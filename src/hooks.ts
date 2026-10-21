import { useCallback, useEffect, useRef, useState } from "react";
import type { Stage } from "./lib/genlayer";

export function useRead<T>(fn: () => Promise<T>, deps: unknown[] = [], pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const v = await fnRef.current();
      if (id !== seq.current) return;
      setData(v); setError(""); setUpdatedAt(Date.now());
    } catch (e) {
      if (id !== seq.current) return;
      setError(e instanceof Error ? e.message : String(e)); // keep the previous data: it is shown as stale
    } finally { if (id === seq.current) setLoading(false); }
  }, []);
  useEffect(() => {
    reload();
    if (pollMs > 0) { const t = setInterval(reload, pollMs); return () => clearInterval(t); }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pollMs]);
  return { data, error, loading, updatedAt, reload, stale: !!error && data !== null };
}

export type Verification = { ok: boolean; message: string };
export type TxState = { stage: Stage; op: string; contract: string; detail: string; hash?: string; startedAt: number; error?: string; execution?: string; finality?: "finalized" | "accepted"; verification?: Verification; done?: boolean };
export function useTx(onDone?: () => void) {
  const [tx, setTx] = useState<TxState | null>(null);
  const busyRef = useRef(false);
  const run = useCallback(async (op: string, contract: string, fn: (on: (s: Stage, d?: string, h?: string) => void, patch: (p: Partial<TxState>) => void) => Promise<unknown>) => {
    if (busyRef.current) return; // prevents accidental duplicate submissions
    busyRef.current = true;
    setTx({ stage: "preparing", op, contract, detail: "", startedAt: Date.now() });
    const patch = (p: Partial<TxState>) => setTx((prev) => (prev ? { ...prev, ...p } : prev));
    try {
      await fn((stage, detail, hash) => setTx((p) => (p ? { ...p, stage, detail: detail ?? "", hash: hash ?? p.hash } : p)), patch);
      patch({ done: true });
      onDone?.();
    } catch (e) {
      setTx((p) => (p ? { ...p, stage: "failed", error: e instanceof Error ? e.message : String(e), done: true } : p));
    } finally { busyRef.current = false; }
  }, [onDone]);
  const busy = tx !== null && !tx.done;
  return { tx, run, busy };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
