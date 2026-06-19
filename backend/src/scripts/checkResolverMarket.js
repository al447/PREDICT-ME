/**
 * checkResolverMarket.js
 *
 * Inspects the CryptoMarketResolver state: active market count, checkUpkeep
 * result, and (optionally) a specific market's status by questionId.
 *
 * Usage:
 *   node src/scripts/checkResolverMarket.js
 *   node src/scripts/checkResolverMarket.js --questionId 0x...
 */

require('dotenv').config();
const { ethers } = require('ethers');

const RPC_URL = process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com';
const RESOLVER = process.env.CRYPTO_MARKET_RESOLVER_ADDRESS;

const RESOLVER_ABI = [
  'function activeMarketCount() view returns (uint256)',
  'function activeQuestionIdAt(uint256) view returns (bytes32)',
  'function checkUpkeep(bytes) view returns (bool upkeepNeeded, bytes performData)',
  'function markets(bytes32) view returns (bytes32 questionId, address feed, int256 targetPrice, uint64 endTime, uint8 comparator, bool resolved)',
  'function forwarder() view returns (address)',
  'function latestPrice(address feed) view returns (int256 price, uint256 updatedAt)',
];

const CMP = ['GTE', 'LTE'];

function fmtMarket(m) {
  return {
    feed: m.feed,
    target: m.targetPrice.toString(),
    endTime: new Date(Number(m.endTime) * 1000).toISOString(),
    comparator: CMP[Number(m.comparator)],
    resolved: m.resolved,
  };
}

async function main() {
  if (!RESOLVER) throw new Error('CRYPTO_MARKET_RESOLVER_ADDRESS not set');
  const qidArg = (() => {
    const i = process.argv.indexOf('--questionId');
    return i >= 0 ? process.argv[i + 1] : null;
  })();

  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 137, name: 'polygon' });
  const resolver = new ethers.Contract(RESOLVER, RESOLVER_ABI, provider);

  console.log('=== CryptoMarketResolver status ===');
  console.log('Resolver  :', RESOLVER);
  console.log('Forwarder :', await resolver.forwarder());

  const count = await resolver.activeMarketCount();
  console.log('Active (unresolved) markets:', count.toString());

  for (let i = 0; i < Number(count); i++) {
    const qid = await resolver.activeQuestionIdAt(i);
    const m = await resolver.markets(qid);
    console.log(`  [${i}] ${qid}`);
    console.log('      ', JSON.stringify(fmtMarket(m)));
  }

  const [needed, performData] = await resolver.checkUpkeep('0x');
  console.log('\ncheckUpkeep -> upkeepNeeded:', needed);
  if (needed) console.log('  performData (questionId):', performData);

  if (qidArg) {
    const m = await resolver.markets(qidArg);
    console.log('\nMarket', qidArg);
    if (m.feed === ethers.ZeroAddress) {
      console.log('  (not found / removed — if it resolved it stays in markets[] with resolved=true)');
    } else {
      console.log(' ', JSON.stringify(fmtMarket(m)));
      const [price, updatedAt] = await resolver.latestPrice(m.feed);
      console.log('  current feed price:', price.toString(),
        `(updated ${Math.floor(Date.now() / 1000) - Number(updatedAt)}s ago)`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
