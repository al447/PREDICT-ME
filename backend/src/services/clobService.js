/**
 * CLOB (Central Limit Order Book) Service
 * Polymarket-style hybrid-decentralized exchange
 * Off-chain matching + on-chain settlement
 */

const { ethers } = require('ethers');
const Order = require('../models/Order');
const { ADDRESSES, ABIS, RPC_URL, CHAIN_ID, getOperatorKey } = require('../config/contracts');

// CTF Exchange ABI (subset for operator matchOrders)
const CTF_EXCHANGE_ABI = [
  'function matchOrders(tuple(uint256 tokenId, uint256 makerAmount, uint256 takerAmount, uint256 side, uint256 feeRateBps, uint256 nonce, uint256 expiration, address maker, address signer, address taker, bytes makerAssetFilled, bytes32 orderHash, bytes signature)[] calldata makerOrders, tuple(uint256 tokenId, uint256 makerAmount, uint256 takerAmount, uint256 side, uint256 feeRateBps, uint256 nonce, uint256 expiration, address maker, address signer, address taker, bytes makerAssetFilled, bytes32 orderHash, bytes signature) takerOrder) external',
  'function matchOrdersSimple(bytes32[] calldata makerOrderHashes, bytes32 takerOrderHash) external',
  'function fillOrder(tuple(uint256 tokenId, uint256 makerAmount, uint256 takerAmount, uint256 side, uint256 feeRateBps, uint256 nonce, uint256 expiration, address maker, address signer, address taker, bytes makerAssetFilled, bytes32 orderHash, bytes signature) order, uint256 fillAmount) external',
];

// EIP-712 Domain — must include verifyingContract (Bug fix #1)
const ORDER_DOMAIN = {
  name: 'PolyBet365 CTF Exchange',
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
    signatureType: 0,
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
    orderType:     orderData.orderType || 'GTC',
  });
  
  await order.save();
  
  // Try to match immediately
  await tryMatchOrders(order);
  
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
 * Settle matches on-chain via CTFExchange.matchOrders (Bug fix #3, #4, #5).
 * Uses OPERATOR_PRIVATE_KEY, not relayer. Each match is settled independently
 * so a single failure doesn't block the entire batch.
 */
async function settleMatches(matches) {
  const operator = getOperatorWallet();
  const exchange = new ethers.Contract(ADDRESSES.CTF_EXCHANGE, ABIS.CTF_EXCHANGE, operator);

  const results = [];

  for (const match of matches) {
    try {
      // Build the on-chain order struct for CTFExchange.fillOrder
      // Amounts are already BigInt from tryMatchOrders
      const makerOrder = await Order.findOne({ orderId: match.makerOrderId });
      const takerOrder = await Order.findOne({ orderId: match.takerOrderId });

      if (!makerOrder || !takerOrder) {
        console.warn(`[CLOB] settleMatches: order not found for match ${match.makerOrderId}/${match.takerOrderId}`);
        continue;
      }

      // Build the struct expected by CTFExchange
      const makerStruct = buildOrderStruct(makerOrder);
      const fillAmount   = match.makerAmount;

      const tx = await exchange.fillOrder(makerStruct, fillAmount);
      const receipt = await tx.wait();

      // Bug fix #4: update each order individually with correct filter
      await Order.updateOne({ orderId: match.makerOrderId }, { settlementTxHash: receipt.hash });
      await Order.updateOne({ orderId: match.takerOrderId }, { settlementTxHash: receipt.hash });

      console.log(`[CLOB] Settled match ${match.makerOrderId}/${match.takerOrderId} tx=${receipt.hash}`);
      results.push({ txHash: receipt.hash, makerOrderId: match.makerOrderId, takerOrderId: match.takerOrderId });

    } catch (err) {
      console.error(`[CLOB] Settlement failed for match ${match.makerOrderId}/${match.takerOrderId}:`, err.message);
      // Don't rethrow — allow remaining matches to settle
    }
  }

  return { settled: results.length, total: matches.length, results };
}

/**
 * Build the on-chain order struct from a DB Order document.
 */
function buildOrderStruct(order) {
  return {
    tokenId:       order.tokenId,
    makerAmount:   ethers.parseUnits(order.size.toString(), 6),
    takerAmount:   ethers.parseUnits((order.size * order.price).toFixed(6), 6),
    side:          order.side === 'buy' ? 0 : 1,
    feeRateBps:    TAKER_FEE_BPS,
    nonce:         order.nonce,
    expiration:    Math.floor(new Date(order.expiration).getTime() / 1000),
    maker:         order.maker,
    signer:        order.signer || order.maker,
    taker:         ethers.ZeroAddress,
    makerAssetFilled: '0x',
    orderHash:     ethers.ZeroHash,
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
