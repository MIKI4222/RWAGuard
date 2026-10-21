import { useState, type ReactNode } from "react";
import { useWallet } from "./wallet";
import { ConfirmDialog, TxPanel } from "./ui";
import { useTx } from "../hooks";
import { write, read, clearReadCache, type Stage, type WriteResult } from "../lib/genlayer";
import { getBreaker, getCustody, type Writer } from "../lib/api";

export type Ask = { op: string; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; exec: (w: Writer) => Promise<unknown>; verify?: (before: any, after: any) => string | null };

// One consistent flow for every consequential action:
// confirm → snapshot → wallet → real lifecycle → FINALIZED + successful execution → fresh read → state check.
export function useActionRunner(contract: "Circuit Breaker" | "RWA Custody", address: string, onDone: () => void) {
  const { account, connect, status, networkOk } = useWallet();
  const { tx, run, busy } = useTx(onDone);
  const [pending, setPending] = useState<Ask | null>(null);
  const snapshot = () => (contract === "Circuit Breaker" ? getBreaker(read, address) : getCustody(read, address));
  const writer = (on: (s: Stage, d?: string, h?: string) => void): Writer => (a, fn, args, v = 0n) => write(a, fn, args, account, on, v);
  const ask = (a: Ask) => { if (status !== "connected") { connect(); return; } setPending(a); };
  const confirm = () => {
    const a = pending; setPending(null); clearReadCache();
    if (!a) return;
    void run(a.op, contract, async (on, patch) => {
      let before: unknown = null;
      if (a.verify) { try { before = await snapshot(); } catch { before = null; } }
      const res = (await a.exec(writer(on))) as WriteResult;
      patch({ execution: res?.verdict?.execution, finality: res?.finalized ? "finalized" : "accepted" });
      if (!a.verify) return;
      if (!res?.finalized) { patch({ verification: { ok: false, message: "Accepted by consensus but not final yet: the state change is not verified as final. Refresh later." } }); return; }
      if (!before) { patch({ verification: { ok: false, message: "The state before the transaction could not be read, so the change cannot be compared." } }); return; }
      clearReadCache();
      try {
        const after = await snapshot();
        const problem = a.verify(before, after);
        patch({ verification: problem ? { ok: false, message: `State check failed: ${problem}` } : { ok: true, message: "State change confirmed by a fresh read of the contract." } });
      } catch (e) { patch({ verification: { ok: false, message: `State could not be re-read: ${e instanceof Error ? e.message : String(e)}` } }); }
    });
  };
  const blocked = networkOk === false ? "Switch your wallet to GenLayer Bradbury Testnet" : busy ? "A transaction is in progress" : "";
  const dialog = (
    <ConfirmDialog open={!!pending} title={pending?.title ?? ""} confirmLabel={pending?.confirmLabel ?? "Confirm & sign"} danger={pending?.danger} onConfirm={confirm} onCancel={() => setPending(null)}>
      {pending?.body}
      <p className="font-mono text-xs">Contract {address.slice(0, 10)}…{address.slice(-6)} · Bradbury Testnet</p>
      <p className="text-xs">Your wallet will ask you to authorize this transaction. Nothing is signed silently.</p>
    </ConfirmDialog>
  );
  return { ask, dialog, txPanel: <TxPanel tx={tx} address={address} />, busy, blocked, connected: status === "connected" };
}
