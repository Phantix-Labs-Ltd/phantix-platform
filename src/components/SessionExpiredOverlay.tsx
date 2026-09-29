import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";

/** Routes that already ARE the sign-in surface: the card must not cover them. */
const AUTH_PATHS = [
  "/login",
  "/register",
  "/password-reset",
  "/reset-password",
  "/device-confirm",
  "/change-password",
  "/setup",
  "/privacy",
  "/terms",
  "/aup",
  "/cookies",
];

/**
 * Shown when the app (company) session ends mid-use — a 401 cleared the bearer
 * tokens. Instead of an abrupt redirect to /login we hold the current page in
 * place under this card. "Sign back in" sends the user to /login carrying the
 * path they were on, so a successful sign-in returns them right back there.
 *
 * Note: this is the org/platform session, not the dual-control operate session
 * (which has its own DualControlOverlay).
 */
export default function SessionExpiredOverlay() {
  const { sessionExpired, logout } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  // Never cover the sign-in surface itself (e.g. the operator navigated to
  // /login directly while a stale token was still present).
  const onAuthRoute = AUTH_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );
  const open = sessionExpired.active && !onAuthRoute;

  // Keep the page behind the card from scrolling while it is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const signBackIn = () => {
    const from = sessionExpired.returnTo || "/dashboard";
    // Clear the dead session first so /login renders as signed out; the return
    // path travels with the navigation, not the session.
    logout();
    navigate("/login", { state: { from }, replace: true });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[96] flex items-center justify-center bg-phantix-950/85 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-expired-title"
          aria-describedby="session-expired-desc"
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-phantix-600/50 bg-phantix-900/95 shadow-card"
          >
            <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid opacity-40" />
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold-400/10 blur-3xl" />

            <div className="relative flex flex-col items-center px-6 pb-6 pt-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-400">
                <ShieldAlert size={26} />
              </span>
              <h2 id="session-expired-title" className="mt-4 font-display text-xl font-bold text-white">
                Session has expired
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                For your security, you have been signed out.
              </p>
              <p
                id="session-expired-desc"
                className="mt-4 flex w-full items-start gap-2.5 rounded-md border border-phantix-700/50 bg-phantix-950/60 px-3.5 py-3 text-left text-xs leading-5 text-slate-400"
              >
                <Clock size={14} className="mt-0.5 shrink-0 text-gold-400" />
                <span>
                  We are holding your place. Your session has ended, but you can pick up right where
                  you left off.
                </span>
              </p>
            </div>

            <div className="relative border-t border-phantix-700/50 px-6 py-5">
              <button type="button" className="btn-primary w-full !py-3" onClick={signBackIn} autoFocus>
                Sign back in
                <ArrowRight size={15} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
