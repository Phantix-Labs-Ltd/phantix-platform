import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Github, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { BrandWordmark } from "@/components/BrandLogo";
import { errorCode } from "@/lib/api";
import SocialSignupForm, { type SocialSignup } from "@/components/SocialSignupForm";

/** GitHub redirects here with `code` and `state`. An existing organization is
 *  signed straight in; a new one only needs a company name. */
export default function GithubAuthCallback() {
  const { githubAuthCallback, registerWithGithub } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [signup, setSignup] = useState<SocialSignup | null>(null);
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
        else setSignup(res);
      })
      .catch((err) => {
        setError(errorCode(err) === "github_email_unverified"
          ? "Your GitHub primary email isn't verified. Verify it on GitHub, or sign up with email."
          : (err instanceof Error && err.message) || "GitHub sign-in failed. Start again.");
      });
  }, [params, githubAuthCallback, navigate]);

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
        {signup && (
          <SocialSignupForm provider="GitHub" icon={<Github size={14} />} signup={signup} register={registerWithGithub} />
        )}
      </div>
    </div>
  );
}
