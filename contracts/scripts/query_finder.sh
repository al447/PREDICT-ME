#!/usr/bin/env bash
# Query UMA Finder to get registered contract addresses
RPC="https://polygon-amoy-bor-rpc.publicnode.com"
FINDER="0x28077B47Cd03326De7838926A63699849DD4fa87"

# getImplementationAddress(bytes32) selector = 0x7e4a1aa8
# bytes32 keys are keccak256 of the interface names
# We know the sha3-256, need keccak — use Foundry cast

FORGE=/root/.foundry/bin/forge
CAST=/root/.foundry/bin/cast

echo "=== Finder implementations via cast ==="
for iface in "OptimisticOracleV2" "OptimisticOracle" "OptimisticOracleV3" "CollateralWhitelist" "Store"; do
  key=$($CAST keccak "$iface" 2>/dev/null)
  result=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$FINDER\",\"data\":\"0x7e4a1aa8${key:2}\"},\"latest\"],\"id\":1}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',''); print('0x'+r[-40:] if len(r)>=42 else r)" 2>/dev/null)
  echo "  $iface: $result"
done

echo ""
echo "=== Verify which OO has requestPrice() ==="
for addr in "0x38fAc33bD20D4c4Cce085C0f347153C06CbA2968" "0xd8866E76441df243fc98B892362Fc6264dC3ca80"; do
  # requestPrice(bytes32,uint256,bytes,address,uint256) selector
  sel=$($CAST sig "requestPrice(bytes32,uint256,bytes,address,uint256)" 2>/dev/null)
  echo "  $addr: requestPrice selector = $sel"
done
