/**
 * CLOB (Central Limit Order Book) Service
 * Polymarket-style hybrid-decentralized exchange
 * Off-chain matching + on-chain settlement
 */

const { ethers } = require('ethers');
const Order = require('../models/Order');
const Fill = require('../models/Fill');
const Trade = require('../models/Trade');
const Market = require('../models/Market');
const { resolveAddressToUser } = require('./addressResolverService');
const websocketService = require('./websocketService');
const clobPriceService = require('./clobPriceService');
const { ADDRESSES, ABIS, RPC_URL, CHAIN_ID, getOperatorKey } = require('../config/contracts');

// EIP-712 Domain — MUST match the deployed CTFExchange.domainSeparator().
// Verified on-chain (Polygon Amoy): name='Polymarket CTF Exchange', version='1'.
// Any other name causes both off-chain verification and on-chain fillOrder/matchOrders to reject signatures.
const ORDER_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: ADDRESSES.CTF_EXCHANGE,
};

// EIP-712 Types — signature is NOT part of the signed struct (Bug fix #2)
const ORDER_TYPES = {
  Order: [
    { name: 'salt',        type: 'uint256' },
    { name: 'maker',       type: 'address' },
    { name: 'signer',      type: 'address' },
    { name: 'taker',       type: 'address' },
    { name: 'tokenId',     type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration',  type: 'uint256' },
    { name: 'nonce',       type: 'uint256' },
    { name: 'feeRateBps',  type: 'uint256' },
    { name: 'side',        type: 'uint8'   },
    { name: 'signatureType', type: 'uint8' },
  ],
};

// Fee rate: 2% = 200 basis points
const TAKER_FEE_BPS = 200;

/**
 * Verify order signature
 */
async function verifyOrderSignature(orderData) {
  const {
    maker, signer, makerAmount, takerAmount, tokenId, expiration, nonce, signature, salt, side,
  } = orderData;

  // The signer may differ from maker (e.g. Safe owner signing on behalf of Safe)
  const signerAddress = signer || maker;

  const message = {
    salt:          salt || nonce || 0,
    maker,
    signer:        signerAddress,
    taker:         '0x0000000000000000000000000000000000000000',
    tokenId:       tokenId || orderData.makerTokenId || 0,
    makerAmount,
    takerAmount,
    expiration,
    nonce,
    feeRateBps:    TAKER_FEE_BPS,
    side:          orderData.side,
    signatureType: orderData.signatureType ?? 0,
  };

  const domain = {
    ...ORDER_DOMAIN,
    verifyingContract: ADDRESSES.CTF_EXCHANGE,
  };

  const recovered = ethers.verifyTypedData(domain, ORDER_TYPES, message, signature);

  if (recovered.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Invalid order signature: recovered=${recovered}, expected=${signerAddress}`);
  }

  return true;
}

/**
 * Create a new limit order
 */
async function createOrder(orderData) {
  // Verify signature
  await verifyOrderSignature(orderData);
  
  // Check if order is valid
  if (orderData.expiration <= Date.now() / 1000) {
    throw new Error('Order expired');
  }
  
  // Check for existing nonce (replay protection)
  const existing = await Order.findOne({ maker: orderData.maker.toLowerCase(), nonce: orderData.nonce });
  if (existing) {
    throw new Error('Nonce already used');
  }
  
  // Resolve tokenId — accept either tokenId (new) or makerTokenId (legacy)
  const resolvedTokenId = (orderData.tokenId || orderData.makerTokenId || '').toString();

  // Create order in database
  const order = new Order({
    orderId:       Order.generateOrderId(),
    conditionId:   orderData.conditionId,
    tokenId:       resolvedTokenId,
    maker:         orderData.maker.toLowerCase(),
    signer:        (orderData.signer || orderData.maker).toLowerCase(),
    salt:          orderData.salt || orderData.nonce || 0,
    side:          orderData.side === 0 || orderData.side === 'buy' ? 'buy' : 'sell',
    price:         calculatePrice(orderData.makerAmount, orderData.takerAmount, typeof orderData.side === 'number' ? orderData.side : (orderData.side === 'buy' ? 0 : 1)),
    size:          parseFloat(ethers.formatUnits(orderData.makerAmount, 6)),
    remainingSize: parseFloat(ethers.formatUnits(orderData.makerAmount, 6)),
    expiration:    new Date(orderData.expiration * 1000),
    signature:     orderData.signature,
    nonce:         orderData.nonce,
    signatureType: orderData.signatureType ?? 0,
    orderType:     orderData.orderType || 'GTC',
  });
  
  await order.save();

  // Try to match immediately
  await tryMatchOrders(order);

  // Broadcast order book update
  try {
    await websocketService.broadcastOrderBookUpdate(order.conditionId, order.tokenId);
  } catch (wsErr) {
    console.warn(`[CLOB] Failed to broadcast order book update: ${wsErr.message}`);
  }

  return order;
}

/**
 * Calculate price from maker/taker amounts
 * Side 0 (buy): price = takerAmount / makerAmount
 * Side 1 (sell): price = makerAmount / takerAmount
 */
function calculatePrice(makerAmount, takerAmount, side) {
  const maker = parseFloat(ethers.formatUnits(makerAmount, 6));
  const taker = parseFloat(ethers.formatUnits(takerAmount, 6));
  
  if (side === 0) {
    // Buy: maker pays USDC for outcome tokens
    return taker / maker;
  } else {
    // Sell: maker sells outcome tokens for USDC
    return maker / taker;
  }
}

/**
 * Try to match an order against the order book
 */
async function tryMatchOrders(newOrder) {
  const matches = [];
  
  // Find opposite side orders
  const oppositeSide = newOrder.side === 'buy' ? 'sell' : 'buy';
  
  // For buy orders, we want sell orders at or below our price
  // For sell orders, we want buy orders at or above our price
  const priceQuery = newOrder.side === 'buy'
    ? { $lte: newOrder.price }
    : { $gte: newOrder.price };
  
  const candidates = await Order.find({
    conditionId: newOrder.conditionId,
    tokenId: newOrder.tokenId,
    status: { $in: ['open', 'partially_filled'] },
    side: oppositeSide,
    price: priceQuery,
    maker: { $ne: newOrder.maker }, // Can't match with self
    expiration: { $gt: new Date() },
  }).sort({ price: newOrder.side === 'buy' ? 1 : -1, createdAt: 1 }); // Best price first
  
  let remainingToFill = newOrder.remainingSize;
  
  for (const candidate of candidates) {
    if (remainingToFill <= 0) break;
    
    const matchSize = Math.min(remainingToFill, candidate.remainingSize);
    
    matches.push({
      conditionId:  newOrder.conditionId,  // Bug fix: was missing
      maker:        candidate.maker,
      taker:        newOrder.maker,
      makerOrderId: candidate.orderId,
      takerOrderId: newOrder.orderId,
      makerTokenId: candidate.tokenId,
      takerTokenId: newOrder.tokenId,
      makerAmount:  ethers.parseUnits(matchSize.toString(), 6),
      takerAmount:  ethers.parseUnits(matchSize.toString(), 6),
      price:        candidate.price,
      side:         newOrder.side,
    });
    
    // Update candidate
    candidate.fill(matchSize);
    await candidate.save();
    
    remainingToFill -= matchSize;
  }
  
  // Update new order
  const filled = newOrder.remainingSize - remainingToFill;
  if (filled > 0) {
    newOrder.fill(filled);
    await newOrder.save();
  }
  
  // If we have matches, settle on-chain
  if (matches.length > 0) {
    await settleMatches(matches);
  }
  
  return matches;
}

/**
 * Get a lazy-initialised operator wallet for on-chain settlement.
 * Operator must be registered on CTFExchange via addOperator().
 */
let _operatorWallet = null;
function getOperatorWallet() {
  if (!_operatorWallet) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    _operatorWallet = new ethers.Wallet(getOperatorKey(), provider);
  }
  return _operatorWallet;
}

/**
 * Settle matches on-chain via CTFExchange.matchOrders.
 * Uses OPERATOR_PRIVATE_KEY. Each match settled independently (fail-soft).
 *
 * matchOrders signature (from deployed CTFExchange ABI):
 *   matchOrders(Order takerOrder, Order[] makerOrders, uint256[] makerFillAmounts)
 */
async function settleMatches(matches) {
  const operator = getOperatorWallet();
  const exchange = new ethers.Contract(ADDRESSES.CTF_EXCHANGE, ABIS.CTF_EXCHANGE, operator);

  const results = [];

  for (const match of matches) {
    try {
      const [makerOrder, takerOrder] = await Promise.all([
        Order.findOne({ orderId: match.makerOrderId }),
        Order.findOne({ orderId: match.takerOrderId }),
      ]);

      if (!makerOrder || !takerOrder) {
        console.warn(`[CLOB] settleMatches: order not found ${match.makerOrderId}/${match.takerOrderId}`);
        continue;
      }

      const takerStruct = buildOrderStruct(takerOrder);
      const makerStruct = buildOrderStruct(makerOrder);
      const fillAmount  = match.makerAmount; // already BigInt

      // callStatic first to surface reverts before spending gas
      // matchOrders(takerOrder, makerOrders[], takerFillAmount, makerFillAmounts[])
      try {
        await exchange.matchOrders.staticCall(takerStruct, [makerStruct], takerStruct.makerAmount, [fillAmount]);
      } catch (staticErr) {
        console.error(`[CLOB] matchOrders staticCall failed ${match.makerOrderId}/${match.takerOrderId}: ${staticErr.message}`);
        continue;
      }

      const tx = await exchange.matchOrders(takerStruct, [makerStruct], takerStruct.makerAmount, [fillAmount]);
      const receipt = await tx.wait();

      // Update orders with settlement hash
      await Promise.all([
        Order.updateOne({ orderId: match.makerOrderId }, { settlementTxHash: receipt.hash }),
        Order.updateOne({ orderId: match.takerOrderId }, { settlementTxHash: receipt.hash }),
      ]);

      // Resolve addresses to users and check bot status
      const [makerResolution, takerResolution] = await Promise.all([
        resolveAddressToUser(makerOrder.maker),
        resolveAddressToUser(takerOrder.maker),
      ]);

      // Lookup market for Fill record
      const market = await Market.findOne({ conditionId: makerOrder.conditionId }).select('_id').lean();

      // Calculate fill details
      const fillSize = parseFloat(ethers.formatUnits(fillAmount, 6));
      const fillPrice = makerOrder.price; // Price is in dollars 0.01-0.99
      const fillNotional = fillSize * fillPrice;
      const takerFee = fillNotional * (TAKER_FEE_BPS / 10000);

      // Write Fill record (DM1)
      const fillRecord = new Fill({
        conditionId: makerOrder.conditionId,
        tokenId: makerOrder.tokenId,
        market: market?._id || null,
        candidate: null, // For binary markets; Phase 2 will populate for grouped
        makerOrderId: match.makerOrderId,
        takerOrderId: match.takerOrderId,
        makerAddress: makerOrder.maker,
        takerAddress: takerOrder.maker,
        makerUser: makerResolution.user?._id || null,
        takerUser: takerResolution.user?._id || null,
        isMakerBot: makerResolution.isMakerBot,
        side: takerOrder.side, // 'buy' or 'sell' from taker perspective
        price: fillPrice,
        size: fillSize,
        notional: fillNotional,
        settlementTxHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        takerFee: takerFee,
        negRisk: false, // Phase 2 will set this for NegRisk markets
      });
      await fillRecord.save();

      // Mirror to Trade for platform users (DM3) — idempotent
      const outcome = makerOrder.tokenId === takerOrder.tokenId
        ? (parseInt(makerOrder.tokenId) % 2 === 1 ? 'Yes' : 'No') // Odd=YES, Even=NO based on tokenId pattern
        : 'Yes'; // Fallback

      // Helper to create Trade idempotently
      const createTradeIfUser = async (user, address, type) => {
        if (!user || !user._id) return;
        if (type === 'sell' && makerResolution.isMakerBot) return; // Skip bot sells (they're market making)

        const tradeKey = `${receipt.hash}-${type}-${user._id}`;
        const existingTrade = await Trade.findOne({ idempotencyKey: tradeKey }).lean();
        if (existingTrade) return;

        const trade = new Trade({
          user: user._id,
          market: market?._id || null,
          conditionId: makerOrder.conditionId, // For position tracking
          outcome,
          candidate: null, // Phase 2 will populate for grouped
          amount: type === 'buy' ? fillNotional : fillSize, // For sell, amount is shares
          price: Math.round(fillPrice * 100), // Price in cents for Trade model
          shares: type === 'buy' ? fillSize : -fillSize, // Negative for sells (netting)
          type,
          status: 'open',
          txHash: receipt.hash,
          idempotencyKey: tradeKey,
        });
        await trade.save();
      };

      await Promise.all([
        createTradeIfUser(takerResolution.user, takerOrder.maker, takerOrder.side), // Taker side
        createTradeIfUser(makerResolution.user, makerOrder.maker, makerOrder.side === 'buy' ? 'sell' : 'buy'), // Maker is opposite side
      ]);

      // Sync market price from CLOB (1A)
      try {
        await clobPriceService.syncMarketPrice(makerOrder.conditionId);
      } catch (priceErr) {
        console.warn(`[CLOB] Failed to sync market price: ${priceErr.message}`);
      }

      // Broadcast trade and order book update (1B)
      try {
        await websocketService.broadcastTrade({
          conditionId: makerOrder.conditionId,
          tokenId: makerOrder.tokenId,
          price: fillPrice,
          size: fillSize,
          side: takerOrder.side,
          taker: takerOrder.maker,
          maker: makerOrder.maker,
          txHash: receipt.hash,
          isMakerBot: makerResolution.isMakerBot,
        });
        await websocketService.broadcastOrderBookUpdate(makerOrder.conditionId, makerOrder.tokenId);
      } catch (wsErr) {
        console.warn(`[CLOB] Failed to broadcast trade/orderbook: ${wsErr.message}`);
      }

      console.log(`[CLOB] matchOrders settled ${match.makerOrderId}/${match.takerOrderId} tx=${receipt.hash} fill=${fillRecord._id}`);
      results.push({ txHash: receipt.hash, makerOrderId: match.makerOrderId, takerOrderId: match.takerOrderId, fillId: fillRecord._id });

    } catch (err) {
      console.error(`[CLOB] Settlement failed ${match.makerOrderId}/${match.takerOrderId}: ${err.message}`);
    }
  }

  return { settled: results.length, total: matches.length, results };
}

/**
 * Build the on-chain Order struct expected by CTFExchange.
 * Real struct (from deployed contract):
 *   (salt, maker, signer, taker, tokenId, makerAmount, takerAmount,
 *    expiration, nonce, feeRateBps, side, signatureType, signature)
 */
function buildOrderStruct(order) {
  return {
    salt:          BigInt(order.salt || order.nonce || 0),
    maker:         order.maker,
    signer:        order.signer || order.maker,
    taker:         ethers.ZeroAddress,
    tokenId:       BigInt(order.tokenId || 0),
    makerAmount:   ethers.parseUnits(order.size.toString(), 6),
    takerAmount:   ethers.parseUnits((order.size * order.price).toFixed(6), 6),
    expiration:    BigInt(Math.floor(new Date(order.expiration).getTime() / 1000)),
    nonce:         BigInt(order.nonce || 0),
    feeRateBps:    BigInt(TAKER_FEE_BPS),
    side:          BigInt(order.side === 'buy' ? 0 : 1),
    signatureType: BigInt(order.signatureType ?? 0),
    signature:     order.signature,
  };
}

/**
 * Get order book for a market
 */
async function getOrderBook(conditionId, tokenId, depth = 20) {
  const [bids, asks] = await Promise.all([
    // Bids (buy orders)
    Order.find({
      conditionId,
      tokenId,
      side: 'buy',
      status: { $in: ['open', 'partially_filled'] },
      expiration: { $gt: new Date() },
    })
      .sort({ price: -1 })
      .limit(depth)
      .lean(),
    
    // Asks (sell orders)
    Order.find({
      conditionId,
      tokenId,
      side: 'sell',
      status: { $in: ['open', 'partially_filled'] },
      expiration: { $gt: new Date() },
    })
      .sort({ price: 1 })
      .limit(depth)
      .lean(),
  ]);
  
  // Aggregate by price level
  const aggregate = (orders, side) => {
    const levels = {};
    for (const order of orders) {
      const price = order.price.toFixed(2);
      if (!levels[price]) {
        levels[price] = { price: parseFloat(price), size: 0 };
      }
      levels[price].size += order.remainingSize;
    }
    return Object.values(levels).sort((a, b) => 
      side === 'buy' ? b.price - a.price : a.price - b.price
    );
  };
  
  return {
    bids: aggregate(bids, 'buy'),
    asks: aggregate(asks, 'sell'),
    timestamp: Date.now(),
  };
}

/**
 * Cancel an order
 */
async function cancelOrder(orderId, makerAddress, safeProxy = null) {
  const order = await Order.findOne({ orderId });

  if (!order) {
    throw new Error('Order not found');
  }

  const caller = makerAddress.toLowerCase();
  const safe   = safeProxy ? safeProxy.toLowerCase() : null;

  const isMaker  = order.maker.toLowerCase()  === caller || order.maker.toLowerCase()  === safe;
  const isSigner = order.signer?.toLowerCase() === caller || order.signer?.toLowerCase() === safe;

  if (!isMaker && !isSigner) {
    throw new Error('Not authorized to cancel this order');
  }
  
  if (order.status === 'filled') {
    throw new Error('Cannot cancel filled order');
  }
  
  order.cancel();
  await order.save();

  // Broadcast order book update
  try {
    await websocketService.broadcastOrderBookUpdate(order.conditionId, order.tokenId);
  } catch (wsErr) {
    console.warn(`[CLOB] Failed to broadcast order book update: ${wsErr.message}`);
  }

  return order;
}

/**
 * Get user's orders
 */
async function getUserOrders(makerAddress, status = null, safeProxy = null) {
  const addresses = [makerAddress.toLowerCase()];
  if (safeProxy) addresses.push(safeProxy.toLowerCase());

  const query = { $or: [
    { maker:  { $in: addresses } },
    { signer: { $in: addresses } },
  ]};
  if (status) query.status = status;

  return await Order.find(query).sort({ createdAt: -1 });
}

/**
 * Clean up expired orders
 */
async function cleanupExpiredOrders() {
  const result = await Order.updateMany(
    {
      status: { $in: ['open', 'partially_filled'] },
      expiration: { $lt: new Date() },
    },
    {
      status: 'expired',
    }
  );
  
  return result.modifiedCount;
}

module.exports = {
  createOrder,
  tryMatchOrders,
  settleMatches,
  getOrderBook,
  cancelOrder,
  getUserOrders,
  cleanupExpiredOrders,
  verifyOrderSignature,
  ORDER_DOMAIN,
  ORDER_TYPES,
  TAKER_FEE_BPS,
};
