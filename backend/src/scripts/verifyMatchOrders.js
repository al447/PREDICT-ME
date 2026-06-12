/**
 * verifyMatchOrders.js — Phase 1 acceptance test
 *
 * Builds two dummy orders (operator vs operator, same address for simplicity),
 * signs them with the operator key, and calls matchOrders.staticCall on-chain.
 *
 * Expected: staticCall succeeds (no revert) → struct layout + domain are correct.
 * Any revert message is printed so you can diagnose the failure.
 *
 * Usage: node src/scripts/verifyMatchOrders.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const mongoose = require('mongoose');
const Market = require('../models/Market');
const { ADDRESSES, ABIS, RPC_URL, CHAIN_ID, ORDER_DOMAIN, ORDER_TYPES, getOperatorKey } = require('../config/contracts');

const TAKER_FEE_BPS = 200n;

let _nonceCounter = BigInt(Date.now());
async function buildOrder(operator, tokenId, side, makerAmt, takerAmt) {
  const salt      = BigInt(Math.floor(Math.random() * 1e15));
  const nonce     = _nonceCounter++;
  const expiration = BigInt(Math.floor(Date.now() / 1000) + 86400);

  const msg = {
    salt,
    maker:         operator.address,
    signer:        operator.address,
    taker:         ethers.ZeroAddress,
    tokenId:       BigInt(tokenId),
    makerAmount:   makerAmt,
    takerAmount:   takerAmt,
    expiration,
    nonce,
    feeRateBps:    TAKER_FEE_BPS,
    side:          BigInt(side),
    signatureType: 0n, // EOA
  };

  const signature = await operator.signTypedData(ORDER_DOMAIN, ORDER_TYPES, msg);

  return {
    salt,
    maker:         operator.address,
    signer:        operator.address,
    taker:         ethers.ZeroAddress,
    tokenId:       BigInt(tokenId),
    makerAmount:   makerAmt,
    takerAmount:   takerAmt,
    expiration,
    nonce,
    feeRateBps:    TAKER_FEE_BPS,
    side:          BigInt(side),
    signatureType: 0n,
    signature,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const market = await Market.findOne({ onChain: true, token0: { $ne: null } }).lean();
  await mongoose.disconnect();

  if (!market) throw new Error('No on-chain market with token0 found in DB');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const operator = new ethers.Wallet(getOperatorKey(), provider);
  const exchange = new ethers.Contract(ADDRESSES.CTF_EXCHANGE, ABIS.CTF_EXCHANGE, operator);

  console.log('Operator  :', operator.address);
  console.log('Exchange  :', ADDRESSES.CTF_EXCHANGE);
  console.log('Chain ID  :', CHAIN_ID);
  console.log('Domain    :', ORDER_DOMAIN.name, 'v' + ORDER_DOMAIN.version);
  console.log('Market    :', market.title?.slice(0, 50));
  console.log('token0    :', market.token0);
  console.log('');

  const TOKEN_ID = BigInt(market.token0);
  const BUY_AMT  = ethers.parseUnits('10', 6);  // 10 USDC
  const SELL_AMT = ethers.parseUnits('10', 6);  // 10 shares

  // taker = BUY order (side=0): makerAmount=USDC, takerAmount=shares
  const takerOrder = await buildOrder(operator, TOKEN_ID, 0, BUY_AMT, SELL_AMT);
  // maker = SELL order (side=1): makerAmount=shares, takerAmount=USDC
  const makerOrder = await buildOrder(operator, TOKEN_ID, 1, SELL_AMT, BUY_AMT);

  // Signature: matchOrders(takerOrder, makerOrders[], takerFillAmount, makerFillAmounts[])
  console.log('Calling matchOrders.staticCall ...');
  try {
    await exchange.matchOrders.staticCall(takerOrder, [makerOrder], BUY_AMT, [SELL_AMT]);
    console.log('\n✅ matchOrders staticCall SUCCEEDED — struct layout + EIP-712 domain are correct.');
  } catch (err) {
    console.error('\n❌ matchOrders staticCall FAILED:', err.message);
    if (err.data) console.error('   Revert data:', err.data);
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
