import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { DEMO_MODE } from "@/lib/api";

/** "Continue with GitHub" — sign-in only reads the profile and verified email;
 *  repository access stays with the GitHub App install. Logo-only: it shares a
 *  row with the Google button (see SocialAuthButtons). */
export default function GithubAuthButton({ intent, onError }: { intent: "login" | "signup"; onError: (msg: string) => void }) {
  const { githubAuthStart } = useStore();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      window.location.assign(await githubAuthStart(intent));
    } catch (err) {
      onError(err instanceof Error ? err.message : "GitHub sign-in is unavailable right now");
      setBusy(false);
    }
  };

  if (DEMO_MODE) return null;
  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      aria-label="Continue with GitHub"
      title="Continue with GitHub"
      className="btn-secondary flex-1 justify-center !py-3"
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <Github size={18} />}
    </button>
  );
}
