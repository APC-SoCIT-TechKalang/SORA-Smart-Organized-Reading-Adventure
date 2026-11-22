import "./index.css";
import ReactDOM from "react-dom/client";
import { lazy, Suspense } from "react";
import { App } from "./App";
import { KioskApp } from "./KioskApp";

const rootEl = document.getElementById("root");
// Draft preview: no reader provider, auth, or database calls.
const StatsDraft = lazy(() => import('./pages/ReadingStatsDraft'));
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    window.location.pathname === '/draft/reading-stats'
      ? <Suspense fallback={<p role="status">Loading draft preview…</p>}><StatsDraft /></Suspense>
      : window.location.pathname.startsWith('/kiosk') ? <KioskApp /> : <App />
  );
}
