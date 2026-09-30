import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Mail, KeyRound, ArrowRight, Send, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { DEMO_MODE, ApiError, throttleSeconds } from "@/lib/api";
import { humanize } from "@/lib/utils";
import { APP_DEMO_URL } from "@/lib/links";
import { BrandWordmark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import AuthShowcase from "@/components/AuthShowcase";
import { PasswordInput } from "@/components/ui";

function NewsletterField() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscribe = () => {
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSubscribed(true);
  };

  return (
    <div className="border-t border-phantix-700/40 pt-4">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-400">
        Security insights in your inbox
      </p>
      {subscribed ? (
        <p className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-400">
          You're on the list. Watch your inbox for a welcome note.
        </p>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !pl-9 !py-2 text-xs"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    subscribe();
                  }
                }}
                placeholder="you@company.com"
                aria-label="Newsletter email"
              />
            </div>
            <button type="button" onClick={subscribe} className="btn-secondary !px-3 !py-2" aria-label="Subscribe" title="Subscribe">
              <Send size={14} />
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-severity-critical">{error}</p>}
        </>
      )}
    </div>
  );
}

export default function Login() {
  const { login, verifyMfa, resendLoginOtp, state } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"password" | "mfa">("password");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destinationMasked, setDestinationMasked] = useState("");
  // 429 login throttle (§8) — wait out the lock; never present as a wrong password.
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const locked = lockedUntil != null;
  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [locked]);
  const retryIn = lockedUntil != null ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  // Return the user to wherever they were before the session dropped (set by
  // RequireManagement / SessionExpiredOverlay); otherwise go to the usual landing.
  const fromState = (location.state as { from?: unknown } | null)?.from;
  const fromPath =
    typeof fromState === "string"
      ? fromState
      : fromState && typeof fromState === "object"
        ? `${(fromState as { pathname?: string }).pathname ?? ""}${(fromState as { search?: string }).search ?? ""}${(fromState as { hash?: string }).hash ?? ""}`
        : "";
  const destination = () => {
    if (fromPath && fromPath !== "/login") return fromPath;
    return state.setup.setup_complete ? "/dashboard" : "/setup";
  };

  const resend = async () => {
    if (resending) return;
    setError(null);
    setResending(true);
    try {
      const res = await resendLoginOtp(email, password);
      setDestinationMasked(res.destinationMasked || "");
      setCode("");
      setError("A new code was sent. Enter the latest code.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (stage === "password") {
        const res = await login(email, password);
        if (res.mfaRequired) {
          // Prefer the API-masked destination when the server returns one.
          if (res.destinationMasked) setDestinationMasked(res.destinationMasked);
          setStage("mfa");
        }
        else if (res.mustChangePassword) navigate("/change-password", { replace: true });
        else navigate(destination());
      } else {
        await verifyMfa(code);
        navigate(destination());
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.status === 429) {
        const secs = throttleSeconds(apiErr) ?? 60;
        setLockedUntil(Date.now() + secs * 1000);
        setError("Too many failed attempts. Try again shortly.");
      } else {
        setLockedUntil(null);
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const lockedMessage = () => (retryIn > 0 ? `Too many failed attempts. Try again in ${retryIn}s.` : error ?? "");

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-phantix-950">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-phantix-600/20 blur-[130px]" />
      </div>

      <div className="relative z-10 w-full lg:grid lg:min-h-screen lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <AuthShowcase />

        <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10 bg-phantix-850 lg:border-l lg:border-phantix-700">
          <div className="absolute right-6 top-6 z-20"><ThemeToggle /></div>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-8 text-center">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="mx-auto">
                <BrandWordmark className="mx-auto block h-12" />
              </motion.div>
              <p className="mt-1.5 text-sm text-slate-400">Company or admin sign-in</p>
            </div>

            <div className="card p-7">
              {error && (
                <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-3.5 py-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-severity-critical" />
                  <p className="text-sm leading-5 text-severity-critical">{humanize(lockedMessage())}</p>
                </div>
              )}
              <AnimatePresence mode="wait">
                {stage === "password" ? (
                  <motion.form key="pw" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} onSubmit={submit} className="space-y-4">
                    <div>
                      <label className="label">Primary (company) email</label>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input className="input !pl-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@company.com" />
                      </div>
                      <p className="mt-1 text-[12px] text-slate-500">
                        Platform access is reserved for the organization's primary user. Everyone
                        else works in the applications.
                      </p>
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <PasswordInput
                        leadingIcon={<KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />}
                        className="input !pl-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                    <button className="btn-primary w-full !py-3" disabled={busy || retryIn > 0}>
                      {busy ? "Checking..." : retryIn > 0 ? `Try again in ${retryIn}s` : "Continue"} {retryIn === 0 && <ArrowRight size={15} />}
                    </button>
                    <p className="text-center text-xs text-slate-500">
                      <Link to="/password-reset" className="text-gold-400 hover:text-gold-300">Forgot password?</Link>
                    </p>
                    <p className="text-center text-xs text-slate-500">
                      New tenant?{" "}
                      <Link to="/register" className="text-gold-400 hover:text-gold-300">Register your organization</Link>
                    </p>
                    <NewsletterField />
                    <p className="text-center text-[13px] text-slate-600">
                      <Link to="/terms" className="hover:text-slate-400">Terms of Service</Link>
                      {" · "}
                      <Link to="/aup" className="hover:text-slate-400">AUP</Link>
                      {" · "}
                      <Link to="/privacy" className="hover:text-slate-400">Privacy</Link>
                    </p>
                  </motion.form>
                ) : (
                  <motion.form key="mfa" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} onSubmit={submit} className="space-y-4">
                    <div className="rounded-md border border-phantix-600/40 bg-phantix-800/40 p-3.5 text-center">
                      <ShieldCheck size={22} className="mx-auto text-gold-400" />
                      <p className="mt-2 text-sm font-medium text-slate-200">Email verification</p>
                      <p className="mt-1 text-xs text-slate-500">A 6-digit code was sent to {destinationMasked || email.replace(/(.{2}).+(@.+)/, "$1***$2")}</p>
                    </div>
                    <input
                      className="input text-center font-mono !text-xl !tracking-[0.5em]"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="••••••"
                      autoFocus
                    />
                    <button className="btn-primary w-full !py-3" disabled={busy || retryIn > 0 || code.length !== 6}>
                      {busy ? "Verifying..." : retryIn > 0 ? `Try again in ${retryIn}s` : "Verify and sign in"}
                    </button>
                    <button type="button" onClick={() => void resend()} disabled={resending || retryIn > 0} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">
                      {resending ? "Resending..." : "Resend code"}
                    </button>
                    <button type="button" onClick={() => setStage("password")} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">
                      ← Use a different account
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {DEMO_MODE && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-5 rounded-md border border-gold-400/20 bg-gold-400/6 px-4 py-3 text-center text-xs leading-5 text-gold-300/80">
                <strong>Demo mode</strong> --- any email and any 6-digit code works. Set{" "}
                 live API configuration.
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-4 flex flex-col items-center gap-1.5 text-center"
            >
              <p className="text-xs text-slate-500">Looking for the product demo?</p>
              <a
                href={APP_DEMO_URL}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gold-400 hover:text-gold-300"
              >
                Explore the Command Centre demo →
              </a>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
