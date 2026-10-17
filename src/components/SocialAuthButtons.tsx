import { DEMO_MODE } from "@/lib/api";
import GithubAuthButton from "@/components/GithubAuthButton";
import GoogleAuthButton from "@/components/GoogleAuthButton";

/**
 * Google and GitHub side by side, logo only, each half the row. When Google is
 * not configured its button renders nothing and GitHub fills the row.
 */
export default function SocialAuthButtons({ intent, onError }: { intent: "login" | "signup"; onError: (msg: string) => void }) {
  if (DEMO_MODE) return null;
  return (
    <>
      <div className="flex gap-2">
        <GoogleAuthButton onError={onError} />
        <GithubAuthButton intent={intent} onError={onError} />
      </div>
      <div className="flex items-center gap-3 text-[12px] uppercase tracking-wider text-slate-600">
        <span className="h-px flex-1 bg-phantix-700/50" /> or with email <span className="h-px flex-1 bg-phantix-700/50" />
      </div>
    </>
  );
}
