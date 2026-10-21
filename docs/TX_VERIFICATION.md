# Wallet connection and transaction verification

This document describes how RWA Guard signs, submits and verifies transactions, and what it deliberately does **not** claim.

## Signing client
- Reads use a wallet-free client: `createClient({ chain: testnetBradbury })`.
- Writes use a separate client bound to the connected account **and an explicit EIP-1193 provider**:
  `createClient({ chain, account, provider: window.ethereum })` (`src/lib/genlayer.ts`). If no provider has been connected, sending fails with a clear error instead of guessing.

## Connection errors are not swallowed
`connectWallet()` requests accounts, calls `client.connect("testnetBradbury")` and **throws** if the wallet cannot be switched (`Could not switch the wallet to GenLayer Bradbury Testnet: …`). After switching it compares the wallet's chain id with the SDK's Bradbury chain id and fails if they differ. The UI therefore never shows "connected" for a wallet that cannot sign for Bradbury.

## What counts as success
GenLayer can finalize a transaction whose *execution failed*, so consensus status alone is not proof (see the SDK's "Checking execution results"). `src/lib/txverify.ts` decides:

| Consensus status | Execution result | Verdict |
|---|---|---|
| `FINALIZED` | `FINISHED_WITH_RETURN` | **success** |
| `FINALIZED` | `FINISHED_WITH_ERROR`, `NOT_VOTED`, missing | **failed** |
| `ACCEPTED` | `FINISHED_WITH_RETURN` | **accepted** (not final; can still be appealed; never reported as success) |
| `ACCEPTED` | `FINISHED_WITH_ERROR` | **failed** |
| `UNDETERMINED`, `CANCELED`, `LEADER_TIMEOUT`, `VALIDATORS_TIMEOUT` | any | **failed** |
| `PENDING`, `ACTIVATED`, `PROPOSING`, `COMMITTING`, `REVEALING` | any | pending |

The app polls `getTransaction` (up to ~20 minutes). It resolves only on success or "accepted, not final" (timeout while accepted); a failed execution throws; an unknown outcome is reported as unknown and is never retried automatically.

## Independent state verification
After a successful, finalized transaction the app **re-reads the contract** and compares it with a snapshot taken before signing (`expectState` in `src/lib/api.ts`), for example: `health_check` must advance `get_last_check_timestamp`; `propose_release` must increase the assessment count by one; `finalize_release` must leave the status `RELEASED`; `claim_rwa_custody` must set `CLAIMED` and increase completed cycles. The result is shown in the transaction panel as "State change confirmed by a fresh read" or "State check failed: …". If a transaction is only accepted, the state is explicitly **not** reported as verified.

## Tests
`tests/txverify.test.ts` covers every row of the table and the polling logic; `tests/verification.test.ts` covers the state expectations and the evidence runner. These use models of the contracts; live behaviour is demonstrated separately (see `docs/LIVE_EVIDENCE.md`).
