import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Search } from "lucide-react";
import { Panel, PageHeader, ContractIdentity, StatusBadge, ErrorState, EmptyState, Skeleton, CopyButton, MetricCard } from "../components/ui";
import { useActionRunner } from "../components/actions";
import { useRead, useNow } from "../hooks";
import { useRefreshTick } from "../components/AppShell";
import { read } from "../lib/genlayer";
import { CUSTODY_ADDRESS, REPOS } from "../lib/config";
import * as api from "../lib/api";
import { buildOpenMeteoUrl, evaluatePolicy, fetchCurrent, geocode, POLICY, type GeoResult } from "../lib/weather";

const OPEN = ["OPEN", "REOPENED", "CHALLENGE_PERIOD", "CHALLENGED", "UNSAFE", "RELEASED"];
const fmt = (s: number) => (s > 0 ? new Date(s * 1000).toLocaleString() : "—");

function Row({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <div className="space-y-2 rounded-lg border border-slate-500/20 p-3"><div><div className="text-sm font-semibold">{title}</div><p className="text-xs text-fg-mute">{note}</p></div><div className="flex flex-wrap items-center gap-2">{children}</div></div>;
}

export default function RWACustodyPage() {
  useEffect(() => { document.title = "RWA Custody — RWA Guard"; }, []);
  const tick = useRefreshTick();
  const now = useNow();
  const custody = useRead(() => api.getCustody(read, CUSTODY_ADDRESS), [tick], 30000);
  const act = useActionRunner("RWA Custody", CUSTODY_ADDRESS, () => { void custody.reload(); });
  const c = custody.data;
  const cs = api.custodyState(c, now);
  const known = !!c;
  const cycleOpen = !!c && OPEN.includes(c.status);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState("");
  const [picked, setPicked] = useState<{ label: string; url: string } | null>(null);
  const previewUrl = picked?.url ?? c?.weatherUrl ?? "";
  const wx = useRead(async () => (previewUrl ? fetchCurrent(previewUrl) : null), [previewUrl, tick]);
  const policy = wx.data ? evaluatePolicy(wx.data.weather) : null;
  const search = async () => { setGeoBusy(true); setGeoErr(""); try { setResults(await geocode(query)); } catch (e) { setResults([]); setGeoErr(e instanceof Error ? e.message : String(e)); } finally { setGeoBusy(false); } };

  const [label, setLabel] = useState("");
  const [claimLabel, setClaimLabel] = useState("");
  const [evidence, setEvidence] = useState("");
  const [period, setPeriod] = useState("300");
  const dis = (cond: boolean, why = "Not available in the current contract state") => ({ disabled: !known || act.busy || !!act.blocked || cond, title: !known ? "Contract state unknown" : act.blocked || (cond ? why : "") });
  const step = api.cycleStepIndex(c?.status ?? "");

  return (
    <>
      {act.dialog}
      <PageHeader title="Weather-Gated RWA Custody" subtitle="One reusable custody cycle: validators assess live weather, a SAFE result opens a challenge period, and the configured custodian can then claim release authorization once. The contract records authorization; it does not move tokens or physical assets." />
      <ContractIdentity name="WeatherGatedRWACustody" address={CUSTODY_ADDRESS} repo={REPOS.custody} />
      {custody.error && <ErrorState partial={stale(custody)} message={custody.error} onRetry={custody.reload} />}

      <Panel title="Contract state" source={known ? "ON-CHAIN" : "UNAVAILABLE"} right={<StatusBadge tone={cs.tone} pulse={cs.tone === "info" || cs.tone === "warn"}>{cs.label}</StatusBadge>}>
        {custody.loading && !c ? <Skeleton className="h-24 w-full" /> : (
          <>
            <p className="mb-4 text-sm text-fg-mute">{cs.note}</p>
            <ol className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Cycle progress">
              {api.CYCLE_STEPS.map((s, i) => <li key={s} className={`rounded-lg border p-2 text-xs ${i < step ? "border-ok/40 text-ok" : i === step ? "border-cyan-brand/50 text-cyan-brand" : "border-slate-500/20 text-fg-mute"}`}>{i + 1}. {s}</li>)}
            </ol>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {([["Status (raw)", c?.status], ["Cycle", c ? `#${c.cycleId} ${c.label ? `· ${c.label}` : ""}` : "—"], ["Decision / risk", c ? `${c.decision} / ${c.risk}` : "—"], ["Challenge period", c ? `${c.period}s` : "—"], ["Challenge deadline", c ? fmt(c.deadline) : "—"], ["can_finalize / can_claim_custody", c ? `${c.canFinalize} / ${c.canClaim}` : "—"], ["Source used for last assessment", c?.source || "—"], ["Configured weather URL", c?.weatherUrl || "—"]] as [string, string | undefined][]).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-fg-mute">{k}</dt><dd className="break-all font-mono text-xs">{v}</dd></div>)}
            </dl>
            <div className="mt-3 rounded-lg bg-ink-950/60 p-3 text-xs"><span className="text-fg-mute">Validators' stored reasoning: </span>{c?.reason || "—"}</div>
          </>
        )}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Assessments" value={c?.assessments ?? "—"} source="ON-CHAIN" loading={custody.loading && !c} />
        <MetricCard label="Challenges" value={c?.challenges ?? "—"} source="ON-CHAIN" loading={custody.loading && !c} />
        <MetricCard label="Completed cycles" value={c?.completed ?? "—"} source="ON-CHAIN" loading={custody.loading && !c} />
      </div>

      <Panel title="Weather evaluation workflow" source="LIVE EXTERNAL">
        <p className="mb-3 text-xs text-fg-mute">The contract fetches its configured URL itself; the app cannot pass weather data to it. Pick a location to see current conditions and the exact URL you would set (owner only). The policy check below is a local preview of the contract's documented rules; only validator consensus is authoritative.</p>
        <div className="flex flex-wrap gap-2">
          <input className="inp max-w-xs" placeholder="Search a city, e.g. Kyiv" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} aria-label="Location search" />
          <button className="btn-ghost" onClick={() => void search()} disabled={geoBusy}><Search size={13} />{geoBusy ? "Searching…" : "Search"}</button>
          {picked && <button className="btn-ghost" onClick={() => setPicked(null)}>Use contract's configured source</button>}
        </div>
        {geoErr && <p className="mt-2 text-xs text-crit">{geoErr}</p>}
        {results.length > 0 && <ul className="mt-2 divide-y divide-slate-500/10 rounded-lg border border-slate-500/20">{results.map((r) => <li key={`${r.lat},${r.lon}`}><button className="w-full px-3 py-2 text-left text-sm hover:bg-ink-700" onClick={() => setPicked({ label: `${r.name}, ${r.country}`, url: buildOpenMeteoUrl(r.lat, r.lon) })}>{r.name}{r.region ? `, ${r.region}` : ""}, {r.country} <span className="font-mono text-xs text-fg-mute">({r.lat}, {r.lon})</span></button></li>)}</ul>}
        <div className="mt-4 space-y-3">
          <div className="text-xs text-fg-mute">Source: {picked ? picked.label : "contract's configured URL"} · provider Open-Meteo</div>
          {(wx.loading && !wx.data) || (!previewUrl && custody.loading) ? <Skeleton className="h-16 w-full" /> : wx.error ? <ErrorState message={wx.error} onRetry={wx.reload} /> : wx.data && policy ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">{policy.checks.map((k) => <div key={k.name} className={`rounded-lg border p-3 ${k.ok ? "border-ok/30" : "border-crit/40"}`}><div className="flex items-center justify-between text-xs text-fg-mute"><span>{k.name}</span>{k.ok ? <CheckCircle2 size={14} className="text-ok" /> : <XCircle size={14} className="text-crit" />}</div><div className="text-xl font-semibold">{k.value}</div><div className="text-[11px] text-fg-mute">policy {k.limit}</div></div>)}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs"><StatusBadge tone={policy.safe ? "ok" : "crit"}>Local pre-check: {policy.safe ? "within policy" : "outside policy"}</StatusBadge><span className="text-fg-mute">observed {wx.data.weather.time || "n/a"} UTC · temp {POLICY.tempMin}…{POLICY.tempMax} °C, wind ≤ {POLICY.windMax} km/h, precip ≤ {POLICY.precipMax} mm</span></div>
            </>
          ) : <EmptyState title="No weather to show">The contract's weather URL is not known yet.</EmptyState>}
          {previewUrl && <div className="space-y-2"><div className="break-all rounded-lg bg-ink-950/60 p-2 font-mono text-[11px]">{previewUrl}</div><div className="flex flex-wrap gap-2"><CopyButton text={previewUrl} label="Copy URL" />{picked && <button className="btn-ghost" {...dis(cycleOpen, "set_weather_url is blocked while a cycle is open")} onClick={() => act.ask({ op: "set_weather_url", title: "Change the weather source?", body: <><p>The contract will fetch <span className="break-all font-mono text-xs">{picked.url}</span> in future assessments for <b>{picked.label}</b>.</p><p>Owner only. This does not start a cycle.</p></>, exec: (w) => api.setWeatherUrl(w, CUSTODY_ADDRESS, picked.url), verify: (b, a) => api.expectState.setWeatherUrl(b, a, picked.url) })}>set_weather_url (owner)</button>}</div></div>}
        </div>
      </Panel>

      <Panel title="Custody operations">
        <p className="mb-3 text-xs text-fg-mute">Access is enforced by the contract: owner-only, custodian-only, or open to anyone. The contract has no getter for owner or custodian, so the app cannot pre-check your role; a wrong wallet simply reverts. {act.connected ? "" : "Connect a wallet to submit."}</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <Row title="1 · Start cycle (owner)" note="Opens a new reusable cycle on the same deployment. Allowed when no cycle is open.">
            <input className="inp max-w-[14rem]" placeholder="Cycle label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Cycle label" />
            <button className="btn" {...dis(cycleOpen, "A cycle is still open")} onClick={() => act.ask({ op: "start_cycle", title: "Start a new custody cycle?", body: <p>Label: <b>{label || "(empty)"}</b>. Owner only.</p>, exec: (w) => api.startCycle(w, CUSTODY_ADDRESS, label), verify: (b, a) => api.expectState.startCycle(b, a, label) })}>start_cycle</button>
          </Row>
          <Row title="2 · Propose release (anyone)" note="Validators fetch the configured weather URL and reach consensus. SAFE opens the challenge period; UNSAFE does not.">
            <button className="btn" {...dis(!(c?.status === "OPEN" || c?.status === "REOPENED"), "Needs an OPEN or REOPENED cycle")} onClick={() => act.ask({ op: "propose_release", title: "Run the weather assessment?", body: <p>Validators will independently fetch <span className="break-all font-mono text-xs">{c?.weatherUrl}</span>. This can take a while and may time out if the source is slow.</p>, exec: (w) => api.proposeRelease(w, CUSTODY_ADDRESS), verify: api.expectState.proposeRelease })}>propose_release</button>
          </Row>
          <Row title="3 · Challenge (anyone)" note="Freezes a SAFE proposal before the deadline. The evidence URL is recorded as a veto signal; it is not adjudicated.">
            <input className="inp max-w-[16rem]" placeholder="https://evidence…" value={evidence} onChange={(e) => setEvidence(e.target.value)} aria-label="Evidence URL" />
            <button className="btn-ghost" {...dis(c?.status !== "CHALLENGE_PERIOD" || !!c?.canFinalize, "Only during an open challenge period")} onClick={() => act.ask({ op: "challenge_release", title: "Challenge this release?", danger: true, body: <p>This blocks finalization until the owner reopens the proposal.</p>, exec: (w) => api.challengeRelease(w, CUSTODY_ADDRESS, evidence), verify: api.expectState.challengeRelease })}>challenge_release</button>
          </Row>
          <Row title="4 · Finalize (anyone)" note="Possible once the challenge period ended without a challenge.">
            <button className="btn" {...dis(!c?.canFinalize, "can_finalize is false")} onClick={() => act.ask({ op: "finalize_release", title: "Finalize the release?", body: <p>Marks custody as released so the custodian can claim it.</p>, exec: (w) => api.finalizeRelease(read, w, CUSTODY_ADDRESS), verify: api.expectState.finalizeRelease })}>finalize_release</button>
          </Row>
          <Row title="5 · Claim custody (custodian)" note="One-time claim after release. A second claim is rejected by the contract.">
            <input className="inp max-w-[14rem]" placeholder="Claim label" value={claimLabel} onChange={(e) => setClaimLabel(e.target.value)} aria-label="Claim label" />
            <button className="btn" {...dis(!c?.canClaim, "can_claim_custody is false")} onClick={() => act.ask({ op: "claim_rwa_custody", title: "Claim custody?", body: <p>Label: <b>{claimLabel || "(empty)"}</b>. Only the configured custodian can do this, once.</p>, exec: (w) => api.claimCustody(read, w, CUSTODY_ADDRESS, claimLabel), verify: api.expectState.claimCustody })}>claim_rwa_custody</button>
          </Row>
          <Row title="Owner recovery" note="Reopen a challenged proposal for a fresh assessment, or close a cycle that validators judged UNSAFE.">
            <button className="btn-ghost" {...dis(c?.status !== "CHALLENGED", "Needs a CHALLENGED proposal")} onClick={() => act.ask({ op: "reopen_challenged_proposal", title: "Reopen the challenged proposal?", danger: true, body: <p>Clears the proposal and requires a new assessment. Owner only.</p>, exec: (w) => api.reopenChallengedProposal(w, CUSTODY_ADDRESS), verify: api.expectState.reopenChallengedProposal })}>reopen_challenged_proposal</button>
            <button className="btn-ghost" {...dis(c?.status !== "UNSAFE", "Needs an UNSAFE cycle")} onClick={() => act.ask({ op: "close_unsafe_cycle", title: "Close this unsafe cycle?", danger: true, body: <p>Ends the cycle without release. Owner only.</p>, exec: (w) => api.closeUnsafeCycle(w, CUSTODY_ADDRESS), verify: api.expectState.closeUnsafeCycle })}>close_unsafe_cycle</button>
          </Row>
          <Row title="Owner configuration" note="Only between cycles. Period is in seconds.">
            <input className="inp max-w-[8rem]" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Challenge period seconds" />
            <button className="btn-ghost" {...dis(cycleOpen, "Blocked while a cycle is open")} onClick={() => act.ask({ op: "set_challenge_period", title: "Change the challenge period?", body: <p>New period: <b>{period}s</b>. Owner only.</p>, exec: (w) => api.setChallengePeriod(w, CUSTODY_ADDRESS, period), verify: (b, a) => api.expectState.setChallengePeriod(b, a, period) })}>set_challenge_period</button>
          </Row>
        </div>
        {act.txPanel}
      </Panel>

      <Panel title="Cycle history" source="UNAVAILABLE">
        <EmptyState title="The contract keeps no per-cycle history">Only the current cycle and cumulative counters are readable. Documented transactions from the contract's README and operations sent from this browser are listed in the Audit Explorer.</EmptyState>
      </Panel>
    </>
  );
}
function stale(r: { data: unknown; error: string }) { return !!r.error && r.data !== null; }
