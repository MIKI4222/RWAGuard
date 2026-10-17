import { useState, type ReactNode } from "react";
import { useWallet } from "./wallet";
import { ConfirmDialog, TxPanel } from "./ui";
import { useTx } from "../hooks";
import { write, type Stage } from "../lib/genlayer";
import type { Writer } from "../lib/api";

export type Ask = { op: string; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; exec: (w: Writer) => Promise<unknown> };

// One consistent flow for every consequential action: confirm → wallet → real transaction lifecycle → refresh.
export function useActionRunner(contract: "Circuit Breaker" | "RWA Custody", address: string, onDone: () => void) {
  const { account, connect, status, networkOk } = useWallet();
  const { tx, run, busy } = useTx(onDone);
  const [pending, setPending] = useState<Ask | null>(null);
  const writer = (on: (s: Stage, d?: string, h?: string) => void): Writer => (a, fn, args, v = 0n) => write(a, fn, args, account, on, v);
  const ask = (a: Ask) => { if (status !== "connected") { connect(); return; } setPending(a); };
  const confirm = () => { const a = pending; setPending(null); if (a) void run(a.op, contract, (on) => a.exec(writer(on))); };
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
