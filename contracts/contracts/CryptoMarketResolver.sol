// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CryptoMarketResolver
 * @notice Chainlink Automation upkeep contract that auto-resolves expired
 *         crypto-price prediction markets on-chain.
 *
 * @dev M7 Mainnet milestone — on-chain equivalent of priceMarketResolver.js.
 *
 *      Flow:
 *        1. MarketFactory creates a market with a target price + feed address.
 *        2. This contract is registered as a Chainlink Automation upkeep.
 *        3. checkUpkeep() returns true when any market is past its endTime and unresolved.
 *        4. performUpkeep() reads the Chainlink feed, resolves the market YES/NO,
 *           and calls UmaCtfAdapter.resolveQuestion() or the CTF directly.
 *
 *      Registration:
 *        https://automation.chain.link  → "Register new Upkeep" → Custom Logic
 *        Fund with LINK; set gas limit to ~500 000.
 *
 *      Chainlink Automation docs:
 *        https://docs.chain.link/chainlink-automation/guides/compatible-contracts
 */

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80  roundId,
        int256  answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80  answeredInRound
    );
    function decimals() external view returns (uint8);
}

interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

/// @dev Minimal interface to the MarketFactory — extend as needed.
interface IMarketFactory {
    function resolveMarket(uint256 marketId, bool outcome) external;
}

contract CryptoMarketResolver is AutomationCompatibleInterface {

    struct PriceMarket {
        uint256 id;           // MarketFactory market ID
        address feed;         // Chainlink AggregatorV3 feed address
        int256  targetPrice;  // Price threshold (scaled to feed decimals)
        uint256 endTime;      // Unix timestamp after which resolution is valid
        bool    resolved;
    }

    address public owner;
    IMarketFactory public marketFactory;
    uint256 public maxStaleSec = 3600;

    uint256 private _nextId;
    mapping(uint256 => PriceMarket) public markets;
    uint256[] private _marketIds;

    event MarketRegistered(uint256 indexed internalId, uint256 factoryMarketId, address feed, int256 target, uint256 endTime);
    event MarketResolved(uint256 indexed internalId, uint256 factoryMarketId, bool outcome, int256 price);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(address _marketFactory) {
        owner = msg.sender;
        marketFactory = IMarketFactory(_marketFactory);
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function registerMarket(
        uint256 factoryMarketId,
        address feed,
        int256  targetPrice,
        uint256 endTime
    ) external onlyOwner returns (uint256 internalId) {
        internalId = _nextId++;
        markets[internalId] = PriceMarket(factoryMarketId, feed, targetPrice, endTime, false);
        _marketIds.push(internalId);
        emit MarketRegistered(internalId, factoryMarketId, feed, targetPrice, endTime);
    }

    function setMaxStaleSec(uint256 sec) external onlyOwner { maxStaleSec = sec; }
    function transferOwnership(address newOwner) external onlyOwner { owner = newOwner; }

    // ── Chainlink Automation ─────────────────────────────────────────────────

    /**
     * @notice Called off-chain by the Chainlink Automation network every block.
     * Returns upkeepNeeded=true (and the first resolvable market's id) when
     * any registered market is expired and unresolved.
     */
    function checkUpkeep(bytes calldata)
        external view override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        for (uint256 i = 0; i < _marketIds.length; i++) {
            uint256 mid = _marketIds[i];
            PriceMarket storage m = markets[mid];
            if (!m.resolved && block.timestamp >= m.endTime) {
                // Quick sanity: feed must be fresh
                (, int256 answer,, uint256 updatedAt,) = AggregatorV3Interface(m.feed).latestRoundData();
                if (answer > 0 && block.timestamp - updatedAt <= maxStaleSec) {
                    return (true, abi.encode(mid));
                }
            }
        }
        return (false, bytes(""));
    }

    /**
     * @notice Called on-chain by the Chainlink Automation network when
     * checkUpkeep returns true. Reads the feed and resolves the market.
     */
    function performUpkeep(bytes calldata performData) external override {
        uint256 mid = abi.decode(performData, (uint256));
        PriceMarket storage m = markets[mid];

        require(!m.resolved, "Already resolved");
        require(block.timestamp >= m.endTime, "Not yet expired");

        AggregatorV3Interface feed = AggregatorV3Interface(m.feed);
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();

        require(answer > 0, "Non-positive feed answer");
        require(block.timestamp - updatedAt <= maxStaleSec, "Stale feed");

        bool outcome = answer >= m.targetPrice;
        m.resolved = true;

        marketFactory.resolveMarket(m.id, outcome);

        emit MarketResolved(mid, m.id, outcome, answer);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    function getMarketCount() external view returns (uint256) { return _marketIds.length; }

    function latestPrice(address feed) external view returns (int256 price, uint256 updatedAt) {
        (, price,, updatedAt,) = AggregatorV3Interface(feed).latestRoundData();
    }
}
