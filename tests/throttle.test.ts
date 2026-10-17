import test from "node:test";
import assert from "node:assert/strict";
import { createReader, isRateLimit } from "../src/lib/throttle.ts";

const wait = (ms = 1) => new Promise((r) => setTimeout(r, ms));
const noSleep = async () => {};

test("concurrency never exceeds the limit and every read resolves", async () => {
  let active = 0, peak = 0;
  const r = createReader(async (_a, fn) => { active++; peak = Math.max(peak, active); await wait(3); active--; return fn; }, { maxConcurrent: 3 });
  const out = await Promise.all(Array.from({ length: 25 }, (_, i) => r.read("0xA", `get_${i}`)));
  assert.equal(out.length, 25); assert.ok(peak <= 3, `peak concurrency was ${peak}`);
});

test("identical in-flight reads are de-duplicated (React StrictMode / shared components)", async () => {
  let calls = 0;
  const r = createReader(async () => { calls++; await wait(3); return "v"; });
  const res = await Promise.all([r.read("0xA", "get_status"), r.read("0xa", "get_status"), r.read("0xA", "get_status")]);
  assert.deepEqual(res, ["v", "v", "v"]); assert.equal(calls, 1);
});

test("short cache, explicit clear and expiry", async () => {
  let calls = 0, t = 1000;
  const r = createReader(async () => ++calls, { ttlMs: 5000, now: () => t });
  assert.equal(await r.read("0xA", "x"), 1);
  assert.equal(await r.read("0xA", "x"), 1);          // cached
  r.clear();                                           // after a write the app clears the cache
  assert.equal(await r.read("0xA", "x"), 2);
  t += 5001;
  assert.equal(await r.read("0xA", "x"), 3);          // expired
  assert.equal(await r.read("0xA", "y", [1]), 4);     // different key
});

test("rate-limit errors are retried with growing backoff, other errors are not", async () => {
  const delays: number[] = []; let n = 0;
  const limited = createReader(async () => { if (++n <= 2) throw new Error("Request exceeds defined limit. Details: rate limit exceeded for method: gen_call"); return "ok"; }, { sleep: async (ms) => { delays.push(ms); }, baseDelayMs: 100 });
  assert.equal(await limited.read("0xA", "get_status"), "ok");
  assert.equal(n, 3); assert.deepEqual(delays, [100, 200]);

  let m = 0;
  const bad = createReader(async () => { m++; throw new Error("execution reverted"); }, { sleep: noSleep });
  await assert.rejects(bad.read("0xA", "get_status"), /reverted/); assert.equal(m, 1);

  let k = 0;
  const always = createReader(async () => { k++; throw new Error("429 Too Many Requests"); }, { retries: 2, sleep: noSleep });
  await assert.rejects(always.read("0xA", "get_status"), /429/); assert.equal(k, 3);       // 1 try + 2 retries, then it surfaces
  assert.equal(isRateLimit(new Error("rate limit exceeded")), true); assert.equal(isRateLimit(new Error("boom")), false);
});

test("failed reads are not cached", async () => {
  let n = 0;
  const r = createReader(async () => { if (++n === 1) throw new Error("boom"); return "ok"; }, { sleep: noSleep });
  await assert.rejects(r.read("0xA", "x"), /boom/);
  assert.equal(await r.read("0xA", "x"), "ok");
});
