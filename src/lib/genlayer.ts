import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { BREAKER_ADDRESS, CUSTODY_ADDRESS, RPC_URL } from "./config";
import { parse } from "./api";

export const TARGET_CHAIN_ID: number | undefined = (testnetBradbury as any)?.id;
const cfg = (extra: object = {}) => ({ chain: testnetBradbury, ...(RPC_URL ? { endpoint: RPC_URL } : {}), ...extra });
const client = (extra?: object): any => createClient(cfg(extra) as any);

export type Stage = "idle" | "preparing" | "authorizing" | "consensus" | "executing" | "success" | "failed";
export type AuditEntry = { ts: number; contract: "Circuit Breaker" | "RWA Custody"; fn: string; hash?: string; status: "accepted" | "reverted" | "error"; raw: string };
const contractName = (a: string): AuditEntry["contract"] => (a.toLowerCase() === BREAKER_ADDRESS.toLowerCase() ? "Circuit Breaker" : "RWA Custody");
const ser = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

export type WalletInfo = { account: string; chainId: number | null };
const eth = () => (window as any).ethereum;
export const hasWallet = () => typeof window !== "undefined" && !!eth();
export async function connectWallet(): Promise<WalletInfo> {
  if (!hasWallet()) throw new Error("No EVM wallet found. Install MetaMask or another EVM wallet.");
  const [account] = await eth().request({ method: "eth_requestAccounts" });
  try { await client({ account }).connect("testnetBradbury"); } catch (e) { console.warn("Could not add/switch network automatically", e); }
  return { account, chainId: await currentChainId() };
}
export async function currentChainId(): Promise<number | null> {
  try { return parseInt(await eth().request({ method: "eth_chainId" }), 16); } catch { return null; }
}

export async function read(address: string, fn: string, args: any[] = []) {
  const v = await client().readContract({ address: address as `0x${string}`, functionName: fn, args });
  return Array.isArray(v) ? v : parse(v);
}

export function auditLog(): AuditEntry[] { try { return JSON.parse(localStorage.getItem("rg_audit") || "[]"); } catch { return []; } }
function logAudit(e: AuditEntry) { try { localStorage.setItem("rg_audit", JSON.stringify([e, ...auditLog()].slice(0, 200))); } catch { /* storage unavailable */ } }

const OK = ["ACCEPTED", "FINALIZED"];
const FAIL = ["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"];
const stageOf = (n: string): Stage => OK.includes(n) ? "success" : FAIL.includes(n) ? "failed" : ["PROPOSING", "COMMITTING", "REVEALING"].includes(n) ? "executing" : "consensus";

// Writes a transaction and follows its REAL consensus status (polled from the network, never simulated).
export async function write(address: string, fn: string, args: any[], account: string, on: (s: Stage, detail?: string, hash?: string) => void, value = 0n) {
  const c = client({ account });
  let hash: string | undefined;
  on("authorizing", "Waiting for wallet signature");
  try {
    hash = await c.writeContract({ address: address as `0x${string}`, functionName: fn, args, value });
    on("consensus", "Submitted", hash);
    let tx: any, last = "";
    for (let i = 0; i < 240; i++) {
      tx = await c.getTransaction({ hash: hash as any });
      const n = String(tx?.statusName ?? "PENDING");
      if (n !== last) { last = n; on(stageOf(n), n, hash); }
      if (OK.includes(n) || FAIL.includes(n)) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    const execErr = /ERROR/i.test(String(tx?.txExecutionResultName ?? tx?.resultName ?? ""));
    const bad = FAIL.includes(last) || execErr || !OK.includes(last);
    on(bad ? "failed" : "success", last + (execErr ? " (execution error)" : ""), hash);
    logAudit({ ts: Date.now(), contract: contractName(address), fn, hash, status: bad ? "reverted" : "accepted", raw: ser(tx) });
    if (bad) throw new Error(`Transaction ${last}${execErr ? " with execution error" : ""}`);
    return tx;
  } catch (e: any) {
    on("failed", String(e?.message || e).slice(0, 200), hash);
    if (!hash) logAudit({ ts: Date.now(), contract: contractName(address), fn, status: "error", raw: String(e?.message || e) });
    throw e;
  }
}
