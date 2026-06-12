#!/usr/bin/env bash
RPC="https://polygon-amoy-bor-rpc.publicnode.com"
WHITELIST="0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64"

# Check known testnet USDC addresses on Polygon Amoy
echo "=== Checking known USDC/stablecoin addresses on Amoy ==="
TOKENS=(
  "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582:USDC.e(Amoy)"
  "0x9999f7Fea5938fD3b1E26A12c3f2fb024e194f97:WMATIC"
  "0x0000000000000000000000000000000000001010:POL"
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359:USDC(native)"
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F:USDT(Polygon)"
)

for entry in "${TOKENS[@]}"; do
  addr="${entry%%:*}"
  name="${entry##*:}"
  result=$(curl -s $RPC -X POST -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WHITELIST\",\"data\":\"0xc0b9f7f7000000000000000000000000${addr:2}\"},\"latest\"],\"id\":1}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('result','0x')=='0x0000000000000000000000000000000000000000000000000000000000000001' else d.get('error',{}).get('message','false'))" 2>/dev/null)
  echo "  $name ($addr): $result"
done

# Get AddedToWhitelist events
echo ""
echo "=== AddedToWhitelist events (last 10000 blocks) ==="
curl -s $RPC -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_getLogs","params":[{"address":"0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64","topics":["0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f"],"fromBlock":"0x0","toBlock":"latest"}],"id":1}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); logs=d.get('result',[]); [print('  Added:', '0x'+log['data'][-40:]) for log in logs[:10]]" 2>/dev/null || echo "  (no events or error)"
