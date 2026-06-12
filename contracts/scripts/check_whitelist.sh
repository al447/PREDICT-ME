#!/usr/bin/env bash
RPC="https://polygon-amoy-bor-rpc.publicnode.com"
FINDER="0x28077B47Cd03326De7838926A63699849DD4fa87"
MOCK_USDC="0xC9EfbCF51e175a8171dDb7f65d709e71be969e56"

# Get CollateralWhitelist from Finder
# getImplementationAddress("CollateralWhitelist") — bytes32 key
# keccak256("CollateralWhitelist") = 0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64 was the address in trace

WHITELIST="0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64"
echo "CollateralWhitelist: $WHITELIST"

# Check if MockUSDC is whitelisted
# isOnWhitelist(address) selector = 0x c0b9f7f7
RESULT=$(curl -s $RPC -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WHITELIST\",\"data\":\"0xc0b9f7f7000000000000000000000000${MOCK_USDC:2}\"},\"latest\"],\"id\":1}")
echo "isOnWhitelist(MockUSDC): $RESULT"

# Get owner of whitelist
# owner() selector = 0x8da5cb5b
OWNER=$(curl -s $RPC -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WHITELIST\",\"data\":\"0x8da5cb5b\"},\"latest\"],\"id\":1}")
echo "Whitelist owner: $OWNER"

# Also check USDC.e native (Polygon Amoy bridged USDC)
NATIVE_USDC="0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"
RESULT2=$(curl -s $RPC -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$WHITELIST\",\"data\":\"0xc0b9f7f7000000000000000000000000${NATIVE_USDC:2}\"},\"latest\"],\"id\":1}")
echo "isOnWhitelist(native USDC.e on Amoy): $RESULT2"
