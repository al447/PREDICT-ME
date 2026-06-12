// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "uma-ctf-adapter/UmaCtfAdapter.sol";

/// @dev Thin wrapper so Forge can extract UmaCtfAdapter creation bytecode.
contract UmaCtfAdapterShim is UmaCtfAdapter {
    constructor(address ctf, address finder, address oo)
        UmaCtfAdapter(ctf, finder, oo)
    {}
}
