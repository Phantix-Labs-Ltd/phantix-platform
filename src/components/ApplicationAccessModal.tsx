import React, { useEffect, useState } from "react";
import { Check, Minus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";
import type { OrgUser } from "@/lib/types";

interface AppMeta {
  key: string;
  label: string;
  tagline: string;
  permissions: string[];
}
interface RoleMeta {
  key: string;
  name: string;
  permissions: string[];
}

/**
 * Privileges per application (Core / Attack / Defend / Code) for one user —
 * an explicit row-based matrix. One row per application: the role chosen in
 * that row decides what the person may do *in that application*, and the
 * exact privileges the role grants there are listed beneath it (granted ✓ /
 * not granted –). A row left on "Use global role" falls back to the user's
 * org-wide role. Changing what a role grants org-wide — for everyone holding
 * it — lives in the Roles & privileges editor.
 */
export default function ApplicationAccessModal({
  user,
  onClose,
}: {
  user: OrgUser | null;
  onClose: () => void;
}) {
  const { toast } = useStore();
  const [apps, setApps] = useState<AppMeta[]>([]);
  const [roles, setRoles] = useState<RoleMeta[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    setMapping({ ...((user.application_roles as Record<string, string>) || {}) });
    Promise.all([
      api.get<{ applications?: AppMeta[] }>("/org-users/applications").catch(() => null),
      api.get<{ items?: RoleMeta[] }>("/org-users/roles").catch(() => null),
    ])
      .then(([a, r]) => {
        if (!alive) return;
        setApps(Array.isArray(a?.applications) ? a!.applications! : []);
        setRoles(Array.isArray(r?.items) ? r!.items! : []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const globalRole = user?.role || "viewer";

  const granted = (app: AppMeta, roleKey: string): string[] => {
    const role = roles.find((x) => x.key === roleKey);
    if (!role) return [];
    return role.permissions.filter((p) => app.permissions.includes(p));
  };

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(mapping)) if (v) clean[k] = v;
      await api.put(`/org-users/${user.id}/application-roles`, { application_roles: clean });
      toast("success", "Application access updated", `Roles saved for ${user.full_name}.`);
      onClose();
    } catch (e) {
      toast("error", "Could not save", e instanceof Error ? e.message : "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Privileges per application · ${user?.full_name || ""}`}
      wide
    >
      {loading ? (
        <div className="flex items-center gap-3 py-8 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-400">
            One row per application. The role selected in a row decides what this person may do{" "}
            <strong className="text-slate-200">in that application</strong>. It shows the exact privileges
            it grants are listed beneath the row (✓ granted, – not granted). Rows left on{" "}
            <strong className="text-slate-200">global role</strong> (
            <span className="font-mono text-gold-300">{globalRole}</span>) fall back to the
            user&apos;s org-wide role. To change what a role grants <em>org-wide</em>, edit it
            under <strong className="text-slate-200">Roles and privileges</strong>. Every user
            holding the role is affected.
          </p>

          {apps.map((app) => {
            const selected = mapping[app.key] || "";
            const effectiveRole = selected || globalRole;
            const perms = granted(app, effectiveRole);
            const grantedSet = new Set(perms);
            return (
              <div
                key={app.key}
                className="rounded-lg border border-phantix-700/40 bg-phantix-900/40 p-3.5"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-semibold text-slate-100">{app.label}</p>
                    <p className="text-[13px] text-slate-500">{app.tagline}</p>
                  </div>
                  <span className="chip shrink-0 border-gold-400/30 bg-gold-400/10 font-mono text-[12px] text-gold-300">
                    {perms.length}/{app.permissions.length} privileges
                  </span>
                  <select
                    className="input !w-48 !py-2 !text-xs"
                    value={selected}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [app.key]: e.target.value }))
                    }
                  >
                    <option value="">Use global role ({globalRole})</option>
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Explicit privilege list for this app row — exactly what this
                    user gets in this application from the role above. */}
                {app.permissions.length > 0 ? (
                  <div className="mt-2.5 grid gap-1 sm:grid-cols-2">
                    {app.permissions.map((p) => {
                      const on = grantedSet.has(p);
                      return (
                        <div
                          key={p}
                          className={cx(
                            "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[12px]",
                            on ? "bg-gold-400/8 text-slate-300" : "text-slate-600",
                          )}
                          title={on ? "Granted by the role above" : "Not granted by the role above"}
                        >
                          {on ? (
                            <Check size={11} className="shrink-0 text-gold-300" />
                          ) : (
                            <Minus size={11} className="shrink-0 text-slate-700" />
                          )}
                          {p}
                        </div>
                      );
                    })}
                  </div>
                ) : app.key === "core" ? (
                  <p className="mt-2.5 text-[13px] text-slate-600">
                    Core is always available to active users.
                  </p>
                ) : (
                  <p className="mt-2.5 text-[13px] text-slate-600">
                    This application owns no privileges in the catalog.
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex gap-3 pt-1">
            <button className="btn-primary flex-1" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save application access"}
            </button>
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
