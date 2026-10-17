import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { WalletProvider } from "./components/wallet";
import { AppShell } from "./components/AppShell";
import DashboardPage from "./pages/DashboardPage";
import RWACustodyPage from "./pages/RWACustodyPage";
import CircuitBreakerPage from "./pages/CircuitBreakerPage";
import AuditPage from "./pages/AuditPage";
import NotFoundPage from "./pages/NotFoundPage";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/rwa-custody" element={<RWACustodyPage />} />
            <Route path="/circuit-breaker" element={<CircuitBreakerPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
);
