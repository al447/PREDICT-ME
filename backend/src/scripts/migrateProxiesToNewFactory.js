/**
 * migrateProxiesToNewFactory.js
 *
 * After a WalletFactory redeploy, the new factory starts with an EMPTY proxy
 * cache (_proxies mapping). Safe proxy addresses are derived deterministically
 * by the canonical Gnosis SafeProxyFactory, so the addresses are unchanged —
 * but the new WalletFactory does not know about Safes that were already
 * deployed via the old factory.
 *
 * This script re-registers every already-deployed user Safe into the new
 * WalletFactory via the owner-only registerProxy(owner, proxy), so that
 * proxyOf()/getOrCreateProxy() return the existing Safe instead of attempting
 * a (reverting) redeploy.
 *
 * Source of truth: User.smartWallet { owner, proxy } in MongoDB.
 * Only Safes that actually have on-chain bytecode are registered; undeployed
 * ones are skipped (getOrCreateProxy will deploy them correctly on first use).
 *
 * Auth: registerProxy is onlyOwner. The signer MUST equal WalletFactory.owner()
 * (the deployer, 0x786d...). Uses DEPLOYER_PRIVATE_KEY by default; override with
 * WALLET_FACTORY_ADMIN_KEY.
 *
 * Usage:
 *   node src/scripts/migrateProxiesToNewFactory.js            # live run
 *   DRY_RUN=true node src/scripts/migrateProxiesToNewFactory.js   # preview only
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const User = require('../models/User');
const { ADDRESSES, ABIS, getPolygonProvider } = require('../config/contracts');

const DRY_RUN = process.env.DRY_RUN === 'true';

// ethers v6 requires a 0x-prefixed key.
function normalizeKey(key) {
  if (!key) return null;
  return key.startsWith('0x') ? key : `0x${key}`;
}

function getAdminKey() {
  const key = process.env.WALLET_FACTORY_ADMIN_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error('WALLET_FACTORY_ADMIN_KEY / DEPLOYER_PRIVATE_KEY not set');
  return normalizeKey(key);
}

async function main() {
  const factoryAddress = ADDRESSES.WALLET_FACTORY;
  if (!factoryAddress || factoryAddress === ethers.ZeroAddress) {
    throw new Error('WALLET_FACTORY_ADDRESS not set in env');
  }

  const provider = getPolygonProvider();
  const admin = new ethers.Wallet(getAdminKey(), provider);
  const factory = new ethers.Contract(factoryAddress, ABIS.WALLET_FACTORY, admin);

  console.log('=== Migrate Safe proxies into new WalletFactory ===');
  console.log('Mode          :', DRY_RUN ? 'DRY RUN (no transactions)' : 'LIVE');
  console.log('WalletFactory :', factoryAddress);
  console.log('Admin signer  :', admin.address);

  // Verify the signer is the factory owner (registerProxy is onlyOwner).
  const owner = await factory.owner();
  console.log('Factory owner :', owner);
  if (owner.toLowerCase() !== admin.address.toLowerCase()) {
    throw new Error(
      `Signer ${admin.address} is NOT the WalletFactory owner ${owner}. ` +
      `Set WALLET_FACTORY_ADMIN_KEY to the owner key.`
    );
  }
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({ 'smartWallet.proxy': { $ne: null } })
    .select('email authProvider smartWallet')
    .lean();

  console.log(`Users with a proxy on record: ${users.length}\n`);

  let registered = 0;
  let alreadyRegistered = 0;
  let skippedUndeployed = 0;
  let skippedNoOwner = 0;
  let mismatch = 0;
  let errors = 0;

  for (const u of users) {
    const label = (u.email || String(u._id)).slice(0, 30).padEnd(32);
    const sw = u.smartWallet || {};
    const ownerAddr = sw.owner;
    const proxyAddr = sw.proxy;

    if (!ownerAddr || !proxyAddr) {
      console.log(`${label} | SKIP — missing owner/proxy on record`);
      skippedNoOwner++;
      continue;
    }

    try {
      // 1. Is the Safe actually deployed on-chain? If not, nothing to register;
      //    getOrCreateProxy will deploy it correctly on first use.
      const code = await provider.getCode(proxyAddr);
      if (code === '0x') {
        console.log(`${label} | SKIP — proxy not yet deployed on-chain`);
        skippedUndeployed++;
        continue;
      }

      // 2. Is it already registered in the new factory?
      const existing = await factory.proxyOf(ownerAddr);
      if (existing && existing !== ethers.ZeroAddress) {
        if (existing.toLowerCase() === proxyAddr.toLowerCase()) {
          console.log(`${label} | OK   — already registered`);
          alreadyRegistered++;
        } else {
          console.warn(
            `${label} | WARN — factory has ${existing} but DB has ${proxyAddr} (mismatch, skipping)`
          );
          mismatch++;
        }
        continue;
      }

      // 3. Register the existing Safe.
      if (DRY_RUN) {
        console.log(`${label} | WOULD REGISTER owner=${ownerAddr} proxy=${proxyAddr}`);
        registered++;
        continue;
      }

      const tx = await factory.registerProxy(ownerAddr, proxyAddr);
      const receipt = await tx.wait();
      console.log(
        `${label} | REGISTERED owner=${ownerAddr.slice(0, 10)}.. proxy=${proxyAddr.slice(0, 10)}.. tx=${receipt.hash.slice(0, 12)}..`
      );
      registered++;
    } catch (err) {
      console.error(`${label} | ERROR — ${err.message.slice(0, 120)}`);
      errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log('Registered        :', registered, DRY_RUN ? '(dry run — not sent)' : '');
  console.log('Already registered:', alreadyRegistered);
  console.log('Skipped (undeployed):', skippedUndeployed);
  console.log('Skipped (no owner):', skippedNoOwner);
  console.log('Mismatches        :', mismatch);
  console.log('Errors            :', errors);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
