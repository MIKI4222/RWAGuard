import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MockChain, BREAKER as B, CUSTODY as C } from "./mock-chain.ts";
import { BREAKER_SIG, CUSTODY_SIG } from "./signatures.ts";
import * as api from "../src/lib/api.ts";
import * as wx from "../src/lib/weather.ts";
import { txUrl, contractUrl, TX_URL_FORMAT_VERIFIED } from "../src/lib/explorer.ts";
import { CUSTODY_EVIDENCE } from "../src/lib/evidence.ts";

wx.weatherNet.sleep = async () => {}; // no real waiting in tests
const OWNER = "0xOwner", ALICE = "0xAlice", BOB = "0xBob";
const mk = () => { const c = new MockChain(); c.owner = OWNER.toLowerCase(); c.custodian = OWNER.toLowerCase(); return c; };

test("Workflow 1 — Circuit Breaker: check, pause, block, recover", async () => {
  const c = mk(), owner = c.as(OWNER), alice = c.as(ALICE);
  let b = await api.getBreaker(alice.read, B);
  assert.equal(api.breakerState(b).label, "Active (never checked)");
  assert.equal(b.lastVerdict, "not_checked");

  assert.equal(await api.healthCheck(alice.write, B), false);                    // healthy endpoint
  b = await api.getBreaker(alice.read, B);
  assert.equal(api.breakerState(b).tone, "ok"); assert.equal(b.lastCheck, c.now);
  await api.executeGuardedAction(alice.write, B, "normal-operation");
  assert.equal((await api.getBreaker(alice.read, B)).guardedActions, 1);

  await assert.rejects(async () => api.setMonitoredUrl(owner.write, B, "ftp://nope"), /http/);
  await api.setMonitoredUrl(owner.write, B, "https://httpbin.org/status/503");
  c.endpointDegraded["https://httpbin.org/status/503"] = true;
  assert.equal(await api.healthCheck(alice.write, B), true);                     // degraded -> paused
  b = await api.getBreaker(alice.read, B);
  assert.equal(b.status, "PAUSED"); assert.equal(b.incidents, 1); assert.equal(api.breakerState(b).tone, "crit");
  await assert.rejects(api.executeGuardedAction(alice.write, B, "blocked"), /circuit breaker is active/);
  await assert.rejects(api.emergencyUnpause(owner.read, owner.write, B), /fresh operational/); // blocked before any tx
  assert.equal(c.calls.filter((x) => x.fn === "emergency_unpause").length, 0);

  await api.setMonitoredUrl(owner.write, B, "https://www.githubstatus.com/api/v2/status.json");
  await api.healthCheck(alice.write, B);                                         // operational, still paused
  assert.equal((await api.getBreaker(alice.read, B)).status, "PAUSED");
  await assert.rejects(api.emergencyUnpause(alice.read, alice.write, B), /only owner/);
  await api.emergencyUnpause(owner.read, owner.write, B);
  assert.equal((await api.getBreaker(alice.read, B)).status, "ACTIVE");
  await assert.rejects(api.emergencyUnpause(owner.read, owner.write, B), /not paused/);
  assert.throws(() => api.executeGuardedAction(alice.write, B, "  "), /empty/);
});

test("Workflow 2 — Weather custody: cycle, challenge, reopen, finalize, claim, reuse", async () => {
  const c = mk(), owner = c.as(OWNER), alice = c.as(ALICE);
  let s = await api.getCustody(alice.read, C);
  assert.equal(s.status, "NO_CYCLE"); assert.equal(api.custodyState(s, c.now).label, "No cycle");
  await assert.rejects(api.proposeRelease(alice.write, C), /start a cycle first/);
  await api.setChallengePeriod(owner.write, C, "300");
  await assert.rejects(api.startCycle(alice.write, C, "shipment-1"), /only owner/);
  await api.startCycle(owner.write, C, "shipment-1");
  await api.proposeRelease(alice.write, C);
  s = await api.getCustody(alice.read, C);
  assert.equal(s.status, "CHALLENGE_PERIOD"); assert.equal(s.decision, "SAFE"); assert.equal(s.risk, "LOW"); assert.equal(s.deadline, c.now + 300);
  assert.match(api.custodyState(s, c.now).note, /300s/);
  await assert.rejects(api.finalizeRelease(alice.read, alice.write, C), /Not finalizable/);   // blocked before any tx

  assert.throws(() => api.challengeRelease(alice.write, C, "nope"), /http/);
  await api.challengeRelease(alice.write, C, "https://example.com/evidence");
  s = await api.getCustody(alice.read, C);
  assert.equal(s.status, "CHALLENGED"); assert.equal(s.challenges, 1); assert.equal(api.custodyState(s, c.now).tone, "crit");
  await assert.rejects(api.reopenChallengedProposal(alice.write, C), /only owner/);
  await api.reopenChallengedProposal(owner.write, C);
  assert.equal((await api.getCustody(alice.read, C)).status, "REOPENED");
  await api.proposeRelease(alice.write, C);                                                    // fresh assessment
  c.now += 301;
  s = await api.getCustody(alice.read, C);
  assert.equal(s.canFinalize, true); assert.equal(s.assessments, 2);
  await api.finalizeRelease(alice.read, alice.write, C);
  assert.equal((await api.getCustody(alice.read, C)).status, "RELEASED");
  await assert.rejects(api.claimCustody(alice.read, alice.write, C, "dock-1"), /only custodian/);
  await assert.rejects(api.claimCustody(owner.read, owner.write, C, " "), /empty/);
  await api.claimCustody(owner.read, owner.write, C, "warehouse-01");
  s = await api.getCustody(alice.read, C);
  assert.equal(s.status, "CLAIMED"); assert.equal(s.completed, 1);
  await assert.rejects(api.claimCustody(owner.read, owner.write, C, "again"), /Nothing to claim/);

  await api.startCycle(owner.write, C, "shipment-2");                                          // same deployment, new cycle
  assert.equal((await api.getCustody(alice.read, C)).cycleId, 2);
  c.assess = () => ({ decision: "UNSAFE", risk: "HIGH", reason: "Wind 80 km/h." });           // unsafe path
  await api.proposeRelease(alice.write, C);
  assert.equal(api.custodyState(await api.getCustody(alice.read, C), c.now).tone, "crit");
  await api.closeUnsafeCycle(owner.write, C);
  assert.equal((await api.getCustody(alice.read, C)).status, "CLOSED_UNSAFE");
  assert.deepEqual([api.cycleStepIndex("OPEN"), api.cycleStepIndex("CHALLENGED"), api.cycleStepIndex("RELEASED"), api.cycleStepIndex("CLAIMED"), api.cycleStepIndex("NO_CYCLE")], [0, 1, 2, 3, -1]);
});

test("Weather helpers: URL matches the contract's default, policy bounds, validation", () => {
  // DEFAULT_WEATHER_URL copied from the custody contract source
  const contractDefault = "https://api.open-meteo.com/v1/forecast?latitude=50.4501&longitude=30.5234&current=temperature_2m,wind_speed_10m,precipitation&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=UTC";
  assert.equal(wx.buildOpenMeteoUrl(50.4501, 30.5234), contractDefault);
  assert.deepEqual(wx.coordsFromUrl(contractDefault), { lat: 50.4501, lon: 30.5234 });
  assert.throws(() => wx.buildOpenMeteoUrl(91, 0), /Latitude/); assert.throws(() => wx.buildOpenMeteoUrl(0, 181), /Longitude/);
  const ev = (t: number, w: number, p: number) => wx.evaluatePolicy({ time: "", temperature: t, wind: w, precipitation: p });
  assert.equal(ev(20, 10, 0).safe, true);
  assert.equal(ev(-10, 60, 10).safe, true);                                                    // inclusive bounds
  assert.equal(ev(-10.1, 10, 0).safe, false); assert.equal(ev(35.1, 10, 0).safe, false);
  assert.equal(ev(20, 60.1, 0).safe, false); assert.equal(ev(20, 10, 10.1).safe, false);
  assert.deepEqual(wx.parseCurrentWeather({ current: { time: "t", temperature_2m: 1, wind_speed_10m: 2, precipitation: 0 } }), { time: "t", temperature: 1, wind: 2, precipitation: 0 });
  assert.throws(() => wx.parseCurrentWeather({ current: { temperature_2m: 1 } }), /missing wind_speed_10m/);
  assert.throws(() => wx.parseCurrentWeather({}), /no current/);
  assert.deepEqual(wx.parseGeocoding({}), []);
  assert.equal(wx.parseGeocoding({ results: [{ name: "Kyiv", latitude: 50.45, longitude: 30.52, country: "Ukraine", admin1: "Kyiv City" }, { name: "bad" }] }).length, 1);
});

test("Weather fetching handles rate limits, HTTP errors and malformed data", async () => {
  const res = (status: number, body: any) => (async () => ({ status, ok: status < 400, json: async () => body })) as unknown as typeof fetch;
  await assert.rejects(wx.fetchCurrent("https://x", res(429, {})), /Rate limited/);
  await assert.rejects(wx.fetchCurrent("https://x", res(500, {})), /HTTP 500/);
  await assert.rejects(wx.fetchCurrent("https://x", res(200, { current: { temperature_2m: 1 } })), /missing/);
  const ok = await wx.fetchCurrent("https://x", res(200, { current: { time: "t", temperature_2m: 5, wind_speed_10m: 6, precipitation: 0.1 } }));
  assert.equal(ok.weather.wind, 6);
  await assert.rejects(wx.geocode("a", res(200, {})), /at least 2/);
  assert.equal((await wx.geocode("Kyiv", res(200, { results: [{ name: "Kyiv", latitude: 1, longitude: 2 }] })))[0].name, "Kyiv");
  const hourly = await wx.fetchHourly(1, 2, res(200, { hourly: { time: ["a", "b"], temperature_2m: [1, null], wind_speed_10m: [2, 3], precipitation: [0, 0] } }));
  assert.equal(hourly.length, 1);
});

test("Weather requests retry transient provider errors, cache successes and never retry real errors", async () => {
  const body = { current: { time: "t", temperature_2m: 5, wind_speed_10m: 6, precipitation: 0 } };
  let n = 0; const delays: number[] = []; const saved = wx.weatherNet.sleep;
  wx.weatherNet.sleep = async (ms) => { delays.push(ms); };
  const flaky = (async () => { n++; return n <= 2 ? { status: 503, ok: false, json: async () => ({}) } : { status: 200, ok: true, json: async () => body }; }) as unknown as typeof fetch;
  const ok = await wx.fetchCurrent("https://x/a", flaky);
  assert.equal(ok.weather.temperature, 5); assert.equal(n, 3); assert.deepEqual(delays, [800, 1600]);   // two 503s, then success
  await wx.fetchCurrent("https://x/a", flaky); assert.equal(n, 3);                                       // served from cache
  let m = 0;
  const down = (async () => { m++; return { status: 503, ok: false, json: async () => ({}) }; }) as unknown as typeof fetch;
  await assert.rejects(wx.fetchCurrent("https://x/b", down), /HTTP 503 \(provider temporarily unavailable\)/);
  assert.equal(m, 3);                                                                                    // 1 try + 2 retries, then it surfaces
  let k = 0;
  const notFound = (async () => { k++; return { status: 404, ok: false, json: async () => ({}) }; }) as unknown as typeof fetch;
  await assert.rejects(wx.fetchCurrent("https://x/c", notFound), /HTTP 404/); assert.equal(k, 1);       // not transient: no retry
  await assert.rejects(wx.fetchCurrent("https://x/b", down), /HTTP 503/);                                // failures are not cached
  let c = 0;
  const slow = (async () => { c++; await new Promise((r) => setTimeout(r, 5)); return { status: 200, ok: true, json: async () => body }; }) as unknown as typeof fetch;
  await Promise.all([wx.fetchCurrent("https://x/d", slow), wx.fetchCurrent("https://x/d", slow)]); assert.equal(c, 1); // shared in-flight
  wx.weatherNet.sleep = saved;
});

test("Explorer links never guess a transaction URL format; documented evidence is intact", () => {
  assert.equal(TX_URL_FORMAT_VERIFIED, false);
  assert.equal(txUrl("0xabc", C), contractUrl(C));
  assert.equal(contractUrl(C), "https://explorer-bradbury.genlayer.com/address/0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a");
  assert.equal(CUSTODY_EVIDENCE.length, 7);
  for (const e of CUSTODY_EVIDENCE) assert.match(e.hash, /^0x[0-9a-f]{64}$/);
});

test("the mock enforces real signatures", async () => {
  const c = mk(), r = c.as(ALICE);
  await assert.rejects(r.write(C, "start_cycle", []), /expects 1/);
  await assert.rejects(r.write(B, "health_check", [], 1n), /not payable/);
  await assert.rejects(r.read(C, "get_positions", []), /does not exist/);                     // a method the prompt imagined
  await assert.rejects(r.read(B, "get_emergency_status", []), /does not exist/);              // ditto
  await assert.rejects(r.read(B, "health_check", []), /write method, called as view/);
});

test("read errors surface instead of becoming empty or healthy-looking data", async () => {
  const broken: api.Reader = async () => { throw new Error("RPC unavailable"); };
  await assert.rejects(api.getBreaker(broken, B), /RPC unavailable/);
  await assert.rejects(api.getCustody(broken, C), /RPC unavailable/);
  assert.equal(api.breakerState(null).label, "Unknown"); assert.equal(api.custodyState(null, 0).label, "Unknown");
});

test("every contract method called from src/ exists in the signatures (and vice versa)", () => {
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); });
  walk("src");
  const known = new Set([...Object.keys(BREAKER_SIG), ...Object.keys(CUSTODY_SIG)]);
  const used = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/(?:read|write)\(\s*a\s*,\s*"([a-z_]+)"/g)) used.add(m[1]);
  for (const fn of used) assert.ok(known.has(fn), `${fn} is not a method of the deployed contracts`);
  const unused = [...known].filter((k) => !used.has(k));
  assert.deepEqual(unused.sort(), ["set_custodian", "transfer_ownership"], `unexpected unused methods: ${unused}`); // deliberately not exposed
});
