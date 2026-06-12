/**
 * makerBotService.js — Operator market-maker bot
 *
 * Posts resting SELL orders for YES + NO tokens at each market's probability.
 * The operator splits USDC → YES+NO via CTF, then places:
 *   - SELL YES @ (p + spread)
 *   - SELL NO  @ ((1-p) + spread)
 *
 * Env vars:
 *   MAKER_SPREAD_BPS   — half-spread in basis points (default 100 = 1%)
 *   MAKER_DEPTH_USDC   — USDC per side per market (default 500)
 *   MAKER_REFRESH_MS   — re-quote interval in ms (default 60000)
 *   ONCHAIN_ENABLED    — must be 'true'
 */

const { ethers } = require('ethers');
const { ADDRESSES, ABIS, RPC_URL, CHAIN_ID, getOperatorKey, ORDER_DOMAIN, ORDER_TYPES } = require('../config/contracts');
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
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    _operatorWallet = new ethers.Wallet(getOperatorKey(), provider);
  }
  return _operatorWallet;
}

/**
 * Split USDC into YES+NO tokens for the given market.
 * Operator approvals (USDC→CTF) must already be set (setOperatorApprovals.js).
 */
async function seedMarket(conditionId) {
  if (process.env.ONCHAIN_ENABLED !== 'true') throw new Error('ONCHAIN_ENABLED is not true');

  const operator = getOperatorWallet();
  const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, operator);

  const amount = ethers.parseUnits(DEPTH_USDC.toFixed(6), 6);

  const tx = await ctf.splitPosition(
    ADDRESSES.MOCK_USDC,
    ethers.ZeroHash,      // parentCollectionId = 0 (top-level)
    conditionId,
    [1, 2],               // partition: YES=1, NO=2
    amount,
    { gasLimit: 300_000 }
  );
  const receipt = await tx.wait();
  console.log(`[MakerBot] seedMarket conditionId=${conditionId} amount=${DEPTH_USDC} USDC tx=${receipt.hash}`);
  return { txHash: receipt.hash, conditionId, depthUsdc: DEPTH_USDC };
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
  console.log(`[MakerBot] Placed operator SELL order tokenId=${tokenId} price=${price.toFixed(4)} size=${sizeShares}`);
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
 */
async function refreshMarket(conditionId) {
  if (process.env.ONCHAIN_ENABLED !== 'true') return;

  const market = await Market.findOne({ conditionId });
  if (!market) {
    console.warn(`[MakerBot] refreshMarket: market not found conditionId=${conditionId}`);
    return;
  }

  const yesOutcome = market.outcomes?.find(o => o.name.toLowerCase() === 'yes');
  const noOutcome  = market.outcomes?.find(o => o.name.toLowerCase() === 'no');
  if (!yesOutcome || !noOutcome) {
    console.warn(`[MakerBot] refreshMarket: missing YES/NO outcomes for ${conditionId}`);
    return;
  }

  const p    = (yesOutcome.price || 50) / 100; // probability 0..1
  const spread = SPREAD_BPS / 10000;

  const yesPrice = Math.min(0.99, p + spread);
  const noPrice  = Math.min(0.99, (1 - p) + spread);

  const yesTokenId = market.yesTokenId;
  const noTokenId  = market.noTokenId;

  if (!yesTokenId || !noTokenId) {
    console.warn(`[MakerBot] refreshMarket: missing tokenIds for ${conditionId}`);
    return;
  }

  // Cancel stale orders first
  await cancelOperatorOrders(conditionId);

  // Size: DEPTH_USDC / price = number of shares to sell
  const yesShares = DEPTH_USDC / yesPrice;
  const noShares  = DEPTH_USDC / noPrice;

  await Promise.all([
    placeOperatorOrder({ conditionId, tokenId: yesTokenId, side: 1, price: yesPrice, sizeShares: yesShares }),
    placeOperatorOrder({ conditionId, tokenId: noTokenId,  side: 1, price: noPrice,  sizeShares: noShares }),
  ]);

  console.log(`[MakerBot] refreshMarket conditionId=${conditionId} YES@${yesPrice.toFixed(4)} NO@${noPrice.toFixed(4)}`);
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

  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (market) => {
        try {
          // Check if operator already holds inventory for this market
          const ctf = new ethers.Contract(ADDRESSES.CTF, ABIS.CTF, operator);
          const yesBalance = await ctf.balanceOf(operatorAddress, market.token0);
          const noBalance = await ctf.balanceOf(operatorAddress, market.token1);

          const hasInventory = yesBalance > 0n || noBalance > 0n;

          if (!hasInventory) {
            console.log(`[MakerBot] Seeding ${market.conditionId} (${market.title?.slice(0, 40)}...)`);
            await seedMarket(market.conditionId);
          } else {
            console.log(`[MakerBot] Already seeded ${market.conditionId}, skipping`);
          }

          // Start the market (place initial orders)
          await startMarket(market.conditionId);
        } catch (err) {
          console.error(`[MakerBot] Failed to seed/start ${market.conditionId}: ${err.message}`);
        }
      })
    );

    if (i + BATCH_SIZE < markets.length) {
      console.log(`[MakerBot] Batch complete, waiting ${DELAY_MS}ms...`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[MakerBot] Auto-start complete. Active markets: ${_refreshTimers.size}`);
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
