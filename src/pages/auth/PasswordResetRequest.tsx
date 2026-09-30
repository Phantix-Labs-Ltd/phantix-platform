import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { BrandWordmark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, DEMO_MODE, delay } from "@/lib/api";

export default function PasswordResetRequest() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (DEMO_MODE) await delay(300);
      else await api.post("/organizations/password-reset/request", { identifier: identifier.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a reset link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute right-6 top-6"><ThemeToggle /></div>
      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <BrandWordmark className="mx-auto block h-11" />
          <h1 className="mt-5 font-display text-2xl font-bold text-white">Reset your password</h1>
          <p className="mt-1.5 text-sm text-slate-400">Recover access to your SecureGraph Platform account.</p>
        </div>
        <div className="card p-7">
          {sent ? (
            <div className="text-center">
              <ShieldCheck size={28} className="mx-auto text-emerald-400" />
              <h2 className="mt-3 font-display text-lg font-semibold text-white">Check your email</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">If an account matches that identifier, the system sends a reset link. The link expires in 30 minutes.</p>
              <Link to="/login" className="btn-primary mt-6 w-full"><ArrowRight size={15} /> Return to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">Email or organization username</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input autoFocus className="input !pl-10" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@company.com or organization slug" />
                </div>
              </div>
              {error && <p className="text-sm text-severity-critical">{error}</p>}
              <button className="btn-primary w-full !py-3" disabled={busy || !identifier.trim()}>
                {busy ? "Sending..." : "Send reset link"} <KeyRound size={15} />
              </button>
              <Link to="/login" className="block text-center text-xs text-slate-500 hover:text-slate-300">Back to sign in</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
