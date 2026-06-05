// SPDX-License-Identifier: MIT
// NegRiskAdapter is pragma =0.8.19
pragma solidity 0.8.19;

import "neg-risk-ctf-adapter/NegRiskAdapter.sol";

/// @dev Thin wrapper so Forge can extract NegRiskAdapter creation bytecode.
contract NegRiskAdapterShim is NegRiskAdapter {
    constructor(address ctf, address col, address vault)
        NegRiskAdapter(ctf, col, vault)
    {}
}
