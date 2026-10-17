import { BREAKER_SIG, CUSTODY_SIG, Sig } from "./signatures.ts";
export const BREAKER = "0xD934fA3E6EB893f56dd1d53DBeD9fd6f66678000";
export const CUSTODY = "0x4ea1c077793ACD368EBe8Ff59d8fF21A8067a32a";
const lc = (s: string) => s.toLowerCase();
const err = (m: string) => new Error(m);

// In-memory model of both contracts. Rejects any call that does not match the real signatures
// (unknown method, wrong argument count, view/write mix-up, value on a non-payable method).
export class MockChain {
  now = 1_800_000_000; owner = "0xowner"; custodian = "0xowner";
  calls: { fn: string; args: any[]; sender: string }[] = [];
  // breaker state
  b = { paused: false, lastCheck: 0, incidents: 0, url: "https://www.githubstatus.com/api/v2/status.json", verdict: "not_checked", guarded: 0, threshold: 1 };
  endpointDegraded: Record<string, boolean> = {};
  // custody state
  c = { url: "https://api.open-meteo.com/v1/forecast?latitude=50.4501&longitude=30.5234", period: 30, cycle: 0, label: "", open: false, status: "NO_CYCLE", decision: "NONE", risk: "NONE", reason: "", active: false, challenged: false, released: false, claimed: false, deadline: 0, source: "", evidence: "", challenges: 0, assessments: 0, completed: 0 };
  assess = (_url: string) => ({ decision: "SAFE", risk: "LOW", reason: "All current fields are within policy." });

  as(sender: string) {
    return {
      read: async (a: string, fn: string, args: any[] = []) => this.call(a, fn, args, sender, 0n, "view"),
      write: async (a: string, fn: string, args: any[], value: bigint = 0n) => this.call(a, fn, args, sender, value, "write"),
    };
  }
  private call(addr: string, fn: string, args: any[], sender: string, value: bigint, mode: "view" | "write") {
    const isB = lc(addr) === lc(BREAKER), isC = lc(addr) === lc(CUSTODY);
    if (!isB && !isC) throw err(`no contract at ${addr}`);
    const sig: Sig | undefined = (isB ? BREAKER_SIG : CUSTODY_SIG)[fn];
    if (!sig) throw err(`method ${fn} does not exist on contract`);
    if ((mode === "view") !== (sig.kind === "view")) throw err(`${fn} is a ${sig.kind} method, called as ${mode}`);
    if (args.length !== sig.argc) throw err(`${fn} expects ${sig.argc} argument(s), got ${args.length}`);
    if (value > 0n) throw err(`${fn} is not payable but value ${value} was attached`);
    this.calls.push({ fn, args, sender });
    return isB ? this.breaker(fn, args, lc(sender)) : this.custody(fn, args, lc(sender));
  }
  private breaker(fn: string, a: any[], who: string): any {
    const b = this.b;
    switch (fn) {
      case "get_status": return b.paused ? "PAUSED" : "ACTIVE";
      case "get_monitored_url": return b.url; case "get_last_verdict": return b.verdict; case "get_incident_count": return b.incidents;
      case "get_last_check_timestamp": return b.lastCheck; case "get_guarded_action_count": return b.guarded;
      case "set_monitored_url": { if (who !== this.owner) throw err("only owner can change monitored URL"); if (!a[0]) throw err("monitored URL must not be empty"); b.url = a[0]; return true; }
      case "health_check": {
        const degraded = !!this.endpointDegraded[b.url]; b.lastCheck = this.now;
        if (degraded) { b.verdict = "degraded"; b.incidents += 1; if (b.incidents >= b.threshold) b.paused = true; } else b.verdict = "operational";
        return degraded;
      }
      case "execute_guarded_action": { if (b.paused) throw err("circuit breaker is active"); b.guarded += 1; return "guarded action executed: " + a[0]; }
      case "emergency_unpause": { if (who !== this.owner) throw err("only owner can unpause"); if (b.verdict !== "operational") throw err("operational health check required"); b.paused = false; return true; }
    }
  }
  private custody(fn: string, a: any[], who: string): any {
    const c = this.c; const owner = (m: string) => { if (who !== this.owner) throw err(m); };
    switch (fn) {
      case "get_status": return c.status; case "get_cycle_id": return c.cycle; case "get_cycle_label": return c.label; case "get_weather_url": return c.url;
      case "get_challenge_period": return c.period; case "get_decision": return c.decision; case "get_risk": return c.risk; case "get_reason": return c.reason;
      case "get_source_used": return c.source; case "get_challenge_deadline": return c.deadline; case "get_challenge_count": return c.challenges;
      case "get_assessment_count": return c.assessments; case "get_completed_cycles": return c.completed;
      case "can_finalize": return c.open && c.active && !c.challenged && c.decision === "SAFE" && this.now >= c.deadline;
      case "can_claim_custody": return c.released && !c.claimed;
      case "set_weather_url": { owner("only owner can change weather URL"); if (!a[0]) throw err("weather URL must not be empty"); if (c.open) throw err("cannot change URL during open cycle"); c.url = a[0]; c.status = "SOURCE_CHANGED"; return true; }
      case "set_challenge_period": { owner("only owner can change challenge period"); if (!(a[0] > 0)) throw err("period must be greater than zero"); if (c.open) throw err("cannot change period during open cycle"); c.period = a[0]; return true; }
      case "set_custodian": { owner("only owner can set custodian"); if (!a[0]) throw err("custodian must not be empty"); if (c.open) throw err("cannot change custodian during open cycle"); this.custodian = lc(a[0]); return true; }
      case "transfer_ownership": { owner("only owner can transfer ownership"); if (!a[0]) throw err("new owner must not be empty"); if (c.open) throw err("cannot transfer ownership during open cycle"); this.owner = lc(a[0]); return true; }
      case "start_cycle": {
        owner("only owner can start cycle"); if (!a[0]) throw err("cycle label must not be empty"); if (c.open) throw err("current cycle is still open");
        Object.assign(c, { cycle: c.cycle + 1, label: a[0], open: true, status: "OPEN", decision: "NONE", risk: "NONE", reason: "", active: false, challenged: false, released: false, claimed: false, deadline: 0, source: "", evidence: "" }); return true;
      }
      case "propose_release": {
        if (!c.open) throw err("start a cycle first"); if (c.active) throw err("proposal is already active"); if (c.released) throw err("cycle is already released");
        const r = this.assess(c.url); c.assessments += 1; Object.assign(c, { decision: r.decision, risk: r.risk, reason: r.reason, source: c.url, challenged: false, evidence: "" });
        if (r.decision === "SAFE") { c.active = true; c.status = "CHALLENGE_PERIOD"; c.deadline = this.now + c.period; return true; }
        c.active = false; c.status = "UNSAFE"; c.deadline = 0; return false;
      }
      case "challenge_release": {
        if (!c.active) throw err("no active proposal"); if (c.decision !== "SAFE") throw err("only SAFE proposal can be challenged"); if (c.challenged) throw err("proposal is already challenged");
        if (!a[0]) throw err("evidence URL must not be empty"); if (this.now >= c.deadline) throw err("challenge period has ended");
        c.challenged = true; c.challenges += 1; c.status = "CHALLENGED"; c.evidence = a[0]; return true;
      }
      case "reopen_challenged_proposal": { owner("only owner can reopen proposal"); if (!c.active || !c.challenged) throw err("no challenged proposal"); Object.assign(c, { active: false, challenged: false, status: "REOPENED", decision: "NONE", risk: "NONE", reason: "", deadline: 0 }); return true; }
      case "close_unsafe_cycle": { owner("only owner can close cycle"); if (!c.open || c.active) throw err("cycle cannot be closed now"); if (c.status !== "UNSAFE") throw err("only UNSAFE cycle can be closed"); c.open = false; c.status = "CLOSED_UNSAFE"; return true; }
      case "finalize_release": {
        if (!c.open) throw err("no open cycle"); if (!c.active) throw err("no active proposal"); if (c.challenged) throw err("challenged proposal cannot be finalized");
        if (c.decision !== "SAFE") throw err("only SAFE proposal can be finalized"); if (this.now < c.deadline) throw err("challenge period is still active");
        c.released = true; c.active = false; c.status = "RELEASED"; return true;
      }
      case "claim_rwa_custody": {
        if (who !== this.custodian) throw err("only custodian can claim custody"); if (!c.released) throw err("custody is not released"); if (c.claimed) throw err("custody has already been claimed"); if (!a[0]) throw err("claim label must not be empty");
        c.claimed = true; c.open = false; c.status = "CLAIMED"; c.completed += 1; return "RWA custody granted to: " + a[0];
      }
    }
  }
}
