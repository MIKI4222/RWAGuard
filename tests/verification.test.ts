import test from "node:test";
import assert from "node:assert/strict";
import { MockChain, BREAKER as B, CUSTODY as C } from "./mock-chain.ts";
import * as api from "../src/lib/api.ts";
import { runOp, renderEvidence, diffState, type EvidenceDeps } from "../src/lib/evidence-runner.ts";
import type { TxVerdict } from "../src/lib/txverify.ts";

const OWNER = "0xOwner", ALICE = "0xAlice";
const mk = () => { const c = new MockChain(); c.owner = OWNER.toLowerCase(); c.custodian = OWNER.toLowerCase(); return c; };
const ok: TxVerdict = { state: "success", status: "FINALIZED", execution: "FINISHED_WITH_RETURN", detail: "" };
const HASH = "0x" + "ab".repeat(32);      // test scaffolding only; real runs use the hash returned by the network

// Adapts the in-memory contract model to the evidence runner's write dependency.
const deps = (c: MockChain, sender: string, finalized = true): EvidenceDeps => {
  const r = c.as(sender);
  return { read: r.read, breaker: B, custody: C, write: async (a, fn, args, v) => { await r.write(a, fn, args, v); return { hash: HASH, verdict: finalized ? ok : { ...ok, state: "accepted", status: "ACCEPTED" }, finalized }; } };
};

test("state expectations confirm the promised change and flag a missing one", async () => {
  const c = mk(), r = c.as(ALICE), owner = c.as(OWNER);
  const b0 = await api.getBreaker(r.read, B);
  await api.healthCheck(r.write, B);
  const b1 = await api.getBreaker(r.read, B);
  assert.equal(api.expectState.healthCheck(b0, b1), null);
  assert.match(api.expectState.healthCheck(b1, b1)!, /did not advance/);                       // stale read / no change is reported
  c.now += 60; await api.healthCheck(r.write, B);
  assert.equal(api.expectState.healthCheck(b1, await api.getBreaker(r.read, B)), null);
  await api.executeGuardedAction(r.write, B, "x");
  assert.equal(api.expectState.executeGuardedAction(b1, await api.getBreaker(r.read, B)), null);
  assert.match(api.expectState.executeGuardedAction(b1, b1)!, /expected \+1/);

  const k0 = await api.getCustody(r.read, C);
  await api.startCycle(owner.write, C, "lot-1");
  const k1 = await api.getCustody(r.read, C);
  assert.equal(api.expectState.startCycle(k0, k1, "lot-1"), null);
  assert.match(api.expectState.startCycle(k0, k1, "other")!, /label/);
  await api.proposeRelease(r.write, C);
  const k2 = await api.getCustody(r.read, C);
  assert.equal(api.expectState.proposeRelease(k1, k2), null);
  assert.match(api.expectState.proposeRelease(k2, k2)!, /expected \+1/);
  await api.challengeRelease(r.write, C, "https://example.com/e");
  assert.equal(api.expectState.challengeRelease(k2, await api.getCustody(r.read, C)), null);
  assert.match(api.expectState.setChallengePeriod(k2, { ...k2, period: 30 }, "300")!, /expected 300s/);
  assert.equal(api.expectState.setWeatherUrl(k2, { ...k2, weatherUrl: "https://a.b/c" }, " https://a.b/c "), null);
});

test("full custody cycle verified step by step with the evidence runner", async () => {
  const c = mk(), d = deps(c, OWNER);
  const steps = [await runOp(d, "custody:start_cycle", "lot-7"), await runOp(d, "custody:propose_release"), await runOp(d, "custody:challenge", "https://example.com/e")];
  for (const s of steps) { assert.equal(s.error, undefined); assert.equal(s.check, null); assert.equal(s.hash, HASH); assert.equal(s.execution, "FINISHED_WITH_RETURN"); assert.equal(s.finalized, true); }
  assert.deepEqual(diffState(steps[1].before, steps[1].after).filter((x) => x.startsWith("assessments")), ["assessments: 0 → 1"]);
  await api.reopenChallengedProposal(c.as(OWNER).write, C);
  await runOp(d, "custody:propose_release");
  c.now += 301;
  const fin = await runOp(d, "custody:finalize");
  assert.equal(fin.check, null); assert.equal((fin.after as any).status, "RELEASED");
  const claim = await runOp(d, "custody:claim", "dock-1");
  assert.equal(claim.check, null); assert.equal((claim.after as any).status, "CLAIMED");
});

test("circuit breaker workflow: degraded check pauses, recovery needs a fresh operational check", async () => {
  const c = mk(), d = deps(c, OWNER);
  const h1 = await runOp(d, "breaker:health_check");
  assert.equal(h1.check, null); assert.equal((h1.after as any).lastVerdict, "operational");
  await api.setMonitoredUrl(c.as(OWNER).write, B, "https://httpbin.org/status/503");
  c.endpointDegraded["https://httpbin.org/status/503"] = true; c.now += 60;
  const h2 = await runOp(d, "breaker:health_check");
  assert.equal(h2.check, null); assert.equal((h2.after as any).status, "PAUSED"); assert.equal((h2.after as any).incidents, 1);
  const blocked = await runOp(d, "breaker:guarded_action");
  assert.match(blocked.error!, /circuit breaker is active/); assert.equal(blocked.check, "operation did not succeed");
  const early = await runOp(d, "breaker:unpause");
  assert.match(early.error!, /fresh operational/);
  await api.setMonitoredUrl(c.as(OWNER).write, B, "https://www.githubstatus.com/api/v2/status.json"); c.now += 60;
  assert.equal((await runOp(d, "breaker:health_check")).check, null);
  const un = await runOp(d, "breaker:unpause");
  assert.equal(un.check, null); assert.equal((un.after as any).status, "ACTIVE");
});

test("an accepted-but-not-final transaction is never reported as verified", async () => {
  const c = mk(), d = deps(c, OWNER, false);
  const s = await runOp(d, "breaker:health_check");
  assert.equal(s.finalized, false); assert.match(s.check!, /not final/);
});

test("evidence report contains real values from the run and flags failures", async () => {
  const c = mk(), d = deps(c, OWNER);
  const good = await runOp(d, "breaker:health_check");
  const bad = await runOp(d, "custody:finalize");                                               // nothing to finalize → refused before sending
  const md = renderEvidence([good, bad], { breaker: await api.getBreaker(d.read, B), custody: await api.getCustody(d.read, C) }, { network: "GenLayer Bradbury Testnet", account: "0xAcc", startedAt: "2026-01-01T00:00:00Z", explorer: "https://explorer-bradbury.genlayer.com", breaker: B, custody: C });
  assert.match(md, new RegExp(HASH)); assert.match(md, /FINALIZED/); assert.match(md, /FINISHED_WITH_RETURN/);
  assert.match(md, /\*\*1 of 2\*\*/); assert.match(md, /Not finalizable/); assert.match(md, /✓ state change confirmed/); assert.match(md, /✗ operation did not succeed/);
  assert.match(md, /address\/0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000/);
});
