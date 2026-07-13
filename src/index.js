import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";
import "@/index.css";
import App from "@/App";
import { initSentry } from "@/lib/sentry";
import * as serviceWorkerRegistration from "@/serviceWorkerRegistration";

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

// PWA app shell (production only). When a new deploy is waiting, offer a
// one-tap refresh instead of silently serving the old bundle forever.
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    toast("Update available", {
      description: "A new version of Student Companion is ready.",
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => {
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          window.location.reload();
        },
      },
    });
  },
});

