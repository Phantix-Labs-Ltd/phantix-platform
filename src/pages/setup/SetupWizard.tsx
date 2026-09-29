import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck, Building2, MailCheck, Globe, CheckCircle2, Copy, ArrowRight,
  ArrowLeft, FileText, Landmark, UserCheck, Loader2, PartyPopper, Info, RefreshCw,
  Users, Database, CreditCard, Check,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE, emailFromToken } from "@/lib/api";
import { cx, maskEmail } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  PLAN_CHOICES, isPaidPlan, planLabel, readPlanChoice, writePlanChoice, type PlanChoice,
} from "@/lib/planChoice";

const stepsMeta = [
  { id: 1, key: "privacy", label: "Privacy notice", icon: <ShieldCheck size={16} /> },
  { id: 2, key: "identity", label: "Company profile", icon: <Building2 size={16} />, optional: true },
  { id: 3, key: "otp", label: "Email verification", icon: <MailCheck size={16} /> },
  { id: 4, key: "verify", label: "Company verification", icon: <Globe size={16} />, optional: true },
  { id: 5, key: "plan", label: "Choose a plan", icon: <CreditCard size={16} /> },
  { id: 6, key: "complete", label: "Complete", icon: <PartyPopper size={16} /> },
];

/** Map server next_step → wizard step index (1---6). */
function stepFromSetup(s: {
  privacy_accepted: boolean;
  identity_verified: boolean;
  email_verified: boolean;
  setup_complete: boolean;
  can_complete_setup: boolean;
  next_step: string | null;
  identity_saved: boolean;
}): number {
  if (s.setup_complete) return 6;
  const ns = (s.next_step || "").toLowerCase();
  if (ns === "privacy" || !s.privacy_accepted) return 1;
  if (ns === "email_otp" || (!s.identity_verified && !s.email_verified)) {
    return s.identity_saved || s.privacy_accepted ? 3 : 2;
  }
  if (ns === "complete" || s.can_complete_setup) return s.can_complete_setup ? 5 : 4;
  if (["company_verification", "domain", "cac_rc", "manual_review", "verify"].includes(ns)) return 4;
  if (!s.privacy_accepted) return 1;
  if (!s.identity_verified && !s.email_verified) return 3;
  if (s.can_complete_setup) return 5;
  return 4;
}

export default function SetupWizard() {
  const store = useStore();
  const { state, session, toast, hydrateSession, refreshSetup } = store;
  const s = state.setup;
  const navigate = useNavigate();

  // Fetch privacy notice once for all steps
  const [privacyNotice, setPrivacyNotice] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (DEMO_MODE) {
      setPrivacyNotice({
        version: s.privacy_notice_version || "2026-07-10",
        title: "How SecureGraph handles your organization's data",
        summary: "Demo privacy notice --- connect the live API for the official copy.",
        highlights: [
          { id: "1", label: "Security data", text: "Findings and assets live only in your dedicated security database." },
          { id: "2", label: "Platform data", text: "We store account, billing, and setup state only." },
        ],
        acceptance_required_copy: "I have read and accept the privacy model on behalf of my organization.",
      });
      return;
    }
    (async () => {
      try {
        const raw = await api.get<Record<string, unknown>>("/organizations/privacy");
        // Unwrap paginated { items: [...], total: N } response
        const items = raw?.items as unknown[] | undefined;
        const p = (Array.isArray(items) ? items[0] : raw) as Record<string, unknown> | null;
        setPrivacyNotice(p ?? raw);
      } catch {
        // keep null --- PrivacyStep will show its own error
      }
    })();
  }, [s.privacy_notice_version]);

  useEffect(() => {
    if (!DEMO_MODE) {
      void hydrateSession(session?.email || state.org.email || state.org.primary_email || "");
    }
  }, [hydrateSession, session?.email, state.org.email, state.org.primary_email]);

  // Poll setup while on wizard (picks up manual review approval)
  useEffect(() => {
    if (DEMO_MODE || s.setup_complete) return;
    const t = setInterval(() => { refreshSetup().catch(() => {}); }, 20_000);
    return () => clearInterval(t);
  }, [refreshSetup, s.setup_complete]);

  const currentStep = useMemo(() => stepFromSetup(s), [s]);
  const [step, setStep] = useState(currentStep);
  useEffect(() => setStep(currentStep), [currentStep]);

  // The plan picked during setup. Persisted so a refresh mid-wizard does not
  // lose it, and so Billing can pre-select it once setup completes.
  const [planChoice, setPlanChoice] = useState<PlanChoice>(() => readPlanChoice() ?? "free");
  const [planConfirmed, setPlanConfirmed] = useState<boolean>(() => readPlanChoice() !== null);

  const progress = s.progress_percent || (s.setup_complete ? 100 : s.privacy_accepted && (s.identity_verified || s.email_verified) ? 66 : s.privacy_accepted ? 33 : 0);

  const stepDone = (id: number) => {
    if (id === 1) return s.privacy_accepted;
    if (id === 2) return s.identity_saved || s.identity_verified || s.email_verified;
    if (id === 3) return s.identity_verified || s.email_verified;
    if (id === 4) return s.company_verified || s.domain_dns_ok || s.domain_http_ok || s.cac_submitted || s.manual_review === "approved";
    if (id === 5) return planConfirmed;
    if (id === 6) return s.setup_complete;
    return false;
  };

  return (
    <div className="relative flex min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_30%_0%,black,transparent)]" />

      <aside className="relative hidden w-[320px] shrink-0 flex-col border-r border-phantix-700/40 bg-phantix-950/70 p-8 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold text-white">Organization setup</p>
            <p className="text-[12px] uppercase tracking-[0.18em] text-gold-400">{state.org.name || "Your organization"}</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-6">
          <div className="mb-1.5 flex justify-between text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Progress</span>
            <span className="text-gold-400">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-phantix-800">
            <motion.div
              className="h-full rounded-full bg-gold-400"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <div className="mt-8 flex-1 space-y-1">
          {stepsMeta.map((m, i) => {
            const done = stepDone(m.id);
            const active = step === m.id;
            const reachable = m.id <= Math.max(currentStep, step) || done || (m.id === 2 && s.privacy_accepted);
            return (
              <div key={m.id} className="relative">
                {i < stepsMeta.length - 1 && (
                  <div className={cx("absolute left-[19px] top-11 h-[calc(100%-24px)] w-px", done ? "bg-emerald-400/50" : "bg-phantix-700/60")} />
                )}
                <button
                  type="button"
                  onClick={() => reachable && setStep(m.id)}
                  disabled={!reachable}
                  className={cx(
                    "relative flex w-full items-center gap-3.5 rounded-md px-2 py-3 text-left transition-colors",
                    active ? "bg-phantix-800/50" : reachable ? "hover:bg-phantix-800/30" : "opacity-50",
                  )}
                >
                  <span
                    className={cx(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                      done
                        ? "border-emerald-400 bg-emerald-400/15 text-emerald-400"
                        : active
                          ? "border-gold-400 bg-gold-400/10 text-gold-400"
                          : "border-phantix-700 bg-phantix-900 text-slate-500",
                    )}
                  >
                    {done ? <CheckCircle2 size={16} /> : m.icon}
                  </span>
                  <span>
                    <span className={cx("block text-sm font-medium", active ? "text-white" : done ? "text-slate-300" : "text-slate-500")}>
                      {m.label}
                      {m.optional && <span className="ml-1.5 text-[12px] font-normal text-slate-600">optional</span>}
                    </span>
                    <span className="block text-[13px] text-slate-600">
                      {done ? "Done" : active ? "In progress" : m.id > currentStep ? "Locked" : "Pending"}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-phantix-700/40 bg-phantix-900/60 p-4 text-[13px] leading-5 text-slate-500">
          <Info size={13} className="mb-1.5 text-gold-400" />
          Your progress is saved as you go — leave and return at any time.
          Required: privacy acceptance, email verification and company verification (domain, registry
          details, or a manual review).
          {s.next_step && (
            <span className="mt-2 block text-slate-400">
              Next step: <span className="font-mono text-gold-400/90">{s.next_step}</span>
            </span>
          )}
        </div>
      </aside>

      <main className="relative flex flex-1 items-start justify-center overflow-y-auto px-4 py-10 lg:px-10">
        <div className="w-full max-w-2xl">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            {stepsMeta.map((m) => (
              <div key={m.id} className={cx("h-1.5 flex-1 rounded-full", stepDone(m.id) ? "bg-emerald-400" : step === m.id ? "bg-gold-400" : "bg-phantix-700/60")} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 1 && <PrivacyStep privacyNotice={privacyNotice} />}
              {step === 2 && <IdentityStep onSkip={() => setStep(3)} onDone={() => setStep(3)} privacyNotice={privacyNotice} />}
              {step === 3 && <OtpStep privacyNotice={privacyNotice} />}
              {step === 4 && <VerifyStep onContinue={() => setStep(5)} privacyNotice={privacyNotice} />}
              {step === 5 && (
                <PlanStep
                  value={planChoice}
                  onChange={setPlanChoice}
                  onContinue={() => {
                    writePlanChoice(planChoice);
                    setPlanConfirmed(true);
                    setStep(6);
                  }}
                />
              )}
              {step === 6 && <CompleteStep planChoice={planChoice} privacyNotice={privacyNotice} />}
            </motion.div>
          </AnimatePresence>

          {step > 1 && step < 6 && (
            <button type="button" onClick={() => setStep(step - 1)} className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-200">
              <ArrowLeft size={15} /> Back
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Step 1: Privacy ───────────────────────────────────────────────────────────
function PrivacyStep({ privacyNotice }: { privacyNotice: Record<string, unknown> | null }) {
  const { acceptPrivacy, state, toast } = useStore();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const pn = privacyNotice as Record<string, unknown> | null;

  if (state.setup.privacy_accepted) {
    return (
      <DoneCard
        title="Privacy notice accepted"
        detail={state.setup.privacy_accepted_at ? `Accepted ${new Date(state.setup.privacy_accepted_at).toLocaleString()}` : "Recorded"}
      />
    );
  }

  const version = (pn?.version as string) || state.setup.privacy_notice_version || undefined;
  const title = (pn?.title as string) || "Accept the privacy model";
  const summary = pn?.summary as string | undefined;
  const rawHighlights: unknown = pn?.highlights;
  const highlights: { id: string; label: string; text: string }[] = Array.isArray(rawHighlights)
    ? (rawHighlights as Record<string, unknown>[]).map((h) => ({
        id: String(h.id ?? ""),
        label: String(h.label ?? ""),
        text: String(h.text ?? ""),
      }))
    : [];
  const rawStores: unknown = pn?.phantix_stores;
  const phantixStores: { category: string; items: string[] }[] = Array.isArray(rawStores)
    ? (rawStores as Record<string, unknown>[]).map((s) => ({
        category: String(s.category ?? s.label ?? ""),
        items: Array.isArray(s.items) ? s.items.map(String) : [],
      }))
    : [];
  const acceptance = (pn?.acceptance_required_copy as string) || "I have read and accept the privacy model on behalf of my organization.";
  const body = pn?.body as string | undefined;
  const noticeText = body || (pn?.notice_text as string) || (pn?.text as string) || undefined;

  return (
    <div className="card p-7">
      <StepTitle icon={<ShieldCheck size={18} />} kicker="Step 1 of 6 · required" title={title} />
      <div
        ref={boxRef}
        onScroll={() => {
          const el = boxRef.current;
          if (!el) return;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolled(true);
        }}
        className="mt-5 max-h-[300px] space-y-4 overflow-y-auto rounded-md border border-phantix-700/50 bg-phantix-950/60 p-5 text-sm leading-6 text-slate-300"
      >
        {summary && <p className="text-slate-200">{summary}</p>}
        {noticeText && (
          <div className="space-y-3 whitespace-pre-line text-slate-400">{noticeText}</div>
        )}
        {highlights.length > 0 && !noticeText && (
          <>
            {highlights.map((h) => (
              <div key={h.id}>
                <strong className="text-slate-100">{h.label}</strong>
                <p className="mt-0.5 text-slate-400">{h.text}</p>
              </div>
            ))}
          </>
        )}
        {phantixStores.length > 0 && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Data we store</p>
            <ul className="list-disc space-y-1 pl-5 text-slate-400">
              {phantixStores.map((cat) =>
                cat.items.map((item, i) => (
                  <li key={`${cat.category}-${i}`}>
                    {cat.category && <span className="text-slate-300">{cat.category}: </span>}
                    {item}
                  </li>
                ))
              )}
            </ul>
          </>
        )}
        {!pn && !summary && <p className="text-slate-500">Loading privacy notice...</p>}
      </div>
      {version && <p className="mt-2 text-[13px] text-slate-600">Notice version: {version}</p>}
      <label
        className={cx(
          "mt-4 flex items-start gap-3 rounded-md border p-4 transition-colors",
          checked ? "border-emerald-400/40 bg-emerald-400/5" : "border-phantix-700/50",
          !scrolled && "opacity-60",
        )}
      >
        <input
          type="checkbox"
          disabled={!scrolled || !pn}
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-gold-400"
        />
        <span className="text-sm text-slate-300">
          {acceptance}
          {!scrolled && <span className="block text-xs text-slate-500">Scroll to the end to enable.</span>}
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-severity-critical">{error}</p>}
      <button
        type="button"
        className="btn-primary mt-4 w-full !py-3"
        disabled={!checked || busy || !pn}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await acceptPrivacy(version);
            toast("success", "Privacy accepted");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Accept failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Recording..." : "Accept & continue"} <ArrowRight size={15} />
      </button>
    </div>
  );
}

// ── Step 2: Identity ──────────────────────────────────────────────────────────
function IdentityStep({ onSkip, onDone, privacyNotice }: { onSkip: () => void; onDone: () => void; privacyNotice: Record<string, unknown> | null }) {
  const { saveIdentity, state, toast } = useStore();
  const [website, setWebsite] = useState(state.org.website ?? "");
  const [legalName, setLegalName] = useState(state.org.legal_name ?? state.org.name);
  const [phone, setPhone] = useState(state.org.phone ?? state.org.company_phone ?? "");
  const [reg, setReg] = useState(state.org.registration_number ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.setup.identity_saved && (state.setup.identity_verified || state.setup.email_verified)) {
    return <DoneCard title="Company profile saved" detail="You can edit full profile later under Identity." />;
  }

  return (
    <div className="card p-7">
      <StepTitle icon={<Building2 size={18} />} kicker="Step 2 of 6 · optional" title="Company profile" />
      <p className="mt-2 text-sm text-slate-400">
        Legal details used on verification records and report covers. Website is used as the default for domain verification.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await saveIdentity({
              website: website || undefined,
              legal_name: legalName || undefined,
              company_phone: phone || undefined,
              registration_number: reg || undefined,
            });
            toast("success", "Profile saved");
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label">Legal name</label>
          <input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Your Company Ltd" />
        </div>
        <div>
          <label className="label">Registration / RC number</label>
          <input className="input font-mono" value={reg} onChange={(e) => setReg(e.target.value)} placeholder="RC1234567" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Website</label>
            <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourcompany.com" />
          </div>
          <div>
            <label className="label">Company phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 ..." />
          </div>
        </div>
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1 !py-3" disabled={busy}>
            {busy ? "Saving..." : "Save & continue"}
          </button>
          <button type="button" onClick={onSkip} className="btn-ghost">
            Skip for now
          </button>
        </div>
        </form>
        <PrivacyRef notice={privacyNotice} />
    </div>
  );
}

// ── Step 3: Email OTP ─────────────────────────────────────────────────────────
function OtpStep({ privacyNotice }: { privacyNotice: Record<string, unknown> | null }) {
  const { sendOtp, verifyOtp, state, session, toast } = useStore();
  const s = state.setup;
  const companyEmail =
    s.email_otp_destination ||
    state.org.email ||
    state.org.primary_email ||
    session?.email ||
    emailFromToken() ||
    "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [masked, setMasked] = useState(companyEmail.includes("*") ? companyEmail : "");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (s.identity_verified || s.email_verified) {
    return (
      <DoneCard
        title="Email verified"
        detail={`${masked || (companyEmail ? maskEmail(companyEmail) : "sign-in email")} confirmed by one-time code`}
      />
    );
  }

  if (!s.privacy_accepted) {
    return (
      <div className="card p-7">
        <StepTitle icon={<MailCheck size={18} />} kicker="Step 3 · blocked" title="Accept privacy first" />
        <p className="mt-3 text-sm text-slate-400">Email OTP is blocked until the privacy notice is accepted.</p>
      </div>
    );
  }

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await sendOtp();
      setDevOtp(res.devOtp || null);
      setMasked(res.destinationMasked || masked);
      setCooldown(res.resendAfter || 45);
      toast("success", "Code sent", res.destinationMasked ? `Check ${res.destinationMasked}` : "Check your company email.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send code";
      setError(msg);
      if (msg.toLowerCase().includes("privacy")) {
        toast("warning", "Privacy required", "Accept the privacy notice before requesting OTP.");
      }
    } finally {
      setBusy(false);
    }
  };

  const displayDest = masked || (companyEmail.includes("*") ? companyEmail : companyEmail ? maskEmail(companyEmail) : "your company sign-in email");

  return (
    <div className="card p-7">
      <StepTitle icon={<MailCheck size={18} />} kicker="Step 3 of 6 · required" title="Verify your sign-in email" />
      <p className="mt-2 text-sm text-slate-400">
        We'll email a one-time code to <strong className="text-slate-200">{displayDest}</strong>. Email OTP only --- phone verification is not supported.
      </p>

      {!s.email_otp_sent ? (
        <button type="button" className="btn-primary mt-6 w-full !py-3" onClick={() => void send()} disabled={busy}>
          {busy ? "Sending..." : "Send verification code"}
        </button>
      ) : (
        <div className="mt-6 space-y-4">
          {devOtp && import.meta.env.DEV && (
            <div className="rounded-md border border-gold-400/30 bg-gold-400/8 p-3.5 text-center">
              <p className="text-[12px] uppercase tracking-wider text-gold-400/80">Dev mode --- your code</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-[0.4em] text-gold-300">{devOtp}</p>
            </div>
          )}
          <input
            className="input text-center font-mono !text-2xl !tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="••••••"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          {error && <p className="text-sm text-severity-critical">{error}</p>}
          <button
            type="button"
            className="btn-primary w-full !py-3"
            disabled={busy || code.length < 4}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await verifyOtp(code);
                toast("success", "Email verified");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Verification failed");
                setCode("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Verifying..." : "Verify email"}
          </button>
          <button type="button" onClick={() => void send()} disabled={cooldown > 0 || busy} className="w-full text-center text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      )}
      {error && !s.email_otp_sent && <p className="mt-3 text-sm text-severity-critical">{error}</p>}
      <PrivacyRef notice={privacyNotice} />
    </div>
  );
}

// ── Step 4: Company verification (optional) ───────────────────────────────────
function VerifyStep({ onContinue, privacyNotice }: { onContinue: () => void; privacyNotice: Record<string, unknown> | null }) {
  const { state, startDomainVerification, checkDomain, submitCac, skipCac, requestManualReview, toast, refreshSetup } = useStore();
  const s = state.setup;
  const [mode, setMode] = useState<"none" | "domain" | "cac" | "manual">("none");
  const [domain, setDomain] = useState(() => s.domain || extractHost(state.org.website) || "");
  const [busy, setBusy] = useState(false);
  const [rc, setRc] = useState("");
  const [cacType, setCacType] = useState("");
  const [cacDate, setCacDate] = useState("");
  const [cacStatus, setCacStatus] = useState("Active");
  const [cacAddress, setCacAddress] = useState("");
  const [tin, setTin] = useState("");
  const [notes, setNotes] = useState("");
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState(0);

  const verified =
    s.company_verified || s.domain_dns_ok || s.domain_http_ok || s.cac_submitted || s.manual_review === "approved";

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast("success", `${what} copied`);
  };

  const instr: any = s.domain_instructions || {};
  // Handle new nested API shape: { dns: { value, host, record_type }, http: { url, body }, token }
  const dnsValue = instr.dns?.value || instr.dns_txt || instr.value || instr.txt || "";
  const dnsTxt = dnsValue || (s.domain_token ? `phantix-verify=${s.domain_token}` : "");
  const dnsHost = instr.dns?.host || s.domain || domain || "";
  const dnsRecordType = instr.dns?.record_type || "TXT";
  const httpUrl = instr.http?.url || instr.http_url || instr.url || (s.domain ? `https://${s.domain}/.well-known/phantix-verify.txt` : "");
  const httpBody = instr.http?.body || instr.http_body || instr.body || instr.token || s.domain_token || "";

  return (
    <div className="space-y-4">
      <div className="card p-7">
        <StepTitle icon={<Globe size={18} />} kicker="Step 4 of 6 · required" title="Prove company control" />
        <p className="mt-2 text-sm text-slate-400">
          Choose any <strong>one</strong> mode to verify your company — usually the domain. Verification is required
          before setup can be completed, and you can switch modes at any time.
        </p>

        {verified && (
          <div className="mt-4 flex items-center gap-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-300">
            <CheckCircle2 size={16} /> Company verified
            {s.domain_dns_ok && <span className="chip border-emerald-400/30 text-[12px]">DNS</span>}
            {s.domain_http_ok && <span className="chip border-emerald-400/30 text-[12px]">HTTP</span>}
            {s.cac_submitted && <span className="chip border-emerald-400/30 text-[12px]">CAC</span>}
            {s.manual_review === "approved" && <span className="chip border-emerald-400/30 text-[12px]">Manual</span>}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { id: "domain" as const, icon: <Globe size={17} />, name: "Domain", desc: "DNS TXT or well-known file", done: s.domain_dns_ok || s.domain_http_ok },
            { id: "cac" as const, icon: <Landmark size={17} />, name: "CAC / RC", desc: "Registry numbers", done: s.cac_submitted },
            { id: "manual" as const, icon: <UserCheck size={17} />, name: "Manual review", desc: "Staff approval", done: s.manual_review === "approved" },
          ].map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setMode(mode === m.id ? "none" : m.id)}
              className={cx(
                "rounded-2xl border p-4 text-left transition-all",
                mode === m.id ? "border-gold-400/60 bg-gold-400/8 shadow-glow" : "border-phantix-700/50 bg-phantix-950/40 hover:border-phantix-500/50",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cx("flex h-9 w-9 items-center justify-center rounded-lg", mode === m.id ? "bg-gold-400/15 text-gold-400" : "bg-phantix-800/70 text-phantix-300")}>
                  {m.icon}
                </span>
                {m.done && <CheckCircle2 size={15} className="text-emerald-400" />}
                {m.id === "manual" && s.manual_review === "pending" && <Loader2 size={14} className="animate-spin text-severity-medium" />}
              </div>
              <p className="mt-2.5 text-sm font-semibold text-slate-200">{m.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{m.desc}</p>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {mode === "domain" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl border border-phantix-700/50 bg-phantix-950/50 p-5">
                {!s.domain_token ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      className="input font-mono flex-1"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value.replace(/^https?:\/\//, "").split("/")[0])}
                      placeholder="yourcompany.com"
                    />
                    <button
                      type="button"
                      className="btn-primary shrink-0"
                      disabled={!domain.includes(".") || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await startDomainVerification(domain, state.org.website || undefined);
                          toast("success", "Verification started", "Add the DNS or HTTP proof, then check.");
                        } catch (err) {
                          toast("error", "Start failed", err instanceof Error ? err.message : "Could not start domain verification");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {busy ? "Issuing..." : "Start"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-300">
                      Prove control of <span className="font-mono text-gold-300">{s.domain || domain}</span> with either method:
                    </p>
                    <div className="rounded-md border border-phantix-700/50 bg-phantix-950/70 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Option A --- DNS TXT</p>
                        {s.domain_dns_ok ? <CheckCircle2 size={15} className="text-emerald-400" /> : null}
                      </div>
                      {dnsTxt ? (
                        <>
                          <div className="mt-2 flex items-center gap-2">
                            <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-gold-300">{dnsTxt}</code>
                            <button type="button" onClick={() => copy(dnsTxt, "TXT value")} className="btn-secondary !px-3 !py-2">
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="mt-1.5 text-[12px] text-slate-500">
                            {dnsRecordType} record on <span className="font-mono text-slate-400">{dnsHost || "@"}</span>
                            {instr.dns?.hint && <span className="block mt-0.5">{instr.dns.hint}</span>}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Start verification to get instructions</p>
                      )}
                    </div>
                    <div className="rounded-md border border-phantix-700/50 bg-phantix-950/70 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Option B --- HTTP well-known</p>
                        {s.domain_http_ok ? <CheckCircle2 size={15} className="text-emerald-400" /> : null}
                      </div>
                      {httpUrl ? (
                        <>
                          <div className="mt-2 flex items-center gap-2">
                            <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-gold-300">{httpUrl}</code>
                            <button type="button" onClick={() => copy(httpUrl, "URL")} className="btn-secondary !px-3 !py-2">
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="mt-1.5 text-[12px] text-slate-500">{instr.http?.content_type ? `${instr.http.content_type}` : ""}{instr.http?.hint && <span className="block mt-0.5">{instr.http.hint}</span>}</p>
                          {httpBody && (
                            <>
                              <p className="mt-1.5 text-[13px] text-slate-500">File body must be exactly: <code className="font-mono text-gold-300 text-[13px]">{httpBody.slice(0, 50)}{httpBody.length > 50 ? "..." : ""}</code></p>
                              <button type="button" className="mt-1 text-xs text-gold-400 hover:text-gold-300" onClick={() => copy(httpBody, "Token body")}>
                                Copy token body
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Start verification to get instructions</p>
                      )}
                    </div>
                    {checkMsg && <p className="text-xs text-slate-400">{checkMsg}</p>}
                    <div className="flex flex-wrap gap-2">
                      {(["auto", "dns", "http"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className="btn-secondary !py-2 !text-xs capitalize"
                          disabled={busy || Date.now() - lastCheckAt < 5000}
                          onClick={async () => {
                            if (Date.now() - lastCheckAt < 5000) {
                              toast("info", "Wait a few seconds", "Avoid hammering DNS/HTTP checks.");
                              return;
                            }
                            setBusy(true);
                            setLastCheckAt(Date.now());
                            try {
                              const r = await checkDomain(m);
                              setCheckMsg(r.message);
                              if (r.dns || r.http) toast("success", "Domain verified", r.message);
                              else toast("warning", "Not verified yet", r.message);
                              void refreshSetup();
                            } catch (err) {
                              toast("error", "Check failed", err instanceof Error ? err.message : "Domain check failed");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Check {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {mode === "cac" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl border border-phantix-700/50 bg-phantix-950/50 p-5">
                {s.cac_submitted ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 size={15} /> CAC / RC details recorded.
                  </p>
                ) : s.cac_skipped ? (
                  <p className="text-sm text-slate-400">CAC step skipped.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">RC number</label>
                        <input className="input font-mono" value={rc} onChange={(e) => setRc(e.target.value)} placeholder="RC1234567" />
                      </div>
                      <div>
                        <label className="label">Company type</label>
                        <input className="input" value={cacType} onChange={(e) => setCacType(e.target.value)} placeholder="Private Limited" />
                      </div>
                      <div>
                        <label className="label">Registration date</label>
                        <input className="input" type="date" value={cacDate} onChange={(e) => setCacDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Status</label>
                        <input className="input" value={cacStatus} onChange={(e) => setCacStatus(e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="label">Registered address</label>
                        <input className="input" value={cacAddress} onChange={(e) => setCacAddress(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">TIN</label>
                        <input className="input font-mono" value={tin} onChange={(e) => setTin(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="btn-primary flex-1"
                        disabled={!rc || busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await submitCac({
                              rc_number: rc,
                              company_type: cacType || undefined,
                              registration_date: cacDate || undefined,
                              status: cacStatus || undefined,
                              registered_address: cacAddress || undefined,
                              tin: tin || undefined,
                            });
                            toast("success", "CAC details submitted");
                          } catch (err) {
                            toast("error", "Submit failed", err instanceof Error ? err.message : "CAC submit failed");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {busy ? "Submitting..." : "Submit details"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={async () => {
                          await skipCac();
                          toast("info", "CAC skipped");
                        }}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {mode === "manual" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl border border-phantix-700/50 bg-phantix-950/50 p-5">
                {s.manual_review === "pending" ? (
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <Loader2 size={16} className="animate-spin text-severity-medium" />
                    Awaiting staff review --- this screen refreshes automatically.
                    <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => void refreshSetup()}>
                      Refresh now
                    </button>
                  </div>
                ) : s.manual_review === "approved" ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 size={15} /> Manual review approved
                  </p>
                ) : s.manual_review === "rejected" ? (
                  <p className="text-sm text-severity-critical">Manual review was rejected. You can re-request with notes.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Notes for staff (optional)</label>
                      <textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. DNS not available on CDN..." />
                    </div>
                    <button
                      type="button"
                      className="btn-primary w-full"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await requestManualReview(notes || undefined);
                          toast("success", "Review requested");
                        } catch (err) {
                          toast("error", "Request failed", err instanceof Error ? err.message : "Could not request review");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {busy ? "Requesting..." : "Request staff review"}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <PrivacyRef notice={privacyNotice} />
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!verified && s.manual_review !== "pending"}
        title={
          verified || s.manual_review === "pending"
            ? undefined
            : "Verify your company to continue — domain, registry details or a staff review"
        }
        className="btn-primary w-full !py-3.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {verified
          ? "Continue to complete"
          : s.manual_review === "pending"
            ? "Continue (review pending)"
            : "Verify your company to continue"}{" "}
        <ArrowRight size={15} />
      </button>
      {!verified && s.manual_review !== "pending" && (
        <p className="mt-2 text-center text-xs text-slate-500">
          Company verification is required to finish setup.
        </p>
      )}
    </div>
  );
}

// ── Step 5: Choose a plan ─────────────────────────────────────────────────────
type PlanPriceRow = { key: string; list_price_ngn: number | null };

function PlanStep({
  value,
  onChange,
  onContinue,
}: {
  value: PlanChoice;
  onChange: (p: PlanChoice) => void;
  onContinue: () => void;
}) {
  const [livePlans, setLivePlans] = useState<PlanPriceRow[] | null>(null);

  // Live list prices when the API answers; the catalogue's own are the fallback.
  useEffect(() => {
    if (DEMO_MODE) return;
    let alive = true;
    api.get<unknown>("/billing/plans")
      .then((raw) => {
        if (!alive) return;
        const list = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object" && Array.isArray((raw as { plans?: unknown }).plans)
            ? (raw as { plans: unknown[] }).plans
            : [];
        setLivePlans(list as PlanPriceRow[]);
      })
      .catch(() => { /* fall back to the catalogue prices */ });
    return () => { alive = false; };
  }, []);

  const priceFor = (key: PlanChoice, fallback: number | null) => {
    const live = livePlans?.find((p) => p.key === key);
    return typeof live?.list_price_ngn === "number" ? live.list_price_ngn : fallback;
  };
  const money = (n: number | null) =>
    n === null ? "Custom" : n === 0 ? "Free" : `₦${n.toLocaleString()}`;

  return (
    <div className="card p-7">
      <StepTitle icon={<CreditCard size={18} />} kicker="Step 5 of 6" title="Choose your plan" />
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Pick the plan you want to start on. You can change it later from Billing — Free
        needs no card, and paid plans are confirmed after setup.
      </p>

      <div className="mt-6 space-y-3">
        {PLAN_CHOICES.map((p) => {
          const active = value === p.key;
          const price = priceFor(p.key, p.priceNgn);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              aria-pressed={active}
              className={cx(
                "block w-full rounded-lg border p-4 text-left transition-colors",
                active
                  ? "border-gold-400/60 bg-gold-400/[0.06] ring-1 ring-gold-400/40"
                  : "border-phantix-700/60 bg-phantix-950/50 hover:border-phantix-600",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cx(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        active ? "border-gold-400 bg-gold-400 text-phantix-950" : "border-phantix-600",
                      )}
                    >
                      {active && <Check size={10} />}
                    </span>
                    <span className="font-display text-base font-semibold text-white">{p.name}</span>
                    {p.highlight && (
                      <span className="rounded-full border border-gold-400/40 bg-gold-400/10 px-2 py-0.5 text-[11px] font-semibold text-gold-300">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-slate-400">{p.tagline}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block font-display text-lg font-bold text-white">{money(price)}</span>
                  <span className="block text-[12px] text-slate-500">{p.priceNote}</span>
                </div>
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[12px] leading-5 text-slate-400">
                    <Check size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onContinue} className="btn-primary mt-6 w-full !py-3.5">
        Continue <ArrowRight size={15} />
      </button>
      <p className="mt-3 text-center text-xs text-slate-500">
        Free starts immediately. Starter and Growth take you to Billing after setup to pay.
      </p>
    </div>
  );
}

// ── Step 6: Complete ──────────────────────────────────────────────────────────
function CompleteStep({ privacyNotice, planChoice }: { privacyNotice: Record<string, unknown> | null; planChoice: PlanChoice }) {
  const { state, completeSetup, toast } = useStore();
  const s = state.setup;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canComplete = s.can_complete_setup || (s.privacy_accepted && (s.identity_verified || s.email_verified) && !s.setup_complete);

  if (s.setup_complete) {
    return (
      <div className="card relative overflow-hidden p-8 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(232,181,77,0.15),transparent_60%)]" />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
          className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gold-400/40 bg-gold-400/10"
        >
          <PartyPopper size={32} className="text-gold-400" />
        </motion.div>
        <h2 className="relative mt-6 font-display text-3xl font-bold text-white">Setup complete</h2>
        <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          <strong className="text-slate-200">{state.org.name}</strong> is live. Next: dual control, then your security database.
        </p>
        <div className="relative mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isPaidPlan(planChoice) ? (
            <button type="button" onClick={() => navigate(`/billing?plan=${planChoice}`)} className="btn-primary !py-3">
              <CreditCard size={15} /> Continue to payment
            </button>
          ) : (
            <button type="button" onClick={() => navigate("/users")} className="btn-primary !py-3">
              <Users size={15} /> Set up dual control
            </button>
          )}
          <button type="button" onClick={() => navigate("/connections")} className="btn-secondary !py-3">
            <Database size={15} /> Connect security DB
          </button>
        </div>
        <button type="button" onClick={() => navigate("/dashboard")} className="btn-ghost relative mt-4 text-sm">
          Enter dashboard <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  const rows = [
    { label: "Privacy notice", ok: s.privacy_accepted, required: true },
    { label: "Email verified (OTP)", ok: s.identity_verified || s.email_verified, required: true },
    { label: "Company profile", ok: s.identity_saved, required: false },
    {
      label: "Company verification",
      ok: s.company_verified || s.domain_dns_ok || s.domain_http_ok || s.cac_submitted || s.manual_review === "approved",
      required: false,
    },
    { label: `Plan — ${planLabel(planChoice)}`, ok: true, required: false },
  ];

  return (
    <div className="card p-7">
      <StepTitle icon={<FileText size={18} />} kicker="Step 6 of 6" title="Review & complete" />
      <div className="mt-5 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-md border border-phantix-700/40 bg-phantix-950/50 px-4 py-3">
            <span className="text-sm text-slate-300">
              {r.label} {r.required && <span className="ml-1 text-[12px] text-slate-600">required</span>}
            </span>
            {r.ok ? <CheckCircle2 size={16} className="text-emerald-400" /> : <span className="text-xs text-slate-600">{r.required ? "missing" : "skipped"}</span>}
          </div>
        ))}
      </div>
      {!canComplete && (
        <p className="mt-4 rounded-md border border-severity-critical/30 bg-severity-critical/8 p-3.5 text-xs leading-5 text-severity-critical">
          Privacy acceptance and email OTP are required. Complete those steps first --- the API returns 400 otherwise.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-severity-critical">{error}</p>}
      <button
        type="button"
        className="btn-primary mt-5 w-full !py-3.5"
        disabled={!canComplete || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await completeSetup();
            toast("success", "Organization setup complete", "Welcome to SecureGraph Platform.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Complete failed --- check privacy and email OTP");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Completing..." : "Complete setup"} <CheckCircle2 size={15} />
      </button>
      <PrivacyRef notice={privacyNotice} />
    </div>
  );
}

function StepTitle({ icon, kicker, title }: { icon: React.ReactNode; kicker: string; title: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-gold-400">
        {icon} {kicker}
      </div>
      <h2 className="mt-2 font-display text-2xl font-bold text-white">{title}</h2>
    </div>
  );
}

function DoneCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="card p-7 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-400/12 text-emerald-400">
        <CheckCircle2 size={24} />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold text-white">{title}</h2>
      <p className="mt-1.5 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function PrivacyRef({ notice }: { notice: Record<string, unknown> | null }) {
  if (!notice) return null;
  const title = (notice.title as string) || "Privacy notice";
  const summary = (notice.summary as string) || "";
  return (
    <div className="mt-4 rounded-md border border-phantix-700/30 bg-phantix-950/40 p-3 text-xs text-slate-500">
      <p className="font-medium text-slate-400">{title}</p>
      {summary && <p className="mt-0.5 line-clamp-2">{summary}</p>}
      <p className="mt-1 text-[12px] text-slate-600">
        This privacy model applies to all organization data stored by SecureGraph.
        <span className="ml-1">Your data lives in your dedicated security database --- we never store business rows.</span>
      </p>
    </div>
  );
}

function extractHost(website: string | null | undefined): string {
  if (!website) return "";
  try {
    const u = website.includes("://") ? new URL(website) : new URL(`https://${website}`);
    return u.hostname;
  } catch {
    return website.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}
