// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RutiqRuleMath} from "./RutiqRuleMath.sol";

interface IRutiqFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IRutiqArbSys {
    function arbBlockNumber() external view returns (uint256);
}

/// @title RutiqDecisionLog
/// @notice A public log of PAPER trading decisions made by rule sets on Robinhood Chain. No funds, no tokens, no orders, no admin.
///         A wallet registers a rule set (entry/exit conditions on a Chainlink price feed, size, fee, stop, take-profit, daily entry
///         limit, schedule). For every bar it may then commit the decision; the contract re-reads the referenced Chainlink rounds,
///         proves each one is the close of its bar, recomputes the rule and only accepts the decision the rule actually makes.
///         The paper account (cash, units, fees) is updated on chain from the proven closes.
/// @dev What a committed log proves and what it does not: every committed decision followed the rule at its bar, at prices anyone can
///      re-read with getRoundData. Bars that were never committed are not checked; `gapBars` records how many bars were skipped before
///      each decision, so a gap-free log is visible as such. Decisions can only be committed for bars that close after registration
///      (no back-filling a backtest as if it had run live).
contract RutiqDecisionLog {
    using RutiqRuleMath for RutiqRuleMath.RuleParams;

    /// @notice Bars must be closed at least this long before they can be committed, so no later round can still land inside the bar.
    uint256 public constant SETTLE = 120;
    address private constant ARBSYS = address(0x64);

    struct RuleSet {
        address owner;
        uint64 registeredAt;
        bool retired;
        bytes32 specHash; // keccak256 of the off-chain JSON spec (labels, notes); informational
        bytes32 paramsHash; // keccak256(abi.encode(params))
    }

    struct Decision {
        uint64 barEnd;
        uint80 roundId; // round that is the close of the decision bar
        int64 price; // that round's answer
        uint8 action;
        uint8 reason;
        uint32 gapBars; // bars skipped since the previous committed decision
        uint64 l2Block;
        uint128 cashAfter;
        uint128 unitsAfter;
    }

    RuleSet[] private _sets;
    mapping(uint256 => RutiqRuleMath.RuleParams) private _params;
    mapping(uint256 => RutiqRuleMath.PaperState) private _state;
    mapping(uint256 => Decision[]) private _decisions;
    mapping(address => uint256[]) private _byOwner;

    event RuleSetRegistered(uint256 indexed id, address indexed owner, address indexed feed, uint32 interval, bytes32 paramsHash, bytes32 specHash);
    event RuleSetRetired(uint256 indexed id);
    event DecisionCommitted(
        uint256 indexed id,
        uint256 indexed seq,
        uint64 barEnd,
        uint80 roundId,
        int64 price,
        uint8 action,
        uint8 reason,
        uint32 gapBars,
        uint128 cashAfter,
        uint128 unitsAfter
    );

    error NotOwner();
    error UnknownRuleSet();
    error Retired();
    error FeedNotUsable();
    error BarNotAligned();
    error BarNotSettled();
    error BarBeforeRegistration();
    error BarNotAfterLast();
    error WrongRoundCount(uint256 expected);
    error RoundNotClose(uint256 index);
    error RoundsNotOrdered(uint256 index);
    error BadAnswer(uint256 index);
    error DecisionMismatch(uint8 expectedAction, uint8 expectedReason);

    // ---- registration ----------------------------------------------------------------------------------------------------

    /// @notice Registers a rule set owned by the caller and starts its paper account with params.startCash.
    function register(RutiqRuleMath.RuleParams calldata params, bytes32 specHash) external returns (uint256 id) {
        RutiqRuleMath.RuleParams memory p = params;
        p.validate();
        if (p.feed.code.length == 0) revert FeedNotUsable();
        try IRutiqFeed(p.feed).decimals() returns (uint8 d) {
            if (d != RutiqRuleMath.FEED_DECIMALS) revert FeedNotUsable();
        } catch {
            revert FeedNotUsable();
        }
        try IRutiqFeed(p.feed).latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            if (answer <= 0 || updatedAt == 0) revert FeedNotUsable();
        } catch {
            revert FeedNotUsable();
        }
        id = _sets.length;
        bytes32 ph = keccak256(abi.encode(p));
        _sets.push(RuleSet({owner: msg.sender, registeredAt: uint64(block.timestamp), retired: false, specHash: specHash, paramsHash: ph}));
        _params[id] = p;
        _state[id].cash = p.startCash;
        _byOwner[msg.sender].push(id);
        emit RuleSetRegistered(id, msg.sender, p.feed, p.interval, ph, specHash);
    }

    /// @notice Stops further commits. The log stays readable forever.
    function retire(uint256 id) external {
        RuleSet storage r = _set(id);
        if (r.owner != msg.sender) revert NotOwner();
        if (r.retired) revert Retired();
        r.retired = true;
        emit RuleSetRetired(id);
    }

    // ---- decisions -------------------------------------------------------------------------------------------------------

    /// @notice Commits the decision for the bar ending at `barEnd`. `roundIds[i]` must be the Chainlink round that is the close of the
    ///         bar ending at barEnd - i * interval (the latest round with updatedAt <= that time). Reverts unless (action, reason) is
    ///         exactly what the rule decides at that bar.
    function commit(uint256 id, uint64 barEnd, uint80[] calldata roundIds, uint8 action, uint8 reason) external returns (uint256 seq) {
        RuleSet storage r = _set(id);
        if (r.owner != msg.sender) revert NotOwner();
        if (r.retired) revert Retired();
        if (barEnd < r.registeredAt) revert BarBeforeRegistration();
        Eval memory e = _evaluate(id, barEnd, roundIds);
        if (e.state.lastBar != 0 && barEnd <= e.state.lastBar) revert BarNotAfterLast();
        if (e.action != action || e.reason != reason) revert DecisionMismatch(e.action, e.reason);
        seq = _record(id, barEnd, roundIds[0], e);
    }

    struct Eval {
        RutiqRuleMath.RuleParams params;
        RutiqRuleMath.PaperState state;
        int256 price;
        uint256 age;
        uint8 action;
        uint8 reason;
    }

    function _evaluate(uint256 id, uint64 barEnd, uint80[] calldata roundIds) private view returns (Eval memory e) {
        e.params = _params[id];
        e.state = _state[id];
        if (barEnd % e.params.interval != 0) revert BarNotAligned();
        if (uint256(barEnd) + SETTLE > block.timestamp) revert BarNotSettled();
        int256[] memory closes;
        (closes, e.age) = _proveCloses(e.params, barEnd, roundIds);
        e.price = closes[0];
        (e.action, e.reason) = RutiqRuleMath.decide(e.params, e.state, closes, barEnd, e.age);
    }

    function _record(uint256 id, uint64 barEnd, uint80 roundId, Eval memory e) private returns (uint256 seq) {
        uint64 last = e.state.lastBar;
        uint32 gap = last == 0 ? 0 : uint32((barEnd - last) / e.params.interval - 1);
        RutiqRuleMath.PaperState memory s = RutiqRuleMath.apply_(e.params, e.state, e.action, e.price, barEnd);
        _state[id] = s;
        seq = _decisions[id].length;
        _decisions[id].push(
            Decision({
                barEnd: barEnd,
                roundId: roundId,
                price: int64(e.price),
                action: e.action,
                reason: e.reason,
                gapBars: gap,
                l2Block: uint64(_l2Block()),
                cashAfter: s.cash,
                unitsAfter: s.units
            })
        );
        emit DecisionCommitted(id, seq, barEnd, roundId, int64(e.price), e.action, e.reason, gap, s.cash, s.units);
    }

    /// @notice Dry run: what the rule decides at `barEnd` from the current paper state, with the same proofs as commit().
    ///         Anyone can call it, for any rule set, including bars before registration.
    function check(uint256 id, uint64 barEnd, uint80[] calldata roundIds)
        external
        view
        returns (uint8 action, uint8 reason, int256 price, uint256 closeAge)
    {
        _set(id);
        Eval memory e = _evaluate(id, barEnd, roundIds);
        return (e.action, e.reason, e.price, e.age);
    }

    /// @notice Proves one bar close: returns the answer of `roundId` if it is the latest round of `feed` at time `barEnd`.
    function proveClose(address feed, uint64 barEnd, uint80 roundId) external view returns (int256 answer, uint256 updatedAt) {
        RoundMemo memory m;
        (answer, updatedAt) = _close(IRutiqFeed(feed), barEnd, roundId, 0, m);
    }

    // ---- views -----------------------------------------------------------------------------------------------------------

    function ruleSetCount() external view returns (uint256) {
        return _sets.length;
    }

    function ruleSet(uint256 id) external view returns (RuleSet memory info, RutiqRuleMath.RuleParams memory params, RutiqRuleMath.PaperState memory state) {
        info = _set(id);
        params = _params[id];
        state = _state[id];
    }

    function ruleSetsOf(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }

    function closesNeeded(uint256 id) external view returns (uint256) {
        _set(id);
        return _params[id].closesNeeded();
    }

    function decisionCount(uint256 id) external view returns (uint256) {
        return _decisions[id].length;
    }

    /// @notice Decisions [from, from + count) of a rule set (clamped).
    function decisions(uint256 id, uint256 from, uint256 count) external view returns (Decision[] memory out) {
        Decision[] storage all = _decisions[id];
        if (from >= all.length) return new Decision[](0);
        uint256 end = from + count > all.length ? all.length : from + count;
        out = new Decision[](end - from);
        for (uint256 i = from; i < end; ++i) out[i - from] = all[i];
    }

    /// @notice Paper equity in micro-dollars at a given price (feed decimals).
    function equityAt(uint256 id, int256 price) external view returns (uint256) {
        _set(id);
        if (price <= 0) return _state[id].cash;
        return RutiqRuleMath.equity(_state[id], price);
    }

    // ---- internals -------------------------------------------------------------------------------------------------------

    struct RoundMemo {
        uint80 id;
        int256 answer;
        uint256 updatedAt;
        bool set;
    }

    function _set(uint256 id) private view returns (RuleSet storage) {
        if (id >= _sets.length) revert UnknownRuleSet();
        return _sets[id];
    }

    function _proveCloses(RutiqRuleMath.RuleParams memory p, uint64 barEnd, uint80[] calldata roundIds)
        private
        view
        returns (int256[] memory closes, uint256 age)
    {
        uint256 n = p.closesNeeded();
        if (roundIds.length != n) revert WrongRoundCount(n);
        closes = new int256[](n);
        IRutiqFeed feed = IRutiqFeed(p.feed);
        RoundMemo memory memo;
        for (uint256 i = 0; i < n; ++i) {
            if (i > 0 && roundIds[i] > roundIds[i - 1]) revert RoundsNotOrdered(i);
            uint256 t = uint256(barEnd) - i * p.interval;
            (int256 answer, uint256 updatedAt) = _close(feed, t, roundIds[i], i, memo);
            closes[i] = answer;
            if (i == 0) age = t - updatedAt;
        }
    }

    /// @dev Checks updatedAt(round) <= t < updatedAt(round + 1), or that `round` is the feed's latest round. Reads each round at most
    ///      once per call through `memo` (consecutive bars often share a round).
    function _close(IRutiqFeed feed, uint256 t, uint80 round, uint256 index, RoundMemo memory memo)
        private
        view
        returns (int256 answer, uint256 updatedAt)
    {
        (answer, updatedAt) = _read(feed, round, memo);
        if (updatedAt == 0 || updatedAt > t) revert RoundNotClose(index);
        if (answer <= 0 || answer > type(int64).max) revert BadAnswer(index);
        (bool ok, uint256 nextAt) = _tryUpdatedAt(feed, round + 1);
        if (ok && nextAt != 0) {
            if (nextAt <= t) revert RoundNotClose(index);
        } else {
            (uint80 latest,,,,) = feed.latestRoundData();
            if (latest != round) revert RoundNotClose(index);
        }
    }

    function _read(IRutiqFeed feed, uint80 round, RoundMemo memory memo) private view returns (int256 answer, uint256 updatedAt) {
        if (memo.set && memo.id == round) return (memo.answer, memo.updatedAt);
        (, answer,, updatedAt,) = feed.getRoundData(round);
        memo.id = round;
        memo.answer = answer;
        memo.updatedAt = updatedAt;
        memo.set = true;
    }

    function _tryUpdatedAt(IRutiqFeed feed, uint80 round) private view returns (bool ok, uint256 updatedAt) {
        try feed.getRoundData(round) returns (uint80, int256, uint256, uint256 u, uint80) {
            return (true, u);
        } catch {
            return (false, 0);
        }
    }

    function _l2Block() private view returns (uint256) {
        if (ARBSYS.code.length == 0) return block.number;
        // Gas-capped: where 0x64 is not the ArbSys precompile (a local fork, another chain) a failing call must not eat the transaction.
        try IRutiqArbSys(ARBSYS).arbBlockNumber{gas: 30_000}() returns (uint256 b) {
            return b;
        } catch {
            return block.number;
        }
    }
}
