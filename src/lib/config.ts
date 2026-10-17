// Centralized, documented configuration. Vite exposes only VITE_-prefixed variables; none of them is secret.
const env = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
export const BREAKER_ADDRESS = (env.VITE_CIRCUIT_BREAKER_ADDRESS || "0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000") as `0x${string}`;
export const CUSTODY_ADDRESS = (env.VITE_RWA_CUSTODY_ADDRESS || "0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a") as `0x${string}`;
export const RPC_URL = env.VITE_GENLAYER_RPC_URL || undefined;
export const NETWORK_NAME = "Bradbury Testnet";
export const REPOS = {
  breaker: "https://github.com/MIKI4222/genlayer-emergency-circuit-breaker",
  custody: "https://github.com/MIKI4222/genlayer-weather-gated-rwa-custody",
};
