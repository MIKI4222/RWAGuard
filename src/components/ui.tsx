import { useState, type ReactNode } from "react";
import { Copy, Check, ExternalLink, Loader2, CheckCircle2, XCircle, AlertTriangle, Inbox } from "lucide-react";
import type { Provenance, Tone } from "../lib/api";
import type { Stage } from "../lib/genlayer";
import type { TxState } from "../hooks";
import { contractUrl, txUrl, TX_URL_FORMAT_VERIFIED } from "../lib/explorer";

const toneCls: Record<Tone, string> = {
  ok: "border-ok/40 bg-ok/10 text-ok", warn: "border-warn/40 bg-warn/10 text-warn", crit: "border-crit/40 bg-crit/10 text-crit",
  info: "border-cyan-brand/40 bg-cyan-brand/10 text-cyan-brand", muted: "border-slate-500/30 bg-slate-500/10 text-fg-mute",
};
export const toneText: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", crit: "text-crit", info: "text-cyan-brand", muted: "text-fg-mute" };

export function StatusBadge({ tone, children, pulse }: { tone: Tone; children: ReactNode; pulse?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneCls[tone]}`}><span className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "pulse-dot" : ""}`} />{children}</span>;
}
const srcTone: Record<Provenance, Tone> = { "ON-CHAIN": "info", "LIVE EXTERNAL": "warn", LOCAL: "muted", DOCUMENTED: "muted", UNAVAILABLE: "crit" };
export function DataSourceBadge({ source }: { source: Provenance }) {
  return <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${toneCls[srcTone[source]]}`} title={source === "ON-CHAIN" ? "Read from the deployed contract" : source === "LIVE EXTERNAL" ? "Off-chain data from an external API" : source === "DOCUMENTED" ? "From repository documentation; not re-verified by this app" : source === "LOCAL" ? "Computed locally in your browser" : "Could not be obtained"}>{source}</span>;
}
export function Panel({ title, source, right, children, className = "" }: { title?: string; source?: Provenance; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && <header className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2>{source && <DataSourceBadge source={source} />}</div>{right}</header>}
      {children}
    </section>
  );
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="mt-1 max-w-3xl text-sm text-fg-mute">{subtitle}</p></div>{actions}</div>;
}
export function Skeleton({ className = "h-6 w-24" }: { className?: string }) { return <div className={`animate-pulse rounded bg-ink-700 ${className}`} aria-hidden />; }
export function MetricCard({ label, value, hint, source, tone = "muted", loading }: { label: string; value: ReactNode; hint?: string; source: Provenance; tone?: Tone; loading?: boolean }) {
  return (
    <div className="panel min-w-0">
      <div className="flex items-center justify-between gap-2"><span className="truncate text-xs text-fg-mute">{label}</span><DataSourceBadge source={source} /></div>
      <div className={`mt-2 break-words text-2xl font-semibold ${toneText[tone]}`}>{loading ? <Skeleton className="h-8 w-20" /> : value}</div>
      {hint && <p className="mt-1 text-xs text-fg-mute">{hint}</p>}
    </div>
  );
}
export function RiskStatusCard({ title, label, tone, note, source, loading }: { title: string; label: string; tone: Tone; note: string; source: Provenance; loading?: boolean }) {
  return (
    <div className="panel min-w-0">
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-fg-mute">{title}</span><DataSourceBadge source={source} /></div>
      <div className="mt-3">{loading ? <Skeleton className="h-6 w-28" /> : <StatusBadge tone={tone} pulse={tone === "info" || tone === "warn"}>{label}</StatusBadge>}</div>
      <p className="mt-2 text-xs text-fg-mute">{note}</p>
    </div>
  );
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-500/30 p-6 text-center"><Inbox className="text-fg-mute" size={22} /><p className="text-sm font-medium">{title}</p>{children && <p className="max-w-xl text-xs text-fg-mute">{children}</p>}</div>;
}
export function ErrorState({ message, onRetry, partial }: { message: string; onRetry?: () => void; partial?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crit/40 bg-crit/10 p-3 text-sm text-crit">
      <span className="flex min-w-0 items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span className="break-words">{partial ? "Showing stale data. " : ""}Read error: {message}</span></span>
      {onRetry && <button className="btn-ghost" onClick={onRetry}>Retry</button>}
    </div>
  );
}
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard unavailable */ } }} aria-label={label}>{done ? <Check size={12} /> : <Copy size={12} />}{done ? "Copied" : label}</button>;
}
export function ExplorerLink({ address, hash, children }: { address: string; hash?: string; children?: ReactNode }) {
  const href = hash ? txUrl(hash, address) : contractUrl(address);
  return <a className="inline-flex items-center gap-1 text-xs text-cyan-brand hover:underline" href={href} target="_blank" rel="noreferrer">{children ?? "Open in GenLayer Explorer"}<ExternalLink size={12} /></a>;
}
export function ContractIdentity({ name, address, repo }: { name: string; address: string; repo: string }) {
  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><div className="text-sm font-semibold">{name}</div><div className="break-all font-mono text-xs text-fg-mute">{address}</div></div>
      <div className="flex flex-wrap items-center gap-2"><CopyButton text={address} label="Copy address" /><ExplorerLink address={address} /><a className="inline-flex items-center gap-1 text-xs text-fg-mute hover:text-fg" href={repo} target="_blank" rel="noreferrer">Source<ExternalLink size={12} /></a></div>
    </div>
  );
}
export function ConfirmDialog({ open, title, children, confirmLabel, danger, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="panel w-full max-w-md space-y-3 bg-ink-800">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="space-y-2 text-sm text-fg-mute">{children}</div>
        <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={onCancel} autoFocus>Cancel</button><button className={danger ? "btn-danger" : "btn"} onClick={onConfirm}>{confirmLabel}</button></div>
      </div>
    </div>
  );
}

const steps: { stage: Stage; label: string }[] = [
  { stage: "preparing", label: "Preparing the operation" }, { stage: "authorizing", label: "Wallet authorization" },
  { stage: "consensus", label: "Submitted · waiting for consensus" }, { stage: "executing", label: "GenVM execution & validator consensus" }, { stage: "success", label: "Result retrieved · state refreshed" },
];
export function TxPanel({ tx, address }: { tx: TxState | null; address: string }) {
  if (!tx) return null;
  const idx = steps.findIndex((s) => s.stage === tx.stage);
  const failed = tx.stage === "failed";
  return (
    <div className="mt-4 rounded-lg border border-slate-500/20 bg-ink-950/60 p-4 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{tx.op}</span><span className="text-xs text-fg-mute">{tx.contract} · {new Date(tx.startedAt).toLocaleTimeString()}</span></div>
      <ol className="mt-3 space-y-1.5">
        {steps.map((s, i) => {
          const done = tx.stage === "success" || (!failed && idx > i);
          const active = !failed && idx === i && tx.stage !== "success";
          return <li key={s.stage} className={`flex items-center gap-2 ${done || active ? "text-fg" : "text-fg-mute/50"}`}>{done ? <CheckCircle2 size={14} className="text-ok" /> : active ? <Loader2 size={14} className="animate-spin text-cyan-brand" /> : <span className="w-3.5" />}{s.label}</li>;
        })}
        {failed && <li className="flex items-center gap-2 text-crit"><XCircle size={14} />Failed</li>}
      </ol>
      {tx.detail && <p className="mt-2 text-xs text-fg-mute">network status: {tx.detail}</p>}
      {tx.error && <p className="mt-2 break-words text-xs text-crit">{tx.error}{failed && tx.hash ? " — the outcome may be unknown; check the explorer before retrying." : ""}</p>}
      {tx.hash && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="break-all font-mono text-xs text-fg-mute">{tx.hash}</span><CopyButton text={tx.hash} label="Copy hash" /><ExplorerLink address={address} hash={tx.hash}>{TX_URL_FORMAT_VERIFIED ? "View transaction" : "Contract page (tx link format unverified)"}</ExplorerLink></div>}
    </div>
  );
}
