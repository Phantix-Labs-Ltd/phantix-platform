import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck, MailCheck, CheckCircle2, ArrowRight, Loader2, Info, RefreshCw, Radar,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE, emailFromToken } from "@/lib/api";
import { cx, maskEmail } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * First-run setup: only what is needed before the product is useful. Terms are
 * accepted on the sign-up form, so most users see the email code and then go
 * straight to the Quick Scan (/get-started). Company profile, company
 * verification and plan live on Identity and Billing, asked for when needed.
 */
const stepsMeta = [
  { id: 1, key: "privacy", label: "Privacy notice", icon: <ShieldCheck size={16} /> },
  { id: 2, key: "otp", label: "Verify email", icon: <MailCheck size={16} /> },
  { id: 3, key: "scan", label: "Quick Scan", icon: <Radar size={16} /> },
];

function stepFromSetup(s: { privacy_accepted: boolean; identity_verified: boolean; email_verified: boolean }): number {
  if (!s.privacy_accepted) return 1;
  if (!s.identity_verified && !s.email_verified) return 2;
  return 3;
}

export default function SetupWizard() {
  const { state, session, hydrateSession, refreshSetup, completeSetup } = useStore();
  const s = state.setup;

  // Fetch privacy notice once for all steps
  const [privacyNotice, setPrivacyNotice] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (DEMO_MODE) {
      setPrivacyNotice({
        version: s.privacy_notice_version || "2026-07-10",
        title: "How SecureGraph handles the data of your organization",
        summary: "Demo privacy notice. Connect the live API for the official copy.",
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

  // Poll setup while on the wizard (picks up an email verified in another tab)
  useEffect(() => {
    if (DEMO_MODE || s.setup_complete) return;
    const t = setInterval(() => { refreshSetup().catch(() => {}); }, 20_000);
    return () => clearInterval(t);
  }, [refreshSetup, s.setup_complete]);

  const step = useMemo(() => stepFromSetup(s), [s]);

  // Privacy + email are everything setup needs: finish it as soon as both are
  // in. SetupRoute then forwards to the Quick Scan.
  const [finishError, setFinishError] = useState<string | null>(null);
  const finishing = useRef(false);
  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    setFinishError(null);
    try {
      await completeSetup();
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : "Could not finish setup");
    } finally {
      finishing.current = false;
    }
  };
  useEffect(() => {
    if (step === 3 && !s.setup_complete) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, s.setup_complete]);

  const stepDone = (id: number) => (id === 1 ? s.privacy_accepted : id === 2 ? s.identity_verified || s.email_verified : s.setup_complete);
  // Terms are accepted on the sign-up form, so the privacy step only shows for
  // accounts created before that (or when it is the step in progress).
  const visibleSteps = stepsMeta.filter((m) => m.id !== 1 || step === 1);

  return (
    <div className="relative flex min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_30%_0%,black,transparent)]" />

      <aside className="relative hidden w-[320px] shrink-0 flex-col border-r border-phantix-700/40 bg-phantix-950/70 p-8 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold text-white">Get set up</p>
            <p className="text-[12px] uppercase tracking-[0.18em] text-gold-400">{state.org.name || "Your organization"}</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-8 flex-1 space-y-1">
          {visibleSteps.map((m, i) => {
            const done = stepDone(m.id);
            const active = step === m.id;
            return (
              <div key={m.id} className="relative">
                {i < visibleSteps.length - 1 && (
                  <div className={cx("absolute left-[19px] top-11 h-[calc(100%-24px)] w-px", done ? "bg-emerald-400/50" : "bg-phantix-700/60")} />
                )}
                <div className={cx("relative flex w-full items-center gap-3.5 rounded-md px-2 py-3", active ? "bg-phantix-800/50" : !done && "opacity-50")}>
                  <span
                    className={cx(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2",
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
                    <span className={cx("block text-sm font-medium", active ? "text-white" : done ? "text-slate-300" : "text-slate-500")}>{m.label}</span>
                    <span className="block text-[13px] text-slate-600">{done ? "Done" : active ? "In progress" : "Next"}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-phantix-700/40 bg-phantix-900/60 p-4 text-[13px] leading-5 text-slate-500">
          <Info size={13} className="mb-1.5 text-gold-400" />
          Free plan, no card. Company details, verification and billing can wait. Find them under
          Identity and Billing when you need them.
        </div>
      </aside>

      <main className="relative flex flex-1 items-start justify-center overflow-y-auto px-4 py-10 lg:px-10">
        <div className="w-full max-w-2xl">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            {visibleSteps.map((m) => (
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
              {step === 2 && <OtpStep privacyNotice={privacyNotice} />}
              {step === 3 && (
                <div className="card p-7">
                  {finishError ? (
                    <>
                      <p className="text-sm text-severity-critical">{finishError}</p>
                      <button type="button" onClick={() => void finish()} className="btn-primary mt-4">
                        <RefreshCw size={14} /> Try again
                      </button>
                    </>
                  ) : (
                    <p className="flex items-center gap-2.5 text-sm text-slate-300">
                      <Loader2 size={16} className="animate-spin text-gold-400" /> Getting your Quick Scan ready
                      <ArrowRight size={14} className="text-slate-600" />
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
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

  if (state.setup.privacy_accepted) return null;

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
      <StepTitle icon={<ShieldCheck size={18} />} kicker="Step 1 · required" title={title} />
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
        {busy ? "Recording..." : "Accept and continue"} <ArrowRight size={15} />
      </button>
    </div>
  );
}

// ── Step 2: Email OTP ─────────────────────────────────────────────────────────
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
      <div className="card p-7">
        <p className="flex items-center gap-2.5 text-sm text-emerald-300">
          <CheckCircle2 size={16} /> {masked || (companyEmail ? maskEmail(companyEmail) : "Your email")} is verified.
        </p>
      </div>
    );
  }

  if (!s.privacy_accepted) {
    return (
      <div className="card p-7">
        <StepTitle icon={<MailCheck size={18} />} kicker="Step 2 · blocked" title="Accept privacy first" />
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
      <StepTitle icon={<MailCheck size={18} />} kicker="Step 2 · required" title="Verify your sign-in email" />
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
