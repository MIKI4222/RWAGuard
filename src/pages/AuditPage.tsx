import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Panel, PageHeader, ContractIdentity, StatusBadge, ErrorState, EmptyState, CopyButton, DataSourceBadge, ExplorerLink } from "../components/ui";
import { useRead } from "../hooks";
import { useRefreshTick } from "../components/AppShell";
import { auditLog, read, type AuditEntry } from "../lib/genlayer";
import { BREAKER_ADDRESS, CUSTODY_ADDRESS, REPOS } from "../lib/config";
import { getBreaker, getCustody, type Provenance } from "../lib/api";
import { fetchCurrent } from "../lib/weather";
import { CUSTODY_EVIDENCE } from "../lib/evidence";

type Row = { key: string; ts: number | null; contract: "Circuit Breaker" | "RWA Custody"; op: string; hash: string; status: string; source: Provenance; raw: string };
const PAGE = 10;
const addrOf = (c: Row["contract"]) => (c === "Circuit Breaker" ? BREAKER_ADDRESS : CUSTODY_ADDRESS);

export default function AuditPage() {
  useEffect(() => { document.title = "Audit Explorer — RWA Guard"; }, []);
  const tick = useRefreshTick();
  const breaker = useRead(() => getBreaker(read, BREAKER_ADDRESS), [tick]);
  const custody = useRead(() => getCustody(read, CUSTODY_ADDRESS), [tick]);
  const url = custody.data?.weatherUrl ?? "";
  const weather = useRead(async () => (url ? fetchCurrent(url) : null), [url, tick]);
  const [log, setLog] = useState<AuditEntry[]>([]);
  useEffect(() => { setLog(auditLog()); }, [tick]);

  const [q, setQ] = useState("");
  const [contract, setContract] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState<Row | null>(null);
  const [tab, setTab] = useState<"snapshots" | "weather" | "tx">("snapshots");
  const [view, setView] = useState<"decoded" | "raw">("decoded");

  const rows: Row[] = useMemo(() => [
    ...log.map((e, i): Row => ({ key: `l${i}-${e.ts}`, ts: e.ts, contract: e.contract, op: e.fn, hash: e.hash ?? "(not broadcast)", status: e.status, source: "ON-CHAIN", raw: e.raw })),
    ...CUSTODY_EVIDENCE.map((e, i): Row => ({ key: `d${i}`, ts: null, contract: e.contract, op: e.operation, hash: e.hash, status: "documented", source: "DOCUMENTED", raw: JSON.stringify(e, null, 2) })),
  ], [log]);
  const shown = useMemo(() => rows.filter((r) => (contract === "all" || r.contract === contract) && (status === "all" || r.status === status) && (!q || r.hash.toLowerCase().includes(q.trim().toLowerCase()) || r.op.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => { const x = a.ts ?? -1, y = b.ts ?? -1; return sort === "desc" ? y - x : x - y; }), [rows, q, contract, status, sort]);

  const snapshots = { circuitBreaker: breaker.data, rwaCustody: custody.data };
  const decoded = (r: Row) => { try { return JSON.parse(r.raw); } catch { return r.raw; } };

  return (
    <>
      <PageHeader title="Audit & Transaction Explorer" subtitle="Where each record comes from is always shown. Neither contract keeps an event history, so there is no complete on-chain transaction list the app can verify; the GenLayer Explorer pages are the authoritative source." />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2"><ContractIdentity name="EmergencyCircuitBreaker" address={BREAKER_ADDRESS} repo={REPOS.breaker} />{breaker.error ? <ErrorState message={breaker.error} onRetry={breaker.reload} /> : <p className="px-1 text-xs text-fg-mute">Last successful read: {breaker.updatedAt ? new Date(breaker.updatedAt).toLocaleTimeString() : "none"}</p>}</div>
        <div className="space-y-2"><ContractIdentity name="WeatherGatedRWACustody" address={CUSTODY_ADDRESS} repo={REPOS.custody} />{custody.error ? <ErrorState message={custody.error} onRetry={custody.reload} /> : <p className="px-1 text-xs text-fg-mute">Last successful read: {custody.updatedAt ? new Date(custody.updatedAt).toLocaleTimeString() : "none"}</p>}</div>
      </div>

      <Panel title="Transactions" right={<span className="text-xs text-fg-mute">{shown.length} of {rows.length}</span>}>
        <p className="mb-3 text-xs text-fg-mute">Rows marked <DataSourceBadge source="ON-CHAIN" /> were recorded by this browser from real network status after you submitted them. Rows marked <DataSourceBadge source="DOCUMENTED" /> are transaction IDs listed in the custody contract's README; the app has not re-verified them. The explorer's per-transaction URL format could not be verified, so links open the contract page; use the hash to search.</p>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input className="inp" placeholder="Search hash or operation" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="Search by transaction hash" />
          <select className="inp" value={contract} onChange={(e) => { setContract(e.target.value); setLimit(PAGE); }} aria-label="Filter by contract"><option value="all">All contracts</option><option>Circuit Breaker</option><option>RWA Custody</option></select>
          <select className="inp" value={status} onChange={(e) => { setStatus(e.target.value); setLimit(PAGE); }} aria-label="Filter by status"><option value="all">All statuses</option><option value="accepted">accepted</option><option value="reverted">reverted</option><option value="error">error</option><option value="documented">documented</option></select>
          <select className="inp" value={sort} onChange={(e) => setSort(e.target.value as "asc" | "desc")} aria-label="Sort by timestamp"><option value="desc">Newest first</option><option value="asc">Oldest first</option></select>
        </div>
        {shown.length === 0 ? <EmptyState title="No matching records">Adjust the filters, or submit a transaction from the Custody or Circuit Breaker page.</EmptyState> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-fg-mute"><tr><th className="py-2 pr-3 font-medium">Time</th><th className="pr-3 font-medium">Contract</th><th className="pr-3 font-medium">Operation</th><th className="pr-3 font-medium">Hash</th><th className="pr-3 font-medium">Status</th><th className="font-medium">Source</th></tr></thead>
            <tbody>{shown.slice(0, limit).map((r) => (
              <tr key={r.key} className={`cursor-pointer border-t hover:bg-ink-700/60 ${sel?.key === r.key ? "bg-ink-700/60" : ""}`} style={{ borderColor: "rgba(148,163,184,.12)" }} onClick={() => { setSel(r); setTab("tx"); }}>
                <td className="py-2 pr-3 text-fg-mute">{r.ts ? new Date(r.ts).toLocaleString() : "n/a"}</td><td className="pr-3">{r.contract}</td><td className="pr-3 font-mono">{r.op}</td>
                <td className="pr-3 font-mono text-fg-mute">{r.hash.length > 20 ? `${r.hash.slice(0, 10)}…${r.hash.slice(-6)}` : r.hash}</td>
                <td className="pr-3"><StatusBadge tone={r.status === "accepted" ? "ok" : r.status === "documented" ? "muted" : "crit"}>{r.status}</StatusBadge></td><td><DataSourceBadge source={r.source} /></td>
              </tr>))}</tbody>
          </table></div>
        )}
        {shown.length > limit && <div className="mt-3 text-center"><button className="btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>Show more</button></div>}
      </Panel>

      <Panel title="Raw data inspector" right={<div className="flex gap-1" role="tablist">{([["snapshots", "Contract snapshots"], ["weather", "External weather"], ["tx", "Selected transaction"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`btn-ghost ${tab === k ? "bg-ink-700" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>}>
        {tab === "snapshots" && <Inspect source="ON-CHAIN" retrieval={breaker.error || custody.error ? `partial: ${breaker.error || custody.error}` : "ok"} when={custody.updatedAt} contract="both contracts" id="get_* views" data={snapshots} view={view} setView={setView} />}
        {tab === "weather" && (weather.error ? <ErrorState message={weather.error} onRetry={weather.reload} /> : weather.data ? <Inspect source="LIVE EXTERNAL" retrieval="ok" when={weather.updatedAt} contract="Open-Meteo (not on-chain)" id={url} data={weather.data.raw} view={view} setView={setView} /> : <EmptyState title="No weather response">The contract's weather URL is not known yet.</EmptyState>)}
        {tab === "tx" && (sel ? <Inspect source={sel.source} retrieval={sel.status} when={sel.ts} contract={addrOf(sel.contract)} id={sel.hash} data={decoded(sel)} view={view} setView={setView} extra={<ExplorerLink address={addrOf(sel.contract)} hash={sel.hash}>Contract page in Explorer</ExplorerLink>} /> : <EmptyState title="No transaction selected">Select a row in the table above.</EmptyState>)}
        <p className="mt-3 text-xs text-fg-mute">All content is rendered as plain text. External responses are untrusted and never injected as HTML.</p>
      </Panel>
    </>
  );
}

function Inspect({ source, retrieval, when, contract, id, data, view, setView, extra }: { source: Provenance; retrieval: string; when: number | null; contract: string; id: string; data: unknown; view: "decoded" | "raw"; setView: (v: "decoded" | "raw") => void; extra?: ReactNode }) {
  const raw = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">{([["Source", source], ["Retrieval", retrieval], ["Timestamp", when ? new Date(when).toLocaleString() : "n/a"], ["Contract", contract]] as [string, string][]).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-fg-mute">{k}</dt><dd className="break-all font-mono">{v}</dd></div>)}</dl>
      <div className="text-xs"><span className="text-fg-mute">Identifier: </span><span className="break-all font-mono">{id}</span></div>
      <div className="flex flex-wrap items-center gap-2"><button className={`btn-ghost ${view === "decoded" ? "bg-ink-700" : ""}`} onClick={() => setView("decoded")}>Decoded</button><button className={`btn-ghost ${view === "raw" ? "bg-ink-700" : ""}`} onClick={() => setView("raw")}>Raw</button><CopyButton text={raw} />{extra}</div>
      {view === "decoded" && typeof data === "object" && data !== null ? <pre className="max-h-80 overflow-auto rounded-lg bg-ink-950/60 p-3 text-xs">{raw}</pre> : <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink-950/60 p-3 text-xs">{raw}</pre>}
    </div>
  );
}
