// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RutiqDecisionLog} from "../src/RutiqDecisionLog.sol";
import {RutiqRuleMath} from "../src/RutiqRuleMath.sol";
import {RutiqMockFeed} from "./RutiqMockFeed.sol";

/// @notice Replays the site engine's backtests (fixtures written by scripts/make-parity-fixture.ts) through the contract: every bar is
///         committed with the decision the site computed, and the paper account must match to the last unit.
contract RutiqParityTest is Test {
    struct FRound {
        uint80 id;
        int256 answer;
        uint64 updatedAt;
    }

    struct FStep {
        uint64 barEnd;
        uint80[] roundIds;
        uint8 action;
        uint8 reason;
        uint128 cash;
        uint128 units;
    }

    function _run(string memory name) internal {
        bytes memory raw = vm.parseBytes(vm.readFile(string.concat("test/fixtures/parity-", name, ".hex")));
        (RutiqRuleMath.RuleParams memory p, FRound[] memory rounds, FStep[] memory steps, uint64 t0) =
            abi.decode(raw, (RutiqRuleMath.RuleParams, FRound[], FStep[], uint64));
        deployCodeTo("RutiqMockFeed.sol:RutiqMockFeed", p.feed);
        RutiqMockFeed feed = RutiqMockFeed(p.feed);
        for (uint256 i = 0; i < rounds.length; ++i) {
            uint80 id = feed.push(rounds[i].answer, rounds[i].updatedAt);
            assertEq(id, rounds[i].id);
        }
        vm.warp(t0);
        RutiqDecisionLog dlog = new RutiqDecisionLog();
        uint256 rid = dlog.register(p, keccak256(bytes(name)));
        vm.warp(uint256(rounds[rounds.length - 1].updatedAt) + 1 days);
        uint256 trades;
        for (uint256 i = 0; i < steps.length; ++i) {
            FStep memory s = steps[i];
            dlog.commit(rid, s.barEnd, s.roundIds, s.action, s.reason);
            (,, RutiqRuleMath.PaperState memory st) = dlog.ruleSet(rid);
            assertEq(st.cash, s.cash, "cash");
            assertEq(st.units, s.units, "units");
            if (s.action != RutiqRuleMath.HOLD) trades++;
        }
        assertEq(dlog.decisionCount(rid), steps.length);
        emit log_named_uint(string.concat(name, " bars"), steps.length);
        emit log_named_uint(string.concat(name, " fills"), trades);
    }

    function test_parity_smaCross() public {
        _run("sma-cross");
    }

    function test_parity_dipBuy() public {
        _run("dip-buy");
    }

    function test_parity_breakoutSchedule() public {
        _run("breakout-schedule");
    }

    function test_parity_priceLevels() public {
        _run("price-levels");
    }
}
