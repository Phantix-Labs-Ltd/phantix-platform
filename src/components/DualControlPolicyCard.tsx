import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Loader2, ShieldCheck, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE, delay, errorCode } from "@/lib/api";
import { cx } from "@/lib/utils";

type Mode = "off" | "on" | "enforced";
type Policy = { mode: Mode; can_disable: boolean; pending_change: { mode?: Mode; requested_at?: string } | null };

/**
 * Dual control is opt-in. Solo mode (off) lets one person act, with a code for
 * sensitive actions. Turning it on is instant once two people hold the
 * initiator and authorizer roles; turning it off needs the authorizer's
 * approval, so a single stolen account can't switch it off.
 */
export default function DualControlPolicyCard() {
  const { state, toast, hydrateSession } = useStore();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (DEMO_MODE) { setPolicy({ mode: state.dualControl.policy_mode ?? "off", can_disable: true, pending_change: null }); return; }
    try {
      setPolicy(await api.get<Policy>("/organizations/me/dual-control-policy"));
    } catch {
      setPolicy(null); // backend without the policy: hide the card
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const change = async (mode: Mode) => {
    setBusy(true);
    setError(null);
    try {
      if (DEMO_MODE) { await delay(400); setPolicy({ mode, can_disable: true, pending_change: null }); return; }
      const next = await api.put<Policy>("/organizations/me/dual-control-policy", { mode });
      setPolicy(next);
      if (next.pending_change) toast("info", "Sent to your authorizer", "Dual control stays on until they approve.");
      else toast("success", mode === "off" ? "Solo mode on" : "Dual control on");
      await hydrateSession();
    } catch (err) {
      setError(errorCode(err) === "dual_control_slots_missing"
        ? "Add a second person and assign the initiator and authorizer roles first."
        : err instanceof Error ? err.message : "Could not change the setting");
    } finally {
      setBusy(false);
    }
  };

  if (!policy) return null;
  const on = policy.mode !== "off";

  return (
    <Card>
      <div id="dual-control" className="scroll-mt-24" />
      <CardHeader
        title="Dual control"
        subtitle={on ? "A second person approves sensitive actions." : "Solo mode: you act on your own and confirm sensitive actions with a code."}
        action={<ShieldCheck size={16} className={on ? "text-emerald-400" : "text-slate-500"} />}
      />
      <div className="mt-2 space-y-3 text-sm text-slate-400">
        {policy.mode === "enforced" && <p>Required by your plan. It can't be turned off here.</p>}
        {policy.pending_change && (
          <p className="flex items-center gap-2 rounded-md border border-gold-400/30 bg-gold-400/5 px-3 py-2 text-gold-300">
            <Clock size={14} /> Waiting for your authorizer to approve turning it off.
          </p>
        )}
        {!on && state.users.length < 2 && (
          <p className="flex items-center gap-2">
            <Users size={14} className="shrink-0" />
            Turning it on needs a second person.{" "}
            <Link to="/users" className="text-gold-400 hover:text-gold-300">Invite a teammate</Link>
          </p>
        )}
        {error && <p className="text-severity-critical">{error}</p>}
        {policy.mode !== "enforced" && !policy.pending_change && (
          <button
            type="button"
            disabled={busy || (on && !policy.can_disable)}
            onClick={() => void change(on ? "off" : "on")}
            className={cx(on ? "btn-secondary" : "btn-primary", "!py-2")}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {on ? "Switch to solo mode" : "Turn on dual control"}
          </button>
        )}
        {on && !policy.pending_change && policy.mode !== "enforced" && (
          <p className="text-[13px] text-slate-500">Switching to solo mode needs your authorizer's approval.</p>
        )}
      </div>
    </Card>
  );
}
