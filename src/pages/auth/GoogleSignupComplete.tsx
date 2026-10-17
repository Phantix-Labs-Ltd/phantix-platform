import { Link, Navigate, useLocation } from "react-router-dom";
import { useStore } from "@/lib/store";
import { BrandWordmark } from "@/components/BrandLogo";
import SocialSignupForm, { type SocialSignup } from "@/components/SocialSignupForm";
import { GoogleMark } from "@/components/GoogleAuthButton";

/**
 * A new organization signing up with Google. The Google button hands the
 * signup token over in router state; it is short-lived and never stored, so a
 * reload (or a direct visit) goes back to the sign-up page.
 */
export default function GoogleSignupComplete() {
  const { registerWithGoogle } = useStore();
  const signup = (useLocation().state as { signup?: SocialSignup } | null)?.signup;
  if (!signup?.signupToken) return <Navigate to="/register" replace />;
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-7">
        <BrandWordmark className="h-9" />
        <SocialSignupForm provider="Google" icon={<GoogleMark size={14} />} signup={signup} register={registerWithGoogle} />
        <p className="mt-5 text-center text-xs text-slate-500">
          Not you? <Link to="/register" className="text-gold-400 hover:text-gold-300">Start again</Link>
        </p>
      </div>
    </div>
  );
}
