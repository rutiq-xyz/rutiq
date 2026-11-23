// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Chainlink proxy stand-in for tests: phase 1 rounds, getRoundData reverts for rounds that do not exist (like the real proxy).
contract RutiqMockFeed {
    struct R {
        int256 answer;
        uint256 updatedAt;
    }

    uint8 public decimals = 8;
    uint256 public constant PHASE = 1 << 64;
    R[] internal _rounds; // index i = aggregator round i + 1
    bool public broken;

    function setDecimals(uint8 d) external {
        decimals = d;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function push(int256 answer, uint256 updatedAt) external returns (uint80 id) {
        _rounds.push(R(answer, updatedAt));
        id = uint80(PHASE | _rounds.length);
    }

    function count() external view returns (uint256) {
        return _rounds.length;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!broken, "broken");
        require(_rounds.length > 0, "No data present");
        R memory r = _rounds[_rounds.length - 1];
        uint80 id = uint80(PHASE | _rounds.length);
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }

    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80) {
        require(roundId >> 64 == 1, "No data present");
        uint256 agg = uint256(roundId) & type(uint64).max;
        require(agg >= 1 && agg <= _rounds.length, "No data present");
        R memory r = _rounds[agg - 1];
        return (roundId, r.answer, r.updatedAt, r.updatedAt, roundId);
    }
}
