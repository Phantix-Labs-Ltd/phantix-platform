import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, FileText, ScrollText, CheckCircle2, ShieldAlert } from "lucide-react";
import { api, DEMO_MODE } from "@/lib/api";
import { BrandMark } from "@/components/BrandLogo";

interface TermsSection {
  id?: string;
  title?: string;
  body?: string;
  items?: string[];
}

interface TermsOfService {
  version?: string;
  title?: string;
  effective?: string;
  summary?: string;
  sections?: TermsSection[];
  acceptance_required_copy?: string;
}

function SectionBody({ section }: { section: TermsSection }) {
  return (
    <>
      {section.body && <p className="mt-2.5 text-sm leading-6 text-slate-300">{section.body}</p>}
      {section.items && section.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {section.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-6 text-slate-300">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Fetches GET /api/v1/organizations/terms (public, no auth); keeps the static
// narrative below as a graceful fallback when the endpoint is unavailable.
export default function Terms() {
  const [terms, setTerms] = useState<TermsOfService | null>(null);

  useEffect(() => {
    if (DEMO_MODE) return;
    (async () => {
      try {
        const raw = await api.get<unknown>("/organizations/terms");
        const items = (raw as { items?: unknown[] })?.items;
        const n = (Array.isArray(items) ? items[0] : raw) as TermsOfService | null;
        setTerms(n);
      } catch { /* keep static copy */ }
    })();
  }, []);

  const sections = terms?.sections ?? [];

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
              <h1 className="font-display text-3xl font-bold text-white">{terms?.title || "Terms of Service and Acceptable Use"}</h1>
              <p className="text-sm text-slate-500">{terms?.effective || terms?.summary || "The agreement that governs your use of the SecureGraph platform"}</p>
              {terms?.version && <p className="mt-1 text-[13px] font-mono text-slate-600">version {terms.version}</p>}
            </div>
          </div>
        </motion.div>

        {terms?.summary && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6">
            <div className="card border-gold-400/25 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-400/15 text-gold-400"><ScrollText size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Summary</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{terms.summary}</p>
            </div>
          </motion.div>
        )}

        {sections.length > 0 ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-6 space-y-5">
            {sections.map((s, i) => (
              <div key={s.id ?? i} className="card p-6">
                <h2 className="font-display text-base font-semibold text-white">{s.title || `Section ${i + 1}`}</h2>
                <SectionBody section={s} />
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-6 space-y-5">
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><FileText size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Services</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                SecureGraph provides a subscription-based security platform covering attack-surface discovery,
                asset intelligence, compliance tracking, and optional staff-facilitated VAPT / security
                assessment services. Subscriptions recur at the agreed billing cycle; project engagements
                are billed as one-off fees. All payments are processed through our payment provider (Paystack).
              </p>
            </div>

            <div className="card border-gold-400/25 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-400/15 text-gold-400"><ShieldAlert size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Authorization to test</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                You must own, or hold written authorization from the owner for, every system, application, or
                infrastructure you submit for assessment. You agree to maintain that authorization and to test
                only in-scope assets. The platform requires confirmation of ownership or authorization before
                active testing proceeds, and all activity is logged and auditable. For IP addresses and other
                targets that can't be verified technically, your acceptance of the Acceptable Use Policy is that
                confirmation, and you indemnify SecureGraph for testing them.
              </p>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><ShieldCheck size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Acceptable use</h2>
              </div>
              <ul className="mt-4 space-y-2.5">
                {[
                  "No probing or disruption of systems you do not own or hold authorization for",
                  "No denial-of-service or other destructive activity",
                  "No access or exfiltration of data without permission",
                  "Compliance with all applicable law; accounts in breach may be suspended",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><FileText size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Accounts, billing and liability</h2>
              </div>
              <ul className="mt-4 space-y-2.5">
                {[
                  "You are responsible for activity under your account and for the security of your credentials",
                  "Subscriptions renew at the agreed cycle until cancelled; project fees are billed per statement of work",
                  "Security testing cannot guarantee discovery of all vulnerabilities; the platform is provided 'as is'",
                  "These terms are governed by the laws of the Federal Republic of Nigeria",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}

        {terms?.acceptance_required_copy && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6">
            <div className="rounded-2xl border border-phantix-700/40 bg-phantix-900/50 p-4 text-sm leading-6 text-slate-300">
              <strong className="text-slate-200">Acceptance: </strong>{terms.acceptance_required_copy}
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6 flex items-center justify-between rounded-2xl border border-phantix-700/40 bg-phantix-900/50 px-6 py-4">
          <p className="text-sm text-slate-400">Questions? See our <Link to="/privacy" className="text-gold-400 hover:text-gold-300">privacy notice</Link>.</p>
          <Link to="/login" className="btn-primary !py-2">Back to sign-in</Link>
        </motion.div>
      </div>
    </div>
  );
}
