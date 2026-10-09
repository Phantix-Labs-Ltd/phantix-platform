import React from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Lock } from "lucide-react";
import type { SignupStatus } from "@/lib/betaSignup";

/** Shown above a sign-up form while the beta is on. */
export function BetaBanner({ status }: { status: SignupStatus }) {
  return (
    <div role="note" className="mb-5 rounded-md border border-gold-400/30 bg-gold-400/[0.06] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <FlaskConical size={15} className="text-gold-400" /> Beta: {status.remaining} of {status.target} places left
      </p>
      <p className="mt-1.5 text-[13px] leading-5 text-slate-400">
        SecureGraph is open to its first {status.target} organizations. Registering now means joining the sandbox: you
        try new features first and tell us what works. A place is taken once you finish setup by connecting your
        security database.
      </p>
    </div>
  );
}

/** The required opt-in during the beta. */
export function BetaOptIn({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 rounded-md border border-gold-400/30 bg-gold-400/[0.04] p-3 text-[13px] leading-5 text-slate-300">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} required />
      <span>
        <span className="font-medium text-white">Join the beta sandbox.</span> Required to register during the beta. Your
        organization joins the sandbox cohort as soon as the account is created.
      </span>
    </label>
  );
}

/** In place of a sign-up form while registration is closed. */
export function RegistrationClosed() {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-phantix-800/70 text-gold-400">
        <Lock size={18} />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold text-white">Registration is closed for now</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        The beta is full. We will open registration again soon.
      </p>
      <Link to="/waitlist" className="btn-primary mt-5 inline-flex">Join the waitlist</Link>
      <p className="mt-5 text-xs text-slate-500">
        Already registered? <Link to="/login" className="text-gold-400 hover:text-gold-300">Sign in</Link>
      </p>
    </div>
  );
}
