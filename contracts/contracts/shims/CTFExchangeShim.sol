// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "ctf-exchange/exchange/CTFExchange.sol";

/// @dev Thin wrapper so Forge can extract CTFExchange creation bytecode.
contract CTFExchangeShim is CTFExchange {
    constructor(address col, address ctf, address pf, address sf)
        CTFExchange(col, ctf, pf, sf)
    {}
}
