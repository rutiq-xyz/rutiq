// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RutiqDecisionLog, IRutiqFeed} from "../src/RutiqDecisionLog.sol";
import {RutiqRuleMath} from "../src/RutiqRuleMath.sol";

/// @notice Against real Chainlink feeds on a Robinhood Chain fork:
///   forge test --match-contract Fork --fork-url <rpc> --evm-version cancun
/// (cancun: the feeds' aggregators need it on a fork; the deployed bytecode stays paris.)
contract RutiqForkTest is Test {
    address internal constant ETH_USD = 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9;
    address internal constant NVDA_USD = 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15;

    function setUp() public {
        if (block.chainid != 4663) vm.skip(true);
    }

    function _params(address feed) internal pure returns (RutiqRuleMath.RuleParams memory p) {
        p.feed = feed;
        p.interval = 3600;
        p.maxStale = 30 days;
        p.sizeBps = 10_000;
        p.feeBps = 10;
        p.hoursMask = 0xffffff;
        p.daysMask = 0x7f;
        p.startCash = 10_000e6;
        p.entry = RutiqRuleMath.Condition(RutiqRuleMath.ABOVE_SMA, 6, 0, 0);
        p.exit = RutiqRuleMath.Condition(RutiqRuleMath.BELOW_SMA, 6, 0, 0);
    }

    /// Round ids that close each bar, found by walking back from the latest round (real proxy semantics).
    function _ids(address feed, uint256 barEnd, uint256 n) internal view returns (uint80[] memory ids) {
        ids = new uint80[](n);
        (uint80 r,,, uint256 u,) = IRutiqFeed(feed).latestRoundData();
        for (uint256 i = 0; i < n; ++i) {
            uint256 t = barEnd - i * 3600;
            while (u > t) {
                r -= 1;
                (,,, u,) = IRutiqFeed(feed).getRoundData(r);
            }
            ids[i] = r;
        }
    }

    function test_fork_checkHistoricalBars_realFeeds() public {
        RutiqDecisionLog dlog = new RutiqDecisionLog();
        address[2] memory feeds = [ETH_USD, NVDA_USD];
        for (uint256 f = 0; f < 2; ++f) {
            uint256 id = dlog.register(_params(feeds[f]), bytes32(0));
            uint256 bar = (block.timestamp / 3600 - 30) * 3600; // 30 hours ago, well settled
            uint80[] memory ids = _ids(feeds[f], bar, dlog.closesNeeded(id));
            (uint8 a, uint8 r, int256 price, uint256 age) = dlog.check(id, uint64(bar), ids);
            assertGt(price, 0);
            assertTrue(a == RutiqRuleMath.BUY || a == RutiqRuleMath.HOLD);
            assertTrue(r == RutiqRuleMath.R_ENTRY_RULE || r == RutiqRuleMath.R_WAITING_ENTRY);
            emit log_named_uint("age of close (s)", age);
            // one round off is refused
            ids[0] = ids[0] + 1;
            vm.expectRevert();
            dlog.check(id, uint64(bar), ids);
        }
    }

    function test_fork_commitAfterRegistration_latestRoundPath() public {
        RutiqDecisionLog dlog = new RutiqDecisionLog();
        uint256 id = dlog.register(_params(ETH_USD), bytes32(0));
        vm.warp(block.timestamp + 3 hours); // no new rounds on a fork: the bar close is the feed's latest round
        uint256 bar = (block.timestamp / 3600 - 1) * 3600;
        uint80[] memory ids = _ids(ETH_USD, bar, dlog.closesNeeded(id));
        (uint8 a, uint8 r,,) = dlog.check(id, uint64(bar), ids);
        uint256 seq = dlog.commit(id, uint64(bar), ids, a, r);
        assertEq(seq, 0);
        RutiqDecisionLog.Decision[] memory d = dlog.decisions(id, 0, 1);
        assertGt(d[0].l2Block, 100_000_000); // a Robinhood Chain block number (ArbSys on chain; block.number on a forge fork)
        bar += 3600;
        vm.warp(block.timestamp + 3600);
        ids = _ids(ETH_USD, bar, dlog.closesNeeded(id));
        (a, r,,) = dlog.check(id, uint64(bar), ids);
        uint256 g = gasleft();
        dlog.commit(id, uint64(bar), ids, a, r);
        emit log_named_uint("gas for one commit (7 closes)", g - gasleft());
    }
}
