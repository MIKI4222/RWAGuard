import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
export default function NotFoundPage() {
  useEffect(() => { document.title = "Page not found — RWA Guard"; }, []);
  return (
    <div className="panel grid-bg mx-auto mt-10 max-w-xl space-y-3 text-center">
      <Compass className="mx-auto text-cyan-brand" size={28} />
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="text-sm text-fg-mute">This route does not exist. Use the navigation or jump to one of the workspaces.</p>
      <div className="flex flex-wrap justify-center gap-2"><Link className="btn" to="/">Overview</Link><Link className="btn-ghost" to="/rwa-custody">RWA Custody</Link><Link className="btn-ghost" to="/circuit-breaker">Circuit Breaker</Link><Link className="btn-ghost" to="/audit">Audit</Link></div>
    </div>
  );
}
