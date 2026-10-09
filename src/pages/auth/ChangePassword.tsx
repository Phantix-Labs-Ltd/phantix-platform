import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { KeyRound, ArrowRight, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { PasswordInput } from "@/components/ui";
import { BrandWordmark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Forced first sign-in change for an org admin who was given a platform
 * password by another admin. The account stays gated here until the password
 * is changed, because `session.mustChangePassword` redirects every management
 * route back to this page.
 */
export default function ChangePassword() {
  const { changePassword, state, toast } = useStore();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      toast("success", "Password updated", "You changed your platform password.");
      navigate(state.setup.setup_complete ? "/dashboard" : "/setup", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-phantix-950 px-4">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-phantix-600/20 blur-[130px]" />
      </div>
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[420px]"
      >
        <div className="mb-6 text-center">
          <BrandWordmark className="mx-auto block h-11" />
          <h1 className="mt-4 font-display text-xl font-bold text-white">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your admin assigned this password. Set your own to continue.
          </p>
        </div>

        <div className="card p-7">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-gold-400/30 bg-gold-400/8 px-3 py-2">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-gold-300" />
            <p className="text-[13px] leading-5 text-slate-400">
              Platform access is role-based. Changing your password does not change your role or
              privileges.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Current password</label>
              <PasswordInput
                leadingIcon={<KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />}
                className="input !pl-10"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label">New password</label>
              <PasswordInput
                className="input"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="At least 12 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <PasswordInput
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat the new password"
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-severity-critical">{error}</p>}
            <button className="btn-primary w-full !py-3" disabled={busy}>
              {busy ? "Saving..." : "Update password"} {!busy && <ArrowRight size={15} />}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
