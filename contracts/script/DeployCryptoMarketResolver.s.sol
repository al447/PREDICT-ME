// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../contracts/CryptoMarketResolver.sol";

/**
 * @title  DeployCryptoMarketResolver
 * @notice Deploys the Chainlink-Automation price-market resolver.
 *
 *  The resolver reports payouts directly to the Gnosis Conditional Tokens
 *  Framework (CTF). For resolution to succeed, each price-market condition MUST
 *  be prepared with the deployed resolver address as the oracle:
 *
 *      ConditionalTokens.prepareCondition(resolver, questionId, 2)
 *
 *  Post-deploy:
 *    1. Register the resolver as a Chainlink Automation upkeep (Custom Logic)
 *       at https://automation.chain.link and fund with LINK.
 *    2. (Recommended) call setForwarder(<upkeep forwarder>) to restrict
 *       performUpkeep() to the Automation network.
 *    3. For each price market, call registerMarket(questionId, feed, target,
 *       comparator, endTime).
 *
 *  Run:
 *    forge script script/DeployCryptoMarketResolver.s.sol \
 *      --rpc-url $POLYGON_AMOY_RPC_URL \
 *      --broadcast --verify -vvvv
 */
contract DeployCryptoMarketResolver is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        // CTF address (Gnosis Conditional Tokens). Defaults to the Amoy deployment.
        address ctf = vm.envAddress("CONDITIONAL_TOKENS_ADDRESS");
        // Admin/owner of the resolver (Ownable2Step). Defaults to the deployer.
        address admin = vm.envOr("RESOLVER_ADMIN", deployer);

        require(ctf != address(0), "CONDITIONAL_TOKENS_ADDRESS=0");

        console.log("=== Deploy CryptoMarketResolver ===");
        console.log("Deployer:", deployer);
        console.log("CTF:", ctf);
        console.log("Admin:", admin);

        vm.startBroadcast(deployerKey);
        CryptoMarketResolver resolver = new CryptoMarketResolver(ctf, admin);
        vm.stopBroadcast();

        console.log("\n>>> CryptoMarketResolver:", address(resolver));
        console.log("CRYPTO_MARKET_RESOLVER_ADDRESS=", address(resolver));
    }
}
