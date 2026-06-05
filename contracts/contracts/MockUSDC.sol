// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  MockUSDC
 * @notice 6-decimal ERC-20 used as canonical CTF collateral on Polygon Amoy testnet.
 *         Anyone can mint via faucet() for testing.
 * @dev    Deployed by DeployM1.s.sol.  Address written to contracts/deployments/amoy.json.
 */
contract MockUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** 6; // 10 000 USDC per call
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    mapping(address => uint256) public lastFaucet;

    event Faucet(address indexed to, uint256 amount);

    constructor(address admin) ERC20("USD Coin (Test)", "USDC") Ownable(admin) {
        _mint(admin, 1_000_000_000 * 10 ** 6); // 1 B USDC to deployer
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Anyone can call once per 24 h to receive 10 000 USDC.
    function faucet() external {
        require(block.timestamp >= lastFaucet[msg.sender] + FAUCET_COOLDOWN, "Cooldown active");
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Faucet(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner can mint arbitrary amounts (for seeding liquidity, etc.).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
