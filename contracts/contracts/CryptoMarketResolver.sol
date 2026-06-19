// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CryptoMarketResolver
 * @notice Chainlink Automation upkeep contract that auto-resolves expired
 *         crypto-price prediction markets on-chain.
 *
 * @dev M7 Mainnet milestone — on-chain equivalent of priceMarketResolver.js.
 *
 *      Flow:
 *        1. A binary CTF condition is prepared with THIS contract as the oracle:
 *               ConditionalTokens.prepareCondition(resolver, questionId, 2)
 *           (see CryptoMarketResolver deployment notes). The market is then
 *           registered here via registerMarket(questionId, feed, target, ...).
 *        2. This contract is registered as a Chainlink Automation upkeep.
 *        3. checkUpkeep() returns true when any market is past its endTime,
 *           unresolved, and has a fresh Chainlink feed.
 *        4. performUpkeep() reads the Chainlink feed, derives the YES/NO outcome,
 *           and reports it directly to the CTF via reportPayouts(questionId, payouts).
 *
 *      IMPORTANT (deployment): for reportPayouts() to succeed, the condition
 *      MUST have been prepared with this resolver's address as the oracle and
 *      outcomeSlotCount == 2. Payout slots: index 0 = YES, index 1 = NO.
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

/// @dev Minimal interface to the Gnosis Conditional Tokens Framework (CTF).
///      reportPayouts is callable only by the oracle that prepared the condition.
interface IConditionalTokens {
    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external;
}

contract CryptoMarketResolver is AutomationCompatibleInterface, Ownable2Step, ReentrancyGuard {

    /// @notice Direction of the price comparison used to derive the YES outcome.
    ///         GTE: YES iff price >= targetPrice. LTE: YES iff price <= targetPrice.
    enum Comparator { GTE, LTE }

    struct PriceMarket {
        bytes32    questionId;   // CTF questionId (condition prepared with this resolver as oracle)
        address    feed;         // Chainlink AggregatorV3 feed address
        int256     targetPrice;  // Price threshold (scaled to feed decimals)
        uint64     endTime;      // Unix timestamp after which resolution is valid
        Comparator comparator;   // Comparison direction
        bool       resolved;     // Set once payouts have been reported
    }

    // ─── Constants ──────────────────────────────────────────────────────────
    uint256 public constant BINARY_OUTCOME_SLOTS = 2;
    uint256 public constant MIN_STALE_SEC        = 60;
    uint256 public constant MAX_STALE_SEC_LIMIT  = 7 days;

    // ─── State ──────────────────────────────────────────────────────────────
    IConditionalTokens public immutable ctf;
    uint256 public maxStaleSec;
    /// @notice Optional Chainlink Automation forwarder. If set (non-zero),
    ///         performUpkeep() may only be called by it. If zero, resolution is
    ///         permissionless — safe because the outcome derives solely from
    ///         on-chain Chainlink data and block.timestamp.
    address public forwarder;

    mapping(bytes32 => PriceMarket) public markets;        // questionId → market
    bytes32[] private _activeQuestionIds;                  // unresolved markets only
    mapping(bytes32 => uint256) private _activeIndexPlusOne; // questionId → (index + 1)

    // ─── Events ─────────────────────────────────────────────────────────────
    event MarketRegistered(bytes32 indexed questionId, address feed, int256 targetPrice, Comparator comparator, uint64 endTime);
    event MarketResolved(bytes32 indexed questionId, bool outcome, int256 price);
    event MarketRemoved(bytes32 indexed questionId);
    event MaxStaleSecUpdated(uint256 oldValue, uint256 newValue);
    event ForwarderUpdated(address oldForwarder, address newForwarder);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address _ctf, address _admin) Ownable(_admin) {
        require(_ctf   != address(0), "ctf=0");
        require(_admin != address(0), "admin=0");
        ctf = IConditionalTokens(_ctf);
        maxStaleSec = 3600;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Register a price market for automated resolution.
     * @param questionId  CTF questionId; condition must be prepared with this
     *                    resolver as oracle and 2 outcome slots.
     * @param feed        Chainlink AggregatorV3 price feed.
     * @param targetPrice Threshold in feed decimals.
     * @param comparator  GTE or LTE (see Comparator).
     * @param endTime     Resolution becomes valid at/after this timestamp.
     */
    function registerMarket(
        bytes32    questionId,
        address    feed,
        int256     targetPrice,
        Comparator comparator,
        uint64     endTime
    ) external onlyOwner {
        require(questionId != bytes32(0),          "questionId=0");
        require(feed != address(0),                "feed=0");
        require(endTime > block.timestamp,         "endTime in past");
        require(markets[questionId].feed == address(0), "exists");

        markets[questionId] = PriceMarket({
            questionId:  questionId,
            feed:        feed,
            targetPrice: targetPrice,
            endTime:     endTime,
            comparator:  comparator,
            resolved:    false
        });
        _activeQuestionIds.push(questionId);
        _activeIndexPlusOne[questionId] = _activeQuestionIds.length;

        emit MarketRegistered(questionId, feed, targetPrice, comparator, endTime);
    }

    /**
     * @notice Remove an unresolved, mis-configured market from the active set
     *         (e.g. a deprecated feed). Cannot remove already-resolved markets.
     */
    function removeMarket(bytes32 questionId) external onlyOwner {
        PriceMarket storage m = markets[questionId];
        require(m.feed != address(0), "unknown");
        require(!m.resolved,          "resolved");
        _removeActive(questionId);
        delete markets[questionId];
        emit MarketRemoved(questionId);
    }

    function setMaxStaleSec(uint256 newMaxStaleSec) external onlyOwner {
        require(newMaxStaleSec >= MIN_STALE_SEC && newMaxStaleSec <= MAX_STALE_SEC_LIMIT, "out of range");
        emit MaxStaleSecUpdated(maxStaleSec, newMaxStaleSec);
        maxStaleSec = newMaxStaleSec;
    }

    function setForwarder(address newForwarder) external onlyOwner {
        emit ForwarderUpdated(forwarder, newForwarder);
        forwarder = newForwarder;
    }

    // ── Chainlink Automation ─────────────────────────────────────────────────

    /**
     * @notice Called off-chain by the Chainlink Automation network. Returns
     * upkeepNeeded=true (with the first resolvable questionId) when any market
     * is expired, unresolved, and backed by a fresh feed.
     * @dev Iterates only the unresolved (active) set; resolved markets are
     *      removed on resolution so the loop cannot grow unboundedly. A failing
     *      feed is skipped (try/catch) rather than reverting the whole check.
     */
    function checkUpkeep(bytes calldata)
        external view override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 len = _activeQuestionIds.length;
        for (uint256 i = 0; i < len; i++) {
            bytes32 qid = _activeQuestionIds[i];
            PriceMarket storage m = markets[qid];
            if (m.resolved || block.timestamp < m.endTime) continue;

            try AggregatorV3Interface(m.feed).latestRoundData() returns (
                uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80 answeredInRound
            ) {
                if (
                    answer > 0 &&
                    updatedAt != 0 &&
                    answeredInRound >= roundId &&
                    block.timestamp - updatedAt <= maxStaleSec
                ) {
                    return (true, abi.encode(qid));
                }
            } catch {
                continue;
            }
        }
        return (false, bytes(""));
    }

    /**
     * @notice Resolve an expired market by reading the Chainlink feed and
     * reporting payouts to the CTF. Effects are applied before the external
     * CTF interaction (checks-effects-interactions) and guarded against reentrancy.
     */
    function performUpkeep(bytes calldata performData) external override nonReentrant {
        if (forwarder != address(0)) {
            require(msg.sender == forwarder, "!forwarder");
        }

        bytes32 qid = abi.decode(performData, (bytes32));
        PriceMarket storage m = markets[qid];

        require(m.feed != address(0),       "unknown market");
        require(!m.resolved,                "already resolved");
        require(block.timestamp >= m.endTime, "not expired");

        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) =
            AggregatorV3Interface(m.feed).latestRoundData();

        require(answer > 0,                              "bad answer");
        require(updatedAt != 0,                          "round incomplete");
        require(answeredInRound >= roundId,              "stale round");
        require(block.timestamp - updatedAt <= maxStaleSec, "stale feed");

        bool outcome = m.comparator == Comparator.GTE
            ? answer >= m.targetPrice
            : answer <= m.targetPrice;

        // Effects
        m.resolved = true;
        _removeActive(qid);

        // Interaction: report payouts to CTF — slot 0 = YES, slot 1 = NO.
        uint256[] memory payouts = new uint256[](BINARY_OUTCOME_SLOTS);
        if (outcome) {
            payouts[0] = 1; // YES
        } else {
            payouts[1] = 1; // NO
        }
        ctf.reportPayouts(qid, payouts);

        emit MarketResolved(qid, outcome, answer);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    function activeMarketCount() external view returns (uint256) {
        return _activeQuestionIds.length;
    }

    function activeQuestionIdAt(uint256 index) external view returns (bytes32) {
        return _activeQuestionIds[index];
    }

    function latestPrice(address feed) external view returns (int256 price, uint256 updatedAt) {
        (, price,, updatedAt,) = AggregatorV3Interface(feed).latestRoundData();
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    /// @dev O(1) swap-and-pop removal from the active question-id set.
    function _removeActive(bytes32 questionId) internal {
        uint256 indexPlusOne = _activeIndexPlusOne[questionId];
        if (indexPlusOne == 0) return; // not in active set
        uint256 index   = indexPlusOne - 1;
        uint256 lastIdx = _activeQuestionIds.length - 1;
        if (index != lastIdx) {
            bytes32 lastQid = _activeQuestionIds[lastIdx];
            _activeQuestionIds[index] = lastQid;
            _activeIndexPlusOne[lastQid] = index + 1;
        }
        _activeQuestionIds.pop();
        delete _activeIndexPlusOne[questionId];
    }
}
