#!/usr/bin/env bash
RPC="https://polygon-amoy-bor-rpc.publicnode.com"
FINDER="0x28077B47Cd03326De7838926A63699849DD4fa87"
CAST=/root/.foundry/bin/cast

echo "=== Finder getImplementationAddress for known UMA interface names ==="
for iface in "OptimisticOracleV2" "OptimisticOracle" "OptimisticOracleV3" "CollateralWhitelist" "Store" "IdentifierWhitelist" "Registry"; do
  # keccak256 of string
  key=$($CAST keccak "$iface")
  echo -n "  $iface (key=$key): "
  result=$($CAST call "$FINDER" "getImplementationAddress(bytes32)(address)" "$key" --rpc-url "$RPC" 2>/dev/null)
  echo "$result"
done

echo ""
echo "=== Check the address our UmaCtfAdapter resolves to ==="
UMA_ADAPTER="0x91874c0000D49eA26d8b27cabd2eDE3a3A7fC6b5"
# The adapter stores the OO address from finder at construction time
# Let's read OO immutable via low-level — slot scan
echo "Reading oo() immutable from adapter..."
$CAST call "$UMA_ADAPTER" "oo()(address)" --rpc-url "$RPC" 2>/dev/null || echo "  no oo() getter"
$CAST call "$UMA_ADAPTER" "optimisticOracle()(address)" --rpc-url "$RPC" 2>/dev/null || echo "  no optimisticOracle() getter"

# Check collateralWhitelist
echo ""
echo "collateralWhitelist:"
$CAST call "$UMA_ADAPTER" "collateralWhitelist()(address)" --rpc-url "$RPC" 2>/dev/null || echo "  no getter"
