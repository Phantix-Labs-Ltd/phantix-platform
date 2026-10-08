import React, { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Globe, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { APPLICATIONS_STEP } from "@/lib/firstRun";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import VerifiedDomainsCard from "@/components/VerifiedDomainsCard";

/**
 * First-run step after the Quick Scan results are saved: prove the organization
 * owns its domain. Active testing (VAPT, pentest agents) only runs against
 * verified domains and their subdomains. DNS changes can take a while, so the
 * user may continue and finish this later from Identity.
 */
export default function DomainStep() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prefill = params.get("domain") || undefined;
  const [verified, setVerified] = useState(0);
  const onVerifiedChange = useCallback((n: number) => setVerified(n), []);

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
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 size={15} /> Your Quick Scan results are saved to your security database.
        </p>

        <div className="mt-4 mb-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-400">Next step</p>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold text-white">
            <Globe size={20} className="text-gold-400" /> Verify your domain
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Active testing, such as VAPT, only runs against domains you have proven you own. Add a DNS record, or publish
            a small file, then check. A verified domain covers all of its subdomains.
          </p>
        </div>

        <VerifiedDomainsCard prefill={prefill} onVerifiedChange={onVerifiedChange} />

        <div className="card mt-4 p-5">
          {verified > 0 ? (
            <>
              <p className="flex items-center gap-2 text-sm text-emerald-300">
                <ShieldCheck size={15} /> {verified === 1 ? "1 domain is" : `${verified} domains are`} verified. Active testing is unlocked.
              </p>
              <button type="button" onClick={() => navigate(APPLICATIONS_STEP)} className="btn-primary mt-4 w-full !py-3">
                Continue: choose your applications <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                DNS changes can take a few minutes. You can continue now and finish verifying later from Identity, but
                VAPT stays locked until a domain is verified.
              </p>
              <button type="button" onClick={() => navigate(APPLICATIONS_STEP)} className="btn-secondary mt-4 w-full !py-3">
                Verify later and continue <ArrowRight size={15} />
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-sm">
          <Link to="/dashboard" className="text-slate-500 hover:text-slate-300">Skip to dashboard</Link>
        </p>
      </main>
    </div>
  );
}
