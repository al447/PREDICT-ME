// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

/**
 * @title  DeployUmaAdapter
 * @notice Redeploys UmaCtfAdapter with CORRECT UMA OO V2 address.
 *         Previous deployment used wrong OO address.
 *
 * Run:
 *   forge script script/DeployUmaAdapter.s.sol \
 *     --rpc-url $POLYGON_AMOY_RPC_URL \
 *     --broadcast --verify \
 *     -vvvv
 */
contract DeployUmaAdapter is Script {

    // ── UMA on Polygon Amoy ───────────────────────────────────────────────────
    // CORRECT UMA Optimistic Oracle V2 (verified on-chain)
    address constant UMA_OO_V2_CORRECT = 0x38fAc33bD20D4c4Cce085C0f347153C06CbA2968;
    address constant UMA_FINDER = 0x28077B47Cd03326De7838926A63699849DD4fa87;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address ctf = vm.envAddress("CONDITIONAL_TOKENS_ADDRESS");

        console.log("=== Redeploying UmaCtfAdapter ===");
        console.log("Deployer:", deployer);
        console.log("CTF:", ctf);
        console.log("Finder:", UMA_FINDER);
        console.log("OO V2 (CORRECT):", UMA_OO_V2_CORRECT);

        vm.startBroadcast(deployerKey);

        // Deploy UmaCtfAdapter via shim
        address umaAdapter = _deployUmaCtfAdapter(ctf, UMA_FINDER, UMA_OO_V2_CORRECT);
        console.log("\n>>> New UmaCtfAdapter:", umaAdapter);

        vm.stopBroadcast();

        console.log("\n=== Update these in .env files ===");
        console.log("UMA_CTF_ADAPTER_ADDRESS=", umaAdapter);
        console.log("\n=== Then redeploy MarketFactory pointing to new adapter ===");
    }

    function _deployUmaCtfAdapter(address ctf, address finder, address oo) internal returns (address adapter) {
        bytes memory creationCode = vm.getCode("UmaCtfAdapterShim.sol:UmaCtfAdapterShim");
        bytes memory initCode = abi.encodePacked(creationCode, abi.encode(ctf, finder, oo));
        assembly { adapter := create(0, add(initCode, 0x20), mload(initCode)) }
        require(adapter != address(0), "UmaCtfAdapter deploy failed");
    }
}
