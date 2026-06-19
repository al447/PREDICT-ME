# Audit Scope — PredictMe Smart Contracts

Prepared for the CertiK security review. This separates **upstream code already
audited by third parties** from **PredictMe-original code** that should receive
primary audit focus.

Network: **Polygon mainnet (chainId 137)** · Deployed 2026-06-17 · block 88660117

---

## A. PRIMARY AUDIT FOCUS — PredictMe original code

These contracts contain PredictMe-authored logic and represent the real attack
surface introduced by PredictMe. **Audit effort should concentrate here.**

| Contract | Deployed address | What to scrutinize |
|---|---|---|
| `MarketFactory.sol` | `0x0e9Be76713060ae72bF4a431a79DE4e4342703Dd` | Condition preparation, UMA question init params (reward token, bond, liveness), access control (owner = Safe), reentrancy on external CTF/adapter calls |
| `CryptoMarketResolver.sol` | `0x54D68C9D477fb516AD5310F4c42f5D66cDd8c10c` | Chainlink feed handling, `checkUpkeep`/`performUpkeep` logic, payout derivation, `reportPayouts` authorization, Ownable2Step transfer (pendingOwner = Safe) |
| `WalletFactory.sol` | `0x2818282f94e6aBCAC612B5f14b79d061E3B681d8` | Deterministic Safe proxy salt/nonce, initializer correctness, front-running of proxy creation, owner config |

### Key invariants to verify
- `MarketFactory` only initializes markets with the intended mainnet UMA Finder /
  Optimistic Oracle V2 and native USDC reward token (non-zero proposal bond).
- `CryptoMarketResolver` can only report payouts for markets it is the oracle of,
  and only after `endTime` with a fresh feed.
- `WalletFactory` produces a proxy address that is a pure function of the user key
  and cannot be hijacked by a third party submitting the same salt.
- Privileged roles are held by the Gnosis Safe multisig
  `0xe0b2C07e4a70d119dA7A90C3A14A628113F5BB1E`, not an EOA.

---

## B. SECONDARY / OUT-OF-SCOPE — Upstream audited code

These are vendored **unmodified** from audited upstream projects. They were audited
by their original authors and should be treated as out-of-scope except to confirm
**(1) they are byte-identical to upstream** and **(2) they are wired together with
safe constructor parameters**.

| Contract | Deployed address | Upstream | Prior audits |
|---|---|---|---|
| `CTFExchange` | `0xB2FB436cC2E6F5c8F2cb9a876FF4AF0CfDF2D8D8` | Polymarket (MIT) | Audited for Polymarket production |
| `NegRiskCtfExchange` | `0x6ceED4031F634bb57fcaE7AD71D58DFDcfCA7eB1` | Polymarket (MIT) | Audited for Polymarket production |
| `NegRiskAdapter` | `0x32d2bE3240A73cDd5A432fE987477A615da29fa9` | Polymarket (MIT) | Audited for Polymarket production |
| `UmaCtfAdapter` | `0x78E4B65e23cAD525851F32A1FF19320dE1Df73f7` | Polymarket (MIT) | Audited for Polymarket production |
| `ConditionalTokens` | `0x4518a86c85F3D0aE6ac100B9384011bba63a9b1c` | Gnosis (LGPL-3.0) | Battle-tested, widely audited |
| `WrappedCollateral` | `0xF5880Ed43a7af85Cf46E7D164b07D3c2C3727931` | Polymarket (MIT) | Audited for Polymarket production |

The shim contracts (`CTFExchangeShim`, `NegRiskShims`, `NegRiskExchangeShim`,
`UmaCtfAdapterShim`) add **no logic** — they only expose upstream creation bytecode
to Foundry. Verifying they are empty pass-through wrappers is sufficient.

---

## C. Deployment / configuration to confirm

| Item | Expected |
|---|---|
| Collateral token | Native Circle USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (NOT a mock) |
| `MockUSDC.sol` | **Not deployed on mainnet** — test artifact only |
| Admin / owner | Gnosis Safe `0xe0b2C07e4a70d119dA7A90C3A14A628113F5BB1E` on all ownable/admin contracts |
| Old deployer EOA `0x27E73Fa8...` | Stripped of all admin/owner roles |
| Operator | `0x730ab5f7755e63E0270bF97A57e163282878E5B8` — registered on both exchanges |
| EIP-712 domain | `name='Polymarket CTF Exchange', version='1'` (matches deployed exchange) |

### Known pending items (operational, not code vulnerabilities)
- `CryptoMarketResolver.acceptOwnership()` to be executed from the Safe (Ownable2Step finalization).
- Chainlink Automation upkeep registration + LINK funding + `setForwarder` for `CryptoMarketResolver`.

---

## D. Provenance & licensing
See `NOTICE.md` for the full origin/license breakdown. Summary: all Polymarket code
is MIT (commercial use permitted, notices retained); Gnosis CTF is LGPL-3.0 used
unmodified via interface (no copyleft trigger).

_Last updated: 2026-06-18_
