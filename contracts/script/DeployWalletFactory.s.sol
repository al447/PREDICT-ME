// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../contracts/WalletFactory.sol";

/**
 * @title  DeployWalletFactory
 * @notice Standalone (re)deploy of the hardened WalletFactory on Polygon Amoy.
 *         Reuses the canonical Gnosis Safe infrastructure already live on Amoy.
 *
 *  NOTE: Safe proxy addresses are derived from the canonical SafeProxyFactory
 *        (not from WalletFactory), so users keep the SAME wallet addresses after
 *        a redeploy. However the new factory starts with an empty proxy cache:
 *        for users whose Safe is already deployed, call
 *        registerProxy(owner, existingSafe) instead of getOrCreateProxy.
 *
 *  Run:
 *    forge script script/DeployWalletFactory.s.sol \
 *      --rpc-url $POLYGON_AMOY_RPC_URL \
 *      --broadcast --verify -vvvv
 */
contract DeployWalletFactory is Script {

    // ── Gnosis Safe canonical addresses on Polygon Amoy (chainId 80002) ───────
    address constant SAFE_PROXY_FACTORY    = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
    address constant SAFE_SINGLETON_L2     = 0x3E5c63644E683549055b9Be8653de26E0B4CD36E;
    address constant SAFE_FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        // Allow overrides via env, else use canonical Amoy addresses.
        address proxyFactory    = vm.envOr("SAFE_PROXY_FACTORY", SAFE_PROXY_FACTORY);
        address safeSingleton   = vm.envOr("SAFE_SINGLETON_L2", SAFE_SINGLETON_L2);
        address fallbackHandler = vm.envOr("SAFE_FALLBACK_HANDLER", SAFE_FALLBACK_HANDLER);
        address admin           = vm.envOr("WALLET_FACTORY_ADMIN", deployer);

        console.log("=== Deploy WalletFactory ===");
        console.log("Deployer:", deployer);
        console.log("ProxyFactory:", proxyFactory);
        console.log("SafeSingleton:", safeSingleton);
        console.log("FallbackHandler:", fallbackHandler);
        console.log("Admin:", admin);

        vm.startBroadcast(deployerKey);
        WalletFactory walletFactory = new WalletFactory(
            proxyFactory, safeSingleton, fallbackHandler, admin
        );
        vm.stopBroadcast();

        console.log("\n>>> New WalletFactory:", address(walletFactory));
        console.log("WALLET_FACTORY_ADDRESS=", address(walletFactory));
    }
}
