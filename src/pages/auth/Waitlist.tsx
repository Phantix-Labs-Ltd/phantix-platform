import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Circle, Loader2, Radar, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { BrandWordmark } from "@/components/BrandLogo";
import { errorCode } from "@/lib/api";
import { useSignupStatus } from "@/lib/betaSignup";
import {
  joinWaitlist, saveWaitlistToken, savedWaitlistToken, startWaitlistScan, waitlistStatus, type WaitlistStatus,
} from "@/lib/waitlist";
import { cx } from "@/lib/utils";

type Stage = "email" | "offer" | "scanning" | "done";
const POLL_MS = 3000;

/** Quick Scan step keys, in plain words. */
const STEP_LABEL: Record<string, string> = {
  dns: "DNS records",
  tls: "TLS certificate",
  http_headers: "Security headers",
  ct_subdomains: "Subdomains in certificate logs",
  email_auth: "Email authentication (SPF, DKIM, DMARC)",
};

/**
 * The launch waitlist, shown while registration is closed. A work email puts
 * the visitor on the list; a Quick Scan of the email's domain, when it
 * completes, moves them onto the prioritized launch list. The scan's findings
 * are never shown here: the email is not verified, so the domain is not
 * proven theirs.
 */
export default function Waitlist() {
  const { status: signup } = useSignupStatus();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [entry, setEntry] = useState<WaitlistStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const follow = useCallback((t: string) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const s = await waitlistStatus(t);
        setEntry(s);
        if (s.status === "scanning") follow(t);
        else setStage("done");
      } catch {
        follow(t); // a blip: keep checking at the same pace
      }
    }, POLL_MS);
  }, []);

  // A refresh mid-scan picks up where the visitor was.
  useEffect(() => {
    const saved = savedWaitlistToken();
    if (!saved) return;
    waitlistStatus(saved)
      .then((s) => {
        setToken(saved);
        setDomain(s.domain);
        setEntry(s);
        if (s.status === "scanning") { setStage("scanning"); follow(saved); }
        else if (s.status === "joined") setStage("offer");
        else setStage("done");
      })
      .catch(() => saveWaitlistToken(null));
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [follow]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Enter your work email");
    setBusy(true);
    try {
      const res = await joinWaitlist(email.trim());
      setToken(res.token);
      saveWaitlistToken(res.token);
      setDomain(res.domain);
      setStage("offer");
    } catch (err) {
      setError(errorCode(err) === "work_email_required"
        ? "Use your work email, not a personal address."
        : err instanceof Error ? err.message : "Could not join the waitlist");
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    if (!token) return;
    setError(null);
    setBusy(true);
    try {
      const s = await startWaitlistScan(token);
      setEntry(s);
      if (s.status === "scanning") { setStage("scanning"); follow(token); }
      else setStage("done");
    } catch (err) {
      // The domain can't be scanned (unreachable, or opted out): still on the list.
      setNote(errorCode(err) === "domain_unavailable" && err instanceof Error ? err.message : `We couldn't scan ${domain}, but you are on the waitlist.`);
      setStage("done");
    } finally {
      setBusy(false);
    }
  };

  const skipScan = () => { setNote(null); setEntry(null); setStage("done"); };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
        <div className="absolute left-1/4 top-1/4 h-[420px] w-[600px] rounded-full bg-phantix-600/20 blur-[130px]" />
      </div>

      <div className="relative grid w-full max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }} className="hidden lg:block">
          <BrandWordmark className="h-12" />
          <h1 className="mt-6 font-display text-4xl font-bold leading-tight tracking-tight text-white">
            The beta is full. Be first in line.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-slate-400">
            Registration opens again soon. Leave your work email, and add a Quick Scan of your website to move up
            to the prioritized launch list.
          </p>
          <div className="mt-8 space-y-3.5">
            {[
              { icon: <Sparkles size={16} />, text: "Prioritized organizations are invited first when registration opens" },
              { icon: <Radar size={16} />, text: "Quick Scan: passive checks only, nothing is attacked" },
              { icon: <ShieldCheck size={16} />, text: "Work emails only. We use it to tell you when you can register" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-phantix-800/70 text-gold-400">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.1 }}>
          <div className="card p-7">
            {stage === "email" && (
              <form onSubmit={join} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">Join the waitlist</h2>
                  <p className="mt-1.5 text-sm text-slate-400">
                    {signup?.phase === "closed"
                      ? "Registration is closed for now: the beta is full."
                      : "Registration opens in waves. Join the list to hear first."}
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="wl-email">Work email</label>
                  <input id="wl-email" className="input" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourcompany.com" />
                </div>
                {error && <p className="text-sm text-severity-critical">{error}</p>}
                <button className="btn-primary w-full !py-3" disabled={busy}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null} Continue <ArrowRight size={15} />
                </button>
                <p className="text-center text-xs text-slate-500">
                  Already registered? <Link to="/login" className="text-gold-400 hover:text-gold-300">Sign in</Link>
                </p>
              </form>
            )}

            {stage === "offer" && (
              <div className="space-y-4">
                <p className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={15} /> You are on the waitlist.</p>
                <h2 className="font-display text-2xl font-bold text-white">Would you like a Quick Scan of {domain}?</h2>
                <p className="text-sm leading-6 text-slate-400">
                  We look at {domain} the way an attacker would from the outside: DNS, TLS, headers and subdomains.
                  Passive checks only, nothing is attacked, and it takes a few minutes. When it completes, you move to
                  the prioritized launch list.
                </p>
                {error && <p className="text-sm text-severity-critical">{error}</p>}
                <button type="button" className="btn-primary w-full !py-3" disabled={busy} onClick={() => void scan()}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} Yes, scan {domain}
                </button>
                <button type="button" className="w-full text-center text-sm text-slate-400 hover:text-slate-200" onClick={skipScan}>
                  No thanks
                </button>
              </div>
            )}

            {stage === "scanning" && (
              <div aria-live="polite">
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-gold-400">Quick Scan running</p>
                <h2 className="mt-2 break-all font-display text-2xl font-bold text-white">{domain}</h2>
                <p className="mt-2 text-sm text-slate-400">You can leave this page. Your place on the list is saved.</p>
                <ol className="mt-5 divide-y divide-phantix-700/40 rounded-md border border-phantix-700/50">
                  {(entry?.scan?.steps ?? []).map((p) => (
                    <li key={p.step} className="flex items-center gap-3 px-4 py-3 text-sm">
                      {p.state === "done" ? <CheckCircle2 size={16} className="text-emerald-400" />
                        : p.state === "running" ? <Loader2 size={16} className="animate-spin text-gold-400" />
                          : p.state === "failed" ? <XCircle size={16} className="text-severity-critical" />
                            : <Circle size={16} className="text-phantix-700" />}
                      <span className={cx(p.state === "pending" || p.state === "skipped" ? "text-slate-500" : "text-slate-200")}>{STEP_LABEL[p.step] ?? p.step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {stage === "done" && (
              entry?.prioritized ? (
                <div className="text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold-400/15 text-gold-400"><Sparkles size={20} /></span>
                  <h2 className="mt-4 font-display text-2xl font-bold text-white">You are on the prioritized launch list</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    The Quick Scan of {domain} is complete. We will invite you first when registration opens again.
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-400"><CheckCircle2 size={20} /></span>
                  <h2 className="mt-4 font-display text-2xl font-bold text-white">You are on the waitlist</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {note ?? (entry?.status === "scan_failed"
                      ? `The Quick Scan of ${domain} could not finish. You are still on the waitlist.`
                      : "We will email you when registration opens again.")}
                  </p>
                  {token && entry?.status !== "scan_failed" && !note && (
                    <button type="button" className="btn-secondary mt-5" disabled={busy} onClick={() => void scan()}>
                      <Radar size={15} /> Scan {domain} to get prioritized
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
