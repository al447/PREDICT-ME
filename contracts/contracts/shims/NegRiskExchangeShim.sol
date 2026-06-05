// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "neg-risk-ctf-adapter/NegRiskCtfExchange.sol";

/// @dev Thin wrapper so Forge can extract NegRiskCtfExchange creation bytecode.
contract NegRiskExchangeShim is NegRiskCtfExchange {
    constructor(address col, address ctf, address nra, address pf, address sf)
        NegRiskCtfExchange(col, ctf, nra, pf, sf)
    {}
}
