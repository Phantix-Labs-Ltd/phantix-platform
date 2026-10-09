import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Github, Loader2 } from "lucide-react";
import { useStore, type GithubAuthResult } from "@/lib/store";
import { BrandWordmark } from "@/components/BrandLogo";
import { errorCode } from "@/lib/api";
import { BetaBanner, BetaOptIn, RegistrationClosed } from "@/components/BetaSignup";
import { useSignupStatus } from "@/lib/betaSignup";

type Signup = Extract<GithubAuthResult, { kind: "signup" }>;

/** GitHub redirects here with `code` and `state`. An existing organization is
 *  signed straight in; a new one only needs a company name. */
export default function GithubAuthCallback() {
  const { githubAuthCallback, registerWithGithub } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [signup, setSignup] = useState<Signup | null>(null);
  const [company, setCompany] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [joinBeta, setJoinBeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const { status, reload: reloadStatus } = useSignupStatus();
  const beta = status?.phase === "beta";
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice; the OAuth code is single-use.
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const oauthState = params.get("state");
    if (params.get("error")) return setError("GitHub sign-in was cancelled.");
    if (!code || !oauthState) return setError("This sign-in link is incomplete. Start again.");
    githubAuthCallback(code, oauthState)
      .then((res) => {
        if (res.kind === "signed_in") navigate("/setup", { replace: true });
        else { setSignup(res); setCompany(res.suggestedCompany); }
      })
      .catch((err) => {
        setError(errorCode(err) === "github_email_unverified"
          ? "Your GitHub primary email isn't verified. Verify it on GitHub, or sign up with email."
          : (err instanceof Error && err.message) || "GitHub sign-in failed. Start again.");
      });
  }, [params, githubAuthCallback, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signup) return;
    setError(null);
    if (company.trim().length < 2) return setError("Enter your company name");
    if (!accepted) return setError("Accept the terms to continue");
    if (beta && !joinBeta) return setError("Join the beta sandbox to register during the beta");
    setBusy(true);
    try {
      await registerWithGithub(signup.signupToken, company.trim(), beta && joinBeta);
      navigate("/setup", { replace: true });
    } catch (err) {
      const code = errorCode(err);
      if (code === "registration_closed" || code === "beta_opt_in_required") reloadStatus();
      setError(err instanceof Error ? err.message : "Could not create your account");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-7">
        <BrandWordmark className="h-9" />
        {!signup && !error && (
          <p className="mt-8 flex items-center gap-2.5 text-sm text-slate-300">
            <Loader2 size={16} className="animate-spin text-gold-400" /> Signing you in with GitHub...
          </p>
        )}
        {!signup && error && (
          <>
            <p className="mt-8 text-sm text-severity-critical">{error}</p>
            <div className="mt-5 flex gap-3">
              <Link to="/register" className="btn-primary">Back to sign-up</Link>
              <Link to="/login" className="btn-ghost">Sign in</Link>
            </div>
          </>
        )}
        {signup && status?.phase === "closed" && (
          <div className="mt-6"><RegistrationClosed /></div>
        )}
        {signup && status?.phase !== "closed" && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {beta && status && <BetaBanner status={status} />}
            <h1 className="font-display text-2xl font-bold text-white">One last thing</h1>
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Github size={14} /> Signed in as <span className="text-slate-200">{signup.email}</span>
            </p>
            <div>
              <label className="label" htmlFor="gh-company">Company name</label>
              <input id="gh-company" className="input" autoComplete="organization" autoFocus value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your Company" />
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
        )}
      </div>
    </div>
  );
}
