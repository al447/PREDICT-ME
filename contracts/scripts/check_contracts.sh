#!/usr/bin/env bash
RPC="https://polygon-amoy-bor-rpc.publicnode.com"
declare -A NAMES=(
  ["0xC9EfbCF51e175a8171dDb7f65d709e71be969e56"]="MockUSDC"
  ["0x688d809494D56aCD8ea8b252937e9b51F7F8111B"]="ConditionalTokens"
  ["0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF"]="CTFExchange"
  ["0x91874c0000D49eA26d8b27cabd2eDE3a3A7fC6b5"]="UmaCtfAdapter"
  ["0x2B73d9B65e1d4829aA5405101d64d6042d7fDa44"]="NegRiskAdapter"
  ["0x70bE8b784846d08c57efBE6fEe9e79632e7F9a87"]="NegRiskExchange"
  ["0xf88b96e47F45aA98176F4A5496A647e039B6ad5E"]="WalletFactory"
  ["0xe50538464D1467C4Ffc4F3b148c028c22cb87f3f"]="MarketFactory"
)

echo "=== M1 Contract Deployment Check ==="
for addr in "${!NAMES[@]}"; do
  name="${NAMES[$addr]}"
  result=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"],\"id\":1}")
  code=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'])" 2>/dev/null)
  if [ ${#code} -gt 4 ]; then
    echo "  ✅ $name ($addr) — ${#code} hex chars of bytecode"
  else
    echo "  ❌ $name ($addr) — NO CODE (deploy failed?)"
  fi
done
