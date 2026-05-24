import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { initSentry } from "@/lib/sentry";

// Initialize Sentry before React mounts so unhandled errors during the very
// first render are captured. No-ops cleanly when REACT_APP_SENTRY_DSN is not
// set (local dev, marketing-preview builds).
initSentry();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
