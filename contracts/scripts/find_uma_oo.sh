#!/usr/bin/env bash
# Find real UMA Optimistic Oracle V2 on Polygon Amoy via Finder
RPC="https://polygon-amoy-bor-rpc.publicnode.com"
FINDER="0x28077B47Cd03326De7838926A63699849DD4fa87"

echo "=== UMA Finder contract bytecode ==="
code_len=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$FINDER\",\"latest\"],\"id\":1}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['result']))" 2>/dev/null)
echo "  Finder bytecode: $code_len chars"

echo ""
echo "=== Query Finder for interface implementations ==="
# getImplementationAddress(bytes32) — bytes32 key is keccak256 of interface name
# We need to compute keccak256("OptimisticOracleV2") 

python3 << 'PYEOF'
import hashlib, struct

def keccak256(data):
    from Crypto.Hash import keccak
    k = keccak.new(digest_bits=256)
    k.update(data if isinstance(data, bytes) else data.encode())
    return k.hexdigest()

try:
    interfaces = [
        "OptimisticOracleV2",
        "OptimisticOracle",
        "OptimisticOracleV3",
        "CollateralWhitelist",
        "IdentifierWhitelist",
        "Registry",
        "Store",
    ]
    for iface in interfaces:
        h = keccak256(iface)
        print(f"  {iface}: 0x{h}")
except ImportError:
    # fallback — use python3's built-in hashlib if pycryptodome not available
    print("  pycryptodome not available, using sha3_256 (NOT keccak)")
    for iface in interfaces:
        h = hashlib.sha3_256(iface.encode()).hexdigest()
        print(f"  {iface} (sha3, not keccak): 0x{h}")
PYEOF

echo ""
echo "=== Check known UMA OO addresses on Amoy ==="
CANDIDATES=(
  "0xAA86dDA78E9434acA114b6676Fc742A18d15a1CC"
  "0x38fAc33bD20D4c4Cce085C0f347153C06CbA2968"
  "0xd8866E76441df243fc98B892362Fc6264dC3ca80"
  "0x9923D42eF695B5dd9911D05Ac944d4cAca3c4ECD"
  "0x9A3f0E7b8D24fcC7fE52B98e2B6b0Ae7AbFE81f3"
)
for addr in "${CANDIDATES[@]}"; do
  size=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"],\"id\":1}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); c=d['result']; print(len(c))" 2>/dev/null)
  if [ "$size" -gt 4 ] 2>/dev/null; then
    echo "  ✅ $addr has code ($size chars)"
  else
    echo "  ❌ $addr has NO code"
  fi
done
