// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  PolyBet365Escrow
 * @notice Polymarket-style binary prediction market escrow.
 *         Admin creates markets; users buy YES/NO shares at 1 USDT each;
 *         admin resolves YES / NO / Cancelled; winners claim with a 2% fee;
 *         cancelled markets allow full refunds.
 * @dev    Deployed on Polygon Amoy: 0x642284206c7eF6a76c0B7E922E7CF343fe064626
 *         USDT (MockUSDT, 6 dec):   0x820D4ceFa26416dba1d91D63412154433148f835
 */
contract PolyBet365Escrow is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 public constant SHARE_PRICE   = 1e6;       // 1 USDT (6 decimals)
    uint256 public constant PLATFORM_FEE_BPS = 200;    // 2 %
    uint256 public constant BPS_DENOM     = 10_000;

    // ─── Types ────────────────────────────────────────────────────────────────
    enum Outcome { Open, YES, NO, Cancelled }

    struct Market {
        string  title;
        uint256 yesPool;        // total USDT staked on YES
        uint256 noPool;         // total USDT staked on NO
        Outcome outcome;
        bool    closed;         // no more buys when true
    }

    struct Position {
        uint256 yesShares;
        uint256 noShares;
        bool    claimed;
    }

    // ─── State ────────────────────────────────────────────────────────────────
    IERC20 public immutable usdt;

    uint256 public marketCount;
    mapping(uint256 => Market)                           public markets;
    mapping(uint256 => mapping(address => Position))     public positions;

    // ─── Events ───────────────────────────────────────────────────────────────
    event MarketCreated(uint256 indexed marketId, string title);
    event MarketClosed(uint256 indexed marketId);
    event MarketResolved(uint256 indexed marketId, Outcome outcome);
    event PositionBought(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 shares);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout);
    event Refunded(uint256 indexed marketId, address indexed user, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _usdt) Ownable(msg.sender) {
        require(_usdt != address(0), "invalid USDT");
        usdt = IERC20(_usdt);
    }

    // ─── Admin: market lifecycle ───────────────────────────────────────────────
    /**
     * @notice Create a new binary market.
     * @param  title  Human-readable question (stored on-chain for transparency).
     */
    function createMarket(string calldata title) external onlyOwner whenNotPaused {
        uint256 id = marketCount++;
        markets[id] = Market({ title: title, yesPool: 0, noPool: 0, outcome: Outcome.Open, closed: false });
        emit MarketCreated(id, title);
    }

    /// @notice Stop accepting new positions (pre-resolution).
    function closeMarket(uint256 marketId) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.outcome == Outcome.Open, "not open");
        require(!m.closed, "already closed");
        m.closed = true;
        emit MarketClosed(marketId);
    }

    /**
     * @notice Resolve a market.  Only callable after closeMarket().
     * @param  outcome  YES (1), NO (2), or Cancelled (3).
     */
    function resolveMarket(uint256 marketId, Outcome outcome) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.closed, "must close first");
        require(m.outcome == Outcome.Open, "already resolved");
        require(outcome == Outcome.YES || outcome == Outcome.NO || outcome == Outcome.Cancelled, "bad outcome");
        m.outcome = outcome;
        emit MarketResolved(marketId, outcome);
    }

    // ─── User: buy positions ───────────────────────────────────────────────────
    /**
     * @notice Buy `shares` YES or NO positions.  Cost = shares × 1 USDT.
     *         Caller must first approve this contract for the total amount.
     */
    function buyPosition(uint256 marketId, bool isYes, uint256 shares)
        external
        nonReentrant
        whenNotPaused
    {
        require(shares > 0, "zero shares");
        Market storage m = markets[marketId];
        require(!m.closed && m.outcome == Outcome.Open, "market not open");

        uint256 cost = shares * SHARE_PRICE;
        usdt.safeTransferFrom(msg.sender, address(this), cost);

        Position storage p = positions[marketId][msg.sender];
        if (isYes) {
            m.yesPool    += cost;
            p.yesShares  += shares;
        } else {
            m.noPool     += cost;
            p.noShares   += shares;
        }
        emit PositionBought(marketId, msg.sender, isYes, shares);
    }

    // ─── User: claim winnings ──────────────────────────────────────────────────
    /**
     * @notice Claim winnings after YES or NO resolution.
     *         2% platform fee is deducted from the payout.
     */
    function claimWinnings(uint256 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        require(m.outcome == Outcome.YES || m.outcome == Outcome.NO, "not resolved");

        Position storage p = positions[marketId][msg.sender];
        require(!p.claimed, "already claimed");
        p.claimed = true;

        uint256 winShares = (m.outcome == Outcome.YES) ? p.yesShares : p.noShares;
        require(winShares > 0, "no winning shares");

        uint256 gross   = winShares * SHARE_PRICE;
        uint256 fee     = (gross * PLATFORM_FEE_BPS) / BPS_DENOM;
        uint256 payout  = gross - fee;

        usdt.safeTransfer(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    /// @notice Claim a full refund when the market is cancelled.
    function claimRefund(uint256 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        require(m.outcome == Outcome.Cancelled, "not cancelled");

        Position storage p = positions[marketId][msg.sender];
        require(!p.claimed, "already claimed");
        p.claimed = true;

        uint256 total = (p.yesShares + p.noShares) * SHARE_PRICE;
        require(total > 0, "nothing to refund");

        usdt.safeTransfer(msg.sender, total);
        emit Refunded(marketId, msg.sender, total);
    }

    // ─── Views ────────────────────────────────────────────────────────────────
    function getMarket(uint256 marketId)
        external
        view
        returns (string memory title, uint256 yesPool, uint256 noPool, Outcome outcome, bool closed)
    {
        Market storage m = markets[marketId];
        return (m.title, m.yesPool, m.noPool, m.outcome, m.closed);
    }

    function getPosition(uint256 marketId, address user)
        external
        view
        returns (uint256 yesShares, uint256 noShares, bool claimed)
    {
        Position storage p = positions[marketId][user];
        return (p.yesShares, p.noShares, p.claimed);
    }

    // ─── Emergency ────────────────────────────────────────────────────────────
    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Rescue any ERC-20 accidentally sent to this contract (owner only).
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
