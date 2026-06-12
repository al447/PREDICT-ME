#!/usr/bin/env bash
RPC="https://polygon-amoy-bor-rpc.publicnode.com"
WHITELIST="0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64"

echo "=== Whitelist contract bytecode size ==="
result=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$WHITELIST\",\"latest\"],\"id\":1}")
code=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d['result']; print(len(c), 'hex chars')" 2>/dev/null)
echo "  $code"

echo ""
echo "=== isOnWhitelist selector check ==="
# isOnWhitelist(address) => 0xc0b9f7f7 
# Try alternate: whitelistContains(address) => different selector
# The UMA AddressWhitelist uses: isOnWhitelist(address) but the selector might be different
# Let's compute: keccak256("isOnWhitelist(address)") -> first 4 bytes
echo "isOnWhitelist(address) selector:"
python3 -c "
from hashlib import sha3_256
import binascii
# Use sha3-256 (keccak256)
try:
    import sha3
    k = sha3.keccak_256()
    k.update(b'isOnWhitelist(address)')
    print('  0x' + k.hexdigest()[:8])
except:
    print('  (need pysha3)')
"

echo ""
echo "=== Try calling with eth_call directly ==="
MOCK_USDC="0xC9EfbCF51e175a8171dDb7f65d709e71be969e56"
# Correct keccak: isOnWhitelist(address) = 0xc0b9f7f7 per solidity-utilities
result2=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WHITELIST\",\"data\":\"0xc0b9f7f7000000000000000000000000${MOCK_USDC:2}\"},\"latest\"],\"id\":1}")
echo "  Result: $result2"

# Also try: addToWhitelist owner address
result3=$(curl -s "$RPC" -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WHITELIST\",\"data\":\"0x8da5cb5b\"},\"latest\"],\"id\":1}")
echo "  Owner: $result3"
