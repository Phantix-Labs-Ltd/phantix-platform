import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { APPLICATIONS_STEP } from "@/lib/firstRun";
import { PLAN_CHOICES, readPlanChoice, writePlanChoice, type PlanChoice } from "@/lib/planChoice";
import {
  clearPaymentReturnParams, returningPaymentId, startPlanCheckout, verifyPayment, type BillingCycle,
} from "@/lib/billingCheckout";
import { cx, formatNaira } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

interface LivePlan { key: string; name: string; list_price_ngn: number | null; features?: string[] }
interface Entitlements { billing_enforcement?: { enabled?: boolean } }
interface Subscription { status?: string; plan?: string }

/**
 * First-run step, production only: choose a billing plan and pay for it.
 *
 * Free continues straight on. Starter and Growth go to Paystack checkout
 * ("Add payment") and come back here, where the payment is verified before
 * moving on. With billing enforcement off (staging, development) every
 * application is open anyway, so the step skips itself.
 */
export default function PlanStep() {
  const { state, session, toast, requireDualControl } = useStore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "choose" | "verifying" | "paid">("loading");
  const [plans, setPlans] = useState<LivePlan[]>([]);
  const [picked, setPicked] = useState<PlanChoice>(() => readPlanChoice() ?? "starter");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [busy, setBusy] = useState(false);
  const [paidPlan, setPaidPlan] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (DEMO_MODE) { setPhase("choose"); return; }
    void (async () => {
      const [ent, planRes, sub] = await Promise.all([
        api.get<Entitlements>("/billing/entitlements").catch(() => null),
        api.get<unknown>("/billing/plans").catch(() => null),
        api.get<Subscription>("/billing/subscription").catch(() => null),
      ]);
      if (ent?.billing_enforcement?.enabled !== true) {
        navigate(APPLICATIONS_STEP, { replace: true });
        return;
      }
      const list = Array.isArray(planRes) ? planRes : (planRes as { plans?: LivePlan[] } | null)?.plans;
      setPlans(Array.isArray(list) ? (list as LivePlan[]) : []);

      // Back from Paystack: verify, then move on.
      const paymentId = returningPaymentId();
      if (paymentId) {
        setPhase("verifying");
        try {
          await verifyPayment(paymentId);
          clearPaymentReturnParams();
          const fresh = await api.get<Subscription>("/billing/subscription").catch(() => null);
          setPaidPlan(fresh?.plan ?? readPlanChoice());
          setPhase("paid");
          toast("success", "Payment confirmed", "Your plan is active.");
        } catch (err) {
          clearPaymentReturnParams();
          setPhase("choose");
          toast("error", "Payment not confirmed", err instanceof Error ? err.message : "Try again, or pay later from Billing.");
        }
        return;
      }
      if (sub?.status === "active" && sub.plan && sub.plan !== "free") {
        setPaidPlan(sub.plan);
        setPhase("paid");
        return;
      }
      setPhase("choose");
    })();
  }, [navigate, toast]);

  const priceFor = (key: PlanChoice): number | null => {
    const live = plans.find((p) => p.key === key)?.list_price_ngn;
    const monthly = live ?? PLAN_CHOICES.find((p) => p.key === key)?.priceNgn ?? null;
    if (monthly == null) return null;
    return cycle === "yearly" ? monthly * 10 : monthly;
  };

  const continueFree = () => {
    writePlanChoice("free");
    navigate(APPLICATIONS_STEP);
  };

  const addPayment = async () => {
    if (picked === "free") return continueFree();
    writePlanChoice(picked);
    if (!(await requireDualControl("Subscribing to a plan requires a dual-control operate session."))) return;
    setBusy(true);
    try {
      const res = await startPlanCheckout({
        plan: picked,
        cycle,
        email: session?.email || state.org.email || "",
        returnPath: "/get-started/plan",
      });
      if (res.redirected) return; // on the way to Paystack
      if (!res.paymentId) toast("error", "Checkout not started", "Try again, or pay later from Billing.");
      else toast("info", "Complete the payment", res.accessCode ? `Paystack access code: ${res.accessCode}.` : "Then come back to this page.");
    } catch (err) {
      toast("error", "Checkout not started", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  const chosen = PLAN_CHOICES.find((p) => p.key === picked)!;

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

      <main className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-400">Next step</p>
        <h1 className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold text-white">
          <CreditCard size={20} className="text-gold-400" /> Choose your plan
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Your plan decides which applications and how much testing you get. Start on Free, or add a payment method to
          start Starter or Growth now. You can change plan any time from Billing.
        </p>

        {phase === "loading" || phase === "verifying" ? (
          <div className="card mt-6 flex items-center gap-2.5 p-6 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin text-gold-400" />
            {phase === "verifying" ? "Confirming your payment..." : "Loading plans..."}
          </div>
        ) : phase === "paid" ? (
          <div className="card mt-6 p-6">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 size={16} /> You're on {PLAN_CHOICES.find((p) => p.key === paidPlan)?.name ?? paidPlan ?? "a paid plan"}.
            </p>
            <button type="button" onClick={() => navigate(APPLICATIONS_STEP)} className="btn-primary mt-5 w-full !py-3">
              Continue: choose your applications <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 inline-flex rounded-md border border-phantix-700/60 p-0.5" role="group" aria-label="Billing cycle">
              {(["monthly", "yearly"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  aria-pressed={cycle === c}
                  className={cx("rounded px-3 py-1.5 text-sm", cycle === c ? "bg-gold-400/15 text-gold-200" : "text-slate-400 hover:text-slate-200")}
                >
                  {c === "monthly" ? "Monthly" : "Yearly (2 months free)"}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {PLAN_CHOICES.map((p) => {
                const on = picked === p.key;
                const price = priceFor(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPicked(p.key)}
                    aria-pressed={on}
                    className={cx(
                      "card relative flex flex-col items-start p-5 text-left transition-colors",
                      on ? "border-gold-400/60 bg-gold-400/[0.06]" : "hover:border-phantix-600",
                    )}
                  >
                    <span className={cx("absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border", on ? "border-gold-400 bg-gold-400 text-phantix-950" : "border-phantix-600 text-transparent")}>
                      <Check size={14} />
                    </span>
                    <span className="flex items-center gap-2 pr-8 font-display text-base font-bold text-white">
                      {p.name}
                      {p.highlight && <span className="rounded bg-gold-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-gold-300">Popular</span>}
                    </span>
                    <span className="mt-2 font-display text-xl font-bold text-white">
                      {price === 0 ? "Free" : price == null ? "—" : formatNaira(price)}
                      {price ? <span className="ml-1 text-[13px] font-normal text-slate-400">{cycle === "yearly" ? "/year" : "/month"}</span> : null}
                    </span>
                    <span className="mt-1 text-[13px] text-slate-400">{p.tagline}</span>
                    <ul className="mt-3 space-y-1.5">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-[13px] text-slate-300">
                          <Check size={13} className="mt-0.5 shrink-0 text-gold-400" /> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {picked === "free" ? (
              <button type="button" onClick={continueFree} className="btn-primary mt-6 w-full !py-3">
                Continue on Free <ArrowRight size={15} />
              </button>
            ) : (
              <>
                <button type="button" onClick={() => void addPayment()} disabled={busy} className="btn-primary mt-6 w-full !py-3">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                  {busy ? "Opening checkout..." : `Add payment and start ${chosen.name}`}
                </button>
                <p className="mt-2 text-center text-[13px] text-slate-400">
                  Secure checkout with Paystack. You come back here once the payment goes through.
                </p>
                <button type="button" onClick={continueFree} className="mx-auto mt-3 block text-sm text-slate-500 hover:text-slate-300">
                  Start on Free instead
                </button>
              </>
            )}
          </>
        )}

        <p className="mt-6 text-center text-sm">
          <Link to="/dashboard" className="text-slate-500 hover:text-slate-300">Skip to dashboard</Link>
        </p>
      </main>
    </div>
  );
}
