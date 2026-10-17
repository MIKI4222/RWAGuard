import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Panel, PageHeader, ContractIdentity, StatusBadge, ErrorState, EmptyState, Skeleton, CopyButton, MetricCard, ExplorerLink } from "../components/ui";
import { useActionRunner } from "../components/actions";
import { useRead } from "../hooks";
import { useRefreshTick } from "../components/AppShell";
import { read, auditLog } from "../lib/genlayer";
import { BREAKER_ADDRESS, REPOS } from "../lib/config";
import * as api from "../lib/api";

const flow = ["Each validator fetches the monitored URL", "Response is classified: operational or degraded/unknown", "Validators must agree on the exact boolean (strict_eq)", "State updates: verdict, incidents, pause"];

export default function CircuitBreakerPage() {
  useEffect(() => { document.title = "Circuit Breaker — RWA Guard"; }, []);
  const tick = useRefreshTick();
  const breaker = useRead(() => api.getBreaker(read, BREAKER_ADDRESS), [tick], 30000);
  const act = useActionRunner("Circuit Breaker", BREAKER_ADDRESS, () => { void breaker.reload(); });
  const b = breaker.data;
  const st = api.breakerState(b);
  const known = !!b;
  const [url, setUrl] = useState("");
  const [data, setData] = useState("");
  const dis = (cond: boolean, why = "Not available in the current contract state") => ({ disabled: !known || act.busy || !!act.blocked || cond, title: !known ? "Contract state unknown" : act.blocked || (cond ? why : "") });
  const local = auditLog().filter((e) => e.contract === "Circuit Breaker");
  const when = b && b.lastCheck > 0 ? new Date(b.lastCheck * 1000).toLocaleString() : "never";

  return (
    <>
      {act.dialog}
      <PageHeader title="Emergency Circuit Breaker" subtitle="Validators fetch a monitored status endpoint and agree on one boolean: operational or degraded/unknown. A degraded result pauses guarded actions; recovery needs a fresh operational check and the owner's unpause." />
      <ContractIdentity name="EmergencyCircuitBreaker" address={BREAKER_ADDRESS} repo={REPOS.breaker} />
      {breaker.error && <ErrorState partial={breaker.data !== null} message={breaker.error} onRetry={breaker.reload} />}

      <Panel title="Protection state" source={known ? "ON-CHAIN" : "UNAVAILABLE"}>
        {breaker.loading && !b ? <Skeleton className="h-28 w-full" /> : (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className={`rounded-xl border p-5 ${st.tone === "crit" ? "border-crit/50 bg-crit/5" : st.tone === "ok" ? "border-ok/40 bg-ok/5" : "border-slate-500/30"}`}>
              <div className="text-xs uppercase tracking-wide text-fg-mute">Current state</div>
              <div className="mt-2 flex items-center gap-3"><StatusBadge tone={st.tone} pulse={st.tone === "warn" || st.tone === "info"}>{st.label}</StatusBadge></div>
              <p className="mt-3 text-sm text-fg-mute">{st.note}</p>
              <p className="mt-3 text-[11px] text-fg-mute">Mapping: get_status() returns ACTIVE or PAUSED; the last verdict (not_checked / operational / degraded) refines the label.</p>
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {([["Raw status", b?.status ?? "—"], ["Last verdict", b?.lastVerdict ?? "—"], ["Incident count", String(b?.incidents ?? "—")], ["Last check", when], ["Guarded actions executed", String(b?.guardedActions ?? "—")], ["Monitored URL", b?.monitoredUrl ?? "—"]] as [string, string][]).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-fg-mute">{k}</dt><dd className="break-all font-mono text-xs">{v}</dd></div>)}
            </dl>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Incidents" value={b?.incidents ?? "—"} source="ON-CHAIN" loading={breaker.loading && !b} tone={b && b.incidents > 0 ? "warn" : "muted"} />
        <MetricCard label="Last verdict" value={b?.lastVerdict ?? "—"} source="ON-CHAIN" loading={breaker.loading && !b} tone={b?.lastVerdict === "degraded" ? "crit" : b?.lastVerdict === "operational" ? "ok" : "muted"} />
        <MetricCard label="Guarded actions" value={b?.guardedActions ?? "—"} source="ON-CHAIN" loading={breaker.loading && !b} />
      </div>

      <Panel title="How an evaluation works">
        <ol className="grid gap-2 md:grid-cols-4">{flow.map((s, i) => <li key={s} className="flex items-start gap-2 rounded-lg border border-slate-500/20 p-3 text-xs"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-700 text-[11px] text-cyan-brand">{i + 1}</span><span>{s}</span>{i < 3 && <ArrowRight size={12} className="ml-auto hidden shrink-0 text-fg-mute md:block" />}</li>)}</ol>
        <p className="mt-3 text-xs text-fg-mute">This contract does not use an LLM and returns no written explanation: the classifier is deterministic JSON parsing of common status-API formats, and unknown responses fail closed. The only verified outputs are the boolean result and the state it changes.</p>
      </Panel>

      <Panel title="Operations">
        <p className="mb-3 text-xs text-fg-mute">Owner-only calls revert for other wallets (the contract has no owner getter, so the app cannot pre-check your role). {act.connected ? "" : "Connect a wallet to submit."}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-slate-500/20 p-3"><div><div className="text-sm font-semibold">Check health &amp; emergency events (anyone)</div><p className="text-xs text-fg-mute">Runs a consensus check of the monitored URL. A degraded or unknown result pauses the breaker.</p></div>
            <button className="btn" {...dis(false)} onClick={() => act.ask({ op: "health_check", title: "Run a health check?", body: <p>Validators will fetch <span className="break-all font-mono text-xs">{b?.monitoredUrl}</span>. If the result is degraded or unknown, guarded actions will be paused.</p>, exec: (w) => api.healthCheck(w, BREAKER_ADDRESS) })}>health_check</button></div>
          <div className="space-y-2 rounded-lg border border-slate-500/20 p-3"><div><div className="text-sm font-semibold">Execute guarded action (anyone)</div><p className="text-xs text-fg-mute">Example protected operation. Rejected by the contract while paused.</p></div>
            <div className="flex flex-wrap gap-2"><input className="inp max-w-[14rem]" placeholder="action data" value={data} onChange={(e) => setData(e.target.value)} aria-label="Action data" /><button className="btn-ghost" {...dis(b?.status === "PAUSED", "The breaker is paused")} onClick={() => act.ask({ op: "execute_guarded_action", title: "Execute the guarded action?", body: <p>Data: <b>{data || "(empty)"}</b></p>, exec: (w) => api.executeGuardedAction(w, BREAKER_ADDRESS, data) })}>execute_guarded_action</button></div></div>
          <div className="space-y-2 rounded-lg border border-slate-500/20 p-3"><div><div className="text-sm font-semibold">Emergency unpause (owner)</div><p className="text-xs text-fg-mute">Requires a paused breaker and a fresh operational verdict. Re-enables guarded actions.</p></div>
            <button className="btn-danger" {...dis(!(b?.status === "PAUSED" && b?.lastVerdict === "operational"), "Needs PAUSED state and an operational verdict")} onClick={() => act.ask({ op: "emergency_unpause", title: "Unpause the circuit breaker?", danger: true, confirmLabel: "Unpause", body: <p>This re-enables guarded actions. Only do this if the monitored service is healthy. Owner only.</p>, exec: (w) => api.emergencyUnpause(read, w, BREAKER_ADDRESS) })}>emergency_unpause</button></div>
          <div className="space-y-2 rounded-lg border border-slate-500/20 p-3"><div><div className="text-sm font-semibold">Change monitored URL (owner)</div><p className="text-xs text-fg-mute">Does not unpause the breaker.</p></div>
            <div className="flex flex-wrap gap-2"><input className="inp max-w-[16rem]" placeholder="https://status.example/api" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Monitored URL" /><button className="btn-ghost" {...dis(false)} onClick={() => act.ask({ op: "set_monitored_url", title: "Change the monitored URL?", danger: true, body: <p>New source: <span className="break-all font-mono text-xs">{url}</span></p>, exec: (w) => api.setMonitoredUrl(w, BREAKER_ADDRESS, url) })}>set_monitored_url</button></div></div>
        </div>
        {act.txPanel}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Raw contract output" source={known ? "ON-CHAIN" : "UNAVAILABLE"} right={b ? <CopyButton text={JSON.stringify(b, null, 2)} /> : undefined}>
          {b ? <pre className="max-h-64 overflow-auto rounded-lg bg-ink-950/60 p-3 text-xs">{JSON.stringify(b, null, 2)}</pre> : <EmptyState title="Nothing to inspect">The contract state could not be read.</EmptyState>}
        </Panel>
        <Panel title="Risk event history" source="UNAVAILABLE">
          <EmptyState title="The contract keeps no event history">Only the incident counter and the last check are readable. Transactions sent from this browser:</EmptyState>
          {local.length > 0 && <ul className="mt-3 space-y-1 text-xs">{local.slice(0, 8).map((e, i) => <li key={i} className="flex flex-wrap items-center gap-2"><span className="text-fg-mute">{new Date(e.ts).toLocaleString()}</span><span className="font-mono">{e.fn}</span><StatusBadge tone={e.status === "accepted" ? "ok" : "crit"}>{e.status}</StatusBadge>{e.hash && <span className="break-all font-mono text-[11px] text-fg-mute">{e.hash.slice(0, 14)}…</span>}</li>)}</ul>}
          <div className="mt-3"><ExplorerLink address={BREAKER_ADDRESS}>Full activity in GenLayer Explorer</ExplorerLink></div>
        </Panel>
      </div>
    </>
  );
}
