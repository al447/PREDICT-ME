/**
 * registerResolverMarket.js
 *
 * Creates a Chainlink-Automation–resolvable price market end-to-end:
 *   1. ConditionalTokens.prepareCondition(resolver, questionId, 2)
 *      — the condition MUST use the resolver as oracle, else reportPayouts reverts.
 *   2. CryptoMarketResolver.registerMarket(questionId, feed, target, cmp, endTime)
 *
 * IMPORTANT ARCHITECTURE NOTE:
 *   Markets created via MarketFactory use the UMA CTF Adapter as oracle, so the
 *   resolver CANNOT settle them (different conditionId/tokens). This script makes
 *   a SEPARATE resolver-oracle condition — the additive Chainlink settlement path.
 *   Its conditionId = getConditionId(resolver, questionId, 2). To make it tradeable
 *   you would register that conditionId's tokens on the exchange separately; for
 *   automated price resolution alone, the condition + registration here suffice.
 *
 * Verified Polygon Amoy Chainlink feeds (8 decimals) are built in. Override any
 * with --feed 0x...
 *
 * Usage:
 *   node src/scripts/registerResolverMarket.js --symbol BTC --target 100000 --cmp gte --end +180
 *   node src/scripts/registerResolverMarket.js --symbol ETH --target 4000 --cmp gte --end 2026-07-01T00:00:00Z
 *   DRY_RUN=true node src/scripts/registerResolverMarket.js --symbol BTC --target 100000 --cmp gte --end +600
 *
 *   --end accepts: "+N" (N seconds from now), a unix timestamp, or an ISO date.
 */

require('dotenv').config();
const { ethers } = require('ethers');

// ── Verified Polygon Amoy Chainlink spot feeds (proxy addresses, 8 decimals) ──
// Source: https://reference-data-directory.vercel.app/feeds-polygon-testnet-amoy.json
const AMOY_FEEDS = {
  BTC:  '0xe7656e23fE8077D438aEfbec2fAbDf2D8e070C4f',
  ETH:  '0xF0d50568e3A7e8259E16663972b11910F89BD8e7',
  SOL:  '0xF8e2648F3F157D972198479D5C7f0D721657Af67',
  LINK: '0xc2e2848e28B9fE430Ab44F55a8437a33802a219C',
  USDC: '0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16',
  USDT: '0x3aC23DcB4eCfcBd24579e1f34542524d0E4eDeA8',
  DAI:  '0x1896522f28bF5912dbA483AC38D7eE4c920fDB6E',
  SAND: '0xeA8C8E97681863FF3cbb685e3854461976EBd895',
  EUR:  '0xa73B1C149CB4a0bf27e36dE347CBcfbe88F65DB2',
};

const RPC_URL = process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com';
const RESOLVER = process.env.CRYPTO_MARKET_RESOLVER_ADDRESS;
const CTF = process.env.CONDITIONAL_TOKENS_ADDRESS || process.env.CTF_ADDRESS;
const DRY_RUN = process.env.DRY_RUN === 'true';

const COMPARATOR = { gte: 0, lte: 1 }; // matches CryptoMarketResolver.Comparator

function normalizeKey(key) {
  if (!key) return null;
  return key.startsWith('0x') ? key : `0x${key}`;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    symbol: (get('--symbol') || '').toUpperCase(),
    target: get('--target'),
    cmp: (get('--cmp') || 'gte').toLowerCase(),
    end: get('--end'),
    feed: get('--feed'),
    questionId: get('--questionId'),
  };
}

function resolveEndTime(end) {
  if (!end) throw new Error('--end is required (+N seconds, unix ts, or ISO date)');
  const now = Math.floor(Date.now() / 1000);
  if (end.startsWith('+')) return now + parseInt(end.slice(1), 10);
  if (/^\d+$/.test(end)) return parseInt(end, 10);
  const ms = Date.parse(end);
  if (Number.isNaN(ms)) throw new Error(`Cannot parse --end "${end}"`);
  return Math.floor(ms / 1000);
}

const CTF_ABI = [
  'function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external',
  'function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external pure returns (bytes32)',
  'function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256)',
];

const RESOLVER_ABI = [
  'function owner() view returns (address)',
  'function registerMarket(bytes32 questionId, address feed, int256 targetPrice, uint8 comparator, uint64 endTime) external',
  'function markets(bytes32) view returns (bytes32 questionId, address feed, int256 targetPrice, uint64 endTime, uint8 comparator, bool resolved)',
  'function latestPrice(address feed) view returns (int256 price, uint256 updatedAt)',
  'function activeMarketCount() view returns (uint256)',
];

const FEED_ABI = ['function decimals() view returns (uint8)'];

async function main() {
  const args = parseArgs();
  if (!RESOLVER) throw new Error('CRYPTO_MARKET_RESOLVER_ADDRESS not set');
  if (!CTF) throw new Error('CONDITIONAL_TOKENS_ADDRESS / CTF_ADDRESS not set');
  if (!args.target) throw new Error('--target is required');
  if (!(args.cmp in COMPARATOR)) throw new Error('--cmp must be "gte" or "lte"');

  const feedAddr = args.feed || AMOY_FEEDS[args.symbol];
  if (!feedAddr) {
    throw new Error(`No Amoy feed for symbol "${args.symbol}". Known: ${Object.keys(AMOY_FEEDS).join(', ')} — or pass --feed.`);
  }

  const endTime = resolveEndTime(args.end);
  const cmpEnum = COMPARATOR[args.cmp];

  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 80002, name: 'amoy' });
  const signer = new ethers.Wallet(normalizeKey(process.env.DEPLOYER_PRIVATE_KEY), provider);

  const ctf = new ethers.Contract(CTF, CTF_ABI, signer);
  const resolver = new ethers.Contract(RESOLVER, RESOLVER_ABI, signer);
  const feed = new ethers.Contract(feedAddr, FEED_ABI, provider);

  // Scale target to feed decimals.
  const decimals = await feed.decimals();
  const targetScaled = ethers.parseUnits(String(args.target), decimals);

  // Deterministic questionId if not supplied.
  const questionId = args.questionId ||
    ethers.id(`${args.symbol}|${args.target}|${args.cmp}|${endTime}|${RESOLVER.toLowerCase()}`);

  const conditionId = await ctf.getConditionId(RESOLVER, questionId, 2);

  console.log('=== Register resolver-oracle price market ===');
  console.log('Mode        :', DRY_RUN ? 'DRY RUN' : 'LIVE');
  console.log('Signer      :', signer.address);
  console.log('Symbol      :', args.symbol);
  console.log('Feed        :', feedAddr, `(${decimals} decimals)`);
  console.log('Target      :', args.target, '→ scaled', targetScaled.toString());
  console.log('Comparator  :', args.cmp.toUpperCase(), `(enum ${cmpEnum})`);
  console.log('End time    :', endTime, `(${new Date(endTime * 1000).toISOString()})`);
  console.log('questionId  :', questionId);
  console.log('conditionId :', conditionId);

  // Sanity: confirm the resolver can read this feed on-chain right now.
  try {
    const [price, updatedAt] = await resolver.latestPrice(feedAddr);
    console.log('Feed read   : price', price.toString(), 'updatedAt', updatedAt.toString(),
      `(${Math.floor(Date.now() / 1000) - Number(updatedAt)}s ago)`);
  } catch (e) {
    throw new Error(`Resolver cannot read feed ${feedAddr} on Amoy: ${e.message}`);
  }

  // Owner check (registerMarket is onlyOwner).
  const owner = await resolver.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer is not resolver owner (${owner})`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would prepareCondition + registerMarket. No tx sent.');
    return;
  }

  // 1. Prepare the CTF condition with the resolver as oracle (idempotent guard).
  const slots = await ctf.getOutcomeSlotCount(conditionId).catch(() => 0n);
  if (slots && slots > 0n) {
    console.log('\nCondition already prepared (outcomeSlots =', slots.toString() + '), skipping prepareCondition.');
  } else {
    console.log('\nprepareCondition(resolver, questionId, 2)...');
    const tx1 = await ctf.prepareCondition(RESOLVER, questionId, 2);
    console.log('  tx:', tx1.hash);
    await tx1.wait();
    console.log('  prepared.');
  }

  // 2. Register the market on the resolver.
  const existing = await resolver.markets(questionId);
  if (existing.feed && existing.feed !== ethers.ZeroAddress) {
    console.log('Market already registered on resolver, skipping.');
  } else {
    console.log('registerMarket(...)...');
    const tx2 = await resolver.registerMarket(questionId, feedAddr, targetScaled, cmpEnum, endTime);
    console.log('  tx:', tx2.hash);
    await tx2.wait();
    console.log('  registered.');
  }

  const count = await resolver.activeMarketCount();
  console.log('\n✅ Done. Active markets on resolver:', count.toString());
  console.log('The Chainlink upkeep will auto-resolve this market shortly after',
    new Date(endTime * 1000).toISOString());
}

main().catch((e) => {
  console.error('registerResolverMarket failed:', e.message);
  process.exit(1);
});
