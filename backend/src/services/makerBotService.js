/**
 * makerBotService.js — Operator market-maker bot
 *
 * Two-sided market maker: posts resting BUY + SELL orders for YES + NO tokens.
 * The operator splits USDC → YES+NO via CTF, then places:
 *   - SELL YES @ (p + spread)   — users buy YES from bot
 *   - SELL NO  @ ((1-p) + spread) — users buy NO from bot
 *   - BUY  YES @ (p - spread)   — users sell YES to bot
 *   - BUY  NO  @ ((1-p) - spread) — users sell NO to bot
 *
 * Env vars:
 *   MAKER_SPREAD_BPS   — half-spread in basis points (default 100 = 1%)
 *   MAKER_DEPTH_USDC   — USDC per side per market (default 500)
 *   MAKER_REFRESH_MS   — re-quote interval in ms (default 60000)
 *   ONCHAIN_ENABLED    — must be 'true'
 */

const { ethers } = require('ethers');
const { ADDRESSES, ABIS, RPC_URL, CHAIN_ID, getOperatorKey, getPolygonProvider, ORDER_DOMAIN, ORDER_TYPES } = require('../config/contracts');
const Order = require('../models/Order');
const Market = require('../models/Market');

const SPREAD_BPS    = parseInt(process.env.MAKER_SPREAD_BPS || '100', 10);
const DEPTH_USDC    = parseFloat(process.env.MAKER_DEPTH_USDC || '500');
const REFRESH_MS    = parseInt(process.env.MAKER_REFRESH_MS  || '60000', 10);
const TAKER_FEE_BPS = 200;

let _operatorWallet = null;
let _refreshTimers  = new Map(); // conditionId → timer

function getOperatorWallet() {
  if (!_operatorWallet) {
    _operatorWallet = new ethers.Wallet(getOperatorKey(), getPolygonProvider());
  }
  return _operatorWallet;
}

/**
 * Split USDC into YES+NO tokens for the given market.
 * Operator approvals (USDC→CTF) must already be set (setOperatorApprovals.js).
 */
async function seedMarket(conditionId, attempt = 1) {
  if (process.env.ONCHAIN_ENABLED !== 'true') throw new Error('ONCHAIN_ENABLED is not true');

  const operator = getOperatorWallet();
  const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, operator);

  // Guard: condition must be prepared on the CTF contract, otherwise splitPosition
  // reverts ("condition not prepared yet"), wasting gas and burning nonces.
  const slotCount = await ctf.getOutcomeSlotCount(conditionId).catch(() => 0n);
  if (slotCount === 0n) {
    const e = new Error('condition not prepared');
    e.code = 'CONDITION_NOT_PREPARED';
    throw e;
  }

  const amount = ethers.parseUnits(DEPTH_USDC.toFixed(6), 6);

  // Get current gas price and add buffer for Polygon Amoy
  const feeData = await operator.provider.getFeeData();
  const gasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n) / 100n : ethers.parseUnits('50', 'gwei'); // Add 20% buffer

  try {
    const tx = await ctf.splitPosition(
      ADDRESSES.USDC,
      ethers.ZeroHash,      // parentCollectionId = 0 (top-level)
      conditionId,
      [1, 2],               // partition: YES=1, NO=2
      amount,
      { 
        gasLimit: 300_000,
        gasPrice: gasPrice
      }
    );
    const receipt = await tx.wait();
    console.log(`[MakerBot] seedMarket conditionId=${conditionId} amount=${DEPTH_USDC} USDC tx=${receipt.hash}`);
    return { txHash: receipt.hash, conditionId, depthUsdc: DEPTH_USDC };
  } catch (err) {
    // Handle replacement transaction underpriced - retry with higher gas
    if (err.code === 'REPLACEMENT_UNDERPRICED' && attempt < 3) {
      console.log(`[MakerBot] Retrying ${conditionId} with higher gas (attempt ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      return seedMarket(conditionId, attempt + 1);
    }
    throw err;
  }
}

/**
 * Place a resting SELL order for the operator.
 * signatureType = 0 (EOA) because the operator is an EOA directly.
 */
async function placeOperatorOrder({ conditionId, tokenId, side, price, sizeShares }) {
  const operator = getOperatorWallet();
  const makerAddress = operator.address;

  const makerAmount = side === 1
    ? ethers.parseUnits(sizeShares.toFixed(6), 6)          // sell: maker gives shares
    : ethers.parseUnits((sizeShares * price).toFixed(6), 6); // buy: maker gives USDC
  const takerAmount = side === 1
    ? ethers.parseUnits((sizeShares * price).toFixed(6), 6) // sell: taker gives USDC
    : ethers.parseUnits(sizeShares.toFixed(6), 6);           // buy: taker gives shares

  const salt      = BigInt(Math.floor(Math.random() * 1e15));
  const nonce     = BigInt(Date.now());
  const expiration = BigInt(Math.floor(Date.now() / 1000) + 3600 * 24 * 7); // 7 days

  const domain = ORDER_DOMAIN;

  const orderMessage = {
    salt,
    maker:         makerAddress,
    signer:        makerAddress,
    taker:         ethers.ZeroAddress,
    tokenId:       BigInt(tokenId),
    makerAmount,
    takerAmount,
    expiration,
    nonce,
    feeRateBps:    BigInt(TAKER_FEE_BPS),
    side:          BigInt(side),
    signatureType: 0n, // EOA
  };

  const signature = await operator.signTypedData(domain, ORDER_TYPES, orderMessage);

  const order = new Order({
    orderId:       Order.generateOrderId(),
    conditionId,
    tokenId:       tokenId.toString(),
    maker:         makerAddress.toLowerCase(),
    signer:        makerAddress.toLowerCase(),
    salt:          salt.toString(),
    side:          side === 0 ? 'buy' : 'sell',
    price,
    size:          sizeShares,
    remainingSize: sizeShares,
    expiration:    new Date(Number(expiration) * 1000),
    signature,
    nonce:         Number(nonce),
    signatureType: 0,
    orderType:     'GTC',
  });

  await order.save();
  console.log(`[MakerBot] Placed operator ${side === 1 ? 'SELL' : 'BUY'} order tokenId=${tokenId} price=${price.toFixed(4)} size=${sizeShares.toFixed(2)}`);
  return order;
}

/**
 * Cancel all open operator orders for a market condition.
 */
async function cancelOperatorOrders(conditionId) {
  const operatorAddr = getOperatorWallet().address.toLowerCase();
  const result = await Order.updateMany(
    { conditionId, maker: operatorAddr, status: { $in: ['open', 'partially_filled'] } },
    { status: 'cancelled' }
  );
  console.log(`[MakerBot] Cancelled ${result.modifiedCount} operator orders for ${conditionId}`);
  return result.modifiedCount;
}

/**
 * Re-quote: cancel existing operator orders, then post fresh ones at current probability.
 * Uses adaptive depth: wider spread and more depth for markets with low liquidity.
 */
async function refreshMarket(conditionId) {
  if (process.env.ONCHAIN_ENABLED !== 'true') return;

  let market;
  try {
    market = await Market.findOne({ conditionId });
  } catch (err) {
    console.error(`[MakerBot] DB error fetching market ${conditionId}: ${err.message}`);
    return;
  }

  if (!market) {
    console.warn(`[MakerBot] refreshMarket: market not found conditionId=${conditionId}`);
    return;
  }

  // Stop quoting if market is no longer active or past end date
  if (market.status !== 'active') {
    console.log(`[MakerBot] Market ${conditionId} is ${market.status}, stopping & cancelling orders`);
    stopMarket(conditionId);
    await cancelOperatorOrders(conditionId);
    return;
  }

  if (market.endDate && new Date(market.endDate) < new Date()) {
    console.log(`[MakerBot] Market ${conditionId} past endDate, stopping`);
    stopMarket(conditionId);
    await cancelOperatorOrders(conditionId);
    return;
  }

  let yesOutcome = market.outcomes?.find(o => o.name.toLowerCase() === 'yes');
  let noOutcome  = market.outcomes?.find(o => o.name.toLowerCase() === 'no');
  if ((!yesOutcome || !noOutcome) && market.outcomes?.length === 2) {
    yesOutcome = market.outcomes[0];
    noOutcome  = market.outcomes[1];
  }
  if (!yesOutcome || !noOutcome) {
    console.warn(`[MakerBot] refreshMarket: missing YES/NO outcomes for ${conditionId}`);
    return;
  }

  const p    = (yesOutcome.price || 50) / 100;
  const spread = SPREAD_BPS / 10000;

  // Widen spread for extreme probabilities to avoid providing
  // one-sided liquidity at near-certain outcomes
  const extremeFactor = Math.max(1, 1 + 2 * Math.abs(p - 0.5));
  const effectiveSpread = Math.min(spread * extremeFactor, 0.15);

  const yesAsk = Math.max(0.02, Math.min(0.98, p + effectiveSpread));
  const noAsk  = Math.max(0.02, Math.min(0.98, (1 - p) + effectiveSpread));
  const yesBid = Math.max(0.02, Math.min(0.98, p - effectiveSpread));
  const noBid  = Math.max(0.02, Math.min(0.98, (1 - p) - effectiveSpread));

  const yesTokenId = market.yesTokenId;
  const noTokenId  = market.noTokenId;

  if (!yesTokenId || !noTokenId) {
    console.warn(`[MakerBot] refreshMarket: missing tokenIds for ${conditionId}`);
    return;
  }

  // Cancel stale orders first
  await cancelOperatorOrders(conditionId);

  // Size: DEPTH_USDC / price = number of shares
  const yesAskShares = DEPTH_USDC / yesAsk;
  const noAskShares  = DEPTH_USDC / noAsk;
  const yesBidShares = DEPTH_USDC / yesBid;
  const noBidShares  = DEPTH_USDC / noBid;

  try {
    await Promise.all([
      placeOperatorOrder({ conditionId, tokenId: yesTokenId, side: 1, price: yesAsk, sizeShares: yesAskShares }),
      placeOperatorOrder({ conditionId, tokenId: noTokenId,  side: 1, price: noAsk,  sizeShares: noAskShares }),
      placeOperatorOrder({ conditionId, tokenId: yesTokenId, side: 0, price: yesBid, sizeShares: yesBidShares }),
      placeOperatorOrder({ conditionId, tokenId: noTokenId,  side: 0, price: noBid,  sizeShares: noBidShares }),
    ]);
  } catch (err) {
    console.error(`[MakerBot] Failed to place orders for ${conditionId}: ${err.message}`);
    return;
  }

  console.log(`[MakerBot] refreshMarket ${conditionId} YES ask=${yesAsk.toFixed(4)} bid=${yesBid.toFixed(4)} NO ask=${noAsk.toFixed(4)} bid=${noBid.toFixed(4)} spread=${(effectiveSpread*100).toFixed(1)}%`);
}

/**
 * Start periodic re-quoting for a market.
 */
function startMarket(conditionId) {
  if (_refreshTimers.has(conditionId)) return;
  refreshMarket(conditionId).catch(console.error);
  const timer = setInterval(() => {
    refreshMarket(conditionId).catch(console.error);
  }, REFRESH_MS);
  _refreshTimers.set(conditionId, timer);
  console.log(`[MakerBot] Started market-making for conditionId=${conditionId} interval=${REFRESH_MS}ms`);
}

/**
 * Stop periodic re-quoting for a market.
 */
function stopMarket(conditionId) {
  const timer = _refreshTimers.get(conditionId);
  if (timer) {
    clearInterval(timer);
    _refreshTimers.delete(conditionId);
    console.log(`[MakerBot] Stopped market-making for conditionId=${conditionId}`);
  }
}

/**
 * Stop all market-making.
 */
function stopAll() {
  for (const [conditionId, timer] of _refreshTimers) {
    clearInterval(timer);
    _refreshTimers.delete(conditionId);
  }
  console.log('[MakerBot] All markets stopped');
}

/**
 * Auto-seed and start all active on-chain binary markets.
 * Called on server startup when MAKER_BOT_ENABLED=true.
 * Respects MAKER_BOT_SCOPE: 'all' | 'featured' | 'manual'
 */
async function seedAndStartAll() {
  if (process.env.ONCHAIN_ENABLED !== 'true') {
    console.log('[MakerBot] ONCHAIN_ENABLED not true, skipping auto-start');
    return;
  }

  const scope = process.env.MAKER_BOT_SCOPE || 'manual';
  if (scope === 'manual') {
    console.log('[MakerBot] MAKER_BOT_SCOPE=manual, skipping auto-start (use admin endpoints)');
    return;
  }

  console.log(`[MakerBot] Auto-starting with scope: ${scope}`);

  // Build query based on scope
  const query = {
    status: 'active',
    onChain: true,
    token0: { $exists: true, $ne: null },
    token1: { $exists: true, $ne: null },
    marketType: { $in: ['binary', null] }, // Binary markets only for Phase 1
  };

  if (scope === 'featured') {
    query.featured = true;
  }
  // 'all' scope = no additional filter

  const markets = await Market.find(query).select('conditionId token0 token1 title').lean();
  console.log(`[MakerBot] Found ${markets.length} markets to seed`);

  const operator = getOperatorWallet();
  const operatorAddress = operator.address.toLowerCase();

  // Process in batches to avoid RPC rate limits
  const BATCH_SIZE = 5;
  const DELAY_MS = 2000;
  let skipped = 0;

  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE);

    // Process sequentially to avoid nonce collisions
    for (const market of batch) {
      try {
        // Check if operator already holds inventory for this market
        const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, operator);
        const yesBalance = await ctf.balanceOf(operatorAddress, market.token0);
        const noBalance = await ctf.balanceOf(operatorAddress, market.token1);

        const hasInventory = yesBalance > 0n || noBalance > 0n;

        if (!hasInventory) {
          console.log(`[MakerBot] Seeding ${market.conditionId} (${market.title?.slice(0, 40)}...)`);
          await seedMarket(market.conditionId);
          // Add delay after each seed to prevent RPC rate limiting
          await new Promise(r => setTimeout(r, 1000));
        } else {
          console.log(`[MakerBot] Already seeded ${market.conditionId}, skipping`);
        }

        // Start the market (place initial orders)
        await startMarket(market.conditionId);
      } catch (err) {
        if (err.code === 'CONDITION_NOT_PREPARED') {
          // Expected for markets synced off-chain but not deployed on-chain — skip quietly.
          skipped++;
          continue;
        }
        console.error(`[MakerBot] Failed to seed/start ${market.conditionId}: ${err.message}`);
        // Continue with next market even if this one fails
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (i + BATCH_SIZE < markets.length) {
      console.log(`[MakerBot] Batch complete, waiting ${DELAY_MS}ms...`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[MakerBot] Auto-start complete. Active markets: ${_refreshTimers.size}, skipped (condition not prepared): ${skipped}`);
}

module.exports = {
  seedMarket,
  refreshMarket,
  startMarket,
  stopMarket,
  stopAll,
  seedAndStartAll,
  placeOperatorOrder,
  cancelOperatorOrders,
  SPREAD_BPS,
  DEPTH_USDC,
  REFRESH_MS,
};
