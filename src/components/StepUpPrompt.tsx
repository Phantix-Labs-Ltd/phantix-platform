import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE, delay, setStepUpToken } from "@/lib/api";

/**
 * Solo mode (dual control off): a sensitive action asks the signed-in person
 * for a one-time code instead of a second approver. The token lasts about 15
 * minutes, so a run of related actions only asks once.
 */
export default function StepUpPrompt() {
  const { stepUpPrompt, closeStepUpPrompt, session } = useStore();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (DEMO_MODE) { await delay(300); setSentTo(session?.email || "your email"); return; }
      const res = await api.post<{ destination_masked?: string }>("/org-users/auth/step-up/send", {});
      setSentTo(res?.destination_masked || session?.email || "your email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  // Each prompt starts fresh and sends the code straight away.
  useEffect(() => {
    if (!stepUpPrompt.open) return;
    setSentTo(null);
    setCode("");
    setError(null);
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepUpPrompt.open]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = DEMO_MODE
        ? { step_up_token: "demo-step-up", expires_in: 900 }
        : await api.post<{ step_up_token: string; expires_in?: number }>("/org-users/auth/step-up/verify", { code });
      setStepUpToken(res.step_up_token, res.expires_in ?? 900);
      closeStepUpPrompt(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={stepUpPrompt.open} onClose={() => closeStepUpPrompt(false)} title="Confirm it's you">
      <form onSubmit={verify} className="space-y-3">
        <p className="text-sm text-slate-400">
          {stepUpPrompt.reason || "This is a sensitive action."} The code works for 15 minutes.
        </p>
        <p className="text-sm text-slate-300">
          {sentTo ? <>We sent a code to <span className="text-white">{sentTo}</span>.</> : busy ? "Sending a code..." : "We'll email you a code."}
        </p>
        <input
          className="input text-center font-mono !text-2xl !tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="••••••"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="One-time code"
        />
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <button className="btn-primary w-full !py-3" disabled={busy || code.length < 4}>
          {busy && sentTo ? <Loader2 size={15} className="animate-spin" /> : null} Confirm
        </button>
        <button type="button" onClick={() => void send()} disabled={busy} className="w-full text-center text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
          Send a new code
        </button>
      </form>
    </Modal>
  );
}
