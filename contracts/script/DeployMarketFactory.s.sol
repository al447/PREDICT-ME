// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../contracts/MarketFactory.sol";

/**
 * @title  DeployMarketFactory
 * @notice Redeploys MarketFactory with the double-prepareCondition bug fixed.
 *         Also re-grants the new factory addAdmin on both exchanges.
 *
 * Run:
 *   forge script script/DeployMarketFactory.s.sol \
 *     --rpc-url $POLYGON_AMOY_RPC_URL \
 *     --broadcast --verify \
 *     -vvvv
 */
contract DeployMarketFactory is Script {

    // ── Existing deployed addresses (from .env) ────────────────────────────────
    // These are read from environment in run(), defaults for reference:
    // CONDITIONAL_TOKENS_ADDRESS=0x688d809494D56aCD8ea8b252937e9b51F7F8111B
    // UMA_CTF_ADAPTER_ADDRESS=0x91874c0000D49eA26d8b27cabd2eDE3a3A7fC6b5
    // CTF_EXCHANGE_ADDRESS=0x8CbA3487e88e19d5aA6A3C78Cc93d06Dc0801eBF
    // NEG_RISK_EXCHANGE_ADDRESS=0x70bE8b784846d08c57efBE6fEe9e79632e7F9a87
    // MOCK_USDC_ADDRESS=0xC9EfbCF51e175a8171dDb7f65d709e71be969e56

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address ctf = vm.envAddress("CONDITIONAL_TOKENS_ADDRESS");
        address umaAdapter = vm.envAddress("UMA_CTF_ADAPTER_ADDRESS");
        address ctfExchange = vm.envAddress("CTF_EXCHANGE_ADDRESS");
        address negRiskExchange = vm.envAddress("NEG_RISK_EXCHANGE_ADDRESS");
        address usdc = vm.envAddress("MOCK_USDC_ADDRESS");

        console.log("=== Redeploying MarketFactory ===");
        console.log("Deployer:", deployer);
        console.log("CTF:", ctf);
        console.log("UmaAdapter:", umaAdapter);
        console.log("CTFExchange:", ctfExchange);
        console.log("NegRiskExchange:", negRiskExchange);
        console.log("USDC:", usdc);

        vm.startBroadcast(deployerKey);

        // Deploy the fixed MarketFactory
        MarketFactory marketFactory = new MarketFactory(
            ctf,
            umaAdapter,
            ctfExchange,
            negRiskExchange,
            usdc,
            deployer
        );
        console.log("\n>>> New MarketFactory:", address(marketFactory));

        // Grant the new factory admin on both exchanges (required for registerToken)
        // CTFExchange.addAdmin(newFactory)
        (bool ok1,) = ctfExchange.call(
            abi.encodeWithSignature("addAdmin(address)", address(marketFactory))
        );
        require(ok1, "addAdmin on CTFExchange failed");
        console.log("Granted admin on CTFExchange");

        // NegRiskExchange.addAdmin(newFactory)
        (bool ok2,) = negRiskExchange.call(
            abi.encodeWithSignature("addAdmin(address)", address(marketFactory))
        );
        require(ok2, "addAdmin on NegRiskExchange failed");
        console.log("Granted admin on NegRiskExchange");

        vm.stopBroadcast();

        // Summary for copy-paste into .env
        console.log("\n=== Update these in .env files ===");
        console.log("MARKET_FACTORY_ADDRESS=", address(marketFactory));
    }
}
