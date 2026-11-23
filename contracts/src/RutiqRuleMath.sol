// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title RutiqRuleMath
/// @notice Pure rule evaluation shared by RutiqDecisionLog. The website's engine (src/lib/engine) implements the same integer math
///         and is checked against this library with parity fixtures (contracts/test/fixtures).
/// @dev Prices are Chainlink answers (int256, feed decimals). closes[0] is the close of the decision bar, closes[i] the close i bars
///      earlier. Every division rounds toward zero, exactly like BigInt division on the site.
library RutiqRuleMath {
    // ---- condition kinds -------------------------------------------------------------------------------------------------
    uint8 internal constant NONE = 0;
    uint8 internal constant PRICE_ABOVE = 1; // close > value
    uint8 internal constant PRICE_BELOW = 2; // close < value
    uint8 internal constant SMA_CROSS_UP = 3; // SMA(a) crosses above SMA(b) on this bar
    uint8 internal constant SMA_CROSS_DOWN = 4; // SMA(a) crosses below SMA(b) on this bar
    uint8 internal constant CHANGE_AT_LEAST = 5; // % change over a bars >= value bps
    uint8 internal constant CHANGE_AT_MOST = 6; // % change over a bars <= value bps
    uint8 internal constant ABOVE_SMA = 7; // close > SMA(a)
    uint8 internal constant BELOW_SMA = 8; // close < SMA(a)
    uint8 internal constant MAX_KIND = 8;

    /// @notice Longest look-back a rule may use, in bars. A decision proves at most MAX_LOOKBACK + 1 closes.
    uint8 internal constant MAX_LOOKBACK = 48;

    // ---- actions and reasons ---------------------------------------------------------------------------------------------
    uint8 internal constant HOLD = 0;
    uint8 internal constant BUY = 1;
    uint8 internal constant SELL = 2;

    uint8 internal constant R_ENTRY_RULE = 1;
    uint8 internal constant R_EXIT_RULE = 2;
    uint8 internal constant R_STOP_LOSS = 3;
    uint8 internal constant R_TAKE_PROFIT = 4;
    uint8 internal constant R_WAITING_ENTRY = 5;
    uint8 internal constant R_IN_POSITION = 6;
    uint8 internal constant R_DAILY_LIMIT = 7;
    uint8 internal constant R_OUT_OF_SCHEDULE = 8;
    uint8 internal constant R_STALE_PRICE = 9;

    uint256 internal constant BPS = 10_000;
    /// @dev Paper cash is counted in micro-dollars (6 decimals); position units in 18 decimals.
    uint256 internal constant CASH_DECIMALS = 6;
    uint256 internal constant UNIT_DECIMALS = 18;
    /// @dev 10^(UNIT_DECIMALS - CASH_DECIMALS) * 10^FEED_DECIMALS. Every feed Rutiq accepts has 8 decimals (checked at registration).
    uint8 internal constant FEED_DECIMALS = 8;
    uint256 internal constant SCALE = 1e20;

    struct Condition {
        uint8 kind;
        uint8 a; // bars: SMA length (fast for crosses) or change look-back
        uint8 b; // bars: slow SMA length for crosses
        int64 value; // price level (feed decimals) or bps threshold, signed
    }

    struct RuleParams {
        address feed; // Chainlink aggregator proxy on Robinhood Chain
        uint32 interval; // bar length in seconds: 3600, 14400 or 86400
        uint32 maxStale; // a close older than this (seconds before the bar end) forces HOLD / stale
        uint16 sizeBps; // share of paper cash spent per entry
        uint16 feeBps; // fee + slippage charged on every fill, both sides
        uint16 stopBps; // stop-loss below the entry price, 0 = off
        uint32 takeProfitBps; // take-profit above the entry price, 0 = off
        uint8 maxEntriesPerDay; // 0 = unlimited; exits are never blocked
        uint24 hoursMask; // bit h = may act on bars closing at UTC hour h
        uint8 daysMask; // bit d = may act on bars closing on weekday d (0 = Sunday, UTC)
        uint64 startCash; // paper cash at start, micro-dollars
        Condition entry;
        Condition exit; // NONE = leave only by stop / take-profit
    }

    struct PaperState {
        uint128 cash; // micro-dollars
        uint128 units; // 18 decimals
        uint128 feesPaid; // micro-dollars
        int64 entryPrice; // feed decimals, 0 when flat
        uint64 lastBar; // bar end of the last committed decision, 0 = none
        uint32 entryDay; // UTC day number of the last entry
        uint8 entriesToday; // entries on entryDay
        bool inPosition;
        uint32 decisions; // committed decisions so far
    }

    error BadCondition(uint8 which);
    error BadParams(uint8 code);

    /// @notice Number of closes a condition needs (closes[0..n-1]).
    function closesNeeded(Condition memory c) internal pure returns (uint256) {
        uint8 k = c.kind;
        if (k == NONE || k == PRICE_ABOVE || k == PRICE_BELOW) return 1;
        if (k == SMA_CROSS_UP || k == SMA_CROSS_DOWN) return uint256(c.b) + 1;
        if (k == CHANGE_AT_LEAST || k == CHANGE_AT_MOST) return uint256(c.a) + 1;
        return c.a; // ABOVE_SMA / BELOW_SMA
    }

    function closesNeeded(RuleParams memory p) internal pure returns (uint256 n) {
        n = closesNeeded(p.entry);
        uint256 m = closesNeeded(p.exit);
        if (m > n) n = m;
    }

    function validCondition(Condition memory c, bool allowNone) internal pure returns (bool) {
        uint8 k = c.kind;
        if (k > MAX_KIND) return false;
        if (k == NONE) return allowNone;
        if (k == PRICE_ABOVE || k == PRICE_BELOW) return c.value > 0;
        if (k == SMA_CROSS_UP || k == SMA_CROSS_DOWN) return c.a >= 1 && c.a < c.b && c.b <= MAX_LOOKBACK;
        if (k == CHANGE_AT_LEAST || k == CHANGE_AT_MOST) return c.a >= 1 && c.a <= MAX_LOOKBACK && c.value > -int64(int256(BPS)) && c.value < 1_000_000;
        return c.a >= 2 && c.a <= MAX_LOOKBACK; // ABOVE_SMA / BELOW_SMA
    }

    /// @notice Reverts with BadParams(code) / BadCondition(which) unless the rule is well formed (feed code is checked by the caller).
    function validate(RuleParams memory p) internal pure {
        if (p.feed == address(0)) revert BadParams(1);
        if (p.interval != 3600 && p.interval != 14_400 && p.interval != 86_400) revert BadParams(2);
        if (p.maxStale == 0 || p.maxStale > 30 days) revert BadParams(3);
        if (p.sizeBps == 0 || p.sizeBps > BPS) revert BadParams(4);
        if (p.feeBps > 1000) revert BadParams(5);
        if (p.stopBps >= BPS) revert BadParams(6);
        if (p.takeProfitBps > 100_000) revert BadParams(7);
        if (p.hoursMask == 0 || p.daysMask == 0 || p.daysMask > 0x7f) revert BadParams(8);
        if (p.startCash < 1e6 || p.startCash > 1e15) revert BadParams(9);
        if (!validCondition(p.entry, false)) revert BadCondition(0);
        if (!validCondition(p.exit, true)) revert BadCondition(1);
    }

    /// @notice Simple moving average of closes[offset .. offset+n-1].
    function sma(int256[] memory closes, uint256 offset, uint256 n) internal pure returns (int256) {
        int256 s;
        for (uint256 i = offset; i < offset + n; ++i) s += closes[i];
        return s / int256(n);
    }

    function holds(Condition memory c, int256[] memory closes) internal pure returns (bool) {
        uint8 k = c.kind;
        int256 c0 = closes[0];
        if (k == PRICE_ABOVE) return c0 > int256(c.value);
        if (k == PRICE_BELOW) return c0 < int256(c.value);
        if (k == SMA_CROSS_UP || k == SMA_CROSS_DOWN) {
            int256 f0 = sma(closes, 0, c.a);
            int256 s0 = sma(closes, 0, c.b);
            int256 f1 = sma(closes, 1, c.a);
            int256 s1 = sma(closes, 1, c.b);
            return k == SMA_CROSS_UP ? (f0 > s0 && f1 <= s1) : (f0 < s0 && f1 >= s1);
        }
        if (k == CHANGE_AT_LEAST || k == CHANGE_AT_MOST) {
            int256 base = closes[c.a];
            int256 lhs = (c0 - base) * int256(BPS);
            int256 rhs = int256(c.value) * base;
            return k == CHANGE_AT_LEAST ? lhs >= rhs : lhs <= rhs;
        }
        if (k == ABOVE_SMA) return c0 > sma(closes, 0, c.a);
        if (k == BELOW_SMA) return c0 < sma(closes, 0, c.a);
        return false; // NONE
    }

    /// @notice The decision the rule makes at the bar ending `barEnd`, given the paper state before it.
    /// @param closeAge seconds between the close's round timestamp and barEnd.
    function decide(RuleParams memory p, PaperState memory s, int256[] memory closes, uint256 barEnd, uint256 closeAge)
        internal
        pure
        returns (uint8 action, uint8 reason)
    {
        uint256 hour = (barEnd / 3600) % 24;
        uint256 weekday = (barEnd / 86_400 + 4) % 7; // 1970-01-01 was a Thursday
        if ((uint256(p.hoursMask) >> hour) & 1 == 0 || (uint256(p.daysMask) >> weekday) & 1 == 0) return (HOLD, R_OUT_OF_SCHEDULE);
        if (closeAge > p.maxStale) return (HOLD, R_STALE_PRICE);
        int256 c0 = closes[0];
        if (s.inPosition) {
            int256 entry = int256(s.entryPrice);
            if (p.stopBps > 0 && c0 * int256(BPS) <= entry * int256(BPS - p.stopBps)) return (SELL, R_STOP_LOSS);
            if (p.takeProfitBps > 0 && c0 * int256(BPS) >= entry * int256(BPS + p.takeProfitBps)) return (SELL, R_TAKE_PROFIT);
            if (p.exit.kind != NONE && holds(p.exit, closes)) return (SELL, R_EXIT_RULE);
            return (HOLD, R_IN_POSITION);
        }
        uint256 day = barEnd / 86_400;
        uint256 today = s.entryDay == day ? s.entriesToday : 0;
        if (p.maxEntriesPerDay > 0 && today >= p.maxEntriesPerDay) return (HOLD, R_DAILY_LIMIT);
        if (holds(p.entry, closes)) return (BUY, R_ENTRY_RULE);
        return (HOLD, R_WAITING_ENTRY);
    }

    /// @notice Applies a decision to the paper account. Fills happen at `price` (the proven close) minus/plus feeBps.
    function apply_(RuleParams memory p, PaperState memory s, uint8 action, int256 price, uint256 barEnd)
        internal
        pure
        returns (PaperState memory)
    {
        // units (1e18) = net (1e6 USD) * SCALE / price ; value (1e6 USD) = units * price / SCALE, with SCALE = 1e12 * 10^feedDecimals.
        uint256 scale = SCALE;
        if (action == BUY) {
            uint256 spend = uint256(s.cash) * p.sizeBps / BPS;
            uint256 fee = spend * p.feeBps / BPS;
            uint256 net = spend - fee;
            s.units = uint128(net * scale / uint256(price));
            s.cash -= uint128(spend);
            s.feesPaid += uint128(fee);
            s.inPosition = true;
            s.entryPrice = int64(price);
            uint32 day = uint32(barEnd / 86_400);
            if (s.entryDay == day) {
                s.entriesToday += 1;
            } else {
                s.entryDay = day;
                s.entriesToday = 1;
            }
        } else if (action == SELL) {
            uint256 gross = uint256(s.units) * uint256(price) / scale;
            uint256 fee = gross * p.feeBps / BPS;
            s.cash += uint128(gross - fee);
            s.feesPaid += uint128(fee);
            s.units = 0;
            s.inPosition = false;
            s.entryPrice = 0;
        }
        s.lastBar = uint64(barEnd);
        s.decisions += 1;
        return s;
    }

    /// @notice Paper equity in micro-dollars at `price`.
    function equity(PaperState memory s, int256 price) internal pure returns (uint256) {
        return uint256(s.cash) + uint256(s.units) * uint256(price) / SCALE;
    }
}
