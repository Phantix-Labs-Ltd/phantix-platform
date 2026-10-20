import React, { useCallback, useEffect, useState } from "react";
import { Clock, Mail, Users } from "lucide-react";
import { PageHeader, Card, StatusBadge, SkeletonCard } from "@/components/ui";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import {
  addAssignment,
  isFeatureError,
  loadAssignments,
  loadReportSchedule,
  loadSlaPolicy,
  loadSlaStatus,
  removeAssignment,
  saveReportSchedule,
  saveSlaPolicy,
  sendReportNow,
  type Assignment,
  type ReportSchedule,
  type SlaPolicy,
  type SlaStatus,
} from "@/lib/mssp";

/**
 * MSSP → Delivery: the contract clocks a testing client writes down, and the
 * recurring pack they receive. Not MDR acknowledgement timers — retest turnaround,
 * verification, remediation confirmation, coverage cadence and report delivery.
 *
 * The SLA panel shows only what the platform can actually measure; the rest is
 * labelled "not measured" with the reason, rather than a number that looks better
 * than reality.
 */
export default function MsspDelivery() {
  const { toast } = useStore();
  const [policy, setPolicy] = useState<SlaPolicy | null>(null);
  const [status, setStatus] = useState<SlaStatus | null>(null);
  const [sched, setSched] = useState<ReportSchedule | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, st, rs] = await Promise.all([loadSlaPolicy(), loadSlaStatus(), loadReportSchedule()]);
      setPolicy(p);
      setStatus(st);
      setSched(rs);
      // Assignments are MSSP-only; a client simply does not get the list.
      setAssignments(await loadAssignments().catch(() => []));
      setUnavailable(false);
    } catch (e) {
      if (isFeatureError(e)) setUnavailable(true);
      else toast("error", "Could not load delivery settings", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const savePolicy = async () => {
    if (!policy) return;
    try {
      setPolicy(await saveSlaPolicy(policy));
      toast("success", "Clocks saved", "These are the terms measured from now on.");
    } catch (e) {
      toast("error", "Could not save the clocks", e instanceof Error ? e.message : undefined);
    }
  };

  const saveSched = async (patch: Partial<ReportSchedule>) => {
    if (!sched) return;
    try {
      setSched(await saveReportSchedule({ ...sched, ...patch }));
    } catch (e) {
      toast("error", "Could not save the schedule", e instanceof Error ? e.message : undefined);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const out = await sendReportNow();
      toast(out.ok ? "success" : "error", out.ok ? "Pack sent" : "Pack not sent", out.ok ? out.subject : out.error);
      await load();
    } catch (e) {
      toast("error", "Could not send the pack", e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div><PageHeader title="Delivery" /><SkeletonCard /><SkeletonCard className="mt-3" /></div>;
  if (unavailable || !policy || !sched) {
    return (
      <div>
        <PageHeader title="Delivery" description="Contract clocks and the recurring report pack." />
        <Card><p className="text-sm text-slate-400">This surface is available to MSSP organizations and their clients.</p></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Delivery"
        description="What was promised, and what is actually being delivered."
        actions={<StatusBadge status={status?.measured.coverage_met ? "active" : "attention"} />}
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="!p-4">
          <p className="flex items-center gap-1.5 font-semibold text-slate-100"><Clock size={14} /> Contract clocks</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ["retest_hours", "Retest turnaround (h)"],
                ["verification_hours", "Verification (h)"],
                ["remediation_confirmation_hours", "Remediation confirm (h)"],
                ["coverage_days", "Coverage cadence (days)"],
                ["report_delivery_hours", "Report delivery (h)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-[12px] text-slate-500">
                {label}
                <input
                  type="number"
                  min={1}
                  className="input mt-1 !py-1.5 text-sm"
                  value={policy[key] as number}
                  onChange={(e) => setPolicy({ ...policy, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          <button className="btn-secondary mt-3" onClick={() => void savePolicy()}>Save clocks</button>
        </Card>

        <Card className="!p-4">
          <p className="font-semibold text-slate-100">Measured now</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Coverage met: <span className={status?.measured.coverage_met ? "text-emerald-300" : "text-red-300"}>{status?.measured.coverage_met ? "yes" : "no"}</span>
            {" · "}last test {status?.measured.last_completed_test_at ? timeAgo(status.measured.last_completed_test_at) : "none recorded"}
            {" · "}{status?.measured.open_criticals ?? 0} open critical
          </p>
          <div className="mt-2 space-y-1">
            {Object.entries(status?.not_measured || {}).map(([key, why]) => (
              <p key={key} className="text-[12px] text-slate-600">
                <span className="text-slate-500">{key.replace(/_/g, " ")}</span> — not measured: {why}
              </p>
            ))}
          </div>
        </Card>
      </div>

      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Mail size={16} className="text-gold-300" />
          <div className="min-w-[14rem] flex-1">
            <p className="font-semibold text-slate-100">Recurring report pack</p>
            <p className="text-[12px] text-slate-500">
              {sched.last_sent_at ? `Last sent ${timeAgo(sched.last_sent_at)}` : "Not sent yet"}
              {sched.last_error ? ` · last error: ${sched.last_error}` : ""}
            </p>
          </div>
          <select
            className="input !w-auto !py-1.5 text-sm"
            value={sched.cadence}
            onChange={(e) => void saveSched({ cadence: e.target.value as ReportSchedule["cadence"] })}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
          <label className="flex items-center gap-2 text-[12px] text-slate-400">
            <input type="checkbox" checked={sched.enabled} onChange={(e) => void saveSched({ enabled: e.target.checked })} />
            Enabled
          </label>
          <button className="btn-secondary" onClick={() => void sendNow()} disabled={sending || !sched.recipients.length}>
            {sending ? "Sending…" : "Send now"}
          </button>
        </div>
        <label className="mt-3 block text-[12px] text-slate-500">
          Recipients (comma separated)
          <input
            className="input mt-1 !py-1.5 text-sm"
            defaultValue={sched.recipients.join(", ")}
            onBlur={(e) =>
              void saveSched({
                recipients: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
              })
            }
          />
        </label>
      </Card>

      {assignments.length > 0 && (
        <Card className="mt-4 !p-4">
          <p className="flex items-center gap-1.5 font-semibold text-slate-100"><Users size={14} /> Analyst coverage</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span>{a.email ?? `user ${a.user_id}`}</span>
                <span className="text-slate-500">→ {a.client_name ?? a.client_organization_id}</span>
                <button className="text-[12px] text-red-300 hover:underline" onClick={() => void removeAssignment(a.id).then(load)}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
