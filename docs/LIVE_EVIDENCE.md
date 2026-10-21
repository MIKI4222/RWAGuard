# Live evidence on the deployed Bradbury contracts

Mocked tests are not evidence. This document explains how to reproduce the principal custody and circuit-breaker workflows against the **deployed** contracts and where to record the results. **Nothing in this file is a result until you paste real output below.**

Contracts: Circuit Breaker `0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000` · RWA Custody `0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a` (Bradbury Testnet).

## A. Through the public frontend (wallet-connected)
Requirements: the deployed site, MetaMask (or another EVM wallet) with testnet GEN.

**Circuit breaker**
1. Open `/circuit-breaker`, connect the wallet. Reads (state, last verdict, incidents) need no wallet.
2. Click `health_check`, confirm, sign. The panel shows each real stage, ending with **Finalized · execution succeeded** and `execution result: FINISHED_WITH_RETURN`.
3. The panel shows the transaction hash and **"State change confirmed by a fresh read of the contract"** (last check timestamp advanced). Copy the hash.
4. Optional (owner wallet): `set_monitored_url` to an endpoint that returns 5xx → `health_check` → status `PAUSED`, incidents +1 → restore the URL → `health_check` (operational) → `emergency_unpause` → `ACTIVE`.

**Custody**
1. Open `/rwa-custody`. Reads need no wallet.
2. Owner wallet: `start_cycle` (label) → state `OPEN`, cycle +1.
3. Any wallet: `propose_release` → validators assess the configured weather URL → `CHALLENGE_PERIOD` (SAFE) with assessments +1.
4. After the challenge period: `finalize_release` → `RELEASED`; custodian wallet: `claim_rwa_custody` → `CLAIMED`, completed cycles +1. (Or `challenge_release` / `reopen_challenged_proposal` to show the veto path.)
5. Each step shows hash, finalization, execution result and the verified state change.

## B. Reproducible command line (no browser, no mocks)
Uses the same `src/lib` functions and strict verification as the app and writes a markdown report.

```bash
npm install
# read-only (proves live reads against both contracts, no key needed)
npm run evidence

# with writes (TESTNET key only; read from the environment, never printed or saved)
EVIDENCE_PRIVATE_KEY=0x… npm run evidence -- breaker:health_check
EVIDENCE_PRIVATE_KEY=0x… npm run evidence -- custody:propose_release
```
Windows PowerShell: `$env:EVIDENCE_PRIVATE_KEY="0x…"; npm run evidence -- breaker:health_check`.
Operations: `breaker:health_check`, `breaker:guarded_action[=data]`, `breaker:unpause`, `custody:start_cycle[=label]`, `custody:propose_release`, `custody:challenge=<url>`, `custody:finalize`, `custody:claim[=label]`. The report is saved under `docs/evidence/` and lists, per step: transaction hash, consensus status, execution result, finalized yes/no, the state before→after diff and the verification verdict. The command exits non-zero if any step fails or its state change is not confirmed.

## C. Results (fill in with real output only)
| # | Contract | Function | Transaction hash | Consensus / execution | Finalized | State change |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

Commit hash of the submitted version: `…` · CI run: `…` · Public frontend URL: `…`

Note: the explorer's per-transaction URL format is not verified by this project; search each hash on the contract's explorer page.
