// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title  IConditionalTokens — minimal CTF interface used by MarketFactory
 */
interface IConditionalTokens {
    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external;
    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external pure returns (bytes32);
    function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) external view returns (bytes32);
    function getPositionId(address collateralToken, bytes32 collectionId) external pure returns (uint256);
    function payoutDenominator(bytes32 conditionId) external view returns (uint256);
}

/**
 * @title  IUmaCtfAdapter — minimal interface for question initialization
 */
interface IUmaCtfAdapter {
    function initialize(
        bytes memory ancillaryData,
        address rewardToken,
        uint256 reward,
        uint256 proposalBond,
        uint256 liveness
    ) external returns (bytes32 questionId);
}

/**
 * @title  ICTFExchange — minimal interface for token registration
 */
interface ICTFExchange {
    function registerToken(uint256 token0, uint256 token1, bytes32 conditionId) external;
}

/**
 * @title  MarketFactory
 * @notice Creates binary prediction markets on Polymarket's CTF stack.
 *         1. Calls UmaCtfAdapter.initialize() → gets questionId
 *         2. Calls ConditionalTokens.prepareCondition()
 *         3. Computes YES/NO ERC1155 tokenIds
 *         4. Registers them on the CTFExchange
 *         5. Emits MarketCreated with all on-chain identifiers for indexing
 *
 * @dev    Deployed by DeployM1.s.sol.
 */
contract MarketFactory is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────
    struct MarketInfo {
        bytes32  questionId;
        bytes32  conditionId;
        uint256  token0;        // YES tokenId
        uint256  token1;        // NO  tokenId
        address  collateral;
        uint256  createdAt;
        bool     negRisk;
    }

    // ─── State ────────────────────────────────────────────────────────────────
    IConditionalTokens public immutable ctf;
    IUmaCtfAdapter     public immutable umaAdapter;
    ICTFExchange       public immutable exchange;
    ICTFExchange       public immutable negRiskExchange; // may be address(0) if not used
    address            public immutable collateral;

    bytes32 public constant EMPTY_PARENT_COLLECTION = bytes32(0);
    uint256 public constant BINARY_OUTCOME_SLOTS    = 2;

    mapping(bytes32 => MarketInfo) public markets; // conditionId → info
    bytes32[] public allConditionIds;

    // ─── Events ───────────────────────────────────────────────────────────────
    event MarketCreated(
        bytes32 indexed conditionId,
        bytes32 indexed questionId,
        uint256 token0,
        uint256 token1,
        address collateral,
        bool    negRisk,
        bytes   ancillaryData
    );

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address _ctf,
        address _umaAdapter,
        address _exchange,
        address _negRiskExchange,
        address _collateral,
        address _admin
    ) Ownable(_admin) {
        require(_ctf          != address(0), "ctf=0");
        require(_umaAdapter   != address(0), "umaAdapter=0");
        require(_exchange     != address(0), "exchange=0");
        require(_collateral   != address(0), "collateral=0");
        ctf             = IConditionalTokens(_ctf);
        umaAdapter      = IUmaCtfAdapter(_umaAdapter);
        exchange        = ICTFExchange(_exchange);
        negRiskExchange = ICTFExchange(_negRiskExchange);
        collateral      = _collateral;
    }

    // ─── Market creation ─────────────────────────────────────────────────────
    /**
     * @notice Create a new binary prediction market.
     * @param ancillaryData  The UMA-formatted question string (UTF-8 bytes).
     * @param rewardToken    Token used for the UMA reward (usually same as collateral).
     * @param reward         UMA reward amount (wei of rewardToken, may be 0).
     * @param proposalBond   UMA bond required to propose/dispute (wei).
     * @param liveness       UMA dispute liveness window in seconds (e.g. 7200 = 2h).
     * @param useNegRisk     Register on NegRisk exchange (for multi-outcome groups).
     * @return conditionId   The Gnosis CTF conditionId.
     */
    struct _CreateVars {
        bytes32 questionId;
        bytes32 conditionId;
        bytes32 yesCollection;
        bytes32 noCollection;
        uint256 token0;
        uint256 token1;
    }

    function createMarket(
        bytes   calldata ancillaryData,
        address rewardToken,
        uint256 reward,
        uint256 proposalBond,
        uint256 liveness,
        bool    useNegRisk
    ) external onlyOwner nonReentrant returns (bytes32) {
        require(ancillaryData.length != 0, "ancillaryData=0");
        require(rewardToken != address(0), "rewardToken=0");

        _CreateVars memory v;

        // 0. If a UMA reward is configured, pull it from the caller and approve
        //    the adapter to spend exactly that amount. UmaCtfAdapter.initialize()
        //    transfers `reward` of `rewardToken` from msg.sender (this factory).
        if (reward > 0) {
            IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), reward);
            IERC20(rewardToken).forceApprove(address(umaAdapter), reward);
        }

        // 1. Initialize UMA question → get questionId
        //    NOTE: UmaCtfAdapter.initialize() calls ctf.prepareCondition() internally,
        //    so we must NOT call it again here.
        v.questionId = umaAdapter.initialize(ancillaryData, rewardToken, reward, proposalBond, liveness);

        // Clear any residual allowance (defense-in-depth; adapter pulls exactly `reward`).
        if (reward > 0) {
            IERC20(rewardToken).forceApprove(address(umaAdapter), 0);
        }

        // 2. Derive conditionId (condition already prepared by UmaCtfAdapter)
        v.conditionId = ctf.getConditionId(address(umaAdapter), v.questionId, BINARY_OUTCOME_SLOTS);

        // Guard against silently overwriting an existing market (duplicate ancillaryData
        // yields the same questionId/conditionId).
        require(markets[v.conditionId].createdAt == 0, "market exists");

        // 3. Derive YES/NO ERC1155 tokenIds
        v.yesCollection = ctf.getCollectionId(EMPTY_PARENT_COLLECTION, v.conditionId, 1);
        v.noCollection  = ctf.getCollectionId(EMPTY_PARENT_COLLECTION, v.conditionId, 2);
        v.token0 = ctf.getPositionId(collateral, v.yesCollection);
        v.token1 = ctf.getPositionId(collateral, v.noCollection);

        // 4. Store state BEFORE external exchange interactions (checks-effects-interactions)
        markets[v.conditionId] = MarketInfo({
            questionId:  v.questionId,
            conditionId: v.conditionId,
            token0:      v.token0,
            token1:      v.token1,
            collateral:  collateral,
            createdAt:   block.timestamp,
            negRisk:     useNegRisk
        });
        allConditionIds.push(v.conditionId);

        // 5. Register on exchange(s)
        exchange.registerToken(v.token0, v.token1, v.conditionId);
        if (useNegRisk && address(negRiskExchange) != address(0)) {
            negRiskExchange.registerToken(v.token0, v.token1, v.conditionId);
        }

        emit MarketCreated(v.conditionId, v.questionId, v.token0, v.token1, collateral, useNegRisk, ancillaryData);
        return v.conditionId;
    }

    // ─── Views ────────────────────────────────────────────────────────────────
    function getMarket(bytes32 conditionId) external view returns (MarketInfo memory) {
        return markets[conditionId];
    }

    function marketCount() external view returns (uint256) {
        return allConditionIds.length;
    }
}
