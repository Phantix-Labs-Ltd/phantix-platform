import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, ShieldCheck, User, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { errorCode } from "@/lib/api";
import { ENABLE_DUAL_CONTROL_STEP, nextAfterApprovals } from "@/lib/firstRun";
import { loadDualControlPolicy, setDualControlPolicy, type DualControlPolicy } from "@/lib/dualControlPolicy";
import { cx } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

type Choice = "solo" | "dual";

/**
 * First-run step after the Quick Scan: how sensitive changes are approved.
 * Solo mode lets one person act and confirm sensitive actions with a code.
 * Dual control has a second person (the authorizer) approve them, which needs
 * the initiator and authorizer roles: with nobody assigned yet, People opens to
 * assign them and turns dual control on once they are.
 */
export default function ApprovalsStep() {
  const { state, toast, hydrateSession } = useStore();
  const navigate = useNavigate();
  const [policy, setPolicy] = useState<DualControlPolicy | null | undefined>(undefined);
  const [choice, setChoice] = useState<Choice>("solo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDualControlPolicy(state.dualControl.policy_mode ?? "off").then((p) => {
      setPolicy(p);
      if (p && p.mode !== "off") setChoice("dual");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enforced = policy?.mode === "enforced";
  const current: Choice = policy && policy.mode !== "off" ? "dual" : "solo";

  const next = async () => {
    setError(null);
    // A backend without the policy, or nothing to change: carry on.
    if (!policy || choice === current) return navigate(nextAfterApprovals(state));
    if (choice === "dual" && !state.dualControl.configured) return navigate(ENABLE_DUAL_CONTROL_STEP);
    setBusy(true);
    try {
      const updated = await setDualControlPolicy(choice === "dual" ? "on" : "off");
      if (updated.pending_change) toast("info", "Sent to your authorizer", "Dual control stays on until they approve.");
      else toast("success", choice === "dual" ? "Dual control on" : "Solo mode on");
      await hydrateSession();
      navigate(nextAfterApprovals({ ...state, dualControl: { ...state.dualControl, policy_mode: updated.mode } }));
    } catch (err) {
      setError(errorCode(err) === "dual_control_slots_missing"
        ? "Add a second person and assign the initiator and authorizer roles first."
        : err instanceof Error ? err.message : "Could not save the choice");
    } finally {
      setBusy(false);
    }
  };

  const options: { id: Choice; icon: React.ReactNode; title: string; body: string; note?: string }[] = [
    {
      id: "solo",
      icon: <User size={18} />,
      title: "Solo mode",
      body: "You act on your own. Sensitive actions, such as starting a VAPT or changing a database, ask for a code from your email.",
      note: "Good for a small team. You can turn on dual control later from Identity.",
    },
    {
      id: "dual",
      icon: <Users size={18} />,
      title: "Dual control",
      body: "A second person, the authorizer, approves sensitive actions before they run. Every approval is in the audit trail.",
      note: state.dualControl.configured
        ? "Your initiator and authorizer are assigned."
        : "Next, you add a second person and choose who starts sensitive actions and who approves them.",
    },
  ];

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <header className="relative flex items-center justify-between px-4 py-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-9 w-9 shrink-0" />
          <span className="truncate font-display text-[15px] font-bold text-white">{state.org.name || "SecureGraph"}</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:px-6">
        <div className="mb-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-400">Next step</p>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold text-white">
            <ShieldCheck size={20} className="text-gold-400" /> How should sensitive changes be approved?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Choose how your organization confirms actions such as active testing, database changes and deleting data.
            You can change this later from Identity.
          </p>
        </div>

        {policy === undefined ? (
          <p className="card flex items-center gap-2 p-5 text-sm text-slate-400"><Loader2 size={15} className="animate-spin text-gold-400" /> Loading...</p>
        ) : (
          <>
            {enforced && (
              <p className="mb-3 rounded-md border border-gold-400/30 bg-gold-400/5 px-4 py-3 text-sm text-slate-300">
                Your plan requires dual control, so it stays on.
              </p>
            )}
            <div role="radiogroup" aria-label="Approvals" className="space-y-3">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={choice === o.id}
                  disabled={enforced || busy}
                  onClick={() => setChoice(o.id)}
                  className={cx(
                    "card flex w-full items-start gap-4 p-5 text-left transition-colors disabled:cursor-not-allowed",
                    choice === o.id ? "border-gold-400/60 bg-gold-400/[0.05]" : "hover:border-phantix-500/60",
                  )}
                >
                  <span className={cx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", choice === o.id ? "bg-gold-400/15 text-gold-400" : "bg-phantix-800/70 text-slate-400")}>{o.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-white">
                      {o.title}
                      {current === o.id && <span className="chip border-emerald-400/30 bg-emerald-400/10 text-[11px] text-emerald-300">Current</span>}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-400">{o.body}</span>
                    {o.note && <span className="mt-1.5 block text-[13px] text-slate-500">{o.note}</span>}
                  </span>
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-severity-critical">{error}</p>}
            <button type="button" onClick={() => void next()} disabled={busy} className="btn-primary mt-5 w-full !py-3">
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {choice === "dual" && !state.dualControl.configured && current !== "dual" ? "Add your second person" : "Continue"} <ArrowRight size={15} />
            </button>
          </>
        )}

        <p className="mt-4 text-center text-sm">
          <Link to="/dashboard" className="text-slate-500 hover:text-slate-300">Skip to dashboard</Link>
        </p>
      </main>
    </div>
  );
}
