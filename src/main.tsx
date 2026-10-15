import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { bootstrapTheme } from "./lib/theme";
// Geist + Geist Mono — self-hosted variable woff2, loaded first
// so the app never flashes a fallback face.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { initAnalytics } from "./lib/analytics";
import { loadBrandTokens } from "./lib/branding";
import "./index.css";

bootstrapTheme();
initAnalytics();
loadBrandTokens();

// A deploy replaces the hashed chunks. A tab still running the previous index
// then asks for a chunk that no longer exists, the dynamic import rejects, and
// React surfaces a confusing "Lazy" crash. Vite fires `vite:preloadError` for
// exactly this: reload once to pick up the new build (guarded so a genuinely
// missing chunk cannot loop the tab).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "phantix_chunk_reload_at";
  try {
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable: reload anyway */
  }
  window.location.reload();
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p style='padding:2rem;font-family:system-ui'>Missing #root element.</p>";
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      {/* reducedMotion="user" drops transform/layout animation for anyone who
          asked the OS for calmer motion; quick opacity fades still carry the
          reveal so content never snaps in (Learn UI — reduced motion). */}
      <MotionConfig reducedMotion="user">
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </MotionConfig>
    </React.StrictMode>,
  );
}
