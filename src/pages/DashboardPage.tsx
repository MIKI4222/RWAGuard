import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, CloudSun, ShieldAlert, ScrollText } from "lucide-react";
import { MetricCard, Panel, RiskStatusCard, EmptyState, ErrorState, PageHeader, Skeleton, ExplorerLink } from "../components/ui";
import { useRead, useNow } from "../hooks";
import { useRefreshTick } from "../components/AppShell";
import { read } from "../lib/genlayer";
import { BREAKER_ADDRESS, CUSTODY_ADDRESS } from "../lib/config";
import { getBreaker, breakerState, getCustody, custodyState, type Tone } from "../lib/api";
import { coordsFromUrl, fetchCurrent, fetchHourly, POLICY } from "../lib/weather";

export default function DashboardPage() {
  useEffect(() => { document.title = "Overview — RWA Guard"; }, []);
  const tick = useRefreshTick();
  const now = useNow(5000);
  const breaker = useRead(() => getBreaker(read, BREAKER_ADDRESS), [tick], 60000);
  const custody = useRead(() => getCustody(read, CUSTODY_ADDRESS), [tick], 60000);
  const url = custody.data?.weatherUrl ?? "";
  const coords = url ? coordsFromUrl(url) : null;
  const weather = useRead(async () => (url ? fetchCurrent(url) : null), [url, tick]);
  const hourly = useRead(async () => (coords ? fetchHourly(coords.lat, coords.lon) : null), [coords?.lat, coords?.lon, tick]);

  const bs = breaker.error && !breaker.data ? null : breakerState(breaker.data);
  const cs = custody.error && !custody.data ? null : custodyState(custody.data, now);
  const reads = [breaker, custody];
  const failed = reads.filter((r) => r.error && !r.data).length;
  const loadingAll = reads.every((r) => r.loading && !r.data);
  const conn: { label: string; tone: Tone; note: string } = loadingAll ? { label: "Checking", tone: "info", note: "Reading both contracts…" }
    : failed === 2 ? { label: "Unavailable", tone: "crit", note: "Neither contract could be read." } : failed === 1 ? { label: "Partial", tone: "warn", note: "One contract could not be read; the other is shown." }
    : { label: "Connected", tone: "ok", note: "Both contracts answered a live read." };
  const waitingUrl = custody.loading && !url; // the contract's weather URL is not known until its state is read
  const wxState: { label: string; tone: Tone; note: string } = weather.data ? { label: "Available", tone: "ok", note: "Open-Meteo answered for the contract's source URL." }
    : waitingUrl ? { label: "Checking", tone: "info", note: "Waiting for the contract's weather URL…" }
    : weather.loading ? { label: "Checking", tone: "info", note: "Requesting current weather…" } : weather.error ? { label: "Unavailable", tone: "crit", note: weather.error } : { label: "Unknown", tone: "muted", note: "The contract's weather URL is not known yet." };

  const tones = [bs?.tone ?? "muted", cs?.tone ?? "muted", conn.tone, wxState.tone];
  const bar: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", crit: "bg-crit", info: "bg-cyan-brand", muted: "bg-slate-600" };
  const b = breaker.data, c = custody.data;
  const series = (hourly.data ?? []).map((p) => ({ t: p.time.slice(5, 13).replace("T", " "), temperature: p.temperature, wind: p.wind }));

  return (
    <>
      <section className="panel grid-bg relative overflow-hidden">
        <div className="relative space-y-4">
          <div><p className="text-xs font-medium uppercase tracking-widest text-cyan-brand">Intelligent Risk. Verifiable Decisions.</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Weather-gated custody with an emergency circuit breaker.</h1>
            <p className="mt-2 max-w-2xl text-sm text-fg-mute">RWA Guard reads two GenLayer Intelligent Contracts on Bradbury Testnet: validators assess live weather before custody is released, and a circuit breaker pauses guarded actions when an external service degrades. Every figure below is labelled by its source.</p></div>
          <div className="flex items-center gap-2" aria-label="System health"><span className="text-xs text-fg-mute">System health</span>{tones.map((t, i) => <span key={i} className={`h-2 w-10 rounded-full ${bar[t]}`} />)}</div>
          <div className="flex flex-wrap gap-2"><Link className="btn" to="/rwa-custody">Evaluate weather &amp; custody<ArrowRight size={14} /></Link><Link className="btn-ghost" to="/circuit-breaker">Check emergency status</Link><Link className="btn-ghost" to="/audit">Review verified operations</Link></div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RiskStatusCard title="Emergency Circuit Breaker" label={bs?.label ?? "Unknown"} tone={bs?.tone ?? "muted"} note={breaker.error && !breaker.data ? breaker.error : bs?.note ?? ""} source={bs ? "ON-CHAIN" : "UNAVAILABLE"} loading={breaker.loading && !breaker.data} />
        <RiskStatusCard title="Weather-Gated RWA Custody" label={cs?.label ?? "Unknown"} tone={cs?.tone ?? "muted"} note={custody.error && !custody.data ? custody.error : cs?.note ?? ""} source={cs ? "ON-CHAIN" : "UNAVAILABLE"} loading={custody.loading && !custody.data} />
        <RiskStatusCard title="GenLayer connectivity" label={conn.label} tone={conn.tone} note={conn.note} source="ON-CHAIN" loading={loadingAll} />
        <RiskStatusCard title="External weather data" label={wxState.label} tone={wxState.tone} note={wxState.note} source={weather.error && !weather.data ? "UNAVAILABLE" : "LIVE EXTERNAL"} loading={waitingUrl || (weather.loading && !weather.data && !weather.error)} />
      </div>
      {(breaker.error || custody.error) && <ErrorState partial={!!(breaker.data || custody.data)} message={[breaker.error && `Circuit Breaker: ${breaker.error}`, custody.error && `RWA Custody: ${custody.error}`].filter(Boolean).join(" | ")} onRetry={() => { void breaker.reload(); void custody.reload(); }} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Breaker incidents" value={b?.incidents ?? "—"} hint="Degraded or unknown checks" source="ON-CHAIN" loading={breaker.loading && !b} tone={b && b.incidents > 0 ? "warn" : "muted"} />
        <MetricCard label="Guarded actions executed" value={b?.guardedActions ?? "—"} hint="Successful calls to execute_guarded_action" source="ON-CHAIN" loading={breaker.loading && !b} />
        <MetricCard label="Custody cycle" value={c ? `#${c.cycleId} · ${c.completed} completed` : "—"} hint={c?.label ? `Label: ${c.label}` : "No label yet"} source="ON-CHAIN" loading={custody.loading && !c} />
        <MetricCard label="Weather assessments" value={c?.assessments ?? "—"} hint="Consensus assessments recorded" source="ON-CHAIN" loading={custody.loading && !c} />
        <MetricCard label="Challenges raised" value={c?.challenges ?? "—"} hint="Across all cycles" source="ON-CHAIN" loading={custody.loading && !c} tone={c && c.challenges > 0 ? "warn" : "muted"} />
        <MetricCard label="Last verified read" value={breaker.updatedAt ? new Date(breaker.updatedAt).toLocaleTimeString() : "—"} hint="Positions and collateral totals are not exposed by these contracts, so none are shown." source="LOCAL" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Weather vs. contract policy envelope (next 48 h)" source="LIVE EXTERNAL" className="xl:col-span-2" right={coords ? <span className="font-mono text-xs text-fg-mute">{coords.lat}, {coords.lon}</span> : undefined}>
          {waitingUrl || (hourly.loading && !hourly.data) ? <Skeleton className="h-56 w-full" /> : hourly.error ? <ErrorState message={hourly.error} onRetry={hourly.reload} /> : series.length === 0 ? <EmptyState title="No forecast to chart">The contract's weather URL has no coordinates the app can read, or the provider returned no data.</EmptyState> : (
            <div className="h-56 w-full">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fill: "#94A3B8", fontSize: 11 }} interval={5} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#111B2D", border: "1px solid rgba(148,163,184,.25)", fontSize: 12 }} />
                  <ReferenceLine y={POLICY.tempMax} stroke="#F5B942" strokeDasharray="4 4" label={{ value: "max temp 35", fill: "#F5B942", fontSize: 10 }} />
                  <ReferenceLine y={POLICY.windMax} stroke="#FF647C" strokeDasharray="4 4" label={{ value: "max wind 60", fill: "#FF647C", fontSize: 10 }} />
                  <Line type="monotone" dataKey="temperature" name="Temperature °C" stroke="#53D8E8" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="wind" name="Wind km/h" stroke="#45D6A1" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-2 text-xs text-fg-mute">Context only: a forecast chart for the location in the contract's configured URL. The contract's own decision comes from the validators' fetch of that URL, not from this chart.</p>
        </Panel>
        <Panel title="Risk history" source="UNAVAILABLE">
          <EmptyState title="No history to display">Neither contract stores an event history; only current state and counters are readable. A chart of past decisions would have to be invented, so none is drawn. Operations sent from this browser appear in the Audit Explorer.</EmptyState>
        </Panel>
      </div>

      <Panel title="Quick actions">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/rwa-custody" className="rounded-lg border border-slate-500/20 p-4 transition hover:bg-ink-700"><CloudSun className="text-cyan-brand" size={18} /><div className="mt-2 text-sm font-semibold">Evaluate weather conditions</div><p className="text-xs text-fg-mute">Search a location, see the policy pre-check, run propose_release.</p></Link>
          <Link to="/circuit-breaker" className="rounded-lg border border-slate-500/20 p-4 transition hover:bg-ink-700"><ShieldAlert className="text-warn" size={18} /><div className="mt-2 text-sm font-semibold">Check emergency risk status</div><p className="text-xs text-fg-mute">Run a consensus health check and inspect the breaker.</p></Link>
          <Link to="/audit" className="rounded-lg border border-slate-500/20 p-4 transition hover:bg-ink-700"><ScrollText className="text-ok" size={18} /><div className="mt-2 text-sm font-semibold">Review recent operations</div><p className="text-xs text-fg-mute">Transactions from this browser and documented evidence.</p></Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-4"><ExplorerLink address={BREAKER_ADDRESS}>Circuit Breaker in Explorer</ExplorerLink><ExplorerLink address={CUSTODY_ADDRESS}>RWA Custody in Explorer</ExplorerLink></div>
      </Panel>
    </>
  );
}
