import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTx, waitForVerdict } from "../src/lib/txverify.ts";

const tx = (statusName: string, txExecutionResultName?: string) => ({ statusName, txExecutionResultName });

test("success requires FINALIZED and FINISHED_WITH_RETURN", () => {
  assert.equal(evaluateTx(tx("FINALIZED", "FINISHED_WITH_RETURN")).state, "success");
});

test("a FINALIZED transaction with a failed or missing execution result is NOT a success", () => {
  assert.equal(evaluateTx(tx("FINALIZED", "FINISHED_WITH_ERROR")).state, "failed");
  assert.equal(evaluateTx(tx("FINALIZED", "NOT_VOTED")).state, "failed");
  assert.equal(evaluateTx(tx("FINALIZED")).state, "failed");
  assert.match(evaluateTx(tx("FINALIZED", "FINISHED_WITH_ERROR")).detail, /state was not modified/);
});

test("ACCEPTED is not final: it is reported as accepted, never as success", () => {
  assert.equal(evaluateTx(tx("ACCEPTED", "FINISHED_WITH_RETURN")).state, "accepted");
  assert.equal(evaluateTx(tx("ACCEPTED", "FINISHED_WITH_ERROR")).state, "failed");
  assert.equal(evaluateTx(tx("ACCEPTED", "NOT_VOTED")).state, "pending");
  assert.equal(evaluateTx(tx("ACCEPTED")).state, "pending");
});

test("failing consensus statuses and in-flight statuses", () => {
  for (const s of ["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]) assert.equal(evaluateTx(tx(s, "FINISHED_WITH_RETURN")).state, "failed", s);
  for (const s of ["PENDING", "ACTIVATED", "PROPOSING", "COMMITTING", "REVEALING"]) assert.equal(evaluateTx(tx(s)).state, "pending", s);
  assert.equal(evaluateTx(null).state, "pending"); assert.equal(evaluateTx(undefined).state, "pending");
  assert.equal(evaluateTx({}).status, "PENDING");
});

test("waitForVerdict follows the real lifecycle until FINALIZED + success", async () => {
  const seq = [tx("PENDING"), tx("PROPOSING"), tx("COMMITTING"), tx("ACCEPTED", "FINISHED_WITH_RETURN"), tx("ACCEPTED", "FINISHED_WITH_RETURN"), tx("FINALIZED", "FINISHED_WITH_RETURN")];
  let i = 0; const seen: string[] = [];
  const r = await waitForVerdict({ getTx: async () => seq[Math.min(i++, seq.length - 1)], sleep: async () => {}, onUpdate: (v) => seen.push(`${v.status}:${v.state}`) });
  assert.equal(r.verdict.state, "success"); assert.equal(r.timedOut, false);
  assert.deepEqual(seen, ["PENDING:pending", "PROPOSING:pending", "COMMITTING:pending", "ACCEPTED:accepted", "FINALIZED:success"]);
});

test("waitForVerdict stops on a failed execution and does not wait for more polls", async () => {
  let calls = 0;
  const r = await waitForVerdict({ getTx: async () => { calls++; return tx("FINALIZED", "FINISHED_WITH_ERROR"); }, sleep: async () => {} });
  assert.equal(r.verdict.state, "failed"); assert.equal(calls, 1);
});

test("if finalization never arrives the result is timed-out ACCEPTED, not success", async () => {
  const r = await waitForVerdict({ getTx: async () => tx("ACCEPTED", "FINISHED_WITH_RETURN"), sleep: async () => {}, maxPolls: 5 });
  assert.equal(r.timedOut, true); assert.equal(r.verdict.state, "accepted");
  const p = await waitForVerdict({ getTx: async () => tx("PROPOSING"), sleep: async () => {}, maxPolls: 3 });
  assert.equal(p.timedOut, true); assert.equal(p.verdict.state, "pending");
});

test("transient read errors are tolerated, persistent ones surface", async () => {
  let n = 0;
  const ok = await waitForVerdict({ getTx: async () => { if (++n <= 2) throw new Error("rate limit"); return tx("FINALIZED", "FINISHED_WITH_RETURN"); }, sleep: async () => {} });
  assert.equal(ok.verdict.state, "success");
  await assert.rejects(waitForVerdict({ getTx: async () => { throw new Error("RPC down"); }, sleep: async () => {}, maxReadErrors: 3 }), /RPC down/);
});
