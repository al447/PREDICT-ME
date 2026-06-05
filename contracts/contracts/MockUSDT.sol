// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @notice Test-net collateral token for PolyBet365.  Mirrors real USDT:
 *         6 decimals, public faucet mints 10 000 tokens per call.
 * @dev    Deployed on Polygon Amoy: 0x820D4ceFa26416dba1d91D63412154433148f835
 */
contract MockUSDT is ERC20, Ownable {
    uint8 private constant _DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** _DECIMALS;

    constructor() ERC20("Mock USDT", "USDT") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * 10 ** _DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Anyone can call this once to receive 10 000 USDT for testing.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner can mint arbitrary amounts (e.g. to top-up platform wallet).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
