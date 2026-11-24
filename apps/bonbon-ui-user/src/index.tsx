import "./index.css";
import ReactDOM from "react-dom/client";
import { lazy, Suspense } from "react";
import { App } from "./App";
import { KioskApp } from "./KioskApp";
import { CheckoutKioskApp } from "./CheckoutKioskApp";
import { GameProvider } from "./contexts/GameContext";

const rootEl = document.getElementById("root");
// Retain the original stats URL with activation checks and recorded history.
const StatsDraft = lazy(() => import('./pages/ReadingStatsDraft'));
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    window.location.pathname === '/draft/reading-stats'
      ? <GameProvider><Suspense fallback={<p role="status">Loading reading stats…</p>}><StatsDraft /></Suspense></GameProvider>
      : window.location.pathname.startsWith('/kiosk') ? <KioskApp />
        : window.location.pathname.startsWith('/checkout') ? <CheckoutKioskApp /> : <App />
  );
}
