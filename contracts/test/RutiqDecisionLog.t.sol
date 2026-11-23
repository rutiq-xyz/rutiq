// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RutiqDecisionLog} from "../src/RutiqDecisionLog.sol";
import {RutiqRuleMath} from "../src/RutiqRuleMath.sol";
import {RutiqMockFeed} from "./RutiqMockFeed.sol";

contract RutiqTestBase is Test {
    RutiqDecisionLog internal dlog;
    RutiqMockFeed internal feed;
    uint64 internal constant T0 = 1_790_812_800; // 2026-10-01 00:00 UTC (a Thursday)
    uint32 internal constant H = 3600;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public virtual {
        vm.warp(T0 - 3 days);
        dlog = new RutiqDecisionLog();
        feed = new RutiqMockFeed();
    }

    function _cond(uint8 kind, uint8 a, uint8 b, int64 value) internal pure returns (RutiqRuleMath.Condition memory) {
        return RutiqRuleMath.Condition({kind: kind, a: a, b: b, value: value});
    }

    function _params() internal view returns (RutiqRuleMath.RuleParams memory p) {
        p.feed = address(feed);
        p.interval = H;
        p.maxStale = 6 * H;
        p.sizeBps = 5000;
        p.feeBps = 30;
        p.stopBps = 0;
        p.takeProfitBps = 0;
        p.maxEntriesPerDay = 0;
        p.hoursMask = 0xffffff;
        p.daysMask = 0x7f;
        p.startCash = 10_000e6;
        p.entry = _cond(RutiqRuleMath.PRICE_BELOW, 0, 0, 100e8);
        p.exit = _cond(RutiqRuleMath.PRICE_ABOVE, 0, 0, 110e8);
    }

    /// One round per hour at hh:30 starting T0 - 30 min, from a price list (8 decimals).
    function _hourly(int256[] memory prices) internal {
        for (uint256 i = 0; i < prices.length; ++i) feed.push(prices[i], T0 - 1800 + i * H);
    }

    function _ids(uint64 barEnd, uint256 n, uint256 interval) internal view returns (uint80[] memory ids) {
        ids = new uint80[](n);
        uint256 c = feed.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 t = barEnd - i * interval;
            uint256 best;
            for (uint256 k = 1; k <= c; ++k) {
                (, , , uint256 u, ) = feed.getRoundData(uint80((1 << 64) | k));
                if (u <= t) best = k;
            }
            ids[i] = uint80((1 << 64) | best);
        }
    }

    function _register(RutiqRuleMath.RuleParams memory p) internal returns (uint256 id) {
        vm.prank(alice);
        id = dlog.register(p, keccak256("spec"));
    }

    function _commitExpected(uint256 id, uint64 barEnd, uint256 n, uint256 interval) internal returns (uint8 a, uint8 r) {
        uint80[] memory ids = _ids(barEnd, n, interval);
        (a, r,,) = dlog.check(id, barEnd, ids);
        vm.prank(alice);
        dlog.commit(id, barEnd, ids, a, r);
    }
}

contract RutiqDecisionLogTest is RutiqTestBase {
    function _prices(int256[8] memory v) internal pure returns (int256[] memory out) {
        out = new int256[](8);
        for (uint256 i = 0; i < 8; ++i) out[i] = v[i];
    }

    // ---- registration ----

    function test_register_storesEverything() public {
        RutiqRuleMath.RuleParams memory p = _params();
        feed.push(105e8, T0 - 100);
        uint256 id = _register(p);
        (RutiqDecisionLog.RuleSet memory info, RutiqRuleMath.RuleParams memory q, RutiqRuleMath.PaperState memory s) = dlog.ruleSet(id);
        assertEq(info.owner, alice);
        assertEq(info.paramsHash, keccak256(abi.encode(p)));
        assertEq(q.feed, address(feed));
        assertEq(s.cash, 10_000e6);
        assertEq(dlog.ruleSetsOf(alice).length, 1);
        assertEq(dlog.closesNeeded(id), 1);
    }

    function test_register_rejectsBadParams() public {
        feed.push(105e8, T0 - 100);
        RutiqRuleMath.RuleParams memory p;
        p = _params(); p.interval = 60;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 2)); dlog.register(p, 0);
        p = _params(); p.maxStale = 0;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 3)); dlog.register(p, 0);
        p = _params(); p.sizeBps = 0;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 4)); dlog.register(p, 0);
        p = _params(); p.feeBps = 1001;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 5)); dlog.register(p, 0);
        p = _params(); p.stopBps = 10_000;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 6)); dlog.register(p, 0);
        p = _params(); p.takeProfitBps = 100_001;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 7)); dlog.register(p, 0);
        p = _params(); p.daysMask = 0x80;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 8)); dlog.register(p, 0);
        p = _params(); p.startCash = 1;
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadParams.selector, 9)); dlog.register(p, 0);
        p = _params(); p.entry = _cond(RutiqRuleMath.NONE, 0, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadCondition.selector, 0)); dlog.register(p, 0);
        p = _params(); p.entry = _cond(RutiqRuleMath.SMA_CROSS_UP, 20, 5, 0);
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadCondition.selector, 0)); dlog.register(p, 0);
        p = _params(); p.exit = _cond(RutiqRuleMath.ABOVE_SMA, 49, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadCondition.selector, 1)); dlog.register(p, 0);
        p = _params(); p.exit = _cond(9, 1, 2, 0);
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadCondition.selector, 1)); dlog.register(p, 0);
        p = _params(); p.entry = _cond(RutiqRuleMath.CHANGE_AT_MOST, 3, 0, -10_000);
        vm.expectRevert(abi.encodeWithSelector(RutiqRuleMath.BadCondition.selector, 0)); dlog.register(p, 0);
    }

    function test_register_rejectsUnusableFeeds() public {
        RutiqRuleMath.RuleParams memory p = _params();
        p.feed = address(0xdead);
        vm.expectRevert(RutiqDecisionLog.FeedNotUsable.selector);
        dlog.register(p, 0);
        p = _params();
        vm.expectRevert(RutiqDecisionLog.FeedNotUsable.selector); // no rounds yet
        dlog.register(p, 0);
        feed.push(105e8, T0 - 100);
        feed.setDecimals(18);
        vm.expectRevert(RutiqDecisionLog.FeedNotUsable.selector);
        dlog.register(p, 0);
        feed.setDecimals(8);
        feed.push(-1, T0 - 50);
        vm.expectRevert(RutiqDecisionLog.FeedNotUsable.selector);
        dlog.register(p, 0);
    }

    // ---- the happy path: buy below 100, sell above 110 ----

    function test_commit_buyHoldSell_accounting() public {
        feed.push(105e8, T0 - 4000);
        uint256 id = _register(_params());
        _hourly(_prices([int256(104e8), 99e8, 101e8, 108e8, 111e8, 109e8, 98e8, 97e8]));
        vm.warp(T0 + 10 * H);
        (uint8 a, uint8 r) = _commitExpected(id, T0, 1, H); // close = 104 (round at T0-1800)
        assertEq(a, RutiqRuleMath.HOLD); assertEq(r, RutiqRuleMath.R_WAITING_ENTRY);
        (a, r) = _commitExpected(id, T0 + H, 1, H); // 99 -> buy
        assertEq(a, RutiqRuleMath.BUY); assertEq(r, RutiqRuleMath.R_ENTRY_RULE);
        (,, RutiqRuleMath.PaperState memory s) = dlog.ruleSet(id);
        // spend 5000e6, fee 15e6, net 4985e6 -> units = 4985e6 * 1e20 / 99e8
        assertEq(s.cash, 5000e6);
        assertEq(s.units, uint128(uint256(4985e6) * 1e20 / 99e8));
        assertEq(s.feesPaid, 15e6);
        assertTrue(s.inPosition);
        (a, r) = _commitExpected(id, T0 + 2 * H, 1, H); // 101 hold
        assertEq(r, RutiqRuleMath.R_IN_POSITION);
        // skip one bar (108) -> gap 1
        (a, r) = _commitExpected(id, T0 + 4 * H, 1, H); // 111 -> sell
        assertEq(a, RutiqRuleMath.SELL); assertEq(r, RutiqRuleMath.R_EXIT_RULE);
        (,, s) = dlog.ruleSet(id);
        uint256 gross = uint256(4985e6) * 1e20 / 99e8 * 111e8 / 1e20;
        assertEq(s.cash, 5000e6 + gross - gross * 30 / 10_000);
        assertFalse(s.inPosition);
        assertEq(s.units, 0);
        RutiqDecisionLog.Decision[] memory d = dlog.decisions(id, 0, 10);
        assertEq(d.length, 4);
        assertEq(d[3].gapBars, 1);
        assertEq(d[1].price, 99e8);
        assertEq(dlog.decisionCount(id), 4);
        assertEq(dlog.decisions(id, 9, 3).length, 0);
    }

    function test_stopLoss_and_takeProfit() public {
        feed.push(105e8, T0 - 4000);
        RutiqRuleMath.RuleParams memory p = _params();
        p.exit = _cond(RutiqRuleMath.NONE, 0, 0, 0);
        p.stopBps = 500; // 5 %
        p.takeProfitBps = 800; // 8 %
        uint256 id = _register(p);
        _hourly(_prices([int256(99e8), 95e8, 94e8, 99e8, 107e8, 108e8, 101e8, 100e8]));
        vm.warp(T0 + 10 * H);
        (uint8 a, uint8 r) = _commitExpected(id, T0, 1, H); // 99 buy
        assertEq(a, RutiqRuleMath.BUY);
        (a, r) = _commitExpected(id, T0 + H, 1, H); // 95: 95*1e4 = 950000 > 99*9500=940500 -> hold
        assertEq(r, RutiqRuleMath.R_IN_POSITION);
        (a, r) = _commitExpected(id, T0 + 2 * H, 1, H); // 94 <= 94.05 -> stop
        assertEq(a, RutiqRuleMath.SELL); assertEq(r, RutiqRuleMath.R_STOP_LOSS);
        (a, r) = _commitExpected(id, T0 + 3 * H, 1, H); // 99 buy again
        assertEq(a, RutiqRuleMath.BUY);
        (a, r) = _commitExpected(id, T0 + 4 * H, 1, H); // 107 < 106.92? 107 >= 106.92 -> take profit
        assertEq(a, RutiqRuleMath.SELL); assertEq(r, RutiqRuleMath.R_TAKE_PROFIT);
    }

    function test_dailyLimit_blocksEntries_notExits() public {
        feed.push(105e8, T0 - 4000);
        RutiqRuleMath.RuleParams memory p = _params();
        p.maxEntriesPerDay = 1;
        uint256 id = _register(p);
        _hourly(_prices([int256(99e8), 111e8, 99e8, 98e8, 111e8, 99e8, 99e8, 99e8]));
        vm.warp(T0 + 10 * H);
        _commitExpected(id, T0, 1, H); // buy
        (uint8 a, uint8 r) = _commitExpected(id, T0 + H, 1, H); // sell (exits are never limited)
        assertEq(a, RutiqRuleMath.SELL);
        (a, r) = _commitExpected(id, T0 + 2 * H, 1, H); // 99 but limit reached
        assertEq(a, RutiqRuleMath.HOLD); assertEq(r, RutiqRuleMath.R_DAILY_LIMIT);
    }

    function test_schedule_and_stale() public {
        feed.push(105e8, T0 - 4000);
        RutiqRuleMath.RuleParams memory p = _params();
        p.hoursMask = uint24(1 << 2); // only bars closing at 02:00 UTC
        p.daysMask = uint8(1 << 4); // Thursday only (T0 is a Thursday)
        p.maxStale = 1800;
        uint256 id = _register(p);
        _hourly(_prices([int256(99e8), 99e8, 99e8, 99e8, 99e8, 99e8, 99e8, 99e8]));
        vm.warp(T0 + 30 * H);
        (uint8 a, uint8 r) = _commitExpected(id, T0 + H, 1, H);
        assertEq(r, RutiqRuleMath.R_OUT_OF_SCHEDULE);
        (a, r) = _commitExpected(id, T0 + 2 * H, 1, H); // 02:00, close age 1800 -> ok -> buy
        assertEq(a, RutiqRuleMath.BUY);
        // 26:00 = Friday 02:00 -> out of schedule (weekday)
        (a, r) = _commitExpected(id, T0 + 26 * H, 1, H);
        assertEq(r, RutiqRuleMath.R_OUT_OF_SCHEDULE);
    }

    function test_stalePrice() public {
        feed.push(105e8, T0 - 4000);
        RutiqRuleMath.RuleParams memory p = _params();
        p.maxStale = 3600;
        uint256 id = _register(p);
        feed.push(99e8, T0 + 60);
        vm.warp(T0 + 10 * H);
        (uint8 a, uint8 r) = _commitExpected(id, T0 + 3 * H, 1, H); // last round 2h59 before the bar
        assertEq(a, RutiqRuleMath.HOLD); assertEq(r, RutiqRuleMath.R_STALE_PRICE);
        (a, r) = _commitExpected(id, T0 + 4 * H, 1, H);
        assertEq(r, RutiqRuleMath.R_STALE_PRICE);
    }

    function test_smaCross_and_change() public {
        feed.push(100e8, T0 - 4000);
        RutiqRuleMath.RuleParams memory p = _params();
        p.entry = _cond(RutiqRuleMath.SMA_CROSS_UP, 2, 4, 0);
        p.exit = _cond(RutiqRuleMath.CHANGE_AT_MOST, 2, 0, -200); // -2 % over 2 bars
        uint256 id = _register(p);
        _hourly(_prices([int256(100e8), 99e8, 98e8, 97e8, 99e8, 103e8, 104e8, 101e8]));
        vm.warp(T0 + 10 * H);
        // bars T0..T0+3: closes 100,99,98,97 ; T0+4: 99, T0+5: 103
        // at T0+5: fast(103,99)=101 slow(103,99,97,98)=99.25 ; prev fast(99,97)=98 slow(99,97,98,99)=98.25 -> cross up
        uint256 n = dlog.closesNeeded(id);
        assertEq(n, 5);
        (uint8 a, uint8 r) = _commitExpected(id, T0 + 4 * H, n, H);
        assertEq(a, RutiqRuleMath.HOLD); assertEq(r, RutiqRuleMath.R_WAITING_ENTRY);
        (a, r) = _commitExpected(id, T0 + 5 * H, n, H);
        assertEq(a, RutiqRuleMath.BUY);
        (a, r) = _commitExpected(id, T0 + 6 * H, n, H); // 104 vs 99 two bars back: +5 %
        assertEq(r, RutiqRuleMath.R_IN_POSITION);
        (a, r) = _commitExpected(id, T0 + 7 * H, n, H); // 101 vs 103: -1.94 % > -2 % -> hold
        assertEq(r, RutiqRuleMath.R_IN_POSITION);
    }

    // ---- hostile callers and bad proofs ----

    function test_commit_rejectsWrongDecision() public {
        feed.push(105e8, T0 - 4000);
        uint256 id = _register(_params());
        _hourly(_prices([int256(99e8), 99e8, 99e8, 99e8, 99e8, 99e8, 99e8, 99e8]));
        vm.warp(T0 + 10 * H);
        uint80[] memory ids = _ids(T0, 1, H);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RutiqDecisionLog.DecisionMismatch.selector, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE));
        dlog.commit(id, T0, ids, RutiqRuleMath.HOLD, RutiqRuleMath.R_WAITING_ENTRY);
        vm.prank(alice);
        vm.expectRevert();
        dlog.commit(id, T0, ids, RutiqRuleMath.BUY, RutiqRuleMath.R_EXIT_RULE);
    }

    function test_commit_rejectsBadRounds() public {
        feed.push(105e8, T0 - 4000);
        uint256 id = _register(_params());
        _hourly(_prices([int256(99e8), 98e8, 97e8, 96e8, 95e8, 94e8, 93e8, 92e8]));
        vm.warp(T0 + 10 * H);
        uint80[] memory ids = _ids(T0 + 2 * H, 1, H);
        // a newer round than the bar close
        uint80[] memory late = new uint80[](1);
        late[0] = ids[0] + 1;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RutiqDecisionLog.RoundNotClose.selector, 0));
        dlog.commit(id, T0 + 2 * H, late, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
        // an older round (a later one also precedes the bar end)
        uint80[] memory old = new uint80[](1);
        old[0] = ids[0] - 1;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RutiqDecisionLog.RoundNotClose.selector, 0));
        dlog.commit(id, T0 + 2 * H, old, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
        // a round that does not exist
        uint80[] memory ghost = new uint80[](1);
        ghost[0] = uint80((1 << 64) | 999);
        vm.prank(alice);
        vm.expectRevert();
        dlog.commit(id, T0 + 2 * H, ghost, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
        // wrong count
        uint80[] memory two = _ids(T0 + 2 * H, 2, H);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RutiqDecisionLog.WrongRoundCount.selector, 1));
        dlog.commit(id, T0 + 2 * H, two, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
    }

    function test_commit_rejectsUnorderedRounds() public {
        feed.push(100e8, T0 - 4000);
        RutiqRuleMath.RuleParams memory p = _params();
        p.entry = _cond(RutiqRuleMath.ABOVE_SMA, 3, 0, 0);
        uint256 id = _register(p);
        _hourly(_prices([int256(99e8), 98e8, 97e8, 96e8, 95e8, 94e8, 93e8, 92e8]));
        vm.warp(T0 + 10 * H);
        uint80[] memory ids = _ids(T0 + 4 * H, 3, H);
        (ids[0], ids[1]) = (ids[1], ids[0]);
        vm.prank(alice);
        vm.expectRevert();
        dlog.commit(id, T0 + 4 * H, ids, RutiqRuleMath.HOLD, RutiqRuleMath.R_WAITING_ENTRY);
    }

    function test_commit_guards() public {
        feed.push(105e8, T0 - 4000);
        uint256 id = _register(_params());
        _hourly(_prices([int256(99e8), 99e8, 99e8, 99e8, 99e8, 99e8, 99e8, 99e8]));
        uint80[] memory ids;
        vm.warp(T0 + 2 * H + 60); // bar T0+2H not settled yet
        ids = _ids(T0 + 2 * H, 1, H);
        vm.prank(alice);
        vm.expectRevert(RutiqDecisionLog.BarNotSettled.selector);
        dlog.commit(id, T0 + 2 * H, ids, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
        vm.warp(T0 + 10 * H);
        vm.prank(alice);
        vm.expectRevert(RutiqDecisionLog.BarNotAligned.selector);
        dlog.commit(id, T0 + 2 * H + 1, ids, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
        vm.prank(bob);
        vm.expectRevert(RutiqDecisionLog.NotOwner.selector);
        dlog.commit(id, T0 + 2 * H, ids, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
        // before registration: registered at T0 - 3 days
        uint80[] memory early = new uint80[](1);
        early[0] = uint80((1 << 64) | 1);
        vm.prank(alice);
        vm.expectRevert(RutiqDecisionLog.BarBeforeRegistration.selector);
        dlog.commit(id, T0 - 4 days, early, RutiqRuleMath.HOLD, RutiqRuleMath.R_WAITING_ENTRY);
        _commitExpected(id, T0 + 2 * H, 1, H);
        vm.prank(alice);
        vm.expectRevert(RutiqDecisionLog.BarNotAfterLast.selector);
        dlog.commit(id, T0 + 2 * H, ids, RutiqRuleMath.HOLD, RutiqRuleMath.R_IN_POSITION);
        vm.prank(bob);
        vm.expectRevert(RutiqDecisionLog.NotOwner.selector);
        dlog.retire(id);
        vm.prank(alice);
        dlog.retire(id);
        vm.prank(alice);
        vm.expectRevert(RutiqDecisionLog.Retired.selector);
        dlog.retire(id);
        uint80[] memory next = _ids(T0 + 3 * H, 1, H);
        vm.prank(alice);
        vm.expectRevert(RutiqDecisionLog.Retired.selector);
        dlog.commit(id, T0 + 3 * H, next, RutiqRuleMath.HOLD, RutiqRuleMath.R_IN_POSITION);
        vm.expectRevert(RutiqDecisionLog.UnknownRuleSet.selector);
        dlog.ruleSet(7);
    }

    function test_latestRound_isAValidClose_butNotIfANewerOneExists() public {
        feed.push(105e8, T0 - 4000);
        uint256 id = _register(_params());
        feed.push(99e8, T0 + 100);
        vm.warp(T0 + 5 * H);
        uint80[] memory ids = _ids(T0 + 4 * H, 1, H); // latest round, nothing newer
        (uint8 a,, int256 price,) = dlog.check(id, T0 + 4 * H, ids);
        assertEq(a, RutiqRuleMath.BUY);
        assertEq(price, 99e8);
        (int256 ans, uint256 upd) = dlog.proveClose(address(feed), T0 + 4 * H, ids[0]);
        assertEq(ans, 99e8);
        assertEq(upd, T0 + 100);
        feed.push(98e8, T0 + 2 * H);
        vm.expectRevert(abi.encodeWithSelector(RutiqDecisionLog.RoundNotClose.selector, 0));
        dlog.check(id, T0 + 4 * H, ids);
    }

    function test_brokenFeed_reverts_noStateChange() public {
        feed.push(105e8, T0 - 4000);
        uint256 id = _register(_params());
        feed.push(99e8, T0 + 100);
        vm.warp(T0 + 5 * H);
        uint80[] memory ids = _ids(T0 + 4 * H, 1, H);
        feed.setBroken(true); // latestRoundData reverts: the latest-round path cannot be proven
        vm.prank(alice);
        vm.expectRevert();
        dlog.commit(id, T0 + 4 * H, ids, RutiqRuleMath.BUY, RutiqRuleMath.R_ENTRY_RULE);
        assertEq(dlog.decisionCount(id), 0);
    }

    function test_equityAt() public {
        feed.push(105e8, T0 - 4000);
        uint256 id = _register(_params());
        feed.push(99e8, T0 + 100);
        vm.warp(T0 + 5 * H);
        _commitExpected(id, T0 + 2 * H, 1, H);
        uint256 e = dlog.equityAt(id, 99e8);
        assertApproxEqAbs(e, 10_000e6 - 15e6, 1);
        assertEq(dlog.equityAt(id, 0), 5000e6);
    }
}
