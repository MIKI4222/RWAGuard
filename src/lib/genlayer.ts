import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { BREAKER_ADDRESS, CUSTODY_ADDRESS, RPC_URL } from "./config";
import { parse } from "./api";
import { createReader } from "./throttle";
import { waitForVerdict, type TxVerdict } from "./txverify";

export const TARGET_CHAIN_ID: number | undefined = (testnetBradbury as any)?.id;
const base = () => ({ chain: testnetBradbury, ...(RPC_URL ? { endpoint: RPC_URL } : {}) });

export type Stage = "idle" | "preparing" | "authorizing" | "consensus" | "executing" | "accepted" | "success" | "failed";
export type AuditEntry = {
  ts: number; contract: "Circuit Breaker" | "RWA Custody"; fn: string; hash?: string;
  status: "finalized" | "accepted" | "reverted" | "error"; execution?: string; consensus?: string; raw: string;
};
const contractName = (a: string): AuditEntry["contract"] => (a.toLowerCase() === BREAKER_ADDRESS.toLowerCase() ? "Circuit Breaker" : "RWA Custody");
const ser = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

// ---------- clients ----------
// Reads use a wallet-free client. Writes use a SEPARATE client bound to the connected account and an EXPLICIT EIP-1193
// provider (window.ethereum), so the SDK never has to guess where to sign.
const readClient = (): any => createClient(base() as any);
let activeProvider: any = null;
const writeClient = (account: string): any => {
  if (!activeProvider) throw new Error("No wallet provider: connect a wallet before sending a transaction.");
  return createClient({ ...base(), account: account as `0x${string}`, provider: activeProvider } as any);
};

export type WalletInfo = { account: string; chainId: number | null };
export const hasWallet = () => typeof window !== "undefined" && !!(window as any).ethereum;
export async function currentChainId(): Promise<number | null> {
  try { return activeProvider ? parseInt(await activeProvider.request({ method: "eth_chainId" }), 16) : null; } catch { return null; }
}
// Connection errors are NOT swallowed: if the wallet cannot be switched to Bradbury, or ends up on another chain,
// the connection fails with a clear message instead of reporting a misleading "connected" state.
export async function connectWallet(): Promise<WalletInfo> {
  if (!hasWallet()) throw new Error("No EVM wallet found. Install MetaMask or another EVM wallet.");
  const provider = (window as any).ethereum;
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const account = accounts?.[0];
  if (!account) throw new Error("The wallet did not return an account.");
  try { await createClient({ ...base(), account, provider } as any).connect("testnetBradbury"); }
  catch (e) { throw new Error(`Could not switch the wallet to GenLayer Bradbury Testnet: ${e instanceof Error ? e.message : String(e)}`); }
  activeProvider = provider;
  const chainId = await currentChainId();
  if (TARGET_CHAIN_ID !== undefined && chainId !== null && chainId !== TARGET_CHAIN_ID) {
    activeProvider = null;
    throw new Error(`The wallet is on chain ${chainId}, but Bradbury Testnet is chain ${TARGET_CHAIN_ID}. Switch the network in your wallet and reconnect.`);
  }
  return { account, chainId };
}

// ---------- reads ----------
const reader = createReader(async (address, fn, args) => {
  const v = await readClient().readContract({ address: address as `0x${string}`, functionName: fn, args });
  return Array.isArray(v) ? v : parse(v);
});
export const read = (address: string, fn: string, args: any[] = []) => reader.read(address, fn, args);
export const clearReadCache = () => reader.clear();

// ---------- local audit log ----------
export function auditLog(): AuditEntry[] { try { return JSON.parse(localStorage.getItem("rg_audit") || "[]"); } catch { return []; } }
function logAudit(e: AuditEntry) { try { localStorage.setItem("rg_audit", JSON.stringify([e, ...auditLog()].slice(0, 200))); } catch { /* storage unavailable */ } }

const stageOf = (v: TxVerdict): Stage => v.state === "success" ? "success" : v.state === "failed" ? "failed" : v.state === "accepted" ? "accepted" : ["PROPOSING", "COMMITTING", "REVEALING"].includes(v.status) ? "executing" : "consensus";

export interface WriteResult { hash: string; tx: unknown; verdict: TxVerdict; finalized: boolean }

// Sends a transaction and verifies it strictly. It resolves ONLY when the transaction is FINALIZED with a successful
// execution result (finalized=true), or when it is ACCEPTED but finalization did not arrive within the polling window
// (finalized=false: reported as "accepted, not final", never as success). Failed executions throw.
export async function write(address: string, fn: string, args: any[], account: string, on: (s: Stage, detail?: string, hash?: string) => void, value = 0n): Promise<WriteResult> {
  let hash: string | undefined;
  on("authorizing", "Waiting for wallet signature");
  try {
    const c = writeClient(account);
    const txHash = (await c.writeContract({ address: address as `0x${string}`, functionName: fn, args, value })) as string;
    hash = txHash;
    on("consensus", "Submitted", txHash);
    const reads = readClient();
    const r = await waitForVerdict({
      getTx: () => reads.getTransaction({ hash: txHash as any }),
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
      onUpdate: (v) => on(stageOf(v), `${v.status}${v.execution !== "NOT_VOTED" ? ` · ${v.execution}` : ""}`, txHash),
    });
    clearReadCache();
    const consensus = r.verdict.status, execution = r.verdict.execution;
    if (r.verdict.state === "success") {
      on("success", `${consensus} · ${execution}`, txHash);
      logAudit({ ts: Date.now(), contract: contractName(address), fn, hash: txHash, status: "finalized", execution, consensus, raw: ser(r.tx) });
      return { hash: txHash, tx: r.tx, verdict: r.verdict, finalized: true };
    }
    if (r.verdict.state === "accepted") {
      on("accepted", "Accepted by consensus — waiting for finalization", txHash);
      logAudit({ ts: Date.now(), contract: contractName(address), fn, hash: txHash, status: "accepted", execution, consensus, raw: ser(r.tx) });
      return { hash: txHash, tx: r.tx, verdict: r.verdict, finalized: false };
    }
    logAudit({ ts: Date.now(), contract: contractName(address), fn, hash: txHash, status: "reverted", execution, consensus, raw: ser(r.tx) });
    throw new Error(r.timedOut ? `Outcome unknown after waiting (${consensus}). Check the transaction on the explorer before retrying.` : r.verdict.detail);
  } catch (e: any) {
    on("failed", String(e?.message || e).slice(0, 240), hash);
    if (!hash) logAudit({ ts: Date.now(), contract: contractName(address), fn, status: "error", raw: String(e?.message || e) });
    throw e;
  }
}

