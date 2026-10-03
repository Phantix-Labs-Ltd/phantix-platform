import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { DEMO_MODE } from "@/lib/api";

/** "Continue with GitHub" — sign-in only reads the profile and verified email;
 *  repository access stays with the GitHub App install. */
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
    <>
      <button type="button" onClick={start} disabled={busy} className="btn-secondary w-full !py-3">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Github size={15} />}
        Continue with GitHub
      </button>
      <div className="flex items-center gap-3 text-[12px] uppercase tracking-wider text-slate-600">
        <span className="h-px flex-1 bg-phantix-700/50" /> or with email <span className="h-px flex-1 bg-phantix-700/50" />
      </div>
    </>
  );
}
