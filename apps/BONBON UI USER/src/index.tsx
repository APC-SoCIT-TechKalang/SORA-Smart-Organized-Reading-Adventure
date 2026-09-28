import "./index.css";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { KioskApp } from "./KioskApp";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(window.location.pathname.startsWith('/kiosk') ? <KioskApp /> : <App />);
}
