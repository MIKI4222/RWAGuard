# RWA Guard — Weather-Gated Custody & Emergency Risk Management

*Intelligent Risk. Verifiable Decisions.*

RWA Guard is a multi-page web app that reads and operates two **already deployed** GenLayer Intelligent Contracts on **Bradbury Testnet**: a weather-gated custody authorization cycle and an emergency circuit breaker. Every figure is labelled by where it comes from.

> **Testnet only.** This is not production financial infrastructure and has not been audited. The deployed contracts are not modified by this repository.

## Problem and solution

Physical-asset workflows (commodities, logistics, insurance collateral) and protocols that depend on external services need decisions that no single party controls:

- *Is the weather safe to release this asset?* Validators fetch and assess the weather themselves, a SAFE result enters an optimistic challenge period, and only then can the custodian claim release authorization.
- *Should guarded actions stop because an external service is down?* Validators fetch a status endpoint and agree on one boolean; a degraded result pauses guarded actions until a fresh operational check and the owner's unpause.

RWA Guard gives both an operations console, a risk overview and an audit view.

## Contracts

| Contract | Address | Explorer | Source |
|---|---|---|---|
| Emergency Circuit Breaker | `0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000` | [view](https://explorer-bradbury.genlayer.com/address/0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000) | [genlayer-emergency-circuit-breaker](https://github.com/MIKI4222/genlayer-emergency-circuit-breaker) |
| Weather-Gated RWA Custody | `0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a` | [view](https://explorer-bradbury.genlayer.com/address/0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a) | [genlayer-weather-gated-rwa-custody](https://github.com/MIKI4222/genlayer-weather-gated-rwa-custody) |

## What the contracts really support (verified from source)

The interfaces below were read from each repository's `contract.py` before any UI was written. Neither contract has a payable method.

**Emergency Circuit Breaker**
- Reads: `get_status` (ACTIVE / PAUSED), `get_monitored_url`, `get_last_verdict` (not_checked / operational / degraded), `get_incident_count`, `get_last_check_timestamp`, `get_guarded_action_count`.
- Writes: `health_check()` (anyone; consensus check via `strict_eq` on a boolean, no LLM), `execute_guarded_action(action_data)` (anyone; reverts while paused), `emergency_unpause()` (owner; needs a fresh operational verdict), `set_monitored_url(new_url)` (owner).

**Weather-Gated RWA Custody** (one reusable cycle, not a list of positions)
- Reads: `get_status`, `get_cycle_id`, `get_cycle_label`, `get_weather_url`, `get_challenge_period`, `get_decision`, `get_risk`, `get_reason`, `get_source_used`, `get_challenge_deadline`, `get_challenge_count`, `get_assessment_count`, `get_completed_cycles`, `can_finalize`, `can_claim_custody`.
- Writes: `start_cycle(label)`, `propose_release()`, `challenge_release(evidence_url)`, `finalize_release()`, `claim_rwa_custody(label)` (custodian), `reopen_challenged_proposal()`, `close_unsafe_cycle()`, `set_weather_url(url)`, `set_challenge_period(seconds)` (owner-only where the contract says so).

**Not exposed by the app on purpose:** `transfer_ownership` and `set_custodian` (high-impact administrative changes; use the explorer or Studio).

### Operations the contracts do not support (and the app therefore does not offer)

- Creating or listing custody positions, collateral amounts, freezing, or settlement. The custody contract is a single authorization cycle and does not move tokens or physical assets.
- Passing weather data from the frontend. The validators fetch the contract's configured `weather_url` themselves; the app only previews the same Open-Meteo data off-chain and can build the URL for the owner to set.
- Any event or transaction history, risk-history chart, or AI explanation from the circuit breaker (it uses no LLM).
- Reading the owner or custodian address, so the app cannot pre-check your role; a wrong wallet reverts.

## Data provenance labels

`ON-CHAIN` read from a deployed contract or network status of a transaction you sent · `LIVE EXTERNAL` Open-Meteo, off-chain · `LOCAL` computed in your browser (e.g. the policy pre-check) · `DOCUMENTED` transaction IDs listed in the custody README, not re-verified by the app · `UNAVAILABLE` could not be obtained. There is no simulated data and no demo mode: when something cannot be read the UI says so.

## Pages

| Route | Purpose |
|---|---|
| `/` | Risk overview: four status cards, KPIs from contract counters, weather-vs-policy chart (live external), honest "no history" state |
| `/rwa-custody` | Contract state and cycle progress, weather search with local policy pre-check, all cycle operations with confirmation dialogs and transaction lifecycle |
| `/circuit-breaker` | Protection state, evaluation flow, health check, guarded action, unpause, URL change, raw contract output |
| `/audit` | Contract identities, transaction table (search/filter/sort/paginate), raw-data inspector |
| `*` | 404 page |

### Transaction lifecycle

Writes are signed by your EVM wallet through `genlayer-js`. The panel follows the **real** consensus status polled from the network (PENDING → PROPOSING/COMMITTING/REVEALING → ACCEPTED/FINALIZED, or UNDETERMINED/CANCELED/timeouts) and shows the raw status. A second submission is blocked while one is in progress; uncertain outcomes are never retried automatically. After success the relevant state is re-read from the contract.

### Explorer links

The explorer is client-rendered and its per-transaction URL format could not be verified, so the app never guesses one: transaction links open the verified **contract page** and the hash is shown for copying and searching.

## Architecture

```
src/lib/api.ts         contract-facing logic: typed reads, state mapping, validated writes (no SDK/browser imports)
src/lib/weather.ts     Open-Meteo helpers: URL builder identical to the contract default, policy check, geocoding, forecast
src/lib/genlayer.ts    genlayer-js client, wallet connection, transaction status polling, local audit log
src/lib/throttle.ts    read limiter: concurrency cap, de-duplication, short cache, retry on RPC rate limits
src/lib/explorer.ts    explorer URLs (contract pages only)
src/lib/evidence.ts    transaction IDs documented in the custody README
src/components/        AppShell, wallet, design-system components, action runner
src/pages/             the four pages and the 404 page
tests/                 signature manifest, contract model, workflow tests
```

Stack: React 18, TypeScript (strict), Vite, Tailwind CSS 3, React Router 6, Recharts, Lucide, `genlayer-js`.

## Environment

| Variable | Description |
|---|---|
| `VITE_GENLAYER_RPC_URL` | Optional RPC override; empty uses the `genlayer-js` Bradbury default |
| `VITE_RWA_CUSTODY_ADDRESS` | Custody contract address |
| `VITE_CIRCUIT_BREAKER_ADDRESS` | Circuit breaker address |

Nothing here is secret. The network is identified through `genlayer-js`; chain id is compared with the wallet's when the SDK exposes it, otherwise the status stays "unverified". A demo-mode flag and a weather-provider flag were deliberately not added: there is no demo mode, and the provider is fixed.

## Getting started

Requirements: Node.js 20+.

```bash
git clone https://github.com/MIKI4222/RWAGuard.git
cd RWAGuard
npm install
cp .env.example .env.local
npm run dev          # http://localhost:5173
npm run typecheck
npm test
npm run build        # outputs dist/
```

### Live wallet connection

Use MetaMask or another EVM wallet; the app tries to add/switch to Bradbury through `genlayer-js`. You need testnet GEN for transactions. Reading works without a wallet. Owner-only calls work only from the owner's wallet, the claim only from the custodian's.

## Deploy to Netlify

1. Push the repository to GitHub and import it in Netlify.
2. Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
3. The `/* → /index.html` redirect makes direct navigation to `/rwa-custody`, `/circuit-breaker` and `/audit` work after a refresh.
4. No backend, functions or secrets are required.

## Wallet signing and transaction verification

- Writes are signed by a client created with an **explicit EIP-1193 provider** (`provider: window.ethereum`); reads use a separate wallet-free client. Connection and network-switch errors are surfaced, never swallowed.
- A transaction is a **success** only when it is `FINALIZED` **and** its execution result is `FINISHED_WITH_RETURN`. `ACCEPTED` is shown as "accepted, not final"; failed executions and unknown outcomes are reported as such.
- After a finalized success the app re-reads the contract and checks that the state changed as promised, and shows the hash, execution result and that verification in the transaction panel.
- `npm run evidence` runs the same functions against the deployed contracts from the command line and writes a report. See `docs/TX_VERIFICATION.md`, `docs/LIVE_EVIDENCE.md` and `docs/DEPLOYMENT_EVIDENCE.md`.

## Tests

`npm test` runs `tests/workflows.test.ts` (plus `tests/txverify.test.ts`, `tests/verification.test.ts` and `tests/throttle.test.ts`) against `tests/mock-chain.ts`, a model of both contracts that rejects any call not matching the real signatures (unknown method, wrong argument count, view/write mix-up, value on a non-payable method). It covers the full circuit-breaker flow (check, pause, block, refused early unpause, recovery), the full custody cycle (challenge, reopen, finalize, claim, reuse, unsafe path), the weather helpers (including that the generated URL equals the contract's default byte for byte), error handling for rate limits and malformed responses, and that every method used in `src/` exists in the contracts. `tests/throttle.test.ts` covers the RPC request layer (max 3 concurrent reads, shared identical reads, 8 s cache, retry with backoff on rate-limit errors, no caching of failures), added because the public RPC rate-limits `gen_call`. The tests use a model derived from the contract sources, **not a live chain**; no transaction is sent by any test.

## Known limitations

- Live wallet transactions and end-to-end behaviour on Bradbury have not been verified by the automated tests.
- No history: counters and current state only. Cycle and incident history are not readable.
- The weather chart and policy pre-check are informational; only validator consensus decides.
- Challenge evidence is a URL recorded as a veto signal; it is not adjudicated by the contract.
- The contracts' owner controls the weather source and challenge period; production use would need governance or a multisig.
- External web availability can delay or time out validator consensus.
- The public RPC rate-limits reads; the app queues and retries them, so the first load can take a few seconds.

## Security considerations

No keys or seed phrases in the code; no silent signing; explicit confirmation before every write; external text is rendered as plain text; no automatic retries; no administrative bypass. Testnet only.

## License

MIT
