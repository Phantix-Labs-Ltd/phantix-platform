import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { DEMO_MODE, errorCode } from "@/lib/api";
import { googleIdToken, googlePopupErrorMessage, googleSignInAvailable } from "@/lib/googleAuth";

/** Google's "G" mark, as Google's sign-in branding asks for on the button. */
export function GoogleMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * "Continue with Google": the Google popup returns a Firebase ID token; the API
 * signs in the organization that owns the email, or starts a sign-up that only
 * needs a company name (/auth/google/complete). Hidden unless this build has
 * the Firebase config and the API can verify it.
 */
export default function GoogleAuthButton({ onError }: { onError: (msg: string) => void }) {
  const { googleAuth } = useStore();
  const navigate = useNavigate();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!DEMO_MODE) void googleSignInAvailable().then((ok) => alive && setAvailable(ok));
    return () => { alive = false; };
  }, []);

  const start = async () => {
    setBusy(true);
    let idToken: string;
    try {
      idToken = await googleIdToken();
    } catch (err) {
      const msg = googlePopupErrorMessage(err);
      if (msg) onError(msg);
      setBusy(false);
      return;
    }
    try {
      const res = await googleAuth(idToken);
      if (res.kind === "signed_in") navigate("/setup", { replace: true });
      else navigate("/auth/google/complete", { state: { signup: res } });
    } catch (err) {
      const code = errorCode(err);
      onError(
        code === "firebase_email_unverified"
          ? "Your Google email isn't verified. Verify it with Google, or sign up with email."
          : (err instanceof Error && err.message) || "Google sign-in failed. Try again.",
      );
      setBusy(false);
    }
  };

  if (DEMO_MODE || !available) return null;
  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={busy}
      aria-label="Continue with Google"
      title="Continue with Google"
      className="btn-secondary flex-1 justify-center !py-3"
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark size={18} />}
    </button>
  );
}
