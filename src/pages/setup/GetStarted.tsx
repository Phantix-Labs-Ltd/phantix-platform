import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, CheckCircle2, Circle, Database, ExternalLink, Github, Globe, Loader2, Radar, RefreshCw, ShieldCheck, XCircle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { errorCode } from "@/lib/api";
import { APP_URL } from "@/lib/links";
import { cx } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  SEVERITY_ORDER, getQuickScan, importQuickScan, isValidDomain, isValidRepo, latestQuickScan, normalizeDomain, normalizeRepo,
  startQuickScan, type QuickScan, type QuickScanTargetType, type Severity,
} from "@/lib/quickScan";

/** Mail providers whose domain is not the user's company domain. */
const PERSONAL_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "proton.me", "protonmail.com", "aol.com"]);

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "text-severity-critical border-severity-critical/30 bg-severity-critical/10",
  high: "text-severity-high border-severity-high/30 bg-severity-high/10",
  medium: "text-severity-medium border-severity-medium/30 bg-severity-medium/10",
  low: "text-severity-low border-severity-low/30 bg-severity-low/10",
  info: "text-severity-info border-severity-info/30 bg-severity-info/10",
};

const POLL_MS = 2000;

/**
 * First value: a passive Quick Scan of a domain or GitHub repo, run by one
 * person with no dual control. Results are a 7-day preview until they are
 * imported into the organization's own security database.
 */
export default function GetStarted() {
  const { state, session, securityDbReady, markMilestone, refreshOnboarding } = useStore();
  const navigate = useNavigate();

  const emailDomain = (session?.email || state.org.email || "").split("@")[1]?.toLowerCase() || "";
  const [targetType, setTargetType] = useState<QuickScanTargetType>("domain");
  const [target, setTarget] = useState(() => (emailDomain && !PERSONAL_MAIL.has(emailDomain) ? emailDomain : ""));
  const [scan, setScan] = useState<QuickScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback((id: QuickScan["id"]) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const next = await getQuickScan(id);
        setScan(next);
        if (next.status === "queued" || next.status === "running") poll(id);
        else void refreshOnboarding();
      } catch {
        poll(id); // transient: keep trying at the same pace
      }
    }, POLL_MS);
  }, [refreshOnboarding]);

  // Resume the latest scan (a refresh mid-scan, or coming back from the checklist).
  useEffect(() => {
    let alive = true;
    latestQuickScan().then((latest) => {
      if (!alive) return;
      if (latest && !latest.imported_at) {
        setScan(latest);
        if (latest.status === "queued" || latest.status === "running") poll(latest.id);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [poll]);

  // Seeing the results is the "first findings" moment on the checklist.
  useEffect(() => {
    if (scan?.status === "done") void markMilestone("first_finding_viewed");
  }, [scan?.status, markMilestone]);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = targetType === "domain" ? normalizeDomain(target) : normalizeRepo(target);
    if (targetType === "domain" && !isValidDomain(value)) return setError("Enter a domain like acme.com");
    if (targetType === "github_repo" && !isValidRepo(value)) return setError("Enter a repo like acme/web or its GitHub URL");
    setBusy(true);
    try {
      const started = await startQuickScan(targetType, value);
      setScan(started);
      poll(started.id);
    } catch (err) {
      const code = errorCode(err);
      setError(code === "rate_limited" || (err as { status?: number })?.status === 429
        ? "You've used today's Quick Scans. Try again tomorrow, or connect your database to run full scans."
        : err instanceof Error ? err.message : "Could not start the scan");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!scan) return;
    setBusy(true);
    setError(null);
    try {
      await importQuickScan(scan.id);
      setImported(true);
      void refreshOnboarding();
    } catch (err) {
      const code = errorCode(err);
      if (code === "security_db_missing") navigate("/connections?from=quick-scan");
      else if (code === "already_imported") { setImported(true); void refreshOnboarding(); }
      else if (code === "quick_scan_expired") setError("This preview expired. Scan again to get fresh results.");
      else if (await importFinishedAnyway(scan.id)) { setImported(true); void refreshOnboarding(); }
      else setError(err instanceof Error ? err.message : "Could not save the results");
    } finally {
      setBusy(false);
    }
  };

  /**
   * A big import can outlast the request (the server keeps going after the
   * browser gives up). Check the scan for up to two minutes before reporting
   * a failure.
   */
  const importFinishedAnyway = async (id: QuickScan["id"]) => {
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const latest = await getQuickScan(id);
        if (latest.imported_at) return true;
      } catch { /* keep trying */ }
    }
    return false;
  };

  const restart = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setScan(null);
    setImported(false);
    setError(null);
  };

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <header className="relative flex items-center justify-between px-4 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-9 w-9" />
          <span className="font-display text-[15px] font-bold text-white">{state.org.name || "SecureGraph"}</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/dashboard" className="btn-ghost text-sm">Skip to dashboard <ArrowRight size={14} /></Link>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6">
        {loading ? (
          <div className="card flex items-center gap-2.5 p-7 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin text-gold-400" /> Loading...
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {!scan && (
              <motion.div key="ask" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-gold-400">Quick Scan</p>
                <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">What do you want to protect?</h1>
                <p className="mt-3 max-w-xl text-[15px] leading-7 text-slate-400">
                  We'll look at it the way an attacker would from the outside. Passive checks only: nothing is
                  attacked, and it takes a few minutes.
                </p>

                <form onSubmit={run} className="card mt-8 space-y-5 p-7">
                  <div role="tablist" aria-label="What to scan" className="grid grid-cols-2 gap-2 rounded-lg bg-phantix-950/60 p-1">
                    {([
                      { id: "domain", label: "A domain", icon: <Globe size={15} /> },
                      { id: "github_repo", label: "A GitHub repo", icon: <Github size={15} /> },
                    ] as const).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={targetType === t.id}
                        onClick={() => { setTargetType(t.id); setTarget(t.id === "domain" && emailDomain && !PERSONAL_MAIL.has(emailDomain) ? emailDomain : ""); setError(null); }}
                        className={cx(
                          "flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                          targetType === t.id ? "bg-phantix-800 text-white" : "text-slate-400 hover:text-slate-200",
                        )}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="label" htmlFor="qs-target">{targetType === "domain" ? "Domain" : "Repository"}</label>
                    <input
                      id="qs-target"
                      className="input font-mono"
                      value={target}
                      autoFocus
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder={targetType === "domain" ? "acme.com" : "acme/web or https://github.com/acme/web"}
                    />
                    {targetType === "github_repo" && (
                      <p className="mt-1.5 text-[13px] text-slate-500">
                        Public repos scan straight away. For private repos,{" "}
                        <Link to="/github" className="text-gold-400 hover:text-gold-300">install the GitHub App</Link> first.
                      </p>
                    )}
                  </div>
                  {error && <p className="text-sm text-severity-critical">{error}</p>}
                  <button className="btn-primary w-full !py-3" disabled={busy}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} Run Quick Scan
                  </button>
                </form>
                <p className="mt-4 flex items-center gap-2 text-[13px] text-slate-500">
                  <ShieldCheck size={14} className="text-gold-400" />
                  Only scan things you own or are allowed to test. Active testing (VAPT) asks you to verify ownership first.
                </p>
              </motion.div>
            )}

            {scan && (scan.status === "queued" || scan.status === "running") && (
              <motion.div key="running" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-gold-400">Quick Scan running</p>
                <h1 className="mt-2 break-all font-display text-3xl font-bold text-white">{scan.target}</h1>
                <p className="mt-2 text-sm text-slate-400">You can leave this page. The results will be here when you come back.</p>
                <ol className="card mt-8 divide-y divide-phantix-700/40 p-0" aria-live="polite">
                  {scan.progress.map((p) => (
                    <li key={p.step} className="flex items-center gap-3 px-6 py-4 text-sm">
                      {p.state === "done" ? <CheckCircle2 size={17} className="text-emerald-400" />
                        : p.state === "running" ? <Loader2 size={17} className="animate-spin text-gold-400" />
                          : p.state === "failed" ? <XCircle size={17} className="text-severity-critical" />
                            : <Circle size={17} className="text-phantix-700" />}
                      <span className={cx(p.state === "pending" || p.state === "skipped" ? "text-slate-500" : "text-slate-200")}>{p.step}</span>
                      {p.state === "skipped" && <span className="ml-auto text-xs text-slate-600">skipped</span>}
                    </li>
                  ))}
                </ol>
              </motion.div>
            )}

            {scan?.status === "failed" && (
              <motion.div key="failed" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card p-7">
                <h1 className="font-display text-2xl font-bold text-white">The scan couldn't finish</h1>
                <p className="mt-2 text-sm text-slate-400">{scan.error || "We couldn't reach the target. Check the spelling and that it is publicly reachable."}</p>
                <button type="button" onClick={restart} className="btn-primary mt-5"><RefreshCw size={14} /> Try again</button>
              </motion.div>
            )}

            {scan?.status === "done" && (
              <motion.div key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <Results scan={scan} />

                <div className="card mt-6 p-6">
                  {imported ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <p className="flex items-center gap-2.5 text-sm text-emerald-300">
                        <CheckCircle2 size={16} /> Saved to your security database.
                      </p>
                      <a href={APP_URL} className="btn-primary">Open in SecureGraph <ExternalLink size={14} /></a>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">Keep these results</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {securityDbReady
                            ? "Move them into your security database to track and fix them."
                            : "Your findings live in your own database, never ours. Neon or Supabase take about two minutes."}
                          {scan.expires_at && <> This preview is deleted on {new Date(scan.expires_at).toLocaleDateString()}.</>}
                        </p>
                      </div>
                      {securityDbReady ? (
                        <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary">
                          {busy ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />} Save results
                        </button>
                      ) : (
                        <Link to="/connections?from=quick-scan" className="btn-primary"><Database size={15} /> Connect a database</Link>
                      )}
                    </div>
                  )}
                  {error && <p className="mt-3 text-sm text-severity-critical">{error}</p>}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <button type="button" onClick={restart} className="text-slate-400 hover:text-slate-200">Scan something else</button>
                  <Link to="/dashboard" className="text-gold-400 hover:text-gold-300">Go to dashboard <ArrowRight size={13} className="inline" /></Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

function Results({ scan }: { scan: QuickScan }) {
  const counts = SEVERITY_ORDER.map((sev) => ({ sev, n: scan.findings.filter((f) => f.severity === sev).length }));
  const sorted = [...scan.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return (
    <>
      <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-gold-400">Quick Scan results</p>
      <h1 className="mt-2 break-all font-display text-3xl font-bold text-white">{scan.target}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {scan.findings.length === 0
          ? `Nothing stood out across ${scan.assets.length} assets. A full assessment goes much deeper.`
          : `${scan.findings.length} things worth fixing across ${scan.assets.length} assets.`}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {counts.filter((c) => c.n > 0).map((c) => (
          <span key={c.sev} className={cx("rounded-full border px-3 py-1 text-xs font-semibold capitalize", SEVERITY_TEXT[c.sev])}>
            {c.n} {c.sev}
          </span>
        ))}
      </div>

      {sorted.length > 0 && (
        <ul className="card mt-6 divide-y divide-phantix-700/40 p-0">
          {sorted.map((f, i) => (
            <li key={f.id ?? i} className="px-6 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className={cx("mt-0.5 shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold uppercase", SEVERITY_TEXT[f.severity])}>{f.severity}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{f.title}</p>
                  {f.asset && <p className="mt-0.5 break-all font-mono text-xs text-slate-500">{f.asset}</p>}
                  {f.detail && <p className="mt-1.5 text-sm text-slate-400">{f.detail}</p>}
                  {f.recommendation && <p className="mt-1.5 text-sm text-slate-300"><span className="text-slate-500">Fix: </span>{f.recommendation}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {scan.assets.length > 0 && (
        <details className="card mt-4 p-0">
          <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-slate-300">
            {scan.assets.length} assets found
          </summary>
          <ul className="divide-y divide-phantix-700/40 border-t border-phantix-700/40">
            {scan.assets.map((a) => (
              <li key={`${a.type}:${a.value}`} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                <span className="break-all font-mono text-slate-300">{a.value}</span>
                <span className="shrink-0 text-xs text-slate-500">{a.type}{a.source ? ` · ${a.source}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
