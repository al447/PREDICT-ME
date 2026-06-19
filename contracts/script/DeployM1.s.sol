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

    // ── Gnosis Safe canonical addresses (identical on Amoy 80002 + Polygon 137) ─
    address constant SAFE_PROXY_FACTORY    = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
    address constant SAFE_SINGLETON_L2     = 0x3E5c63644E683549055b9Be8653de26E0B4CD36E;
    address constant SAFE_FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;

    // ── UMA addresses on Polygon Amoy (chainId 80002) ─────────────────────────
    address constant UMA_FINDER_AMOY       = 0x28077B47Cd03326De7838926A63699849DD4fa87;
    address constant UMA_OO_V2_AMOY        = 0x38fAc33bD20D4c4Cce085C0f347153C06CbA2968;

    // ── UMA addresses on Polygon mainnet (chainId 137) ────────────────────────
    // Source: UMAprotocol/protocol packages/core/networks/137.json
    address constant UMA_FINDER_POLYGON    = 0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64;
    address constant UMA_OO_V2_POLYGON     = 0xeE3Afe347D5C74317041E2618C49534dAf887c24;

    // ── Native USDC on Polygon mainnet (Circle, 6 decimals) ───────────────────
    address constant USDC_POLYGON          = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;

    struct DeployResult {
        address collateral;
        address ctf;
        address ctfExchange;
        address umaAdapter;
        address negRiskAdapter;
        address negRiskExchange;
        address walletFactory;
        address marketFactory;
    }

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        bool    isMainnet   = block.chainid == 137;

        console.log("=== PolyBet365 M1 Deploy ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Mainnet:", isMainnet);

        vm.startBroadcast(deployerKey);
        DeployResult memory r = _deployAll(deployer, isMainnet);
        vm.stopBroadcast();

        console.log("\n=== M1 Deploy Summary (copy into .env) ===");
        console.log("MOCK_USDC_ADDRESS=", r.collateral);
        console.log("CTF_ADDRESS=", r.ctf);
        console.log("EXCHANGE_ADDRESS=", r.ctfExchange);
        console.log("UMA_ADAPTER_ADDRESS=", r.umaAdapter);
        console.log("NEG_RISK_ADAPTER_ADDRESS=", r.negRiskAdapter);
        console.log("NEG_RISK_EXCHANGE_ADDRESS=", r.negRiskExchange);
        console.log("WALLET_FACTORY_ADDRESS=", r.walletFactory);
        console.log("MARKET_FACTORY_ADDRESS=", r.marketFactory);
    }

    function _deployAll(address deployer, bool isMainnet) internal returns (DeployResult memory r) {
        // 1. Collateral token.
        //    - Mainnet: MUST use real USDC. Read COLLATERAL_TOKEN env (defaults
        //      to native Polygon USDC). NEVER deploy MockUSDC on mainnet.
        //    - Testnet: deploy a fresh MockUSDC unless COLLATERAL_TOKEN is set.
        r.collateral = vm.envOr("COLLATERAL_TOKEN", address(0));
        if (r.collateral == address(0)) {
            require(!isMainnet, "mainnet: set COLLATERAL_TOKEN to real USDC (0x3c49...)");
            MockUSDC usdc = new MockUSDC(deployer);
            r.collateral = address(usdc);
            console.log("MockUSDC (testnet collateral):", r.collateral);
        } else {
            console.log("Collateral (existing USDC):", r.collateral);
        }

        // 2. ConditionalTokens — deployed via pre-compiled bytecode (solc 0.5.1)
        r.ctf = _deployCTF();
        console.log("ConditionalTokens:", r.ctf);

        // 3. CTFExchange
        r.ctfExchange = _deployCTFExchange(r.collateral, r.ctf, SAFE_PROXY_FACTORY, SAFE_SINGLETON_L2);
        console.log("CTFExchange:", r.ctfExchange);

        // 4. UmaCtfAdapter
        {
            address umaFinder = vm.envOr("UMA_FINDER", isMainnet ? UMA_FINDER_POLYGON : UMA_FINDER_AMOY);
            address umaOO     = vm.envOr("UMA_OO_V2",  isMainnet ? UMA_OO_V2_POLYGON  : UMA_OO_V2_AMOY);
            console.log("UMA Finder:", umaFinder);
            console.log("UMA OOV2:", umaOO);
            r.umaAdapter = _deployUmaCtfAdapter(r.ctf, umaFinder, umaOO);
        }
        console.log("UmaCtfAdapter:", r.umaAdapter);

        // 5. NegRiskAdapter
        r.negRiskAdapter = _deployNegRiskAdapter(r.ctf, r.collateral);
        console.log("NegRiskAdapter:", r.negRiskAdapter);

        // 6. NegRiskCtfExchange
        r.negRiskExchange = _deployNegRiskExchange(
            r.collateral, r.ctf, r.negRiskAdapter, SAFE_PROXY_FACTORY, SAFE_SINGLETON_L2
        );
        console.log("NegRiskCtfExchange:", r.negRiskExchange);

        // 7. WalletFactory
        r.walletFactory = address(new WalletFactory(
            SAFE_PROXY_FACTORY, SAFE_SINGLETON_L2, SAFE_FALLBACK_HANDLER, deployer
        ));
        console.log("WalletFactory:", r.walletFactory);

        // 8. MarketFactory
        r.marketFactory = address(new MarketFactory(
            r.ctf, r.umaAdapter, r.ctfExchange, r.negRiskExchange, r.collateral, deployer
        ));
        console.log("MarketFactory:", r.marketFactory);

        // 9. Post-deploy: add MarketFactory as admin on CTFExchange and NegRiskExchange
        _addAdmin(r.ctfExchange, r.marketFactory);
        _addAdmin(r.negRiskExchange, r.marketFactory);
        // Add deployer as operator on exchanges so the CLOB relayer can settle trades
        _addOperator(r.ctfExchange, deployer);
        _addOperator(r.negRiskExchange, deployer);
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

    /// @dev Call addAdmin(address) on an exchange contract
    function _addAdmin(address exchange, address admin) internal {
        (bool ok, ) = exchange.call(abi.encodeWithSignature("addAdmin(address)", admin));
        if (!ok) console.log("Warning: addAdmin failed on", exchange, "for", admin);
        else console.log("addAdmin:", admin, "on", exchange);
    }

    /// @dev Call addOperator(address) on an exchange contract
    function _addOperator(address exchange, address operator) internal {
        (bool ok, ) = exchange.call(abi.encodeWithSignature("addOperator(address)", operator));
        if (!ok) console.log("Warning: addOperator failed on", exchange, "for", operator);
        else console.log("addOperator:", operator, "on", exchange);
    }
}
