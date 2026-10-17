# RWA Guard — submission notes (GenLayer Portal: Projects)

- Source code: https://github.com/MIKI4222/RWAGuard
- Live demo: <!-- add Netlify URL after deploy -->

**What it does.** An operations console and risk overview over two deployed Intelligent Contracts on Bradbury: Weather-Gated RWA Custody (`0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a`) and Emergency Circuit Breaker (`0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000`). The contracts are unchanged.

**Problem.** Real-world-asset release and external-service dependence are decided by whoever controls the data. Here validators fetch the data themselves:
- Custody: validators assess live weather (LLM + Equivalence Principle), a SAFE result opens a challenge period, then a configured custodian claims release authorization once.
- Circuit Breaker: validators fetch a status endpoint and agree on one boolean; a degraded result pauses guarded actions until a fresh operational check and owner unpause.

**How to use.** `npm install && npm run dev`, connect an EVM wallet (Bradbury is added automatically). Reading needs no wallet. On /rwa-custody search a location to preview current weather and the exact URL the contract would fetch, then run the cycle (start_cycle → propose_release → challenge/finalize → claim). On /circuit-breaker run health_check and inspect the state. /audit lists transactions and a raw-data inspector.

**Transaction lifecycle.** Real consensus status is polled from the network and shown with the raw status; duplicate submissions are blocked; state is re-read after success. Read errors are shown, never replaced by healthy-looking defaults.

**Honest scope.** The custody contract is a single authorization cycle (no positions, collateral or token movement); neither contract keeps a history; the circuit breaker uses no LLM. The app therefore shows counters and current state, labels every datum as ON-CHAIN / LIVE EXTERNAL / LOCAL / DOCUMENTED / UNAVAILABLE, and offers no operation the contracts do not have.

**Tests.** `npm test` runs both contract workflows through the app's real API layer against a model enforcing the contracts' exact signatures, plus weather-helper and error-handling tests; `npm run typecheck` and CI run alongside the build. This is a model derived from the contract sources, not a live-chain test.

**Path to continued use.** Per-asset cycle management for logistics DAOs, treasury/custody adapters that consume the authorization, wiring the circuit breaker to a real guarded protocol action, and notifications.
