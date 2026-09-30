import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Trash2, Building2, Users, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui";
import DocLink from "@/components/DocLink";
import TypeToConfirm from "@/components/TypeToConfirm";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

// ── Danger zone (GitHub / GitLab / Vercel style) ─────────────────────────────
// Destructive, irreversible actions are grouped in a single red-outlined zone so
// they can never be mistaken for normal settings. Every deletion is gated behind
// type-to-confirm and, when configured, a dual-control operate session.

type PendingDelete =
  | { kind: "account"; name: string }
  | { kind: "company"; id: number; name: string }
  | { kind: "user"; id: number; name: string; email: string };

export default function DangerZone() {
  const { state, deleteAccount, deleteCompany, deleteOrgUser, toast, requireDualControl, operate } = useStore();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);

  const dc = state.dualControl;

  const runDelete = async (target: PendingDelete) => {
    if (dc.configured && !operate.unlocked) {
      if (!(await requireDualControl("Deleting an account requires a dual-control operate session."))) return;
    }
    setBusy(true);
    try {
      let res: { pending: boolean };
      if (target.kind === "account") res = await deleteAccount();
      else if (target.kind === "company") res = await deleteCompany(target.id);
      else res = await deleteOrgUser(target.id);

      if (res.pending) {
        if (target.kind === "account") {
          toast("info", "Erasure request submitted", "SecureGraph staff will process your data-erasure request. You stay signed in until it is fulfilled.");
        } else {
          toast("info", "Sent for approval", "An authorizer must sign off on this deletion.");
        }
      } else {
        toast("success", "Deleted", target.kind === "account" ? "SecureGraph deleted your account." : `${target.name} was removed.`);
      }
      setPending(null);
      if (target.kind === "account" && !res.pending) navigate("/login");
    } catch (e) {
      toast("error", "Deletion failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const confirmWord = pending
    ? pending.kind === "account"
      ? pending.name
      : pending.kind === "company"
        ? pending.name
        : pending.email
    : "";

  const confirmTitle = pending
    ? pending.kind === "account"
      ? "Request account erasure?"
      : pending.kind === "company"
        ? `Delete company "${pending.name}"?`
        : `Delete user "${pending.name}"?`
    : "";

  const confirmMessage = pending ? (
    pending.kind === "account" ? (
      <>
        This files a formal <strong className="text-severity-critical">data-erasure request</strong> for{" "}
        <strong className="text-severity-critical">{pending.name}</strong> (NDPA §34–37). SecureGraph staff
        process it; organization users, child companies, service keys, connections and stored data are
        removed when it is fulfilled. You stay signed in until then.
      </>
    ) : pending.kind === "company" ? (
      <>
        This removes the child company <strong className="text-severity-critical">{pending.name}</strong> from your account:
        it disappears from the group and its service key and users stop working. Data is retained for audit and
        can be restored by support.
      </>
    ) : (
      <>
        This deletes the organization user account <strong className="text-severity-critical">{pending.name}</strong>{" "}
        ({pending.email}). They lose access immediately. This action is reversible only by re-adding the user.
      </>
    )
  ) : null;

  return (
    <div>
      <PageHeader
        title="Danger zone"
        description="Irreversible account deletions. These actions are intentionally separated from every other setting and require explicit confirmation."
        actions={<DocLink docId="howto-platform-index" label="Platform how-to index" />}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {/* Red zone container */}
        <div className="overflow-hidden rounded-md border border-severity-critical/40">
          <div className="flex items-center gap-3 border-b border-severity-critical/30 bg-severity-critical/10 px-5 py-3.5">
            <AlertTriangle size={16} className="text-severity-critical" />
            <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.14em] text-severity-critical">
              Danger zone
            </h2>
            <span className="ml-auto hidden text-[13px] text-severity-critical/70 sm:block">
              Deletions are gated by dual control when configured
            </span>
          </div>

          <div className="divide-y divide-severity-critical/15 bg-phantix-950/40">
            {/* ── 1. Whole account ─────────────────────────────────── */}
            <DangerRow
              icon={<ShieldAlert size={16} />}
              title="Request account deletion"
              body={
                <>
                  File a formal <strong className="text-slate-200">data-erasure request</strong> for{" "}
                  {state.org.name} <span className="font-mono text-slate-500">#{state.org.id}</span>. SecureGraph
                  staff process it; users, child companies, service keys and stored data are removed when it is fulfilled.
                </>
              }
            >
              <button className="btn-danger shrink-0" onClick={() => setPending({ kind: "account", name: state.org.name || state.org.slug || "DELETE" })}>
                <Trash2 size={14} /> Request deletion
              </button>
            </DangerRow>

            {/* ── 2. Child company accounts ───────────────────────── */}
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-severity-critical/10 text-severity-critical">
                  <Building2 size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">Company accounts</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Delete a child company account and its isolated service key, users, and data.
                  </p>
                </div>
              </div>

              {state.companies.length === 0 ? (
                <p className="mt-3 rounded-md border border-phantix-700/40 bg-phantix-900/40 px-4 py-3 text-xs text-slate-500">
                  No child companies on this account.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {state.companies.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-severity-critical/20 bg-severity-critical/[0.04] px-4 py-3"
                    >
                      <Building2 size={14} className="text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-200">{c.name}</p>
                        <p className="font-mono text-[13px] text-slate-500">#{c.id} · {c.slug}</p>
                      </div>
                      <button
                        className="btn-danger !px-3 !py-1.5 !text-xs"
                        onClick={() => setPending({ kind: "company", id: c.id, name: c.name })}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 3. Org user accounts ────────────────────────────── */}
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-severity-critical/10 text-severity-critical">
                  <Users size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">Organization user accounts</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Delete an organization user account (soft-deactivate). They lose sign-in access immediately.
                  </p>
                </div>
              </div>

              {state.users.length === 0 ? (
                <p className="mt-3 rounded-md border border-phantix-700/40 bg-phantix-900/40 px-4 py-3 text-xs text-slate-500">
                  No organization users on this account.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {state.users.map((u) => {
                    const isSlot = dc.initiator_user_id === u.id || dc.authorizer_user_id === u.id;
                    return (
                      <div
                        key={u.id}
                        className="flex flex-wrap items-center gap-3 rounded-md border border-severity-critical/20 bg-severity-critical/[0.04] px-4 py-3"
                      >
                        <Users size={14} className="text-slate-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-200">{u.full_name}</p>
                            {dc.initiator_user_id === u.id && (
                              <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">Initiator</span>
                            )}
                            {dc.authorizer_user_id === u.id && (
                              <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">Authorizer</span>
                            )}
                          </div>
                          <p className="text-[13px] text-slate-500">{u.email} · {u.title}</p>
                          {isSlot && (
                            <p className="mt-1 text-[13px] text-severity-medium">
                              Assigned dual-control slot. Reassign before you delete it, to avoid locking yourself out.
                            </p>
                          )}
                        </div>
                        <button
                          className="btn-danger !px-3 !py-1.5 !text-xs"
                          onClick={() => setPending({ kind: "user", id: u.id, name: u.full_name, email: u.email })}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Type-to-confirm gate */}
      <TypeToConfirm
        open={!!pending}
        title={confirmTitle}
        message={confirmMessage}
        confirmWord={confirmWord}
        confirmLabel={
          pending?.kind === "account" ? "Delete account" : pending?.kind === "company" ? "Delete company" : "Delete user"
        }
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && void runDelete(pending)}
      />
    </div>
  );
}

function DangerRow({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-severity-critical/10 text-severity-critical">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className={cx("mt-1 text-xs leading-5 text-slate-400")}>{body}</p>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}
