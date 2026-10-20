import React, { useCallback, useEffect, useState } from "react";
import { AlertOctagon, CalendarClock, FileSignature, ShieldCheck } from "lucide-react";
import { PageHeader, Card, StatusBadge, EmptyState, SkeletonCard } from "@/components/ui";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import {
  clearEmergencyStop,
  emergencyStop,
  isFeatureError,
  loadAuthorizations,
  loadScopeStatus,
  type ScopeAuthorization,
  type ScopeStatus,
} from "@/lib/mssp";

/**
 * MSSP → Authorization & scope.
 *
 * This is the record a client's legal team asks for: which rules of engagement are
 * signed, what they cover, when testing may run, and whether anything has been
 * stopped. Signing, blackouts and the emergency stop are human acts — nothing here
 * is reachable by the AI agent.
 */
export default function MsspAuthorization() {
  const { toast } = useStore();
  const [status, setStatus] = useState<ScopeStatus | null>(null);
  const [auths, setAuths] = useState<ScopeAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMssp, setNotMssp] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([loadScopeStatus(), loadAuthorizations()]);
      setStatus(st);
      setAuths(list);
      setNotMssp(false);
    } catch (e) {
      if (isFeatureError(e)) setNotMssp(true);
      else toast("error", "Could not load authorization", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const pressStop = async () => {
    if (reason.trim().length < 3) {
      toast("warning", "Reason required", "Say why testing is stopping — it is written to the audit log.");
      return;
    }
    setStopping(true);
    try {
      const out = await emergencyStop(reason.trim(), true);
      await load();
      setReason("");
      toast(
        "success",
        "Testing stopped",
        `${out.cancelled_scan_jobs?.length ?? 0} scan job(s) cancelled, ${out.cancelled_campaigns?.length ?? 0} campaign(s) cancelled.`,
      );
    } catch (e) {
      toast("error", "Stop failed", e instanceof Error ? e.message : undefined);
    } finally {
      setStopping(false);
    }
  };

  const resume = async () => {
    try {
      await clearEmergencyStop();
      await load();
      toast("success", "Stop cleared", "New testing is allowed again, within the authorization.");
    } catch (e) {
      toast("error", "Could not clear the stop", e instanceof Error ? e.message : undefined);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Authorization & scope" description="Rules of engagement, targets and the emergency stop." />
        <SkeletonCard />
        <SkeletonCard className="mt-3" />
      </div>
    );
  }

  if (notMssp) {
    return (
      <div>
        <PageHeader title="Authorization & scope" description="Rules of engagement, targets and the emergency stop." />
        <EmptyState
          icon={<FileSignature size={22} />}
          title="This is an MSSP surface"
          body="Per-client rules of engagement and scope are available to organizations registered as an MSSP."
        />
      </div>
    );
  }

  const active = status?.authorization ?? null;

  return (
    <div>
      <PageHeader
        title="Authorization & scope"
        description="What this organization is authorised to test, and whether testing may run right now."
        actions={
          <button className="btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card className="!p-3">
          <p className="text-[12px] text-slate-500">Testing state</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
            {status?.can_test ? (
              <><ShieldCheck size={18} className="text-emerald-300" /> Allowed</>
            ) : (
              <><AlertOctagon size={18} className="text-red-300" /> Blocked</>
            )}
          </p>
          {!status?.can_test && status?.blocked_reason && (
            <p className="mt-1 text-[12px] leading-4 text-slate-400">{status.blocked_reason}</p>
          )}
          {status?.blocked_code && (
            <p className="mt-1 font-mono text-[11px] text-slate-600">{status.blocked_code}</p>
          )}
        </Card>

        <Card className="!p-3">
          <p className="text-[12px] text-slate-500">Authorization in force</p>
          {active ? (
            <>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {active.reference} <span className="text-[12px] text-slate-500">v{active.version}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-slate-400">
                {active.targets.length} target{active.targets.length === 1 ? "" : "s"} · signed {active.signed_at ? timeAgo(active.signed_at) : "—"}
              </p>
              {active.window_end && (
                <p className="mt-0.5 text-[12px] text-slate-500">Expires {new Date(active.window_end).toLocaleDateString()}</p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-400">None signed</p>
          )}
        </Card>

        <Card className="!p-3">
          <p className="text-[12px] text-slate-500">Next blackout</p>
          {status?.next_blackout ? (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-200">
                <CalendarClock size={14} /> {new Date(status.next_blackout.starts_at).toLocaleString()}
              </p>
              <p className="mt-0.5 text-[12px] text-slate-500">
                until {new Date(status.next_blackout.ends_at).toLocaleString()} · {status.next_blackout.applies_to}
              </p>
              {status.next_blackout.reason && (
                <p className="mt-0.5 text-[12px] text-slate-400">{status.next_blackout.reason}</p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-400">None scheduled</p>
          )}
        </Card>
      </div>

      {/* Emergency stop */}
      <Card className={status?.active_stop?.active ? "!border-red-500/40 !p-4" : "!p-4"}>
        <div className="flex flex-wrap items-start gap-3">
          <AlertOctagon size={18} className={status?.active_stop?.active ? "text-red-300" : "text-slate-400"} />
          <div className="min-w-[16rem] flex-1">
            <p className="font-semibold text-slate-100">
              {status?.active_stop?.active ? "Testing is stopped" : "Emergency stop"}
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-slate-500">
              {status?.active_stop?.active
                ? `Stopped ${status.active_stop.started_at ? timeAgo(status.active_stop.started_at) : ""}${
                    status.active_stop.started_by ? ` by ${status.active_stop.started_by}` : ""
                  } — ${status.active_stop.reason}`
                : "Refuses all new testing and cancels queued/running scans and campaigns. Audited with who pressed it."}
            </p>
          </div>
          {status?.active_stop?.active ? (
            <button className="btn-secondary" onClick={() => void resume()}>Clear stop</button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is testing stopping?"
                className="input !py-1.5 text-sm"
              />
              <button className="btn-primary !bg-red-500/90 hover:!bg-red-500" onClick={() => void pressStop()} disabled={stopping}>
                {stopping ? "Stopping…" : "Stop all testing"}
              </button>
            </div>
          )}
        </div>
      </Card>

      {!status?.enforcement_enabled && (
        <p className="mt-3 text-[12px] text-amber-300/80">
          Enforcement is off for this organization, so scans are not checked against an
          authorization yet. Turn it on when the first RoE is signed.
        </p>
      )}

      <h2 className="mb-2 mt-6 font-display text-sm font-semibold text-slate-200">Authorizations</h2>
      {auths.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={22} />}
          title="No authorization on file"
          body="Create a draft rules of engagement, add the approved targets, then sign it. Testing stays blocked until it is signed."
        />
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-phantix-700/50 text-[12px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Reference</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Signed by</th>
                <th className="px-3 py-2.5">Targets</th>
                <th className="px-3 py-2.5">Window</th>
              </tr>
            </thead>
            <tbody>
              {auths.map((a) => (
                <tr key={a.id} className="border-b border-phantix-800/40 last:border-0">
                  <td className="px-3 py-2.5 text-slate-200">
                    {a.reference} <span className="text-[12px] text-slate-500">v{a.version}</span>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={a.status} /></td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {a.signer_name || "—"}
                    {a.signed_at && <span className="ml-1 text-[12px] text-slate-600">{timeAgo(a.signed_at)}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{a.targets.length}</td>
                  <td className="px-3 py-2.5 text-[12px] text-slate-500">
                    {a.window_start ? new Date(a.window_start).toLocaleDateString() : "—"} →{" "}
                    {a.window_end ? new Date(a.window_end).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
