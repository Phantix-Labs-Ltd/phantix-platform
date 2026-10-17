import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { RegisterResult, SocialAuthResult } from "@/lib/store";
import { errorCode } from "@/lib/api";
import { BetaBanner, BetaOptIn, RegistrationClosed } from "@/components/BetaSignup";
import { useSignupStatus } from "@/lib/betaSignup";

export type SocialSignup = Extract<SocialAuthResult, { kind: "signup" }>;

/**
 * The last step of a GitHub or Google sign-up: the provider already verified
 * the email, so only the company name, the terms and (during the beta) the
 * sandbox opt-in are left.
 */
export default function SocialSignupForm({
  provider,
  icon,
  signup,
  register,
}: {
  provider: string;
  icon: React.ReactNode;
  signup: SocialSignup;
  register: (signupToken: string, companyName: string, joinBeta: boolean) => Promise<RegisterResult>;
}) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(signup.suggestedCompany);
  const [accepted, setAccepted] = useState(false);
  const [joinBeta, setJoinBeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, reload: reloadStatus } = useSignupStatus();
  const beta = status?.phase === "beta";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (company.trim().length < 2) return setError("Enter your company name");
    if (!accepted) return setError("Accept the terms to continue");
    if (beta && !joinBeta) return setError("Join the beta sandbox to register during the beta");
    setBusy(true);
    try {
      await register(signup.signupToken, company.trim(), beta && joinBeta);
      navigate("/setup", { replace: true });
    } catch (err) {
      const code = errorCode(err);
      if (code === "registration_closed" || code === "beta_opt_in_required") reloadStatus();
      setError(
        code === "signup_token_invalid"
          ? `Your ${provider} sign-up session expired. Start again from the sign-up page.`
          : (err instanceof Error && err.message) || "Could not create your account",
      );
      setBusy(false);
    }
  };

  if (status?.phase === "closed") return <div className="mt-6"><RegistrationClosed /></div>;

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {beta && status && <BetaBanner status={status} />}
      <h1 className="font-display text-2xl font-bold text-white">One last thing</h1>
      <p className="flex items-center gap-2 text-sm text-slate-400">
        {icon} Signed in with {provider} as <span className="text-slate-200">{signup.email}</span>
      </p>
      <div>
        <label className="label" htmlFor="social-company">Company name</label>
        <input id="social-company" className="input" autoComplete="organization" autoFocus value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your Company" />
      </div>
      <label className="flex items-start gap-2.5 text-[13px] leading-5 text-slate-400">
        <input type="checkbox" className="mt-0.5" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>
          I agree to the <Link to="/terms" className="text-gold-400 hover:text-gold-300">Terms</Link>,{" "}
          <Link to="/aup" className="text-gold-400 hover:text-gold-300">Acceptable Use Policy</Link> and{" "}
          <Link to="/privacy" className="text-gold-400 hover:text-gold-300">Privacy notice</Link>, including that I
          only test targets I own or am authorized to test.
        </span>
      </label>
      {beta && <BetaOptIn checked={joinBeta} onChange={setJoinBeta} />}
      {error && <p className="text-sm text-severity-critical">{error}</p>}
      <button className="btn-primary w-full !py-3" disabled={busy || (beta && !joinBeta)}>
        {busy ? "Creating your account..." : "Create account"} <ArrowRight size={15} />
      </button>
    </form>
  );
}
