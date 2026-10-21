// Strict, pure transaction verification (no SDK or browser imports).
// GenLayer can FINALIZE a transaction whose execution FAILED, so consensus status alone is never treated as success:
//   success  = status FINALIZED  AND  txExecutionResultName === FINISHED_WITH_RETURN
//   accepted = status ACCEPTED   AND  FINISHED_WITH_RETURN   (consensus agreed, still inside the appeal window: NOT final)
//   failed   = any failing consensus status, or FINISHED_WITH_ERROR, or FINALIZED without a successful execution result
export type TxState = "pending" | "accepted" | "success" | "failed";
export interface TxVerdict { state: TxState; status: string; execution: string; detail: string }

const FAIL = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

export function evaluateTx(tx: unknown): TxVerdict {
  const t = (tx ?? {}) as { statusName?: unknown; txExecutionResultName?: unknown };
  const status = String(t.statusName ?? "PENDING");
  const execution = String(t.txExecutionResultName ?? "NOT_VOTED");
  const v = (state: TxState, detail: string): TxVerdict => ({ state, status, execution, detail });
  if (FAIL.has(status)) return v("failed", `Consensus ended with ${status}`);
  if (execution === "FINISHED_WITH_ERROR") return v("failed", `Execution failed (${status}): the contract call raised an error and state was not modified`);
  if (status === "FINALIZED") return execution === "FINISHED_WITH_RETURN" ? v("success", "Finalized with a successful execution result") : v("failed", `Finalized without a successful execution result (${execution})`);
  if (status === "ACCEPTED") return execution === "FINISHED_WITH_RETURN" ? v("accepted", "Accepted by consensus, awaiting finalization") : v("pending", `Accepted, execution result ${execution}`);
  return v("pending", status);
}

export interface WaitOptions {
  getTx: () => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
  maxPolls?: number;
  maxReadErrors?: number;
  onUpdate?: (v: TxVerdict, tx: unknown) => void;
}
export interface WaitResult { verdict: TxVerdict; tx: unknown; timedOut: boolean }

// Polls until the verdict is final (success/failed). If the window ends first, the last verdict is returned with
// timedOut=true so the caller can report "accepted, not final" or "outcome unknown" instead of claiming success.
export async function waitForVerdict(o: WaitOptions): Promise<WaitResult> {
  const pollMs = o.pollMs ?? 3000, maxPolls = o.maxPolls ?? 400, maxErr = o.maxReadErrors ?? 5;
  let tx: unknown = null, verdict: TxVerdict = evaluateTx(null), last = "", errors = 0;
  for (let i = 0; i < maxPolls; i++) {
    try { tx = await o.getTx(); errors = 0; }
    catch (e) { if (++errors >= maxErr) throw e; await o.sleep(pollMs); continue; }
    verdict = evaluateTx(tx);
    const key = `${verdict.status}|${verdict.execution}`;
    if (key !== last) { last = key; o.onUpdate?.(verdict, tx); }
    if (verdict.state === "success" || verdict.state === "failed") return { verdict, tx, timedOut: false };
    await o.sleep(pollMs);
  }
  return { verdict, tx, timedOut: true };
}
