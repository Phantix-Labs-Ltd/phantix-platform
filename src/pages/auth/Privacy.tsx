import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Database, EyeOff, KeyRound, CheckCircle2, FileText } from "lucide-react";
import { api, DEMO_MODE } from "@/lib/api";
import { BrandMark } from "@/components/BrandLogo";

interface PrivacyNotice {
  version?: string;
  title?: string;
  summary?: string;
  highlights?: { id?: string; label?: string; text?: string }[];
  phantix_stores?: { category?: string; items?: string[] }[];
  notice_text?: string;
  text?: string;
  body?: string;
}

// Fetches GET /api/v1/organizations/privacy (public, no auth); keeps the static
// narrative below as a graceful fallback when the endpoint is unavailable.
export default function Privacy() {
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);

  useEffect(() => {
    if (DEMO_MODE) return;
    (async () => {
      try {
        const raw = await api.get<unknown>("/organizations/privacy");
        const items = (raw as { items?: unknown[] })?.items;
        const n = (Array.isArray(items) ? items[0] : raw) as PrivacyNotice | null;
        setNotice(n);
      } catch { /* keep static copy */ }
    })();
  }, []);

  const highlights = notice?.highlights ?? [];
  const stores = notice?.phantix_stores ?? [];
  const noticeText = notice?.notice_text || notice?.text || notice?.body;

  return (
    <div className="relative min-h-screen px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto max-w-3xl">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-200">
          <ArrowLeft size={15} /> Back to sign-in
        </Link>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <div className="flex items-center gap-4">
            <BrandMark className="h-16 w-16" />
            <div>
              <h1 className="font-display text-3xl font-bold text-white">{notice?.title || "Privacy notice"}</h1>
              <p className="text-sm text-slate-500">{notice?.summary || "How SecureGraph handles your data --- the short, honest version"}</p>
              {notice?.version && <p className="mt-1 text-[13px] font-mono text-slate-600">version {notice.version}</p>}
            </div>
          </div>
        </motion.div>

        {noticeText && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6">
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-400/15 text-gold-400"><FileText size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Privacy notice</h2>
              </div>
              <div className="mt-4 space-y-3 whitespace-pre-line text-sm leading-6 text-slate-300">{noticeText}</div>
            </div>
          </motion.div>
        )}

        {highlights.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-6">
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><ShieldCheck size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Highlights</h2>
              </div>
              <ul className="mt-4 space-y-2.5">
                {highlights.map((h, i) => (
                  <li key={h.id ?? i} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span><strong className="text-slate-200">{h.label}</strong>{h.text ? `: ${h.text}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}

        {stores.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6">
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><Database size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Data we store</h2>
              </div>
              <ul className="mt-4 space-y-2.5">
                {stores.flatMap((s) => (s.items ?? []).map((item, i) => (
                  <li key={`${s.category}-${i}`} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                    {s.category && <strong className="text-slate-200">{s.category}:</strong>} {item}
                  </li>
                )))}
              </ul>
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-8 space-y-5">
          <div className="card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><ShieldCheck size={18} /></span>
              <h2 className="font-display text-lg font-semibold text-white">What SecureGraph stores</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[
                "Tenancy: organization profile, users, roles and dual-control assignments",
                "Encrypted credentials for your database connections --- never plaintext",
                "Billing, plan and usage state bound to your company",
                "Dual-control audit metadata: who initiated, who authorized, when",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="card border-gold-400/25 p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-400/15 text-gold-400"><Database size={18} /></span>
              <h2 className="font-display text-lg font-semibold text-white">What lives in your dedicated security database</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[
                "Assets, tags, discovery jobs and full inventory history",
                "Scan results, VAPT findings and their evidence",
                "Risks, assessments, treatments and residual scores",
                "Compliance evidence collected by connectors",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold-400" /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-md bg-phantix-950/60 border border-phantix-700/40 p-3.5 text-xs leading-5 text-slate-400">
              Everything is written only to a dedicated schema in a database you own. SecureGraph connects on
              demand --- there is no copy on our side.
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-severity-critical/12 text-severity-critical"><EyeOff size={18} /></span>
              <h2 className="font-display text-lg font-semibold text-white">What SecureGraph never touches</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[
                "Production application tables and business rows",
                "Customer personal data sets. Config inspection reads catalogs and security metadata only",
                "Document or collection contents in Mongo or Firestore. Names and IDs only",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-severity-critical/80" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><KeyRound size={18} /></span>
              <h2 className="font-display text-lg font-semibold text-white">Identity and verification</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[
                "Sign-in email is verified with a one-time code --- email OTP only, no phone OTP",
                "Company verification is optional: domain DNS/HTTP token, CAC/RC details, or manual staff review",
                "Operators use named org-user logins with domain-email OTP and device binding",
                "Sensitive mutations require dual control --- one person proposes, another approves",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-phantix-700/40 bg-phantix-900/50 px-6 py-4">
            <p className="text-sm text-slate-400">Ready to proceed?</p>
            <Link to="/login" className="btn-primary !py-2">Sign in</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
