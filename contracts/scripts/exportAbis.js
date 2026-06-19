#!/usr/bin/env node
/**
 * Export ABIs from Foundry build artifacts to clean JSON files
 * for backend and frontend consumption.
 *
 * Run: node scripts/exportAbis.js
 */

const fs = require('fs');
const path = require('path');

const CONTRACTS_DIR = path.join(__dirname, '..');
const OUT_DIR = path.join(CONTRACTS_DIR, 'out');

// Contract source file -> artifact subdir mapping
// We use the interface ABIs where available for cleaner output
const CONTRACTS = [
  { name: 'MockUSDC', source: 'MockUSDC.sol' },
  { name: 'ConditionalTokens', source: 'IConditionalTokensComplete.sol', artifactName: 'IConditionalTokensComplete' },  // Full ERC1155 + CTF ABI (backend needs balanceOf)
  { name: 'CTFExchange', source: 'CTFExchange.sol' },
  { name: 'UmaCtfAdapter', source: 'UmaCtfAdapter.sol' },
  { name: 'NegRiskAdapter', source: 'NegRiskAdapter.sol' },
  { name: 'NegRiskExchange', source: 'NegRiskCtfExchange.sol', artifactName: 'NegRiskCtfExchange' },
  { name: 'WalletFactory', source: 'WalletFactory.sol' },
  { name: 'MarketFactory', source: 'MarketFactory.sol' },
  { name: 'CryptoMarketResolver', source: 'CryptoMarketResolver.sol' },  // Chainlink Automation resolver
];

const DESTINATIONS = [
  path.join(CONTRACTS_DIR, 'abi'),
  path.join(CONTRACTS_DIR, '..', 'backend', 'src', 'contracts'),
  path.join(CONTRACTS_DIR, '..', 'frontend', 'src', 'contracts'),
];

function extractAbi(sourceFile, contractName, artifactName) {
  // Foundry puts artifacts in out/<SourceFile>/<Contract>.json
  // artifactName allows using a different filename than the export name
  const actualArtifact = artifactName || contractName;
  const artifactPath = path.join(OUT_DIR, sourceFile, `${actualArtifact}.json`);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }

  const content = fs.readFileSync(artifactPath, 'utf8');
  const parsed = JSON.parse(content);

  if (!parsed.abi || !Array.isArray(parsed.abi)) {
    throw new Error(`No ABI array found in ${artifactPath}`);
  }

  return parsed.abi;
}

function main() {
  console.log('=== Exporting M1 Contract ABIs ===\n');

  // Ensure destinations exist
  DESTINATIONS.forEach((dest) => {
    if (!fs.existsSync(dest)) {
      console.log(`Creating directory: ${dest}`);
      fs.mkdirSync(dest, { recursive: true });
    }
  });

  let exported = 0;
  let errors = 0;

  for (const { name, source, artifactName } of CONTRACTS) {
    try {
      const abi = extractAbi(source, name, artifactName);

      // Write to all destinations
      for (const dest of DESTINATIONS) {
        const outputPath = path.join(dest, `${name}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));
      }

      console.log(`✓ ${name}: exported to ${DESTINATIONS.length} destinations`);
      exported++;
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Done: ${exported} exported, ${errors} errors ===`);

  if (errors > 0) {
    process.exit(1);
  }
}

main();
