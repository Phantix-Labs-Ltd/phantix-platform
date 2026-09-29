import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CreditCard, CheckCircle2, Download, Ticket, AlertTriangle, RefreshCw, DollarSign, Lock, Sparkle } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, CollapsibleCard, StatusBadge, Modal, Spinner, PageHeaderSkeleton, SkeletonCard } from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { useStore } from "@/lib/store";
import { formatNaira, timeAgo, cx, humanize } from "@/lib/utils";
import { UPSELL_FEATURES, upsellFor, upsellPlanLabel } from "@/lib/upsell";
import { readPlanChoice } from "@/lib/planChoice";

interface Entitlements {
  billing_enforcement: { enabled: boolean; mode: string; environment: string; free_asset_cap?: number; free_org_user_cap?: number; free_report_formats?: string[] };
  premium_active: boolean;
  full_access_coupon: any;
  subscription: any;
  packs: any[];
  message: string;
  // Headroom left on the Free plan — same GET /billing/entitlements response
  // the Command Centre app used to read these two fields from.
  assets_remaining_free?: number | null;
  org_users_remaining_free?: number | null;
}
interface PricingInfo { monthly_list_price_ngn: number; first_month_price_ngn: number; subsequent_monthly_price_ngn: number; yearly_price_ngn: number; first_month_discount_percent: number; }
interface SubscriptionInfo { id: number; status: string; billing_cycle: string; grant_source: string; current_period_start: string; current_period_end: string; plan?: string; }
interface PaymentInfo { id: number; reference: string; amount_due_ngn: number; status: string; purpose: string; discount_percent: number; created_at: string; }
interface PlanInfo {
  key: string;
  name: string;
  list_price_ngn: number | null;
  sales_motion?: string;
  allowances?: { ai_credits_mo?: number | null };
  credit_allotment?: number | null;
  features?: string[];
}
interface CreditBundle { credits: number; price_ngn?: number | null; currency?: string }
interface CreditBalance {
  buckets: Record<string, number>;
  total: number;
  cycle: string;
  plan?: string | null;
  plan_name?: string | null;
  ai_credits_mo?: number | null;
  exhausted?: boolean;
  low?: boolean;
  top_up_required?: boolean;
  bundles: CreditBundle[];
}

const PENDING_PAYMENT_KEY = "phantix_pending_payment_id";

const demoEntitlements: Entitlements = { billing_enforcement: { enabled: true, mode: "auto", environment: "production" }, premium_active: false, full_access_coupon: null, subscription: null, packs: [], message: "Dev mode" };
const demoPricing: PricingInfo = { monthly_list_price_ngn: 9900, first_month_price_ngn: 4950, subsequent_monthly_price_ngn: 9900, yearly_price_ngn: 99000, first_month_discount_percent: 50 };
const demoSubscription: SubscriptionInfo = { id: 1, status: "active", billing_cycle: "monthly", grant_source: "payment", current_period_start: "2026-07-01T00:00:00Z", current_period_end: "2026-08-01T00:00:00Z", plan: "starter" };
const demoCredits: CreditBalance = {
  buckets: { allowance: 2500, allotment: 3000, topup: 0 },
  total: 5500,
  cycle: "2026-09",
  plan: "starter",
  plan_name: "Starter",
  ai_credits_mo: 3000,
  bundles: [
    { credits: 500, price_ngn: 5000, currency: "NGN" },
    { credits: 2000, price_ngn: 18000, currency: "NGN" },
    { credits: 5000, price_ngn: 40000, currency: "NGN" },
  ],
};

function normalizePayments(raw: unknown): PaymentInfo[] {
  if (Array.isArray(raw)) return raw as PaymentInfo[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: PaymentInfo[] }).items;
  }
  return [];
}

function normalizePlans(raw: unknown): PlanInfo[] {
  if (Array.isArray(raw)) return raw as PlanInfo[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { plans?: unknown }).plans)) {
    return (raw as { plans: PlanInfo[] }).plans;
  }
  return [];
}

export default function Billing() {
  const { state, toast, session, requireDualControl } = useStore();
  const [params] = useSearchParams();
  // Every upgrade CTA elsewhere in the product (Command Centre included) links
  // here with ?feature=<key> so the page can say "this is what you were
  // trying to do" instead of a generic pitch.
  const featureKey = params.get("feature");
  const upsellReason = params.get("reason");
  const up = upsellFor(featureKey);
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [gatewayPublicKey, setGatewayPublicKey] = useState("");
  const [selectedCycle, setSelectedCycle] = useState<"monthly" | "yearly">("monthly");
  // Which self-serve plan is being bought. The backend prices per plan, so the
  // page must say which one — a single legacy price is what made "upgrade"
  // impossible before.
  // Which plan is being bought. The setup wizard hands its choice over as
  // ?plan=; the stored setup choice is the fallback so a direct visit still
  // opens on the plan the operator picked.
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "growth">(() => {
    const param = params.get("plan");
    if (param === "growth" || param === "starter") return param;
    return readPlanChoice() === "growth" ? "growth" : "starter";
  });
  const [busy, setBusy] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [showCoupon, setShowCoupon] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (DEMO_MODE) {
        setEntitlements(demoEntitlements);
        setPricing(demoPricing);
        setSubscription(demoSubscription);
        setCredits(demoCredits);
        setPlans([
          { key: "free", name: "Free", list_price_ngn: 0 },
          { key: "starter", name: "Starter", list_price_ngn: 9900 },
          { key: "growth", name: "Growth", list_price_ngn: 19900 },
          { key: "enterprise", name: "Enterprise", list_price_ngn: null },
        ]);
        setPayments([]);
        setLoading(false);
        return;
      }
      const [entRes, priceRes, plansRes, creditsRes, gwRes] = await Promise.all([
        api.get<any>("/billing/entitlements").catch(() => null),
        api.get<PricingInfo>("/billing/pricing").catch(() => null),
        api.get<unknown>("/billing/plans").catch(() => null),
        api.get<CreditBalance>("/billing/credits").catch(() => null),
        api.get<any>("/billing/gateway").catch(() => null),
      ]);
      setEntitlements(entRes);
      setPricing(priceRes);
      setPlans(normalizePlans(plansRes));
      setCredits(creditsRes);
      if (gwRes?.public_key) setGatewayPublicKey(gwRes.public_key);
      api.get<SubscriptionInfo>("/billing/subscription").then(setSubscription).catch(() => setSubscription(null));
      api.get<unknown>("/billing/payments").then((r) => setPayments(normalizePayments(r))).catch(() => {});
    } catch { /* keep prior */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleVerify = useCallback(async (paymentId: number, opts?: { silent?: boolean }) => {
    try {
      // authClearOn401: false --- a declined/expired gateway verification comes
      // back as a 401 from this endpoint, but it's a payment outcome, not an
      // auth failure. Without this the global 401 handler would tear down the
      // whole org session, signing the user out mid-session over a failed
      // payment check (see api.ts's `request`).
      await api.post(`/billing/payments/${paymentId}/verify`, {}, { dualControl: true, authClearOn401: false });
      if (!opts?.silent) toast("success", "Payment verified");
      try { sessionStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* ignore */ }
      setPayingId(null);
      await loadData();
    } catch (e) {
      if (!opts?.silent) {
        toast("error", "Verification failed", e instanceof Error ? e.message : undefined);
        window.open("/docs/howto-platform-11", "_blank", "noopener,noreferrer");
      }
    }
  }, [loadData, toast]);

  // Auto-verify after Paystack return (?reference= / ?trxref= / ?payment_id=) or stashed id.
  useEffect(() => {
    if (DEMO_MODE || loading) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref") || "";
    const paymentParam = params.get("payment_id") || params.get("payment") || "";
    let pendingId: number | null = null;
    if (/^\d+$/.test(paymentParam)) pendingId = Number(paymentParam);
    if (!pendingId && reference) {
      const match = payments.find((p) => p.reference === reference);
      if (match) pendingId = match.id;
    }
    if (!pendingId) {
      try {
        const stashed = sessionStorage.getItem(PENDING_PAYMENT_KEY);
        if (stashed && /^\d+$/.test(stashed)) pendingId = Number(stashed);
      } catch { /* ignore */ }
    }
    if (!pendingId) return;

    const stripQuery = () => {
      const url = new URL(window.location.href);
      ["reference", "trxref", "payment_id", "payment"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    };

    void (async () => {
      setPayingId(pendingId!);
      await handleVerify(pendingId!, { silent: false });
      stripQuery();
    })();
    // Run once payments/load settle; avoid re-firing on every payments change after strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, payments.length]);

  const handleSubscribe = async (planOverride?: "starter" | "growth") => {
    if (!(await requireDualControl("Subscribing requires a dual-control operate session."))) return;
    setBusy(true);
    try {
      const res = await api.post<any>(
        "/billing/subscribe",
        { billing_cycle: selectedCycle, plan: planOverride ?? selectedPlan },
        { dualControl: true },
      );
      const paymentId = res?.payment?.id;
      if (paymentId) {
        setPayingId(paymentId);
        try { sessionStorage.setItem(PENDING_PAYMENT_KEY, String(paymentId)); } catch { /* ignore */ }
        const initRes = await api.post<any>(`/billing/payments/${paymentId}/initialize`, {
          email: session?.email || state.org.email || "",
          callback_url: `${window.location.origin}/billing`,
          ...(gatewayPublicKey ? {} : {}),
        }, { dualControl: true });
        if (initRes?.authorization_url) window.location.href = initRes.authorization_url;
        else toast("info", "Paystack", `Access code: ${initRes?.access_code ?? "N/A"} — complete payment then click Verify below`);
      }
    } catch (e) { toast("error", "Subscribe failed", e instanceof Error ? e.message : ""); }
    finally { setBusy(false); }
  };

  const handleCreditTopUp = async (bundle: number) => {
    if (!(await requireDualControl("Buying AI credits requires a dual-control operate session."))) return;
    setTopUpBusy(bundle);
    try {
      const res = await api.post<any>(
        "/billing/credits/top-up/checkout",
        {
          bundle,
          email: session?.email || state.org.email || "",
          callback_url: `${window.location.origin}/billing`,
        },
        { dualControl: true },
      );
      const paymentId = res?.payment?.id;
      if (paymentId) {
        setPayingId(paymentId);
        try { sessionStorage.setItem(PENDING_PAYMENT_KEY, String(paymentId)); } catch { /* ignore */ }
      }
      if (res?.authorization_url) window.location.href = res.authorization_url;
      else if (res?.access_code) toast("info", "Paystack", `Access code: ${res.access_code} — complete payment then click Verify`);
      else toast("error", "Top-up failed", "No Paystack session returned");
    } catch (e) {
      toast("error", "Top-up failed", e instanceof Error ? e.message : "");
    } finally {
      setTopUpBusy(null);
    }
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) return;
    if (!(await requireDualControl("Redeeming a beta code requires a dual-control operate session."))) return;
    setBusy(true);
    try { await api.post("/billing/coupons/redeem", { code: couponCode.trim() }, { dualControl: true }); toast("success", "Coupon redeemed", "Full access activated"); setShowCoupon(false); setCouponCode(""); loadData(); } catch (e) { toast("error", "Redeem failed", e instanceof Error ? e.message : "Invalid or already redeemed code"); }
    finally { setBusy(false); }
  };

  const handleCancel = async () => {
    if (!(await requireDualControl("Cancelling the subscription requires a dual-control operate session."))) return;
    try { await api.post("/billing/subscription/cancel", {}, { dualControl: true }); toast("warning", "Cancelled", "Auto-renew cancelled — access continues to period end"); setShowCancelConfirm(false); loadData(); } catch (e) { toast("error", "Failed"); }
  };

  if (loading) {
    return (
      <div>
        <PageHeaderSkeleton actions />
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="skeleton h-6 w-28 rounded-full" />
          <div className="skeleton h-3 w-40 rounded" />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonCard className="h-72" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    );
  }

  const starterPlan = plans.find((p) => p.key === "starter");
  const growthPlan = plans.find((p) => p.key === "growth");
  const planKey = String(subscription?.plan || entitlements?.subscription?.plan || "").toLowerCase();
  const activePlan = plans.find((p) => p.key === planKey);
  const isPremium = Boolean(entitlements?.premium_active) || subscription?.status === "active";
  const isPastDue = subscription?.status === "past_due";
  const isGrace = (entitlements as any)?.subscription?.in_grace_period || isPastDue;
  const daysUntilEnd = subscription?.current_period_end ? Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / 86400000) : null;
  const expiringSoon = isPremium && daysUntilEnd !== null && daysUntilEnd <= 5 && daysUntilEnd >= 0;
  const isCoupon = subscription?.grant_source === "coupon";

  const planLabel = activePlan?.name
    || (isPremium ? (planKey === "growth" ? "Growth" : planKey === "enterprise" ? "Enterprise" : "Starter") : "Free");
  const featureList = (isPremium
    ? (activePlan?.features?.length ? activePlan.features : growthPlan?.features || starterPlan?.features)
    : plans.find((p) => p.key === "free")?.features)
    ?? ["All product modules", "Unlimited campaigns & scans", "Verified-only PDF/DOCX reports", "Dual-control + audit exports", "WA/Telegram alert channels", "AI-assisted remediation"];

  const enforcementOn = entitlements?.billing_enforcement?.enabled === true;
  const ALL_REPORT_FORMATS = ["json", "csv", "markdown", "pdf", "docx", "xlsx", "html", "pptx"];
  const freeFormats = new Set((entitlements?.billing_enforcement?.free_report_formats ?? ALL_REPORT_FORMATS).map(f => f.toLowerCase()));
  const reportFormats: { fmt: string; label: string; free: boolean }[] = [
    { fmt: "json", label: "JSON", free: freeFormats.has("json") },
    { fmt: "csv", label: "CSV", free: freeFormats.has("csv") },
    { fmt: "markdown", label: "Markdown", free: freeFormats.has("markdown") || freeFormats.has("md") },
    { fmt: "pdf", label: "PDF", free: freeFormats.has("pdf") },
    { fmt: "docx", label: "DOCX", free: freeFormats.has("docx") },
    { fmt: "xlsx", label: "XLSX", free: freeFormats.has("xlsx") },
    { fmt: "html", label: "HTML", free: freeFormats.has("html") },
    { fmt: "pptx", label: "PPTX", free: freeFormats.has("pptx") },
  ];
  const canDownload = (fmt: string) => !enforcementOn || isPremium || freeFormats.has(fmt.toLowerCase());

  const creditBundles = credits?.bundles?.length
    ? credits.bundles
    : [
        { credits: 500, price_ngn: undefined },
        { credits: 2000, price_ngn: undefined },
        { credits: 5000, price_ngn: undefined },
      ];

  // Per-tier pricing for the comparison row. Only Starter carries the
  // first-month promo (from /billing/pricing); every other paid tier prices
  // straight off its own list_price_ngn, same as the backend contract.
  function tierPricing(key: string, plan: PlanInfo | undefined) {
    const list = plan?.list_price_ngn ?? null;
    if (list == null) return null;
    if (key === "starter") {
      const monthly = selectedCycle === "monthly" ? (pricing?.first_month_price_ngn ?? list) : list * 10;
      const note = selectedCycle === "monthly"
        ? `then ${formatNaira(pricing?.subsequent_monthly_price_ngn ?? list)}/mo`
        : "billed yearly";
      return { monthly, note };
    }
    const monthly = selectedCycle === "monthly" ? list : list * 10;
    return { monthly, note: selectedCycle === "monthly" ? "per month" : "billed yearly" };
  }

  const freePlan = plans.find((p) => p.key === "free");
  const enterprisePlan = plans.find((p) => p.key === "enterprise");
  const tierCards: { key: string; plan: PlanInfo | undefined; purchasable: boolean }[] = [
    { key: "free", plan: freePlan ?? { key: "free", name: "Free", list_price_ngn: 0 }, purchasable: false },
    { key: "starter", plan: starterPlan, purchasable: true },
    { key: "growth", plan: growthPlan, purchasable: true },
    { key: "enterprise", plan: enterprisePlan ?? { key: "enterprise", name: "Enterprise", list_price_ngn: null }, purchasable: false },
  ];

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Manage your SecureGraph subscription, payments, and access"
        actions={
          <>
            <DocLink docId="howto-platform-11" label="Billing how-to" />
            <button onClick={loadData} className="btn-ghost" aria-label="Refresh billing" title="Refresh"><RefreshCw size={15} /></button>
          </>
        }
      />

      {/* What you tried to do — the reason this page opened. */}
      {(up || upsellReason) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-gold-400/30 bg-gold-400/[0.08] px-4 py-2.5">
          <Lock size={14} className="shrink-0 text-gold-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gold-200">
              {up ? `${up.label} needs ${upsellPlanLabel(up.plan)}` : "Upgrade required"}
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-gold-100/85">
              {up?.blurb || upsellReason || "This action needs a higher plan."}
            </p>
          </div>
        </div>
      )}

      {/* Subscription alerts */}
      {isGrace && (
        <div className="mb-3 flex items-start gap-2.5 rounded-md border border-amber-400/25 bg-amber-400/5 px-4 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <p className="text-[13px] font-semibold text-amber-300">Grace period active</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your {planLabel} access continues until {(entitlements as any)?.subscription?.grace_ends_at ? timeAgo((entitlements as any).subscription.grace_ends_at) : "grace expires"}. Pay the renewal invoice to stay on plan.
            </p>
          </div>
        </div>
      )}
      {expiringSoon && !isGrace && (
        <div className="mb-3 flex items-start gap-2.5 rounded-md border border-gold-400/25 bg-gold-400/5 px-4 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-gold-400" />
          <p className="text-[13px] text-slate-200">Your {planLabel} subscription {daysUntilEnd === 0 ? "expires today" : `ends in ${daysUntilEnd} day${daysUntilEnd === 1 ? "" : "s"}`}. <button onClick={() => setShowCoupon(true)} className="text-gold-400 hover:text-gold-300 underline">Redeem a coupon</button> or renew below.</p>
        </div>
      )}

      {/* Current plan — the one thing this page opens to check, in one dense row. */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="!py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="font-display text-xl font-bold text-white leading-tight">{planLabel}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {entitlements?.billing_enforcement?.enabled ? "Current plan" : "Current plan · dev mode, gates off"}
                </p>
              </div>
              <div className={cx("chip text-xs", isPremium ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-500/50 bg-slate-500/10 text-slate-500")}>
                {isGrace ? "Grace period" : isCoupon ? "Beta access" : isPremium ? "Active" : "Free"}
              </div>
              {isPremium && subscription?.current_period_end && (
                <span className="text-xs text-slate-400">{isGrace ? "Renewal overdue" : `Renews ${timeAgo(subscription.current_period_end)}`}</span>
              )}
              {credits != null && (
                <span className={cx("chip text-xs", credits.exhausted ? "border-severity-critical/30 bg-severity-critical/10 text-severity-critical" : credits.low ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-phantix-600/50 bg-phantix-800/40 text-slate-300")}>
                  <DollarSign size={11} className="inline mr-1" />
                  {credits.total.toLocaleString()} AI credits
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {payingId && <button onClick={() => handleVerify(payingId)} className="btn-secondary !py-1.5 !text-xs"><CheckCircle2 size={13} /> Verify #{payingId}</button>}
              <button onClick={() => setShowCoupon(true)} className="btn-ghost !py-1.5 !text-xs"><Ticket size={13} /> Redeem code</button>
              {isPremium && subscription?.grant_source === "payment" && (
                <button onClick={() => setShowCancelConfirm(true)} className="btn-ghost !py-1.5 !text-xs text-severity-critical">Cancel auto-renew</button>
              )}
            </div>
          </div>

          {/* Free headroom — concrete, not abstract, and part of the same row instead of a second card. */}
          {!isPremium && entitlements?.billing_enforcement?.enabled && (
            <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-phantix-800/60 pt-4">
              <BillingStat
                label="Free assets left"
                value={entitlements.assets_remaining_free == null ? "—" : String(entitlements.assets_remaining_free)}
                tone={entitlements.assets_remaining_free === 0 ? "warn" : "plain"}
              />
              <BillingStat
                label="Free users left"
                value={entitlements.org_users_remaining_free == null ? "—" : String(entitlements.org_users_remaining_free)}
                tone={entitlements.org_users_remaining_free === 0 ? "warn" : "plain"}
              />
              <BillingStat label="Credits / month" value={credits?.ai_credits_mo != null ? String(credits.ai_credits_mo) : "—"} tone="plain" />
            </div>
          )}
        </Card>
      </motion.div>

      {/* Plans — every tier side by side, priced up front, so comparing is a glance not a click. */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-200">Plans</h2>
          <div className="flex rounded-md border border-phantix-700/50 p-0.5">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCycle(c)}
                className={cx(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  selectedCycle === c ? "bg-gold-400/15 text-gold-300" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {c === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tierCards.map(({ key, plan, purchasable }) => {
            const isActive = isPremium ? planKey === key : key === "free";
            const price = purchasable ? tierPricing(key, plan) : null;
            const features = (plan?.features?.length ? plan.features : key === "free" ? featureList : key === "growth" ? growthPlan?.features ?? featureList : featureList).slice(0, 4);
            return (
              <div
                key={key}
                className={cx(
                  "flex flex-col rounded-md border px-4 py-4",
                  isActive ? "border-gold-400/50 bg-gold-400/[0.04]" : "border-phantix-700/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-100">{plan?.name ?? humanize(key)}</p>
                  {isActive && <span className="chip !px-1.5 !py-0.5 text-[11px] border-gold-400/40 text-gold-300">Current</span>}
                </div>
                <div className="mt-2">
                  {key === "free" ? (
                    <p className="font-display text-lg font-bold text-white">Free</p>
                  ) : key === "enterprise" ? (
                    <p className="font-display text-lg font-bold text-white">Custom</p>
                  ) : price ? (
                    <>
                      <p className="font-display text-lg font-bold text-white">{formatNaira(price.monthly)}<span className="text-xs font-normal text-slate-500">/mo</span></p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{price.note}</p>
                    </>
                  ) : (
                    <p className="font-display text-lg font-bold text-slate-500">—</p>
                  )}
                </div>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12px] leading-5 text-slate-400">
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400/80" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  {key === "enterprise" ? (
                    <a href="/support" className="btn-secondary block w-full !py-1.5 text-center text-xs">Contact sales</a>
                  ) : key === "free" ? (
                    <button disabled className="btn-ghost w-full !py-1.5 text-xs opacity-60">{isActive ? "Current plan" : "Included"}</button>
                  ) : isActive ? (
                    <button disabled className="btn-ghost w-full !py-1.5 text-xs opacity-60">Current plan</button>
                  ) : (
                    <button
                      onClick={() => { setSelectedPlan(key as "starter" | "growth"); void handleSubscribe(key as "starter" | "growth"); }}
                      disabled={busy}
                      className="btn-primary w-full !py-1.5 text-xs"
                    >
                      {busy && selectedPlan === key ? <Spinner className="h-3.5 w-3.5" /> : <><CreditCard size={12} /> {isPremium ? "Switch" : "Subscribe"}</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* AI credits wallet — one slim strip, not a full card of its own weight. */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-4">
        <Card className="!py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-slate-200">AI credits</p>
              {credits ? (
                <>
                  <span className="text-xs text-slate-500">{credits.total.toLocaleString()} available · cycle {credits.cycle}</span>
                  {Object.entries(credits.buckets || {}).map(([bucket, amount]) => (
                    <span key={bucket} className="chip text-[11px] border-phantix-600/50 bg-phantix-800/40 text-slate-400">
                      {bucket}: {Number(amount).toLocaleString()}
                    </span>
                  ))}
                  {credits.exhausted && <span className="chip text-[11px] border-severity-critical/30 bg-severity-critical/10 text-severity-critical">Exhausted</span>}
                  {credits.low && !credits.exhausted && <span className="chip text-[11px] border-amber-400/30 bg-amber-400/10 text-amber-300">Low</span>}
                </>
              ) : (
                <span className="text-xs text-slate-500">Balance unavailable — refresh after signing in with an organisation session.</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {creditBundles.map((b) => (
                <button
                  key={b.credits}
                  type="button"
                  disabled={topUpBusy != null}
                  onClick={() => void handleCreditTopUp(b.credits)}
                  className="btn-secondary !py-1.5 text-xs"
                >
                  {topUpBusy === b.credits ? <Spinner className="h-3.5 w-3.5" /> : (
                    <>+{b.credits.toLocaleString()}{b.price_ngn != null ? ` · ${formatNaira(b.price_ngn)}` : ""}</>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Payments history — a real invoice table, not padded list rows. */}
      {payments.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mt-4">
          <CollapsibleCard defaultOpen={false} title="Payment history" subtitle={`${payments.length} invoices`}>
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Reference</th>
                    <th className="th">Purpose</th>
                    <th className="th">Date</th>
                    <th className="th">Amount</th>
                    <th className="th">Status</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-phantix-800/40 last:border-0">
                      <td className="td font-mono text-xs">{p.reference}</td>
                      <td className="td text-xs text-slate-400">{humanize(p.purpose)}{p.discount_percent ? ` · ${p.discount_percent}% off` : ""}</td>
                      <td className="td text-xs text-slate-500">{timeAgo(p.created_at)}</td>
                      <td className="td font-semibold">{formatNaira(p.amount_due_ngn)}</td>
                      <td className="td"><StatusBadge status={p.status} /></td>
                      <td className="td text-right">
                        {p.status === "pending" && <button onClick={() => { setPayingId(p.id); void handleVerify(p.id); }} className="btn-primary !px-2.5 !py-1 !text-[11px]">Verify</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleCard>
        </motion.div>
      )}

      {/* Report formats */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-4">
        <CollapsibleCard defaultOpen={false} title="Report export formats" subtitle="All formats are free on every plan">
          <div className="flex flex-wrap gap-2">
            {reportFormats.map((r) => (
              <span key={r.fmt} className={cx("chip text-xs", canDownload(r.fmt) ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-500/40 bg-slate-500/10 text-slate-500")}>
                <Download size={11} className="inline mr-1" />
                {r.label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            PDF, DOCX, XLSX, HTML, PPTX, JSON, CSV and Markdown are available on every plan, Free included — reporting is never the paid lever.
          </p>
        </CollapsibleCard>
      </motion.div>

      {/* Strategic upsell — exactly what Free cannot do, and what unlocks it. */}
      {!isPremium && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-4">
          <CollapsibleCard defaultOpen={false} title="What Free cannot do" subtitle="Each line names the plan that unlocks it">
            <div className="divide-y divide-phantix-800/50">
              {Object.values(UPSELL_FEATURES).map((f) => (
                <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">{f.label}</p>
                    <p className="text-[13px] leading-5 text-slate-500">{f.blurb}</p>
                  </div>
                  <span className="chip shrink-0 border-gold-400/30 text-gold-300">
                    <Sparkle size={11} className="mr-1 inline" /> {upsellPlanLabel(f.plan)}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        </motion.div>
      )}

      {/* Coupon modal */}
      <Modal open={showCoupon} onClose={() => setShowCoupon(false)} title="Redeem beta code">
        <div className="space-y-3"><p className="text-sm text-slate-400">Enter a staff-issued beta code for full plan access (up to 31 days).</p>
          <input className="input font-mono text-sm" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="BETA-XXXX-XXXX" />
          <button onClick={handleRedeemCoupon} disabled={busy} className="btn-primary w-full">{busy ? "Redeeming..." : "Redeem"}</button>
        </div>
      </Modal>

      {/* Cancel confirm */}
      <Modal open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancel auto-renew?">
        <div className="space-y-3"><div className="flex items-center gap-2 p-3 rounded-md bg-severity-medium/10 border border-severity-medium/20"><AlertTriangle size={16} className="text-severity-medium" /><p className="text-sm text-slate-300">Your {planLabel} access continues until {subscription?.current_period_end ? timeAgo(subscription.current_period_end) : "period end"}. After that, you'll be on the free plan.</p></div>
          <button onClick={handleCancel} className="btn-danger w-full">Confirm cancellation</button>
        </div>
      </Modal>
    </div>
  );
}

function BillingStat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "ok" | "warn";
}) {
  return (
    <div className="rounded-md border border-phantix-700/50 bg-phantix-900/40 px-3 py-2.5">
      <p className="text-[12px] uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={cx(
          "mt-1 font-display text-lg font-semibold",
          tone === "warn" ? "text-severity-medium" : tone === "ok" ? "text-emerald-400" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}
