#!/usr/bin/env bash
# Verify all M1 contracts on Sourcify via forge verify-contract
# Run from: contracts/

FORGE=/root/.foundry/bin/forge
CAST=/root/.foundry/bin/cast
CHAIN=80002

DEPLOYER=0x786d99F5024acE87250544cE56309AEdB97f44cF
MOCK_USDC=0xC9EfbCF51e175a8171dDb7f65d709e71be969e56
CTF=0x688d809494D56aCD8ea8b252937e9b51F7F8111B
CTF_EXCHANGE=0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF
UMA_ADAPTER=0x91874c0000D49eA26d8b27cabd2eDE3a3A7fC6b5
NEG_RISK_ADAPTER=0x2B73d9B65e1d4829aA5405101d64d6042d7fDa44
NEG_RISK_EXCHANGE=0x70bE8b784846d08c57efBE6fEe9e79632e7F9a87
WALLET_FACTORY=0xf88b96e47F45aA98176F4A5496A647e039B6ad5E
MARKET_FACTORY=0xe50538464D1467C4Ffc4F3b148c028c22cb87f3f
SAFE_PROXY_FACTORY=0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2
SAFE_SINGLETON=0x3E5c63644E683549055b9Be8653de26E0B4CD36E
SAFE_FALLBACK=0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4

verify() {
  local name=$1
  local addr=$2
  local file=$3
  local args=$4

  echo ""
  echo "── Verifying $name ($addr) ──"
  if [ -n "$args" ]; then
    $FORGE verify-contract "$addr" "$file" \
      --chain $CHAIN --verifier sourcify \
      --constructor-args "$args" 2>&1
  else
    $FORGE verify-contract "$addr" "$file" \
      --chain $CHAIN --verifier sourcify 2>&1
  fi
}

# 1. MockUSDC — constructor(address initialOwner)
USDC_ARGS=$($CAST abi-encode "constructor(address)" $DEPLOYER)
verify "MockUSDC" $MOCK_USDC "contracts/MockUSDC.sol:MockUSDC" "$USDC_ARGS"

# 2. WalletFactory — constructor(address factory, address singleton, address fallbackHandler, address admin)
WF_ARGS=$($CAST abi-encode "constructor(address,address,address,address)" \
  $SAFE_PROXY_FACTORY $SAFE_SINGLETON $SAFE_FALLBACK $DEPLOYER)
verify "WalletFactory" $WALLET_FACTORY "contracts/WalletFactory.sol:WalletFactory" "$WF_ARGS"

# 3. MarketFactory — constructor(address ctf, address umaAdapter, address exchange, address negRiskExchange, address collateral, address admin)
MF_ARGS=$($CAST abi-encode "constructor(address,address,address,address,address,address)" \
  $CTF $UMA_ADAPTER $CTF_EXCHANGE $NEG_RISK_EXCHANGE $MOCK_USDC $DEPLOYER)
verify "MarketFactory" $MARKET_FACTORY "contracts/MarketFactory.sol:MarketFactory" "$MF_ARGS"

echo ""
echo "=== Verification submissions complete ==="
echo "Check status at: https://sourcify.dev/#/lookup"
