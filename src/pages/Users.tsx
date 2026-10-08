import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SERVICE_KEY_STEP, needsAuditControl } from "@/lib/firstRun";
import { AnimatePresence, motion } from "framer-motion";
import {
  Users, UserPlus, ShieldCheck, Link2, KeyRound, ArrowRight, ArrowLeft,
  CheckCircle2, Copy, Unlock, Smartphone, AlertTriangle, Info, RefreshCw, Loader2,
  Plus, Pencil, Trash2, Lock, Layers,
} from "lucide-react";
import DocLink from "@/components/DocLink";
import { Pagination, usePaged } from "@/components/Pagination";
import ApplicationAccessModal from "@/components/ApplicationAccessModal";
import { PageHeader, Card, CardHeader, CollapsibleCard, StatusBadge, Modal, EmptyState, Spinner, SkeletonCard, PasswordInput } from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { useStore } from "@/lib/store";
import { timeAgo, maskEmail, cx, humanize } from "@/lib/utils";
import type { OrgUser } from "@/lib/types";

export default function People() {
  const { state, operate, toast, requireDualControl, decidePending, refreshPending } = useStore();
  const [searchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [addInitiatorOpen, setAddInitiatorOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [rbacRoles, setRbacRoles] = useState<any[]>([]);
  const [permCatalog, setPermCatalog] = useState<Array<{ permission: string; description?: string }>>([]);
  const [defaultRole, setDefaultRole] = useState<string>("viewer");
  const [appCatalog, setAppCatalog] = useState<Array<{ key: string; label: string; permissions: string[] }>>([]);
  const [myPerms, setMyPerms] = useState<any>(null);
  const [rbacLoading, setRbacLoading] = useState(!DEMO_MODE);
  const [roleEditor, setRoleEditor] = useState<{ mode: "create" | "edit"; role: any | null } | null>(null);
  const [deletingRole, setDeletingRole] = useState<any | null>(null);

  // Load the per-org roles + editable-privilege catalog (GET /org-users/roles) and
  // the current principal's permissions (GET /org-users/me/permissions).
  const loadRbac = React.useCallback(async () => {
    const [rolesRes, permsRes, appsRes] = await Promise.all([
      api.get<any>("/org-users/roles").catch(() => null),
      api.get<any>("/org-users/me/permissions").catch(() => null),
      api.get<any>("/org-users/applications").catch(() => null),
    ]);
    // Backend returns OrganizationRoleListResponse { items, total, permissions, default_role }.
    setRbacRoles(Array.isArray(rolesRes?.items) ? rolesRes.items : []);
    setPermCatalog(Array.isArray(rolesRes?.permissions) ? rolesRes.permissions : []);
    setAppCatalog(Array.isArray(appsRes?.applications) ? appsRes.applications : []);
    if (typeof rolesRes?.default_role === "string") setDefaultRole(rolesRes.default_role);
    setMyPerms(permsRes);
    setRbacLoading(false);
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    void loadRbac();
  }, [loadRbac]);

  // A principal holding users.manage may create/edit/delete roles (backend gate).
  const canManageRoles = Array.isArray(myPerms?.permissions) && myPerms.permissions.includes("users.manage");

  useEffect(() => {
    if (searchParams.get("unlock") === "1") {
      void requireDualControl("Managing people and audit control.");
    }
  }, [searchParams, requireDualControl]);

  // Keep the authorizer approval queue fresh.
  useEffect(() => { void refreshPending(); }, [refreshPending]);

  const pendingItems = state.pending.filter((p) => p.status === "pending");
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const approveOrReject = async (id: number, approve: boolean) => {
    if (!(await requireDualControl("Use a dual-control operate session to decide a pending action."))) return;
    setApprovingId(id);
    try {
      await decidePending(id, approve);
      toast("success", approve ? "Action approved" : "Action rejected", approve ? "The pending action was authorized." : "The pending action was declined.");
      await refreshPending();
    } catch (e) {
      toast("error", "Decision failed", e instanceof Error ? e.message : "");
    } finally {
      setApprovingId(null);
    }
  };

  const dc = state.dualControl;
  const authorizer = state.users.find((u) => u.id === dc.authorizer_user_id);
  // Everyone active who isn't the sole authorizer can initiate (authority comes from
  // their role, not from holding the initiator slot). The stored initiator_user_id is
  // just the primary/bootstrap initiator.
  const initiators = state.users.filter((u) => u.is_active && u.id !== dc.authorizer_user_id);

  return (
    <div>
      <PageHeader
        title="People and audit control"
        description="Named users with role-based privileges. Only the primary user signs in to the platform; actions here are recorded to the audit trail under the audit controller. The applications keep dual control."
        actions={
          <>
            <DocLink docId="howto-platform-03" label="Users how-to" />
            {dc.configured && (
              <button
                className="btn-secondary"
                onClick={async () => {
                  if (dc.configured && !operate.unlocked && !(await requireDualControl("After bootstrap, you need an initiator and authorizer session to create users."))) return;
                  try {
                    if (!DEMO_MODE) {
                      const ent = await api.get<any>("/billing/entitlements").catch(() => null);
                      const remaining = ent?.org_users_remaining_free;
                      const isPremium = ent?.premium_active;
                      if (remaining !== undefined && remaining <= 0 && !isPremium) {
                        toast("warning", "User limit reached", `Free plan includes ${ent?.billing_enforcement?.free_org_user_cap ?? 2} users. Upgrade to Premium for more.`);
                        return;
                      }
                    }
                  } catch {} 
                  setAddOpen(true);
                }}
              >
                <UserPlus size={15} /> Add user
              </button>
            )}
          </>
        }
      />

      {/* First run: audit control comes before the service key and security database. */}
      {searchParams.get("onboarding") === "1" && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-gold-400/30 bg-gold-400/[0.06] px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-slate-300">
            {needsAuditControl(state)
              ? "Set up audit control first: choose who starts sensitive actions and who approves them. Your service key is created next, then you connect your security database."
              : "Audit control is set. Next, your service key is created and you connect your security database."}
          </p>
          {!needsAuditControl(state) && (
            <Link to={SERVICE_KEY_STEP} className="btn-primary shrink-0 !py-1.5 text-sm">Continue</Link>
          )}
        </div>
      )}

      {!dc.configured ? (
        <BootstrapWizard />
      ) : (
        <>
          {!state.serviceKey && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-severity-medium/30 bg-severity-medium/8 px-5 py-4">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-severity-medium" />
                <div className="min-w-[12rem] flex-1">
                  <p className="font-semibold text-slate-100">Service key required for app access</p>
                  <p className="text-sm text-slate-400">
                    Login links will not work until you create a service key. Create it now; it is shown once.
                  </p>
                </div>
                <Link to={SERVICE_KEY_STEP} className="btn-primary w-full justify-center sm:w-auto">Create service key <ArrowRight size={15} /></Link>
              </div>
            </motion.div>
          )}
          {/* People first: this page is named for them, and everything below is
              reference an admin consults occasionally, not the task they came
              to do. */}
          <UsersTable
            onUnlock={() => requireDualControl("This action requires a dual-control operate session.")}
            roles={rbacRoles}
            apps={appCatalog}
          />

          {/* Roles & permissions — a reference listing, collapsed by default */}
          {rbacLoading && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
              <SkeletonCard />
            </motion.div>
          )}
          {!rbacLoading && (rbacRoles.length > 0 || canManageRoles) && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
              <CollapsibleCard
                defaultOpen={false}
                title="Roles and permissions"
                subtitle={canManageRoles
                    ? "Create and edit per-org roles and the privileges each one grants"
                    : "Assignable per-org roles, and what your session can do"}
                  action={
                    canManageRoles ? (
                      <button
                        className="btn-secondary !px-3 !py-1.5 !text-xs"
                        onClick={async () => {
                          if (!operate.unlocked && !(await requireDualControl("Use a dual-control operate session to manage roles."))) return;
                          setRoleEditor({ mode: "create", role: null });
                        }}
                      >
                        <Plus size={13} /> Add role
                      </button>
                    ) : (
                      <ShieldCheck size={16} className="text-gold-400" />
                    )
                  }
              >
                {rbacRoles.length === 0 ? (
                  <EmptyState icon={<ShieldCheck size={22} />} title="No roles yet" body="Create a role to grant a tailored set of privileges." />
                ) : (
                  <div className="divide-y divide-phantix-800/50">
                    {rbacRoles.map((r: any, i: number) => {
                      const perms: string[] = Array.isArray(r.permissions) ? r.permissions : [];
                      return (
                        <div key={r.key || r.id || i} className="flex items-start gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-slate-200">{r.name || r.key}</p>
                              <span className="font-mono text-[13px] text-slate-500">{r.key}</span>
                              {r.is_system && (
                                <span className="chip !py-0 border-phantix-600/40 bg-phantix-800/50 text-[12px] text-slate-400"><Lock size={9} /> system</span>
                              )}
                              {r.key === defaultRole && (
                                <span className="chip !py-0 border-gold-400/30 bg-gold-400/10 text-[12px] text-gold-300">default</span>
                              )}
                            </div>
                            {r.description && <p className="mt-0.5 text-[13px] text-slate-500">{r.description}</p>}
                            <p className="mt-1 text-[13px] text-slate-500" title={perms.join(", ")}>
                              {perms.length} {perms.length === 1 ? "permission" : "permissions"}
                              {perms.length > 0 && <span className="text-slate-600"> · {perms.slice(0, 6).join(", ")}{perms.length > 6 ? "…" : ""}</span>}
                            </p>
                          </div>
                          {canManageRoles && (
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                                title="Edit privileges"
                                onClick={async () => {
                                  if (!operate.unlocked && !(await requireDualControl("Use a dual-control operate session to manage roles."))) return;
                                  setRoleEditor({ mode: "edit", role: r });
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                className="btn-ghost !px-2.5 !py-1.5 !text-xs text-severity-critical disabled:opacity-40"
                                title={r.is_system ? "System roles cannot be deleted" : "Delete role"}
                                disabled={r.is_system}
                                onClick={async () => {
                                  if (!operate.unlocked && !(await requireDualControl("Use a dual-control operate session to manage roles."))) return;
                                  setDeletingRole(r);
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {myPerms && (
                  <p className="mt-3 border-t border-phantix-800/50 pt-3 text-[13px] text-slate-500">
                    Your session role <strong className="text-slate-300">{myPerms.role || "Not set"}</strong> ·{" "}
                    {myPerms.permissions?.length ?? 0} permissions
                    {myPerms.is_initiator ? " · initiator" : ""}
                    {myPerms.is_authorizer ? " · authorizer" : ""}
                    {myPerms.can_operate ? " · can operate" : ""}
                  </p>
                )}
              </CollapsibleCard>
            </motion.div>
          )}

          {/* Audit control — the platform records who controls the audit trail;
              the applications keep dual control. */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
            <CollapsibleCard
              className="border-gold-400/25"
              defaultOpen={!dc.configured}
              title="Audit control"
              subtitle="A single authorizer approves; any number of initiators propose and execute"
              action={<ShieldCheck size={17} className="text-gold-400" />}
            >

              {/* Authorizer --- exactly one */}
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gold-400/30 bg-gold-400/5 p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-gold-400/40 bg-phantix-850 text-gold-300 font-display text-base font-bold">
                  {authorizer?.full_name.slice(0, 1) ?? "?"}
                </span>
                <div className="min-w-[12rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-100">{authorizer?.full_name ?? "Not set"}</p>
                    <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">Authorizer · sole approver</span>
                  </div>
                  <p className="text-xs text-slate-500">{authorizer?.title} · {authorizer?.email}</p>
                  <p className="mt-1 text-[13px] text-slate-600">The only person who approves pending actions and risk treatments. There is only ever one.</p>
                </div>
                <button className="btn-ghost shrink-0 !px-3 !py-1.5 !text-xs" onClick={() => setReassignOpen(true)}>
                  <RefreshCw size={12} /> Change
                </button>
              </div>

              {/* Initiators --- one or more */}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-300">Initiators <span className="font-normal text-slate-500">· {initiators.length}</span></p>
                  <button
                    className="btn-secondary !px-3 !py-1.5 !text-xs"
                    onClick={async () => {
                      if (!operate.unlocked && !(await requireDualControl("Use an initiator and authorizer operate session to add an initiator."))) return;
                      try {
                        if (!DEMO_MODE) {
                          const ent = await api.get<any>("/billing/entitlements").catch(() => null);
                          const remaining = ent?.org_users_remaining_free;
                          if (remaining !== undefined && remaining <= 0 && !ent?.premium_active) {
                            toast("warning", "User limit reached", `Free plan includes ${ent?.billing_enforcement?.free_org_user_cap ?? 2} users. Upgrade to Premium for more.`);
                            return;
                          }
                        }
                      } catch {}
                      setAddInitiatorOpen(true);
                    }}
                  >
                    <UserPlus size={13} /> Add initiator
                  </button>
                </div>
                {initiators.length === 0 ? (
                  <p className="rounded-md border border-phantix-700/40 bg-phantix-950/50 px-4 py-3 text-[13px] text-slate-500">
                    No initiators yet besides the authorizer. Add one to let people propose and execute mutations.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {initiators.map((u) => (
                      <div key={u.id} className="flex items-center gap-3 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-3 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-phantix-800/70 font-display text-[13px] font-bold text-phantix-200">
                          {u.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-slate-200">{u.full_name}</p>
                            {u.id === dc.initiator_user_id && (
                              <span className="chip !py-0 border-gold-400/30 bg-gold-400/10 text-[12px] text-gold-300">primary</span>
                            )}
                          </div>
                          <p className="truncate text-[13px] text-slate-500">{u.email} · <span className="font-mono">{humanize(u.role)}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-4 py-3">
                <Info size={14} className="mt-0.5 shrink-0 text-gold-400" />
                <p className="text-[13px] leading-4 text-slate-500">
                  Any active org user with an operate session initiates with their role's grants --- add as many initiators
                  as you need. Only the authorizer approves. Changing the authorizer revokes existing operate sessions;
                  affected users must log in again with purpose=dual_control. Use organization-domain emails (allowed
                  domains) or registration contact emails only.
                </p>
              </div>
            </CollapsibleCard>
          </motion.div>

          <LoginLinks />
          <ReassignModal
            open={reassignOpen}
            onClose={() => setReassignOpen(false)}
            currentInitiatorId={dc.initiator_user_id}
            currentAuthorizerId={dc.authorizer_user_id}
          />
        </>
      )}

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} />
      <AddUserModal open={addInitiatorOpen} onClose={() => setAddInitiatorOpen(false)} context="initiator" defaultRole="operator" />

      <RoleEditorModal
        open={!!roleEditor}
        mode={roleEditor?.mode ?? "create"}
        role={roleEditor?.role ?? null}
        catalog={permCatalog}
        applications={appCatalog}
        onClose={() => setRoleEditor(null)}
        onSaved={async () => { setRoleEditor(null); await loadRbac(); }}
      />

      <DeleteRoleDialog
        role={deletingRole}
        onClose={() => setDeletingRole(null)}
        onDeleted={async () => { setDeletingRole(null); await loadRbac(); }}
      />
    </div>
  );
}

// ── Role editor (create / edit per-org role + privileges) ─────────────────────
function RoleEditorModal({
  open, mode, role, catalog, applications, onClose, onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  role: any | null;
  catalog: Array<{ permission: string; description?: string }>;
  applications: Array<{ key: string; label: string; permissions: string[] }>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useStore();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the modal opens for a different role.
  useEffect(() => {
    if (!open) return;
    setKey(role?.key ?? "");
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPerms(new Set(Array.isArray(role?.permissions) ? role.permissions : []));
    setError(null);
  }, [open, role]);

  const toggle = (p: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });

  const submit = async () => {
    setError(null);
    if (mode === "create" && !/^[a-z0-9_]{2,50}$/.test(key.trim())) {
      setError("Key must be 2–50 chars: lowercase letters, numbers or underscores.");
      return;
    }
    if (!name.trim()) { setError("Name is required."); return; }
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, permissions: Array.from(perms) };
      if (mode === "create") {
        await api.post("/org-users/roles", { key: key.trim(), ...body });
        toast("success", "Role created", `${name.trim()} is now assignable.`);
      } else {
        await api.patch(`/org-users/roles/${encodeURIComponent(role.key)}`, body);
        toast("success", "Role updated", `Privileges for ${name.trim()} were saved.`);
      }
      await onSaved();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Could not save the role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === "create" ? "Create role" : `Edit role · ${role?.name || role?.key || ""}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Key</label>
            <input
              className="input font-mono disabled:opacity-60"
              value={key}
              disabled={mode === "edit"}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              placeholder="e.g. auditor"
            />
            {mode === "edit" && <p className="mt-1 text-[13px] text-slate-600">The key is fixed once a role is created.</p>}
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auditor" />
          </div>
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" />
        </div>
        {role?.is_system && (
          <div className="flex items-start gap-2 rounded-md border border-gold-400/25 bg-gold-400/5 px-3 py-2 text-[13px] leading-4 text-slate-400">
            <Lock size={12} className="mt-0.5 shrink-0 text-gold-300" />
            This is a system role. You can tune its privileges, but it cannot be renamed away or deleted.
          </div>
        )}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label !mb-0">Privileges ({perms.size} selected)</label>
            {catalog.length > 0 && (
              <button
                type="button"
                className="text-[13px] text-gold-300 hover:underline"
                onClick={() => setPerms((prev) => prev.size === catalog.length ? new Set() : new Set(catalog.map((c) => c.permission)))}
              >
                {perms.size === catalog.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-phantix-700/40 bg-phantix-950/50 p-2">
            {catalog.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">No permission catalog available.</p>
            ) : (
              (() => {
                const used = new Set<string>();
                const sections = applications.map((app) => {
                  const items = catalog.filter((c) => app.permissions.includes(c.permission));
                  items.forEach((c) => used.add(c.permission));
                  return { key: app.key, label: app.label, items };
                });
                const other = catalog.filter((c) => !used.has(c.permission));
                if (other.length) sections.push({ key: "shared", label: "Shared platform", items: other });
                return sections
                  .filter((s) => s.items.length > 0)
                  .map((s) => (
                    <div key={s.key}>
                      <p className="px-2 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                        {s.label}
                      </p>
                      {s.items.map((c) => (
                        <label key={c.permission} className="flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 hover:bg-phantix-800/40">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-gold-400"
                            checked={perms.has(c.permission)}
                            onChange={() => toggle(c.permission)}
                          />
                          <span className="min-w-0">
                            <span className="font-mono text-xs text-slate-300">{c.permission}</span>
                            {c.description && <span className="block text-[13px] leading-4 text-slate-500">{c.description}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  ));
              })()
            )}
          </div>
        </div>
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <div className="flex gap-3">
          <button className="btn-primary flex-1" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            {busy ? "Saving..." : mode === "create" ? "Create role" : "Save privileges"}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Delete role confirmation ──────────────────────────────────────────────────
function DeleteRoleDialog({
  role, onClose, onDeleted,
}: {
  role: any | null;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setError(null); }, [role]);

  return (
    <Modal open={!!role} onClose={onClose} title="Delete role">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Delete <strong className="text-slate-200">{role?.name || role?.key}</strong>? Users must be moved to another
          role first; this cannot be undone.
        </p>
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <div className="flex gap-3">
          <button
            className="btn-primary flex-1 !bg-severity-critical/90 hover:!bg-severity-critical"
            disabled={busy}
            onClick={async () => {
              if (!role) return;
              setBusy(true);
              setError(null);
              try {
                await api.delete(`/org-users/roles/${encodeURIComponent(role.key)}`);
                toast("success", "Role deleted", `${role.name || role.key} was removed.`);
                await onDeleted();
              } catch (err: any) {
                setError(err instanceof Error ? err.message : "Could not delete the role.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {busy ? "Deleting..." : "Delete role"}
          </button>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Bootstrap wizard (Phases 0---3 from DUAL_CONTROL_SETUP_FE.md) ──────────────
function BootstrapWizard() {
  const { state, createUser, assignDualControl, toast } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const users = state.users;
  const [phase, setPhase] = useState<"welcome" | "initiator" | "authorizer" | "review">("welcome");
  const [initiator, setInitiator] = useState<OrgUser | null>(users[0] ?? null);
  const [authorizer, setAuthorizer] = useState<OrgUser | null>(users[1] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wizardStep = phase === "welcome" ? 0 : phase === "initiator" ? 1 : phase === "authorizer" ? 2 : 3;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gold-400/8 blur-[80px]" />

        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {["Welcome", "First initiator", "Authorizer", "Review and assign"].map((l, i) => (
            <React.Fragment key={l}>
              <div className={cx("flex items-center gap-2", i <= wizardStep ? "text-gold-300" : "text-slate-600")}>
                <span className={cx("flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold", i < wizardStep ? "bg-emerald-400/20 text-emerald-400" : i === wizardStep ? "bg-gold-400/20 text-gold-300" : "bg-phantix-800/70 text-slate-600")}>
                  {i < wizardStep ? "✓" : i + 1}
                </span>
                <span className="hidden text-xs font-medium sm:block">{l}</span>
              </div>
              {i < 3 && <div className={cx("h-px flex-1", i < wizardStep ? "bg-emerald-400/40" : "bg-phantix-700/50")} />}
            </React.Fragment>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {phase === "welcome" && (
            <motion.div key="welcome" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-400 sm:h-16 sm:w-16">
                  <ShieldCheck size={28} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold text-white">Set up dual control</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                    SecureGraph protects every mutation with <strong className="text-slate-200">dual control</strong>:
                    <strong className="text-gold-300"> initiators</strong> propose and execute; a single{" "}
                    <strong className="text-gold-300">authorizer</strong> is the only person who approves. You'll create
                    your first initiator and the authorizer now --- and can{" "}
                    <strong className="text-slate-200">add more initiators anytime</strong> afterwards. Bootstrap uses
                    your company account; after assignment, mutations need a live operate session.
                  </p>
                  <div className="mt-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3.5">
                      <p className="text-xs font-semibold text-gold-300">Initiators <span className="font-normal text-slate-500">· one or more</span></p>
                      <p className="mt-1 text-[13px] leading-4 text-slate-500">Propose and execute, for example IT Admin. Add as many as you need.</p>
                    </div>
                    <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3.5">
                      <p className="text-xs font-semibold text-gold-300">Authorizer <span className="font-normal text-slate-500">· exactly one</span></p>
                      <p className="mt-1 text-[13px] leading-4 text-slate-500">Sole approver of pending actions, for example the CISO.</p>
                    </div>
                  </div>
                  <button onClick={() => setPhase("initiator")} className="btn-primary mt-5 w-full justify-center sm:w-auto">
                    Create the first initiator <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {(phase === "initiator" || phase === "authorizer") && (
            <motion.div key={phase} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <PersonForm
                key={phase}
                slot={phase === "initiator" ? "Initiator" : "Authorizer"}
                excludeEmail={phase === "authorizer" ? initiator?.email : undefined}
                busy={busy}
                onBack={() => setPhase(phase === "initiator" ? "welcome" : "initiator")}
                onSubmit={async (form) => {
                  setBusy(true);
                  setError(null);
                  try {
                    const user = await createUser(form);
                    if (phase === "initiator") {
                      setInitiator(user);
                      setPhase("authorizer");
                    } else {
                      setAuthorizer(user);
                      setPhase("review");
                    }
                    toast("success", `${form.full_name} created`, "OTP-only user --- they sign in with domain-email OTP.");
                  } catch (err: any) {
                    // 409 = email already exists --- find existing user and reuse
                    if (err?.status === 409 || String(err?.message || "").toLowerCase().includes("already exists") || String(err?.message || "").toLowerCase().includes("duplicate")) {
                      const existing = users.find((u) => u.email.toLowerCase() === form.email.toLowerCase());
                      if (existing) {
                        if (phase === "initiator") {
                          setInitiator(existing);
                          setPhase("authorizer");
                        } else {
                          setAuthorizer(existing);
                          setPhase("review");
                        }
                        toast("info", `${existing.full_name} already exists`, "Reuse an existing organization user for dual control.");
                        return;
                      }
                      setError("This email is already registered, but it is not in the current user list. Refresh the page and try again.");
                    } else {
                      setError(err instanceof Error ? err.message : "Could not create user. Check the email address.");
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              {error && <p className="mt-3 text-sm text-severity-critical">{error}</p>}
            </motion.div>
          )}

          {phase === "review" && initiator && authorizer && (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="font-display text-xl font-bold text-white">Review the assignment</h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Assignment confirms the two people who will govern protected actions. After this, sensitive
                changes require a live operate session.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {[
                  { slot: "First initiator", user: initiator },
                  { slot: "Authorizer", user: authorizer },
                ].map((s) => (
                  <div key={s.slot} className="rounded-2xl border border-gold-400/25 bg-gold-400/5 p-4">
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-gold-400">{s.slot}</p>
                    <p className="mt-1.5 font-semibold text-slate-100">{s.user.full_name}</p>
                    <p className="text-xs text-slate-500">{s.user.title} · {s.user.email}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-start gap-2 text-[13px] leading-4 text-slate-500">
                <Info size={13} className="mt-0.5 shrink-0 text-gold-400" />
                You can add more initiators from the People page after this. The authorizer stays a single, sole approver ---
                change who it is anytime, but there is only ever one.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  className="btn-primary flex-1 !py-3"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await assignDualControl(initiator.id, authorizer.id);
                      toast("success", "Audit control active", "The audit controller is recorded on every platform action.");
                      // First run continues to the service key, then the security database.
                      if (searchParams.get("onboarding") === "1") navigate(SERVICE_KEY_STEP);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Assignment failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Assigning..." : "Assign dual control"} <ShieldCheck size={15} />
                </button>
                <button className="btn-ghost" onClick={() => setPhase("authorizer")}><ArrowLeft size={15} /> Back</button>
              </div>
              {error && <p className="mt-3 text-sm text-severity-critical">{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function PersonForm({
  slot, excludeEmail, busy, onBack, onSubmit,
}: {
  slot: string;
  excludeEmail?: string;
  busy: boolean;
  onBack: () => void;
  onSubmit: (form: { full_name: string; email: string; title: string; role: string }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-white">Create the {slot.toLowerCase()}</h2>
      <p className="mt-1.5 text-sm text-slate-400">
        A named person with domain-email OTP sign-in. The role sets view/report scope only --- the slot is assigned next.
      </p>
      <form
        className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!fullName || !email) { setError("Name and email are required"); return; }
          if (excludeEmail && email.toLowerCase() === excludeEmail.toLowerCase()) {
            return setError("Initiator and authorizer must be two different people");
          }
          try {
            await onSubmit({ full_name: fullName, email, title, role: slot === "Initiator" ? "org_admin" : "security_admin" });
          } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
          }
        }}
      >
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" required autoComplete="name" />
        </div>
        <div>
          <label className="label">Title (shows on audit trail)</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={slot === "Initiator" ? "e.g. IT Admin" : "e.g. CISO"} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Work email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
          <p className="mt-1.5 text-[13px] text-slate-500">
            OTP-only (no password) --- recommended. Free-mail is rejected unless it matches a registration contact.
          </p>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-severity-critical">{error}</p>}
        <div className="flex gap-3 sm:col-span-2">
          <button className="btn-primary flex-1 !py-3" disabled={busy}>{busy ? "Creating..." : `Create ${slot.toLowerCase()}`}</button>
          <button type="button" onClick={onBack} className="btn-ghost"><ArrowLeft size={15} /> Back</button>
        </div>
      </form>
    </div>
  );
}

// ── Users table ───────────────────────────────────────────────────────────────
function UsersTable({
  onUnlock,
  roles,
  apps,
}: {
  onUnlock: () => Promise<boolean>;
  roles: Array<{ key: string; name: string; permissions: string[] }>;
  apps: Array<{ key: string; label: string; permissions: string[] }>;
}) {
  const { state, issueLoginLink, clearDevice, operate, toast } = useStore();
  const [link, setLink] = useState<{ user: string; url: string } | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [clearingId, setClearingId] = useState<number | null>(null);
  const [pwdFor, setPwdFor] = useState<{ id: number; name: string } | null>(null);
  const [pwd, setPwd] = useState("");
  const [appUser, setAppUser] = useState<OrgUser | null>(null);
  const [savingPwd, setSavingPwd] = useState(false);
  const [appFilter, setAppFilter] = useState<string>("all");
  const dc = state.dualControl;

  const appByKey = (k: string) => apps.find((a) => a.key === k);
  const rolePermsFor = (u: OrgUser, appKey: string): string[] => {
    const roleKey = u.application_roles?.[appKey] || u.role;
    const role = roles.find((r) => r.key === roleKey);
    const app = appByKey(appKey);
    if (!role || !app) return [];
    return role.permissions.filter((p) => app.permissions.includes(p));
  };
  const canAccess = (u: OrgUser, appKey: string): boolean =>
    appKey === "core" || rolePermsFor(u, appKey).length > 0;
  const visibleUsers = state.users.filter(
    (u) => appFilter === "all" || canAccess(u, appFilter),
  );
  const { pageItems: userPageItems, pagination: userPagination } = usePaged(visibleUsers, "platform-users", appFilter);

  if (state.users.length === 0) {
    return <Card><EmptyState icon={<Users size={22} />} title="No users yet" /></Card>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
      {apps.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {[{ key: "all", label: "All users" }, ...apps].map((a) => (
            <button
              key={a.key}
              onClick={() => setAppFilter(a.key)}
              className={cx(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                appFilter === a.key
                  ? "border-gold-400/50 bg-gold-400/10 text-gold-300"
                  : "border-phantix-700/50 text-slate-400 hover:border-phantix-500/50 hover:text-slate-200",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <Card className="!p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-phantix-700/40">
              <th className="th">User</th>
              <th className="th">Role</th>
              <th className="th">App access</th>
              <th className="th">Slot</th>
              <th className="th">Auth</th>
              <th className="th">Last login</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {userPageItems.map((u) => (
              <tr key={u.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                <td className="td">
                  <div className="flex max-w-[30rem] items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-phantix-800/70 font-display text-[11px] font-bold text-phantix-200">
                      {u.full_name.split(" ").map((n) => n[0]).join("")}
                    </span>
                    <span className="block min-w-0 truncate" title={`${u.full_name} · ${u.email}${u.title ? ` · ${u.title}` : ""}`}>
                      <span className="font-medium text-slate-100">{u.full_name}</span>
                      <span className="ml-2 text-[13px] text-slate-500">{u.email}{u.title ? ` · ${u.title}` : ""}</span>
                    </span>
                  </div>
                </td>
                <td className="td"><span className="font-mono text-xs text-slate-400">{humanize(u.role)}</span></td>
                <td className="td">
                  {(() => {
                    const overrides = Object.entries(u.application_roles || {});
                    if (overrides.length === 0) {
                      return <span className="text-xs text-slate-600">Global ({humanize(u.role)})</span>;
                    }
                    return (
                      <div className="flex flex-wrap gap-1">
                        {overrides.map(([k, v]) => (
                          <span key={k} className="chip border-phantix-700 bg-phantix-850 text-[12px] text-slate-300">
                            {apps.find((a) => a.key === k)?.label || k}: {v}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </td>
                <td className="td">
                  {dc.initiator_user_id === u.id ? (
                    <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">Initiator</span>
                  ) : dc.authorizer_user_id === u.id ? (
                    <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">Authorizer</span>
                  ) : (
                    <span className="text-xs text-slate-600">---</span>
                  )}
                </td>
                <td className="td">
                  {u.otp_only ? (
                    <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><KeyRound size={11} /> OTP only</span>
                  ) : (u as { must_change_password?: boolean }).must_change_password ? (
                    <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300"><KeyRound size={11} /> Change required</span>
                  ) : (
                    <span className="text-xs text-slate-500">password</span>
                  )}
                </td>
                <td className="td text-xs text-slate-500">{u.last_login_at ? timeAgo(u.last_login_at) : "never"}</td>
                <td className="td">
                  <div className="flex justify-end gap-1.5">
                    <button
                      className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      title="Application access. Assign a role per application: Core, Attack, Defend and Code"
                      onClick={async () => {
                        if (!operate.unlocked && !(await onUnlock())) return;
                        setAppUser(u);
                      }}
                    >
                      <Layers size={13} /> Apps
                    </button>
                    <button
                      className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      title={!state.serviceKey ? "App access needs an active service key. Create one on the Identity page." : "Generate a one-time app sign-in URL"}
                      disabled={!state.serviceKey || linkingId === u.id}
                      onClick={async () => {
                        if (!operate.unlocked && !(await onUnlock())) return;
                        setLinkingId(u.id);
                        try {
                          const { url } = await issueLoginLink(u.id);
                          setLink({ user: u.full_name, url });
                        } catch (err) {
                          toast("error", "Failed", err instanceof Error ? err.message : "Could not generate login link");
                        } finally {
                          setLinkingId(null);
                        }
                      }}
                    >
                      {linkingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                      {linkingId === u.id ? "Generating..." : "Login link"}
                    </button>
                    <button
                      className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      title="Set a platform password. The user must change it at the first sign-in."
                      onClick={async () => {
                        if (!operate.unlocked && !(await onUnlock())) return;
                        setPwd("");
                        setPwdFor({ id: u.id, name: u.full_name });
                      }}
                    >
                      <KeyRound size={13} />
                    </button>
                    <button
                      className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      title="Clear device bind"
                      disabled={clearingId === u.id}
                      onClick={async () => {
                        if (!operate.unlocked && !(await onUnlock())) return;
                        setClearingId(u.id);
                        try {
                          await clearDevice(u.id);
                          toast("success", "Device bind cleared", `${u.full_name} can bind a new browser at next login.`);
                        } catch (err) {
                          toast("error", "Failed", err instanceof Error ? err.message : "");
                        } finally {
                          setClearingId(null);
                        }
                      }}
                    >
                      {clearingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination {...userPagination} itemLabel="users" />
      </Card>

      <ApplicationAccessModal user={appUser} onClose={() => setAppUser(null)} />

      {/* Login link modal */}
      <Modal open={!!link} onClose={() => setLink(null)} title="Application login link">        <div className="space-y-4">
          <div className="rounded-md border border-gold-400/25 bg-gold-400/5 p-3.5 text-xs leading-5 text-slate-400">
            <strong className="text-gold-300">app.phantixlabs.com</strong> --- the Command Centre where scans, campaigns and reports live.
            Share this with {link?.user || "the user"}. They visit the link, verify via email OTP, and get direct access --- no platform login needed.
          </div>
          <div className="rounded-md border border-gold-400/30 bg-gold-400/8 p-3.5 text-xs leading-5 text-slate-400">
            <strong>Shown once.</strong> The platform stores no secrets. Rotating the service key does not invalidate this link.
          </div>
          <div className="rounded-md border border-phantix-700/50 bg-phantix-950/70 p-3.5 font-mono text-xs leading-6 text-gold-300/90 break-all">
            {link?.url}
          </div>
          <button
            className="btn-primary w-full"
            onClick={() => {
              navigator.clipboard?.writeText(link?.url ?? "").catch(() => {});
              toast("success", "Link copied", "Share this with the user --- they sign in on app.phantixlabs.com.");
              setLink(null);
            }}
          >
            <Copy size={15} /> Copy link
          </button>
        </div>
      </Modal>

      {/* Set platform password modal */}
      <Modal open={!!pwdFor} onClose={() => setPwdFor(null)} title="Set platform password">
        <div className="space-y-4">
          <div className="rounded-md border border-gold-400/25 bg-gold-400/5 p-3.5 text-xs leading-5 text-slate-400">
            <strong className="text-gold-300">{pwdFor?.name}</strong> signs in to the platform with
            this password and must change it at first sign-in. Only roles with platform access
            (<span className="font-mono">org_admin</span> or <span className="font-mono">org_owner</span>
            ) can use it.
          </div>
          <div>
            <label className="label">New password</label>
            <PasswordInput
              className="input"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <button
            className="btn-primary w-full"
            disabled={savingPwd || pwd.length < 8}
            onClick={async () => {
              if (!pwdFor) return;
              setSavingPwd(true);
              try {
                await api.patch(`/org-users/${pwdFor.id}`, { password: pwd });
                toast("success", "Password set", `${pwdFor.name} must change it at first sign-in.`);
                setPwdFor(null);
                setPwd("");
              } catch (err) {
                toast("error", "Failed", err instanceof Error ? err.message : "Could not set password");
              } finally {
                setSavingPwd(false);
              }
            }}
          >
            {savingPwd ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            {savingPwd ? "Saving..." : "Set password"}
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}

// ── Login links list ──────────────────────────────────────────────────────────
function LoginLinks() {
  const { state } = useStore();
  if (state.loginLinks.length === 0) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="mt-5">
      <Card>
        <CardHeader title="Issued login links" subtitle="No secrets are stored here. This shows delivery status only." />
        <div className="space-y-2">
          {state.loginLinks.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-4 py-3">
              <Link2 size={14} className="text-gold-400" />
              <span className="text-sm text-slate-300">{l.user_name}</span>
              <span className="text-xs text-slate-600">issued {timeAgo(l.created_at)}</span>
              <span className="ml-auto"><StatusBadge status={l.status} /></span>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// ── Reassign dual control modal ────────────────────────────────────────────────
function ReassignModal({
  open, onClose, currentInitiatorId, currentAuthorizerId,
}: {
  open: boolean;
  onClose: () => void;
  currentInitiatorId: number | null;
  currentAuthorizerId: number | null;
}) {
  const { state, assignDualControl, toast, operate, requireDualControl } = useStore();
  const [initiatorId, setInitiatorId] = useState<number>(currentInitiatorId ?? 0);
  const [authorizerId, setAuthorizerId] = useState<number>(currentAuthorizerId ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeUsers = state.users.filter((u) => u.is_active);
  const policy = state.dualControl.email_policy;
  const allowedDomains = policy?.allowed_domains ?? [];
  const exemptEmails = policy?.registration_emails_exempt ?? [];

  useEffect(() => {
    setInitiatorId(currentInitiatorId ?? 0);
    setAuthorizerId(currentAuthorizerId ?? 0);
    setError(null);
  }, [open, currentInitiatorId, currentAuthorizerId]);

  return (
    <Modal open={open} onClose={onClose} title="Reassign dual control">
      <div className="space-y-4">
        <div className="rounded-md border border-severity-medium/30 bg-severity-medium/8 p-3.5 text-xs leading-5 text-severity-medium">
          Set the sole authorizer and the primary initiator (both on your organization domain). Additional initiators are
          added from the Audit control card --- there is only ever one authorizer.{allowedDomains.length > 0 && (
            <span> Allowed: <strong>{allowedDomains.join(", ")}</strong>.</span>
          )}{exemptEmails.length > 0 && (
            <span> Registration contacts exempt: <strong>{exemptEmails.join(", ")}</strong>.</span>
          )}
          {" "}Gmail/yahoo/outlook users cannot complete dual-control login.
        </div>
        <div>
          <label className="label">Primary initiator</label>
          <select
            className="input"
            value={initiatorId || ""}
            onChange={(e) => setInitiatorId(Number(e.target.value))}
          >
            <option value="" disabled>Select initiator</option>
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} --- {u.email} ({humanize(u.role)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Authorizer</label>
          <select
            className="input"
            value={authorizerId || ""}
            onChange={(e) => setAuthorizerId(Number(e.target.value))}
          >
            <option value="" disabled>Select authorizer</option>
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} --- {u.email} ({humanize(u.role)})
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <button
          className="btn-primary w-full"
          disabled={busy || !initiatorId || !authorizerId || initiatorId === authorizerId}
          onClick={async () => {
            // Dual control is already configured by the time this modal can
            // open (it's the *reassign* flow) — the backend requires an
            // unlocked initiator/authorizer session for that, not just the
            // company JWT. Prompt for it first instead of letting the raw
            // 403 surface.
            if (state.dualControl.configured && !operate.unlocked && !(await requireDualControl("Use an initiator and authorizer operate session to reassign dual control."))) {
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await assignDualControl(initiatorId, authorizerId);
              toast("success", "Audit control updated", "The new assignments are active.");
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Assignment failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Updating..." : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

// ── Add user modal (post-bootstrap) ───────────────────────────────────────────
export function AddUserModal({
  open, onClose, context = "user", defaultRole = "viewer",
}: {
  open: boolean;
  onClose: () => void;
  context?: "user" | "initiator";
  defaultRole?: string;
}) {
  const { createUser, toast } = useStore();
  const isInitiator = context === "initiator";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [busy, setBusy] = useState(false);

  // Preselect the intended role each time the modal opens.
  useEffect(() => { if (open) setRole(defaultRole); }, [open, defaultRole]);

  return (
    <Modal open={open} onClose={onClose} title={isInitiator ? "Add initiator" : "Add organization user"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!fullName || !email) { toast("error", "Missing fields", "Name and email are required"); return; }
          setBusy(true);
          try {
            await createUser({ full_name: fullName, email, title, role });
            toast("success", isInitiator ? "Initiator added" : "User created", "OTP-only --- they sign in with domain-email OTP.");
            onClose();
            setFullName(""); setEmail(""); setTitle("");
          } catch (err) {
            toast("error", isInitiator ? "Failed to add initiator" : "Failed to create user", err instanceof Error ? err.message : "Check the email address and try again");
          } finally {
            setBusy(false);
          }
        }}
      >
        {isInitiator && (
          <div className="flex items-start gap-2 rounded-md border border-gold-400/25 bg-gold-400/5 px-3 py-2 text-[13px] leading-4 text-slate-400">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-gold-300" />
            An initiator proposes and executes mutations with their role's grants. There is no separate "authorizer"
            role --- the authorizer is a single designated slot, changed from the Audit control card.
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="SOC Analyst" required />
          </div>
        </div>
        <div>
          <label className="label">Work email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Role: sets the privileges of this user</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
            <option value="org_admin">org_admin</option>
            <option value="security_admin">security_admin</option>
          </select>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating..." : "Create user"}</button>
      </form>
    </Modal>
  );
}
