import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldAlert, FileText, CheckCircle2, ScrollText, Ban } from "lucide-react";
import { api, DEMO_MODE } from "@/lib/api";
import { BrandMark } from "@/components/BrandLogo";

interface AupSection {
  id?: string;
  title?: string;
  body?: string;
  items?: string[];
}

interface AcceptableUsePolicy {
  version?: string;
  title?: string;
  effective?: string;
  summary?: string;
  sections?: AupSection[];
  acceptance_required_copy?: string;
}

function SectionBody({ section }: { section: AupSection }) {
  return (
    <>
      {section.body && <p className="mt-2.5 text-sm leading-6 text-slate-300">{section.body}</p>}
      {section.items && section.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {section.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-6 text-slate-300">
              <Ban size={14} className="mt-0.5 shrink-0 text-severity-medium" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Fetches GET /api/v1/organizations/aup (public, no auth); keeps the static
// narrative below as a graceful fallback when the endpoint is unavailable.
export default function AcceptableUsePolicy() {
  const [aup, setAup] = useState<AcceptableUsePolicy | null>(null);

  useEffect(() => {
    if (DEMO_MODE) return;
    (async () => {
      try {
        const raw = await api.get<unknown>("/organizations/aup");
        const items = (raw as { items?: unknown[] })?.items;
        const n = (Array.isArray(items) ? items[0] : raw) as AcceptableUsePolicy | null;
        setAup(n);
      } catch { /* keep static copy */ }
    })();
  }, []);

  const sections = aup?.sections ?? [];

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
              <h1 className="font-display text-3xl font-bold text-white">{aup?.title || "Acceptable Use Policy"}</h1>
              <p className="text-sm text-slate-500">{aup?.effective || aup?.summary || "Rules for the lawful use of the SecureGraph platform, and only on authorized systems."}</p>
              {aup?.version && <p className="mt-1 text-[13px] font-mono text-slate-600">version {aup.version}</p>}
            </div>
          </div>
        </motion.div>

        {aup?.summary && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6">
            <div className="card border-gold-400/25 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-400/15 text-gold-400"><ScrollText size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Summary</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{aup.summary}</p>
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
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-400/15 text-gold-400"><ShieldAlert size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Authorized use only</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Use the SecureGraph platform only to assess, discover, or test systems you own or for which
                you hold written authorization from the lawful owner. Confirm ownership or authorization
                in the platform before active testing; all activity is logged and auditable.
              </p>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-severity-critical/12 text-severity-critical"><Ban size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Prohibited conduct</h2>
              </div>
              <ul className="mt-4 space-y-2.5">
                {[
                  "Unauthorized access to any computer system or network (Cybercrimes Act, s.6)",
                  "Denial-of-service or disruption of systems (s.8)",
                  "Distribution of malware, ransomware, or viruses (s.32(3))",
                  "Phishing, or the collection of credentials by deception (s.32)",
                  "Password or credential trafficking and evasion devices (s.28)",
                  "Cyberstalking, or the distribution of offensive messages (s.24)",
                  "Data exfiltration you are not authorized to access",
                  "Scanning Critical National Information Infrastructure without lawful authority",
                  "Circumvention or interference with the security controls of the platform",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <Ban size={14} className="mt-0.5 shrink-0 text-severity-medium" /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-phantix-700/50 text-phantix-300"><FileText size={18} /></span>
                <h2 className="font-display text-lg font-semibold text-white">Enforcement</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Breach of this policy is a material breach of the Terms and may result in immediate
                suspension or termination, and referral to the appropriate authorities where conduct is
                unlawful. Incidents affecting computer systems may carry separate reporting duties under
                Section 21 of the Cybercrimes Act and Section 40 of the NDPA.
              </p>
            </div>
          </motion.div>
        )}

        {aup?.acceptance_required_copy && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6">
            <div className="rounded-2xl border border-phantix-700/40 bg-phantix-900/50 p-4 text-sm leading-6 text-slate-300">
              <strong className="text-slate-200">Acceptance: </strong>{aup.acceptance_required_copy}
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6 flex items-center justify-between rounded-2xl border border-phantix-700/40 bg-phantix-900/50 px-6 py-4">
          <p className="text-sm text-slate-400">See also our <Link to="/terms" className="text-gold-400 hover:text-gold-300">Terms of Service</Link>.</p>
          <Link to="/login" className="btn-primary !py-2">Back to sign-in</Link>
        </motion.div>
      </div>
    </div>
  );
}
