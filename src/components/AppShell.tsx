import { createContext, useContext, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ShieldCheck, LayoutDashboard, Wheat, ZapOff, ScrollText, Menu, X, RefreshCw, ExternalLink } from "lucide-react";
import { WalletConnect } from "./wallet";
import { StatusBadge } from "./ui";
import { useRead } from "../hooks";
import { read, clearReadCache } from "../lib/genlayer";
import { BREAKER_ADDRESS, CUSTODY_ADDRESS, NETWORK_NAME, REPOS } from "../lib/config";
import { contractUrl } from "../lib/explorer";

const RefreshCtx = createContext(0);
export const useRefreshTick = () => useContext(RefreshCtx);

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/rwa-custody", label: "RWA Custody", icon: Wheat },
  { to: "/circuit-breaker", label: "Circuit Breaker", icon: ZapOff },
  { to: "/audit", label: "Audit Explorer", icon: ScrollText },
];
const titles: Record<string, string> = { "/": "Overview", "/rwa-custody": "RWA Custody", "/circuit-breaker": "Circuit Breaker", "/audit": "Audit Explorer" };

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const { pathname } = useLocation();
  // Connectivity is verified by an actual read from each contract, not assumed from configuration.
  const conn = useRead(async () => { await Promise.all([read(BREAKER_ADDRESS, "get_status"), read(CUSTODY_ADDRESS, "get_status")]); return true; }, [tick], 60000);
  const tone = conn.loading && !conn.data ? "info" : conn.error ? "crit" : "ok";
  const label = conn.loading && !conn.data ? "Verifying network…" : conn.error ? "RPC unreachable" : "Network verified by contract reads";
  const SidebarBody = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-brand/40 bg-ink-800"><ShieldCheck size={18} className="text-cyan-brand" /></div><div><div className="text-sm font-bold leading-tight">RWA Guard</div><div className="text-[11px] leading-tight text-fg-mute">Intelligent Risk. Verifiable Decisions.</div></div></div>
      <nav aria-label="Primary" className="space-y-1">
        <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-fg-mute">Risk management</div>
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-ink-700 text-fg" : "text-fg-mute hover:bg-ink-800 hover:text-fg"}`}><Icon size={16} />{label}</NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-2 text-xs text-fg-mute">
        <div className="px-2 text-[11px] font-medium uppercase tracking-wider">System</div>
        <div className="space-y-1.5 px-2"><div>Network: {NETWORK_NAME}</div><StatusBadge tone={tone} pulse={tone === "info"}>{label}</StatusBadge></div>
        <div className="space-y-1 px-2 pt-2">
          <a className="flex items-center gap-1 hover:text-fg" href={contractUrl(BREAKER_ADDRESS)} target="_blank" rel="noreferrer">Circuit Breaker contract<ExternalLink size={11} /></a>
          <a className="flex items-center gap-1 hover:text-fg" href={contractUrl(CUSTODY_ADDRESS)} target="_blank" rel="noreferrer">RWA Custody contract<ExternalLink size={11} /></a>
          <a className="flex items-center gap-1 hover:text-fg" href={REPOS.custody} target="_blank" rel="noreferrer">Documentation (source)<ExternalLink size={11} /></a>
        </div>
        <p className="px-2 pt-2 text-[11px] leading-snug">Testnet only. Not production financial infrastructure.</p>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r bg-ink-900 lg:block" style={{ borderColor: "rgba(148,163,184,.14)" }}>{SidebarBody}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} /><aside className="relative h-full w-72 bg-ink-900" aria-label="Navigation drawer">{SidebarBody}<button className="btn-ghost absolute right-3 top-3" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={14} /></button></aside></div>}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b bg-ink-950/85 px-4 py-3 backdrop-blur" style={{ borderColor: "rgba(148,163,184,.14)" }}>
          <div className="flex items-center gap-3"><button className="btn-ghost lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={16} /></button><span className="text-sm font-semibold">{titles[pathname] ?? "Not found"}</span><span className="hidden text-xs text-fg-mute sm:inline">{NETWORK_NAME}</span></div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden text-xs text-fg-mute md:inline">{conn.updatedAt ? `Last verified read ${new Date(conn.updatedAt).toLocaleTimeString()}` : "No verified read yet"}</span>
            <button className="btn-ghost" onClick={() => { clearReadCache(); setTick((t) => t + 1); }}><RefreshCw size={13} />Refresh</button>
            <WalletConnect />
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-6 p-4 py-6 sm:p-6"><RefreshCtx.Provider value={tick}>{children}</RefreshCtx.Provider></main>
      </div>
    </div>
  );
}
