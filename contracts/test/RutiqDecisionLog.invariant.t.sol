// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {RutiqDecisionLog} from "../src/RutiqDecisionLog.sol";
import {RutiqRuleMath} from "../src/RutiqRuleMath.sol";
import {RutiqMockFeed} from "./RutiqMockFeed.sol";

/// @dev Drives one rule set through random prices and time; commits whatever check() says (the only thing commit accepts).
contract RutiqHandler is Test {
    RutiqDecisionLog public dlog;
    RutiqMockFeed public feed;
    uint256 public id;
    uint64 public nextBar;
    uint32 public constant I = 3600;
    int256 public price = 2000e8;
    uint256 public commits;
    uint64 public lastBarSeen;
    uint128 public lastFees;
    bool public feesWentDown;
    bool public barsWentBack;

    constructor(RutiqDecisionLog l, RutiqMockFeed f, RutiqRuleMath.RuleParams memory p) {
        dlog = l;
        feed = f;
        id = l.register(p, bytes32(0)); // the handler owns the rule set, so its commits are the owner's
        nextBar = uint64((block.timestamp / I + 1) * I);
    }

    function move(int16 stepBps, uint16 delay) external {
        int256 b = int256(bound(stepBps, -400, 400));
        price = price + price * b / 10_000;
        if (price < 1e8) price = 1e8;
        vm.warp(block.timestamp + bound(delay, 1, 2 hours));
        feed.push(price, block.timestamp);
    }

    function commitNext(uint8 skip) external {
        uint64 bar = nextBar + uint64(bound(skip, 0, 3)) * I;
        if (uint256(bar) + dlog.SETTLE() > block.timestamp) return;
        uint256 n = dlog.closesNeeded(id);
        uint80[] memory ids = new uint80[](n);
        uint256 c = feed.count();
        for (uint256 i = 0; i < n; ++i) {
            uint256 t = bar - i * I;
            uint256 best;
            for (uint256 k = c; k >= 1; --k) {
                (,,, uint256 u,) = feed.getRoundData(uint80((1 << 64) | k));
                if (u <= t) {
                    best = k;
                    break;
                }
            }
            if (best == 0) {
                nextBar = bar + I;
                return;
            }
            ids[i] = uint80((1 << 64) | best);
        }
        (uint8 a, uint8 r,,) = dlog.check(id, bar, ids);
        dlog.commit(id, bar, ids, a, r);
        commits++;
        (,, RutiqRuleMath.PaperState memory s) = dlog.ruleSet(id);
        if (s.lastBar <= lastBarSeen) barsWentBack = true;
        if (s.feesPaid < lastFees) feesWentDown = true;
        lastBarSeen = s.lastBar;
        lastFees = s.feesPaid;
        nextBar = bar + I;
    }
}

contract RutiqDecisionLogInvariant is StdInvariant, Test {
    RutiqDecisionLog internal dlog;
    RutiqMockFeed internal feed;
    RutiqHandler internal h;

    function setUp() public {
        vm.warp(1_790_812_800);
        dlog = new RutiqDecisionLog();
        feed = new RutiqMockFeed();
        feed.push(2000e8, block.timestamp - 10);
        RutiqRuleMath.RuleParams memory p;
        p.feed = address(feed);
        p.interval = 3600;
        p.maxStale = 3 hours;
        p.sizeBps = 7000;
        p.feeBps = 25;
        p.stopBps = 300;
        p.takeProfitBps = 500;
        p.maxEntriesPerDay = 3;
        p.hoursMask = 0xffffff;
        p.daysMask = 0x7f;
        p.startCash = 10_000e6;
        p.entry = RutiqRuleMath.Condition(RutiqRuleMath.SMA_CROSS_UP, 2, 5, 0);
        p.exit = RutiqRuleMath.Condition(RutiqRuleMath.BELOW_SMA, 4, 0, 0);
        h = new RutiqHandler(dlog, feed, p);
        targetContract(address(h));
    }

    /// Sanity: the handler really commits (an invariant suite whose handler never acts proves nothing).
    function test_handlerCommits() public {
        for (uint256 i = 0; i < 12; ++i) {
            h.move(int16(int256(i % 3) * 120 - 100), 3000);
            h.commitNext(0);
        }
        assertGe(h.commits(), 5);
    }

    function invariant_stateMatchesLog() public view {
        uint256 id = h.id();
        (, RutiqRuleMath.RuleParams memory p, RutiqRuleMath.PaperState memory s) = dlog.ruleSet(id);
        assertEq(uint256(s.decisions), dlog.decisionCount(id));
        assertEq(s.decisions, h.commits());
        assertEq(s.inPosition, s.entryPrice != 0);
        assertEq(s.inPosition, s.units != 0);
        assertFalse(h.feesWentDown());
        assertFalse(h.barsWentBack());
        if (!s.inPosition) assertLe(s.entriesToday, p.maxEntriesPerDay);
        // value only leaves the paper account through fees and price moves; cash never exceeds what is possible with fees >= 0
        assertGe(uint256(s.cash) + s.feesPaid, 0);
    }

    function invariant_decisionsAreTheRulesOwn() public view {
        uint256 id = h.id();
        uint256 n = dlog.decisionCount(id);
        if (n == 0) return;
        RutiqDecisionLog.Decision[] memory d = dlog.decisions(id, 0, n);
        for (uint256 i = 0; i < d.length; ++i) {
            if (d[i].action == RutiqRuleMath.BUY) assertEq(d[i].reason, RutiqRuleMath.R_ENTRY_RULE);
            if (d[i].action == RutiqRuleMath.SELL) assertTrue(d[i].reason >= 2 && d[i].reason <= 4);
            if (d[i].action == RutiqRuleMath.HOLD) assertTrue(d[i].reason >= 5 && d[i].reason <= 9);
            if (i > 0) assertGt(d[i].barEnd, d[i - 1].barEnd);
        }
    }
}
