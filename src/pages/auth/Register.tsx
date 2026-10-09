import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Database, EyeOff } from "lucide-react";
import { useStore } from "@/lib/store";
import { PasswordInput } from "@/components/ui";
import { BrandWordmark } from "@/components/BrandLogo";
import GithubAuthButton from "@/components/GithubAuthButton";

const slide = { initial: { opacity: 0, x: 30 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } };

export default function Register() {
  const { register } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only what the next screen needs. Country, industry, contacts and plan are
  // asked later from the profile checklist; Free is the default plan.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Enter your company name");
    if (!email.includes("@")) return setError("Enter a valid work email");
    if (password.length < 12) return setError("Password must be at least 12 characters");
    if (!accepted) return setError("Accept the terms to continue");
    setBusy(true);
    try {
      const res = await register(name.trim(), email.trim(), password);
      navigate(res.signedIn ? "/setup" : `/login?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
        <div className="absolute left-1/4 top-1/4 h-[420px] w-[600px] rounded-full bg-phantix-600/20 blur-[130px]" />
      </div>

      <div className="relative grid w-full max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
        {/* Pitch */}
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }} className="hidden lg:block">
          <BrandWordmark className="h-12" />
          <h1 className="mt-6 font-display text-4xl font-bold leading-tight tracking-tight text-white">
            See your attack surface in minutes
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-slate-400">
            Create an account, enter a domain or connect GitHub, and a passive Quick Scan shows what
            an attacker sees --- before you set anything else up.
          </p>
          <div className="mt-8 space-y-3.5">
            {[
              { icon: <ShieldCheck size={16} />, text: "Privacy-first: security data lives only in your dedicated database" },
              { icon: <Database size={16} />, text: "You bring the database --- SecureGraph writes nothing anywhere else" },
              { icon: <EyeOff size={16} />, text: "Production business data is never read, copied, or stored" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-phantix-800/70 text-gold-400">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Form */}
        <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.1 }}>
          <div className="card p-7">
            <h2 className="font-display text-2xl font-bold text-white">Create your account</h2>
            <p className="mt-1.5 text-sm text-slate-400">Free plan · no card · about a minute.</p>

            <motion.form onSubmit={submit} {...slide} className="mt-6 space-y-4">
              <GithubAuthButton intent="signup" onError={setError} />
              <div>
                <label className="label" htmlFor="reg-company">Company name</label>
                <input id="reg-company" className="input" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Company" />
              </div>
              <div>
                <label className="label" htmlFor="reg-email">Work email</label>
                <input id="reg-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourcompany.com" />
                <p className="mt-1.5 text-[13px] text-slate-500">We send a 6-digit code to confirm it.</p>
              </div>
              <div>
                <label className="label" htmlFor="reg-password">Password</label>
                <PasswordInput id="reg-password" className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters" />
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
              {error && <p className="text-sm text-severity-critical">{error}</p>}
              <button className="btn-primary w-full !py-3" disabled={busy}>
                {busy ? "Creating your account..." : "Create account"} <ArrowRight size={15} />
              </button>
              <p className="text-center text-xs text-slate-500">
                Already registered? <Link to="/login" className="text-gold-400 hover:text-gold-300">Sign in</Link>
              </p>
            </motion.form>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
