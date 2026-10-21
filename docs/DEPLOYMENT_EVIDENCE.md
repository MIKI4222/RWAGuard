# Source-matched deployment evidence

Goal: show that the code deployed at each address is the code in this repository's `contracts/` folder.

| Contract | Address | Explorer | Source repository |
|---|---|---|---|
| Emergency Circuit Breaker | `0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000` | https://explorer-bradbury.genlayer.com/address/0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000 | https://github.com/MIKI4222/genlayer-emergency-circuit-breaker |
| Weather-Gated RWA Custody | `0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a` | https://explorer-bradbury.genlayer.com/address/0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a | https://github.com/MIKI4222/genlayer-weather-gated-rwa-custody |

## Procedure
1. Copy the exact deployed files into `contracts/` (`circuit_breaker.py` from `genlayer-emergency-circuit-breaker/contract.py`, `weather_custody.py` from `genlayer-weather-gated-rwa-custody/contract.py`), unmodified.
2. Print their hashes: `npm run hash-sources` (SHA-256 of each file).
3. Open each contract on the explorer, locate the deployment transaction and the contract code shown there, and compare it with the local file (for example by pasting the explorer's code into a file and hashing it the same way, or with a diff tool). Record the deployment transaction hash.
4. Cross-check the interfaces: `tests/signatures.ts` lists every method and argument count, and the test "every contract method used in src/ exists in the contract signatures" fails if the app calls anything else.

## Record (fill in with real values only)
| Contract file | SHA-256 | Deployment tx hash | Matches explorer code? |
|---|---|---|---|
| contracts/circuit_breaker.py | | | |
| contracts/weather_custody.py | | | |

The custody contract's README also lists transaction IDs from its own test runs; they are context, not evidence produced by this frontend.
