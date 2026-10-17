import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Wallet, Loader2, AlertTriangle } from "lucide-react";
import { connectWallet, currentChainId, hasWallet, TARGET_CHAIN_ID } from "../lib/genlayer";

type Status = "disconnected" | "connecting" | "connected" | "error";
type Ctx = { status: Status; account: string; chainId: number | null; networkOk: boolean | null; error: string; connect: () => Promise<void>; disconnect: () => void };
const WalletCtx = createContext<Ctx>({ status: "disconnected", account: "", chainId: null, networkOk: null, error: "", connect: async () => {}, disconnect: () => {} });
export const useWallet = () => useContext(WalletCtx);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("disconnected");
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const disconnect = useCallback(() => { setAccount(""); setChainId(null); setStatus("disconnected"); setError(""); }, []);
  const connect = useCallback(async () => {
    setStatus("connecting"); setError("");
    try { const w = await connectWallet(); setAccount(w.account); setChainId(w.chainId); setStatus("connected"); }
    catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => {
    const eth = hasWallet() ? (window as any).ethereum : null;
    if (!eth?.on) return undefined;
    const onAccounts = (accs: string[]) => { if (!accs?.length) disconnect(); else setAccount(accs[0]); };
    const onChain = async () => setChainId(await currentChainId());
    eth.on("accountsChanged", onAccounts); eth.on("chainChanged", onChain);
    return () => { eth.removeListener?.("accountsChanged", onAccounts); eth.removeListener?.("chainChanged", onChain); };
  }, [disconnect]);
  const networkOk = status !== "connected" || TARGET_CHAIN_ID === undefined || chainId === null ? null : chainId === TARGET_CHAIN_ID;
  const value = useMemo(() => ({ status, account, chainId, networkOk, error, connect, disconnect }), [status, account, chainId, networkOk, error, connect, disconnect]);
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function WalletConnect() {
  const { status, account, networkOk, error, connect, disconnect } = useWallet();
  if (status === "connecting") return <button className="btn" disabled><Loader2 size={16} className="animate-spin" />Connecting…</button>;
  if (status === "connected") return (
    <div className="flex items-center gap-2">
      {networkOk === false && <span className="flex items-center gap-1 text-xs text-warn" title="Switch your wallet to GenLayer Bradbury Testnet"><AlertTriangle size={14} />Unsupported network</span>}
      <button className="btn-ghost font-mono" onClick={disconnect} title="Disconnect (clears the app's session; your wallet stays unlocked)"><Wallet size={14} />{account.slice(0, 6)}…{account.slice(-4)}</button>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      {status === "error" && <span className="max-w-[14rem] truncate text-xs text-crit" title={error}>{error}</span>}
      <button className="btn" onClick={connect}><Wallet size={16} />Connect wallet</button>
    </div>
  );
}
