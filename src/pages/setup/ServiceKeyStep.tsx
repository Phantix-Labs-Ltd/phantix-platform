import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { AUDIT_CONTROL_STEP, SECURITY_DB_STEP, needsAuditControl } from "@/lib/firstRun";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * First-run step between audit control and the security database: the org's
 * service key is created automatically and shown exactly once.
 */
export default function ServiceKeyStep() {
  const { state, operate, requireDualControl, rotateServiceKey, toast } = useStore();
  const navigate = useNavigate();
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const started = useRef(false);

  const auditPending = needsAuditControl(state);
  const hadKey = Boolean(state.serviceKey?.active) && !secret;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      // Dual control on: creating a credential needs an operate session.
      // Solo mode: the API asks for a step-up code itself and retries.
      if (state.dualControl.configured && !operate.unlocked) {
        const ok = await requireDualControl("Creating your organization's service key requires a dual-control operate session.");
        if (!ok) {
          setError("The service key needs an operate session. Start one to continue.");
          return;
        }
      }
      setSecret(await rotateServiceKey());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the service key");
    } finally {
      setBusy(false);
    }
  };

  // Create it automatically, once, when the org has no key yet.
  useEffect(() => {
    if (started.current || auditPending || state.serviceKey?.active) return;
    started.current = true;
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditPending, state.serviceKey?.active]);

  if (auditPending) return <Navigate to={AUDIT_CONTROL_STEP} replace />;

  const copy = () => {
    if (!secret) return;
    try { void navigator.clipboard?.writeText(secret); } catch { /* clipboard unavailable */ }
    setCopied(true);
    toast("success", "Service key copied");
  };

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <header className="relative flex items-center justify-between px-4 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-9 w-9" />
          <span className="font-display text-[15px] font-bold text-white">{state.org.name || "SecureGraph"}</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:px-6">
        <div className="card p-7">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-400">Next step</p>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold text-white">
            <KeyRound size={20} className="text-gold-400" /> Your service key
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The applications use this key to act for your organization. It is created for you now and shown only once,
            so save it in your password manager before you continue.
          </p>

          {busy && (
            <p className="mt-6 flex items-center gap-2.5 text-sm text-slate-300">
              <Loader2 size={16} className="animate-spin text-gold-400" /> Creating your service key...
            </p>
          )}

          {secret && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 rounded-md border border-gold-400/30 bg-gold-400/[0.06] p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-gold-200">{secret}</code>
                <button type="button" onClick={copy} className="btn-ghost shrink-0 !px-2.5 !py-1.5 text-xs">
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[13px] text-severity-medium">
                You won't see this key again. If you lose it, rotate it from Identity and Keys.
              </p>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
                <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-[rgb(var(--gold-400))]" />
                I've saved the service key somewhere safe
              </label>
              <button type="button" disabled={!saved} onClick={() => navigate(SECURITY_DB_STEP)} className="btn-primary w-full !py-3">
                Continue to the security database <ArrowRight size={15} />
              </button>
            </div>
          )}

          {hadKey && !busy && (
            <div className="mt-6 space-y-4">
              <p className="flex items-center gap-2.5 text-sm text-emerald-300">
                <ShieldCheck size={16} /> Your organization already has a service key
                {state.serviceKey?.prefix ? <span className="font-mono text-slate-400">({state.serviceKey.prefix})</span> : null}.
              </p>
              <button type="button" onClick={() => navigate(SECURITY_DB_STEP)} className="btn-primary w-full !py-3">
                Continue to the security database <ArrowRight size={15} />
              </button>
            </div>
          )}

          {error && !busy && !secret && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-severity-critical">{error}</p>
              <button type="button" onClick={() => void create()} className="btn-primary">
                <KeyRound size={15} /> Create service key
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-sm">
          <Link to="/dashboard" className="text-slate-500 hover:text-slate-300">Skip to dashboard</Link>
        </p>
      </main>
    </div>
  );
}
