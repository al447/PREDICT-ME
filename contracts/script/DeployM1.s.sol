// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../contracts/MockUSDC.sol";
import "../contracts/MarketFactory.sol";
import "../contracts/WalletFactory.sol";
import "../contracts/lib/ConditionalTokensBytecode.sol";

/**
 * @title  DeployM1
 * @notice Deploys the full PolyBet365 M1 on-chain stack in dependency order.
 *
 * Stack (in deploy order):
 *   1.  MockUSDC            — 6-decimal test USDC collateral
 *   2.  ConditionalTokens   — Gnosis CTF ERC1155 (deployed via pre-compiled bytecode)
 *   3.  CTFExchange         — Polymarket binary order-book exchange
 *   4.  UmaCtfAdapter       — UMA OO ↔ CTF bridge
 *   5.  NegRiskAdapter      — multi-outcome / neg-risk wrapper
 *   6.  NegRiskCtfExchange  — NegRisk order-book exchange
 *   7.  WalletFactory       — deterministic Gnosis Safe proxies per user
 *   8.  MarketFactory       — PolyBet365 market orchestrator
 *
 * Run:
 *   forge script script/DeployM1.s.sol \
 *     --rpc-url $POLYGON_AMOY_RPC_URL \
 *     --broadcast --verify \
 *     --etherscan-api-key $POLYGONSCAN_API_KEY \
 *     -vvvv
 *
 * Broadcast artefact: broadcast/DeployM1.s.sol/80002/run-latest.json
 * Post-deploy:        node scripts/postDeploy.js
 */
contract DeployM1 is Script {

    // ── Gnosis Safe canonical addresses on Polygon Amoy (chainId 80002) ───────
    address constant SAFE_PROXY_FACTORY    = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
    address constant SAFE_SINGLETON_L2     = 0x3E5c63644E683549055b9Be8653de26E0B4CD36E;
    address constant SAFE_FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;

    // ── UMA addresses on Polygon Amoy ─────────────────────────────────────────
    address constant UMA_FINDER            = 0x28077B47Cd03326De7838926A63699849DD4fa87;
    // UMA Optimistic Oracle V2 on Polygon Amoy (verified: eth_getCode returns code)
    address constant UMA_OO_V2             = 0x38fAc33bD20D4c4Cce085C0f347153C06CbA2968;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("=== PolyBet365 M1 Deploy ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        // 1. MockUSDC
        MockUSDC usdc = new MockUSDC(deployer);
        console.log("MockUSDC:", address(usdc));

        // 2. ConditionalTokens — deployed via pre-compiled bytecode (solc 0.5.1)
        address ctf = _deployCTF();
        console.log("ConditionalTokens:", ctf);

        // 3. CTFExchange
        address ctfExchange = _deployCTFExchange(address(usdc), ctf, SAFE_PROXY_FACTORY, SAFE_SINGLETON_L2);
        console.log("CTFExchange:", ctfExchange);

        // 4. UmaCtfAdapter
        address umaAdapter = _deployUmaCtfAdapter(ctf, UMA_FINDER, UMA_OO_V2);
        console.log("UmaCtfAdapter:", umaAdapter);

        // 5. NegRiskAdapter
        address negRiskAdapter = _deployNegRiskAdapter(ctf, address(usdc));
        console.log("NegRiskAdapter:", negRiskAdapter);

        // 6. NegRiskCtfExchange
        address negRiskExchange = _deployNegRiskExchange(
            address(usdc), ctf, negRiskAdapter, SAFE_PROXY_FACTORY, SAFE_SINGLETON_L2
        );
        console.log("NegRiskCtfExchange:", negRiskExchange);

        // 7. WalletFactory
        WalletFactory walletFactory = new WalletFactory(
            SAFE_PROXY_FACTORY, SAFE_SINGLETON_L2, SAFE_FALLBACK_HANDLER, deployer
        );
        console.log("WalletFactory:", address(walletFactory));

        // 8. MarketFactory
        MarketFactory marketFactory = new MarketFactory(
            ctf, umaAdapter, ctfExchange, negRiskExchange, address(usdc), deployer
        );
        console.log("MarketFactory:", address(marketFactory));

        vm.stopBroadcast();

        // Summary for copy-paste into .env files
        console.log("\n=== M1 Deploy Summary (copy into .env) ===");
        console.log("MOCK_USDC_ADDRESS=", address(usdc));
        console.log("CTF_ADDRESS=", ctf);
        console.log("EXCHANGE_ADDRESS=", ctfExchange);
        console.log("UMA_ADAPTER_ADDRESS=", umaAdapter);
        console.log("NEG_RISK_ADAPTER_ADDRESS=", negRiskAdapter);
        console.log("NEG_RISK_EXCHANGE_ADDRESS=", negRiskExchange);
        console.log("WALLET_FACTORY_ADDRESS=", address(walletFactory));
        console.log("MARKET_FACTORY_ADDRESS=", address(marketFactory));
    }

    // ── Deploy helpers ────────────────────────────────────────────────────────

    /// @dev CTF is pre-compiled Solidity 0.5.1; deploy from embedded bytecode.
    function _deployCTF() internal returns (address ctf) {
        bytes memory code = ConditionalTokensBytecode.creationCode();
        assembly {
            ctf := create(0, add(code, 0x20), mload(code))
        }
        require(ctf != address(0), "CTF deploy failed");
    }

    function _deployCTFExchange(
        address collateral, address ctf, address proxyFactory, address safeFactory
    ) internal returns (address exchange) {
        bytes memory creationCode = vm.getCode("CTFExchangeShim.sol:CTFExchangeShim");
        bytes memory initCode = abi.encodePacked(creationCode, abi.encode(collateral, ctf, proxyFactory, safeFactory));
        assembly { exchange := create(0, add(initCode, 0x20), mload(initCode)) }
        require(exchange != address(0), "CTFExchange deploy failed");
    }

    function _deployUmaCtfAdapter(address ctf, address finder, address oo) internal returns (address adapter) {
        bytes memory creationCode = vm.getCode("UmaCtfAdapterShim.sol:UmaCtfAdapterShim");
        bytes memory initCode = abi.encodePacked(creationCode, abi.encode(ctf, finder, oo));
        assembly { adapter := create(0, add(initCode, 0x20), mload(initCode)) }
        require(adapter != address(0), "UmaCtfAdapter deploy failed");
    }

    function _deployNegRiskAdapter(address ctf, address collateral) internal returns (address adapter) {
        bytes memory creationCode = vm.getCode("NegRiskShims.sol:NegRiskAdapterShim");
        bytes memory initCode = abi.encodePacked(creationCode, abi.encode(ctf, collateral, address(0)));
        assembly { adapter := create(0, add(initCode, 0x20), mload(initCode)) }
        require(adapter != address(0), "NegRiskAdapter deploy failed");
    }

    function _deployNegRiskExchange(
        address collateral, address ctf, address negRiskAdapter,
        address proxyFactory, address safeFactory
    ) internal returns (address exchange) {
        bytes memory creationCode = vm.getCode("NegRiskExchangeShim.sol:NegRiskExchangeShim");
        bytes memory initCode = abi.encodePacked(creationCode, abi.encode(collateral, ctf, negRiskAdapter, proxyFactory, safeFactory));
        assembly { exchange := create(0, add(initCode, 0x20), mload(initCode)) }
        require(exchange != address(0), "NegRiskExchange deploy failed");
    }
}
