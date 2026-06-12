#!/usr/bin/env bash
# Verify M1 contracts on Sourcify (chainId 80002 = Polygon Amoy)
CHAIN=80002

declare -A CONTRACTS=(
  ["MockUSDC"]="0xC9EfbCF51e175a8171dDb7f65d709e71be969e56"
  ["ConditionalTokens"]="0x688d809494D56aCD8ea8b252937e9b51F7F8111B"
  ["CTFExchange"]="0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF"
  ["UmaCtfAdapter"]="0x91874c0000D49eA26d8b27cabd2eDE3a3A7fC6b5"
  ["NegRiskAdapter"]="0x2B73d9B65e1d4829aA5405101d64d6042d7fDa44"
  ["NegRiskExchange"]="0x70bE8b784846d08c57efBE6fEe9e79632e7F9a87"
  ["WalletFactory"]="0xf88b96e47F45aA98176F4A5496A647e039B6ad5E"
  ["MarketFactory"]="0xe50538464D1467C4Ffc4F3b148c028c22cb87f3f"
)

echo "=== Sourcify Verification Check (chainId $CHAIN) ==="
for name in "${!CONTRACTS[@]}"; do
  addr="${CONTRACTS[$name]}"
  response=$(curl -s "https://sourcify.dev/server/check-by-addresses?addresses=${addr}&chainIds=${CHAIN}")
  status=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('status','unknown'))" 2>/dev/null || echo "error")
  if [ "$status" = "perfect" ] || [ "$status" = "partial" ]; then
    echo "  ✅ $name — $status match on Sourcify"
  else
    echo "  ⚠️  $name ($addr) — NOT verified ($status)"
  fi
done
