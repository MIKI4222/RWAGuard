// Pure contract-facing logic (no browser / SDK imports). Targets the EXACT interfaces of:
//   EmergencyCircuitBreaker  (contract.py in MIKI4222/genlayer-emergency-circuit-breaker)
//   WeatherGatedRWACustody   (contract.py in MIKI4222/genlayer-weather-gated-rwa-custody)
export type Reader = (address: string, fn: string, args?: any[]) => Promise<any>;
export type Writer = (address: string, fn: string, args: any[], value?: bigint) => Promise<any>;
export type Provenance = "ON-CHAIN" | "LIVE EXTERNAL" | "LOCAL" | "DOCUMENTED" | "UNAVAILABLE";
export type Tone = "ok" | "warn" | "crit" | "info" | "muted";

export const parse = (v: any) => { if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } } return v; };
const isHttp = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());

// ================= Emergency Circuit Breaker =================
export type Breaker = { status: string; monitoredUrl: string; lastVerdict: string; incidents: number; lastCheck: number; guardedActions: number };
export async function getBreaker(read: Reader, a: string): Promise<Breaker> {
  const [status, url, verdict, inc, ts, ga] = await Promise.all([
    read(a, "get_status"), read(a, "get_monitored_url"), read(a, "get_last_verdict"),
    read(a, "get_incident_count"), read(a, "get_last_check_timestamp"), read(a, "get_guarded_action_count"),
  ]);
  return { status: String(status), monitoredUrl: String(url), lastVerdict: String(verdict), incidents: Number(inc), lastCheck: Number(ts), guardedActions: Number(ga) };
}
// get_status() returns "ACTIVE" | "PAUSED"; last verdict is "not_checked" | "operational" | "degraded".
export function breakerState(b: Breaker | null): { label: string; tone: Tone; note: string } {
  if (!b) return { label: "Unknown", tone: "muted", note: "State could not be read." };
  if (b.status === "PAUSED") return { label: "Paused", tone: "crit", note: "Guarded actions are blocked. Recovery needs a fresh operational health check, then the owner's emergency_unpause." };
  if (b.status !== "ACTIVE") return { label: "Unknown", tone: "muted", note: `Unrecognized status “${b.status}”.` };
  if (b.lastVerdict === "not_checked") return { label: "Active (never checked)", tone: "warn", note: "No health check has been recorded yet." };
  if (b.lastVerdict === "degraded") return { label: "Active (degraded verdict)", tone: "warn", note: "The last check was degraded but the incident threshold has not paused the breaker." };
  return { label: "Active", tone: "ok", note: "Last consensus check was operational." };
}
export const healthCheck = (write: Writer, a: string) => write(a, "health_check", [], 0n);
export function executeGuardedAction(write: Writer, a: string, data: string) {
  if (!data.trim()) throw new Error("Action data cannot be empty");
  return write(a, "execute_guarded_action", [data.trim()], 0n);
}
export async function emergencyUnpause(read: Reader, write: Writer, a: string) {
  const b = await getBreaker(read, a);
  if (b.status !== "PAUSED") throw new Error("The breaker is not paused");
  if (b.lastVerdict !== "operational") throw new Error("A fresh operational health check is required before unpausing");
  return write(a, "emergency_unpause", [], 0n);
}
export function setMonitoredUrl(write: Writer, a: string, url: string) {
  if (!isHttp(url)) throw new Error("URL must start with http:// or https://");
  return write(a, "set_monitored_url", [url.trim()], 0n);
}

// ================= Weather-Gated RWA Custody =================
export type Custody = { status: string; cycleId: number; label: string; weatherUrl: string; period: number; decision: string; risk: string; reason: string; source: string; deadline: number; challenges: number; assessments: number; completed: number; canFinalize: boolean; canClaim: boolean };
export async function getCustody(read: Reader, a: string): Promise<Custody> {
  const [status, cycle, label, url, period, decision, risk, reason, source, deadline, challenges, assessments, completed, canFinalize, canClaim] = await Promise.all([
    read(a, "get_status"), read(a, "get_cycle_id"), read(a, "get_cycle_label"), read(a, "get_weather_url"), read(a, "get_challenge_period"),
    read(a, "get_decision"), read(a, "get_risk"), read(a, "get_reason"), read(a, "get_source_used"), read(a, "get_challenge_deadline"),
    read(a, "get_challenge_count"), read(a, "get_assessment_count"), read(a, "get_completed_cycles"), read(a, "can_finalize"), read(a, "can_claim_custody"),
  ]);
  return { status: String(status), cycleId: Number(cycle), label: String(label), weatherUrl: String(url), period: Number(period), decision: String(decision), risk: String(risk), reason: String(reason), source: String(source), deadline: Number(deadline), challenges: Number(challenges), assessments: Number(assessments), completed: Number(completed), canFinalize: Boolean(canFinalize), canClaim: Boolean(canClaim) };
}
export function custodyState(c: Custody | null, nowSec: number): { label: string; tone: Tone; note: string } {
  if (!c) return { label: "Unknown", tone: "muted", note: "State could not be read." };
  switch (c.status) {
    case "NO_CYCLE": return { label: "No cycle", tone: "muted", note: "The owner starts a custody cycle with start_cycle." };
    case "SOURCE_CHANGED": return { label: "Source changed", tone: "muted", note: "Weather source updated; the owner can start a new cycle." };
    case "OPEN": return { label: "Cycle open", tone: "info", note: "Run propose_release: validators fetch and assess the configured weather URL." };
    case "REOPENED": return { label: "Reopened", tone: "info", note: "The challenged proposal was cleared; a fresh assessment is required." };
    case "CHALLENGE_PERIOD": {
      const left = Math.max(0, c.deadline - nowSec);
      return c.canFinalize ? { label: "Challenge window ended", tone: "warn", note: "No challenge was recorded; anyone can finalize." }
        : { label: "Challenge period", tone: "warn", note: `SAFE proposal. Anyone can challenge for ${left}s more (by the browser clock).` };
    }
    case "CHALLENGED": return { label: "Challenged", tone: "crit", note: "Finalization is blocked until the owner reopens the proposal." };
    case "UNSAFE": return { label: "Unsafe", tone: "crit", note: "Validators judged the weather UNSAFE; the owner can close this cycle." };
    case "CLOSED_UNSAFE": return { label: "Closed (unsafe)", tone: "muted", note: "The owner can start a new cycle." };
    case "RELEASED": return { label: "Released", tone: "ok", note: "The configured custodian can claim custody once." };
    case "CLAIMED": return { label: "Claimed", tone: "ok", note: "Custody was claimed; the owner can start the next cycle." };
    default: return { label: c.status || "Unknown", tone: "muted", note: "" };
  }
}
export const CYCLE_STEPS = ["Open", "Assessment & challenge", "Released", "Claimed"];
export function cycleStepIndex(status: string): number {
  if (status === "OPEN" || status === "REOPENED") return 0;
  if (["CHALLENGE_PERIOD", "CHALLENGED", "UNSAFE", "CLOSED_UNSAFE"].includes(status)) return 1;
  if (status === "RELEASED") return 2;
  if (status === "CLAIMED") return 3;
  return -1;
}
const need = (v: string, what: string) => { if (!v.trim()) throw new Error(`${what} cannot be empty`); return v.trim(); };
export const startCycle = (write: Writer, a: string, label: string) => write(a, "start_cycle", [need(label, "Cycle label")], 0n);
export const proposeRelease = (write: Writer, a: string) => write(a, "propose_release", [], 0n);
export function challengeRelease(write: Writer, a: string, evidence: string) {
  if (!isHttp(evidence)) throw new Error("Evidence must be an http(s) URL");
  return write(a, "challenge_release", [evidence.trim()], 0n);
}
export async function finalizeRelease(read: Reader, write: Writer, a: string) {
  if (!(await read(a, "can_finalize"))) throw new Error("Not finalizable: needs an unchallenged SAFE proposal whose challenge period has ended");
  return write(a, "finalize_release", [], 0n);
}
export async function claimCustody(read: Reader, write: Writer, a: string, label: string) {
  const l = need(label, "Claim label");
  if (!(await read(a, "can_claim_custody"))) throw new Error("Nothing to claim: custody must be released and unclaimed");
  return write(a, "claim_rwa_custody", [l], 0n);
}
export const reopenChallengedProposal = (write: Writer, a: string) => write(a, "reopen_challenged_proposal", [], 0n);
export const closeUnsafeCycle = (write: Writer, a: string) => write(a, "close_unsafe_cycle", [], 0n);
export function setWeatherUrl(write: Writer, a: string, url: string) {
  if (!isHttp(url)) throw new Error("Weather URL must start with http:// or https://");
  return write(a, "set_weather_url", [url.trim()], 0n);
}
export function setChallengePeriod(write: Writer, a: string, seconds: string) {
  const n = Number(seconds);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Period must be a positive number of seconds");
  return write(a, "set_challenge_period", [n], 0n);
}
