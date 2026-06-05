# contracts/lib — Vendored Submodules

All directories here are **git submodules** tracked in `/.gitmodules`.  
Run `git submodule update --init --recursive` after a fresh clone to populate them.

## Build toolchain

**Foundry** (`forge 1.7.1`) — installed via WSL2/Ubuntu:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Build commands:
```bash
# Our contracts (MockUSDT + PolyBet365Escrow)
cd contracts && forge build --skip test

# Forked Polymarket contracts
cd contracts/lib/ctf-exchange       && forge build --skip test
cd contracts/lib/uma-ctf-adapter    && forge build --skip test
```

## Pinned submodule commits

| Library | Repo | HEAD commit |
|---|---|---|
| `ctf-exchange` | Polymarket/ctf-exchange | `ed5c770` |
| `uma-ctf-adapter` | Polymarket/uma-ctf-adapter | `8b76cc9` |
| `conditional-tokens-contracts` | gnosis/conditional-tokens-contracts | (latest main) |
| `openzeppelin-contracts` | OpenZeppelin/openzeppelin-contracts | `74edc4ba` |
| `forge-std` | foundry-rs/forge-std | `b3bc8b1` |

## Why Foundry (not Hardhat) for these repos

The Polymarket repos use native Foundry remappings (`remappings.txt`), relative
imports, and nested git submodules for `solmate`, `solady`, `forge-std`.
Hardhat v2 cannot consume Foundry remappings without rewriting every import path.
Foundry handles them natively — `forge build` works out of the box.

## Remappings (ctf-exchange)

```
openzeppelin/=lib/openzeppelin-contracts/contracts/
openzeppelin-contracts/=lib/openzeppelin-contracts/contracts/
solmate/=lib/solmate/src/
solady/=lib/solady/src/
common/=src/common/
creator/=src/creator/
dev/=src/dev/
exchange/=src/exchange/
```

## Deployed testnet addresses (Polygon Amoy, chainId 80002)

| Contract | Address |
|---|---|
| MockUSDT | `0x820D4ceFa26416dba1d91D63412154433148f835` |
| PolyBet365Escrow | `0x642284206c7eF6a76c0B7E922E7CF343fe064626` |
| Deployer / Platform wallet | `0x786d99F5024acE87250544cE56309AEdB97f44cF` |
