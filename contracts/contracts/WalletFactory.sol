// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  IGnosisSafeProxyFactory — minimal interface
 */
interface IGnosisSafeProxyFactory {
    function createProxyWithNonce(
        address singleton,
        bytes   memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);

    function proxyCreationCode() external pure returns (bytes memory);
}

/**
 * @title  IGnosisSafe — minimal Safe interface for initialization
 */
interface IGnosisSafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes   calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}

/**
 * @title  WalletFactory
 * @notice Deterministic (CREATE2) 1-of-1 Gnosis Safe proxy per user.
 *         - Each user's proxy is derived from their address via a fixed salt.
 *         - Deploys the proxy on first use; subsequent calls return the
 *           already-deployed address (no re-deploy).
 *         - The Safe owner is the user's EOA (or Magic wallet address).
 *         - Operator / relayer can call on behalf of users (meta-tx pattern).
 *
 * @dev    Deployed by DeployM1.s.sol.
 *         On Polygon Amoy the Gnosis Safe singleton and proxy factory already
 *         have canonical deployments at well-known addresses.
 */
contract WalletFactory is Ownable {

    // ─── State ────────────────────────────────────────────────────────────────
    IGnosisSafeProxyFactory public immutable proxyFactory;
    address                 public immutable safeSingleton;
    address                 public immutable fallbackHandler;

    mapping(address => address) private _proxies; // owner → proxy

    // ─── Events ───────────────────────────────────────────────────────────────
    event ProxyCreated(address indexed owner, address indexed proxy);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address _proxyFactory,
        address _safeSingleton,
        address _fallbackHandler,
        address _admin
    ) Ownable(_admin) {
        require(_proxyFactory   != address(0), "factory=0");
        require(_safeSingleton  != address(0), "singleton=0");
        proxyFactory    = IGnosisSafeProxyFactory(_proxyFactory);
        safeSingleton   = _safeSingleton;
        fallbackHandler = _fallbackHandler;
    }

    // ─── Core ─────────────────────────────────────────────────────────────────
    /**
     * @notice Return the proxy wallet for `owner`, deploying it if needed.
     * @param  owner  The EOA / Magic address that will own the Safe.
     * @return proxy  The deployed Safe proxy address.
     */
    function getOrCreateProxy(address owner) external returns (address proxy) {
        proxy = _proxies[owner];
        if (proxy != address(0)) return proxy;

        // Build Safe setup calldata: 1-of-1 owner, no modules, no payment
        address[] memory owners = new address[](1);
        owners[0] = owner;

        bytes memory initializer = abi.encodeWithSelector(
            IGnosisSafe.setup.selector,
            owners,
            1,               // threshold = 1
            address(0),      // to (no delegate call)
            bytes(""),       // data
            fallbackHandler,
            address(0),      // paymentToken
            0,               // payment
            payable(address(0)) // paymentReceiver
        );

        // Deterministic salt: keccak256(owner address) so same address always
        // produces the same proxy address on any chain with same factory/singleton.
        uint256 saltNonce = uint256(keccak256(abi.encodePacked(owner)));

        proxy = proxyFactory.createProxyWithNonce(safeSingleton, initializer, saltNonce);
        _proxies[owner] = proxy;

        emit ProxyCreated(owner, proxy);
    }

    /**
     * @notice Predict the proxy address for `owner` without deploying.
     *         Uses the same CREATE2 parameters as getOrCreateProxy.
     */
    function predictProxyAddress(address owner) external view returns (address) {
        uint256 saltNonce = uint256(keccak256(abi.encodePacked(owner)));
        bytes memory creationCode = proxyFactory.proxyCreationCode();
        bytes memory deploymentData = abi.encodePacked(creationCode, uint256(uint160(safeSingleton)));
        bytes32 salt = keccak256(abi.encodePacked(keccak256(bytes("")), saltNonce));
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(proxyFactory), salt, keccak256(deploymentData))
        );
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Read proxy for owner (returns address(0) if not deployed yet).
     */
    function proxyOf(address owner) external view returns (address) {
        return _proxies[owner];
    }

    /**
     * @notice Admin can pre-register a proxy that was deployed externally.
     */
    function registerProxy(address owner, address proxy) external onlyOwner {
        require(_proxies[owner] == address(0), "already registered");
        _proxies[owner] = proxy;
        emit ProxyCreated(owner, proxy);
    }
}
