import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Radar, ShieldCheck, Loader2, Plus, Pencil, Trash2, CheckCircle2,
  RefreshCw, Lock, Mail, Globe2, Star, ToggleLeft, ToggleRight, KeyRound, AlertTriangle,
} from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, CardHeader, Modal, EmptyState, StatusBadge, PageHeaderSkeleton, SettingsSkeleton } from "@/components/ui";
import { api, DEMO_MODE, delay } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx, humanize } from "@/lib/utils";

// ── Types (mirror backend customer_api / org_test_accounts) ──────────────────
type OrgSettings = {
  enabled_for_org: boolean;
  daily_session_limit: number;
  max_session_minutes: number;
  max_allowlist_targets: number;
  allow_state_changing: boolean;
  require_dual_control_for_active: boolean;
  require_asset_backed_targets: boolean;
  default_target_environment: "staging" | "production";
  allow_production_testing: boolean;
  prefer_mailinator_test_emails: boolean;
  default_mobile_apk_asset_id: number | null;
  default_test_account_id: number | null;
  notes: string | null;
};

type TestAccount = {
  id: number;
  label: string;
  account_kind: "login" | "registration" | "both";
  target_environment: "staging" | "production" | "any";
  login_url: string | null;
  register_url: string | null;
  username: string | null;
  email: string | null;
  password_set: boolean;
  otp_mode: "interactive" | "mailinator";
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

type Bootstrap = {
  settings: OrgSettings | null;
  test_accounts: TestAccount[];
  agreement: { version: string | null; title: string | null; accepted: boolean; must_accept: boolean } | null;
  access: {
    /** Backend `customer_access_snapshot().agi` — keys the readiness panel reads. */
    can_use?: boolean;
    entitled: boolean;
    org_enabled?: boolean;
    agreement_required?: boolean;
    blockers: { code: string; message: string }[];
  } | null;
  ui: { sections: string[] } | null;
};

// ── Demo fixtures ─────────────────────────────────────────────────────────────
const demoBootstrap: Bootstrap = {
  settings: {
    enabled_for_org: true, daily_session_limit: 5, max_session_minutes: 0, max_allowlist_targets: 10,
    allow_state_changing: true, require_dual_control_for_active: true, require_asset_backed_targets: true,
    default_target_environment: "staging", allow_production_testing: false, prefer_mailinator_test_emails: true,
    default_mobile_apk_asset_id: null, default_test_account_id: 1, notes: "Staging QA only",
  },
  test_accounts: [
    { id: 1, label: "staging-mobile-qa", account_kind: "both", target_environment: "staging", login_url: "https://api-staging.example.com/login", register_url: "https://api-staging.example.com/signup", username: "qa_user", email: "qa@mailinator.com", password_set: true, otp_mode: "mailinator", is_default: true, is_active: true, notes: "Do not use production", created_at: new Date().toISOString() },
    { id: 2, label: "staging-api", account_kind: "login", target_environment: "staging", login_url: "https://api-staging.example.com/login", register_url: null, username: "tester", email: "", password_set: true, otp_mode: "interactive", is_default: false, is_active: true, notes: "", created_at: new Date().toISOString() },
  ],
  agreement: { version: "1.0.0", title: "Autonomous Pentest Agent Usage Agreement", accepted: true, must_accept: false },
  access: { can_use: true, blockers: [], entitled: true },
  ui: { sections: ["settings", "test_accounts"] },
};

type AccountForm = {
  label: string;
  account_kind: TestAccount["account_kind"];
  target_environment: TestAccount["target_environment"];
  login_url: string;
  register_url: string;
  username: string;
  email: string;
  otp_mode: TestAccount["otp_mode"];
  is_default: boolean;
  notes: string;
  password: string;
};

const emptyAccount: AccountForm = {
  label: "", account_kind: "login", target_environment: "staging",
  login_url: "", register_url: "", username: "", email: "", otp_mode: "interactive",
  is_default: false, notes: "", password: "",
};

export default function AgiSettings() {
  const { toast, requireDualControl } = useStore();
  const navigate = useNavigate();
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [accountModal, setAccountModal] = useState<{ open: boolean; editing: TestAccount | null }>({ open: false, editing: null });
  const [busyAccount, setBusyAccount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      if (DEMO_MODE) { await delay(300); setBootstrap(demoBootstrap); return; }
      const res = await api.get<any>("/agi/org/settings/bootstrap");
      const settings = res?.settings ?? null;
      const accounts = Array.isArray(res?.test_accounts) ? res.test_accounts : [];
      setBootstrap({
        settings,
        test_accounts: accounts,
        agreement: res?.agreement ?? null,
        access: res?.access ?? null,
        ui: res?.ui ?? null,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load Autonomous Agent settings");
      setBootstrap(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patchSettings = async (body: Record<string, unknown>) => {
    if (!(await requireDualControl("Changing Autonomous Agent settings requires a dual-control operate session."))) return null;
    setSaving(true);
    try {
      let res: any;
      if (DEMO_MODE) { await delay(300); res = { ...(bootstrap?.settings ?? {}), ...body }; }
      else res = await api.patch<any>("/agi/org/settings", body, { dualControl: true });
      setBootstrap((b) => b ? { ...b, settings: { ...(b.settings ?? {} as OrgSettings), ...res } } : b);
      toast("success", "Autonomous Agent settings saved");
      return res;
    } catch (e: any) {
      const code = e?.detail?.code;
      if (code === "agi_plan_required") toast("error", "AGI plan required", "Upgrade to Premium or an AI pack to enable AGI.");
      else toast("error", "Save failed", e instanceof Error ? e.message : "");
      return null;
    } finally { setSaving(false); }
  };

  const toggle = (field: keyof OrgSettings) => {
    const cur = bootstrap?.settings;
    if (!cur) return;
    void patchSettings({ [field]: !cur[field] });
  };

  // The usage agreement is per organization and can be accepted from any
  // surface. Without this the platform admin sees "agreement required" but has
  // no way to clear it without going to the Attack app.
  const acceptAgreement = async () => {
    if (!(await requireDualControl("Accepting the Autonomous Agent agreement requires a dual-control operate session."))) return;
    setSaving(true);
    try {
      if (DEMO_MODE) await delay(300);
      else await api.post("/agi/agreement/accept", { accepted: true, surface: "platform" }, { dualControl: true });
      toast("success", "Agreement accepted", "The Autonomous Agent can now run for this organization.");
      await load();
    } catch (e: any) {
      toast("error", "Could not accept agreement", e instanceof Error ? e.message : "");
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = () => {
    const s = bootstrap?.settings;
    if (!s) return;
    void patchSettings({
      daily_session_limit: Number(s.daily_session_limit) || 5,
      // 0 is meaningful here (uncapped), so it must not fall through `||`.
      max_session_minutes: Number.isFinite(Number(s.max_session_minutes))
        ? Number(s.max_session_minutes)
        : 0,
      max_allowlist_targets: Number(s.max_allowlist_targets) || 10,
      default_target_environment: s.default_target_environment,
      allow_production_testing: s.allow_production_testing,
      prefer_mailinator_test_emails: s.prefer_mailinator_test_emails,
      default_mobile_apk_asset_id: s.default_mobile_apk_asset_id ? Number(s.default_mobile_apk_asset_id) : null,
      default_test_account_id: s.default_test_account_id ? Number(s.default_test_account_id) : null,
      notes: s.notes ?? "",
    });
  };

  const saveAccount = async (form: typeof emptyAccount) => {
    if (!(await requireDualControl("Saving test credentials requires a dual-control operate session."))) return;
    setSaving(true);
    try {
      const body = {
        label: form.label,
        account_kind: form.account_kind,
        target_environment: form.target_environment,
        login_url: form.login_url || undefined,
        register_url: form.register_url || undefined,
        username: form.username || undefined,
        email: form.email || undefined,
        password: form.password,
        otp_mode: form.otp_mode,
        is_default: form.is_default,
        notes: form.notes || undefined,
      };
      if (DEMO_MODE) {
        await delay(300);
        toast("success", accountModal.editing ? "Test account updated" : "Test account created", form.label);
      } else if (accountModal.editing) {
        await api.patch(`/agi/org/test-accounts/${accountModal.editing.id}`, body, { dualControl: true });
        toast("success", "Test account updated", form.label);
      } else {
        await api.post("/agi/org/test-accounts", body, { dualControl: true });
        toast("success", "Test account created", form.label);
      }
      setAccountModal({ open: false, editing: null });
      await load();
    } catch (e: any) {
      const code = e?.detail?.code;
      if (code === "duplicate_label") toast("error", "Duplicate label", "An account with this label already exists.");
      else toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally { setSaving(false); }
  };

  const deleteAccount = async (a: TestAccount) => {
    if (!(await requireDualControl("Deleting test credentials requires a dual-control operate session."))) return;
    setBusyAccount(a.id);
    try {
      if (!DEMO_MODE) await api.delete(`/agi/org/test-accounts/${a.id}`, { dualControl: true });
      toast("success", "Test account deleted", a.label);
      await load();
    } catch (e) { toast("error", "Delete failed", e instanceof Error ? e.message : ""); }
    finally { setBusyAccount(null); }
  };

  const setDefault = async (a: TestAccount) => {
    await patchSettings({ default_test_account_id: a.id });
  };

  if (loading) {
    return (
      <div>
        <PageHeaderSkeleton actions />
        <SettingsSkeleton groups={3} rows={3} />
      </div>
    );
  }

  if (loadError && !bootstrap) {
    return (
      <EmptyState
        icon={<Radar size={24} />}
        title="Could not load Autonomous Agent settings"
        body={loadError}
        action={<button onClick={() => void load()} className="btn-primary !text-xs"><RefreshCw size={12} className="mr-1 inline" /> Retry</button>}
      />
    );
  }

  const s = bootstrap?.settings;

  return (
    <div>
      <PageHeader
        title="Autonomous Agent"
        description="Configure the autonomous pentest agent for your organization: enable it, set environment defaults, and store reusable test login + registration credentials."
        actions={
          <>
            <DocLink docId="howto-platform-index" label="Platform how-to index" />
            <button onClick={() => void load()} className="btn-ghost text-sm px-3 py-1.5"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh</button>
          </>
        }
      />

      {/* Readiness — one row per gate, each with the action that clears it. A
          blocker list alone tells an admin the agent is off but not that the
          fix is "buy a plan", "accept the agreement" or "flip this switch". */}
      <Card className="mb-4">
        <CardHeader
          title="Readiness"
          subtitle="Every gate the Autonomous Agent needs, and where to clear it"
          action={<ShieldCheck size={16} className="text-gold-400" />}
        />
        <ul className="space-y-2.5">
          {bootstrap?.access && (
            <li className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {bootstrap.access.entitled ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                ) : (
                  <Lock size={16} className="mt-0.5 shrink-0 text-gold-400" />
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-200">A plan that includes the agent</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {bootstrap.access.entitled
                      ? "Your current plan is entitled to the Autonomous Agent."
                      : "Your plan does not include the Autonomous Agent. Upgrade on Billing, or request the AI Pentest Agent pack from Phantix sales."}
                  </p>
                </div>
              </div>
              {!bootstrap.access.entitled && (
                <button className="btn-primary shrink-0 !px-3 !py-1.5 !text-xs" onClick={() => navigate("/billing")}>
                  Go to Billing
                </button>
              )}
            </li>
          )}
          {bootstrap?.agreement && (
            <li className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {bootstrap.agreement.accepted ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                ) : (
                  <Lock size={16} className="mt-0.5 shrink-0 text-gold-400" />
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-200">Usage agreement</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {bootstrap.agreement.accepted
                      ? `Accepted (version ${bootstrap.agreement.version ?? "Not set"}).`
                      : "A company admin must accept the Autonomous Agent usage agreement before any session can run."}
                  </p>
                </div>
              </div>
              {!bootstrap.agreement.accepted && (
                <button className="btn-primary shrink-0 !px-3 !py-1.5 !text-xs" disabled={saving} onClick={() => void acceptAgreement()}>
                  {saving ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <ShieldCheck size={12} className="mr-1 inline" />} Review &amp; accept
                </button>
              )}
            </li>
          )}
          {s && (
            <li className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {s.enabled_for_org ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-gold-400" />
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-200">Enabled for this organization</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {s.enabled_for_org
                      ? "Operators can start scoped sessions once the agreement is accepted."
                      : "Turn it on below to make the Autonomous Agent available to your operators."}
                  </p>
                </div>
              </div>
            </li>
          )}
        </ul>
      </Card>

      {/* Raw blockers (platform disabled, entitlement edge cases) — kept as a
          safety net so nothing is silently hidden. */}
      {bootstrap?.access && bootstrap.access.blockers.length > 0 && (
        <Card className="mb-4 border-gold-400/25">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-gold-400" />
            <div className="flex-1 space-y-1">
              {bootstrap.access.blockers.map((b) => <p key={b.code} className="text-xs text-slate-300">{b.message}</p>)}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Settings ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader title="Agent settings" subtitle="Enable + limits for this organization" action={<Radar size={16} className="text-gold-400" />} />

            {/* Enable */}
            <div className="flex items-center justify-between gap-4 rounded-md border border-phantix-700/40 bg-phantix-950/50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-200">{s?.enabled_for_org ? "Enabled for this org" : "Disabled"}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {s?.enabled_for_org ? "Org users can start scoped AGI sessions after they accept the agreement." : "Enable so org users can run the Autonomous Pentest Agent."}
                </p>
              </div>
              <button onClick={() => toggle("enabled_for_org")} disabled={saving} aria-label="Toggle AGI">
                {saving ? <Loader2 size={22} className="animate-spin text-gold-400" /> : s?.enabled_for_org ? <ToggleRight size={26} className="text-emerald-400" /> : <ToggleLeft size={26} className="text-slate-500" />}
              </button>
            </div>

            {/* Limits — the three figures an org admin owns. Each says what it
                governs, because "Max minutes" alone does not tell an admin that
                0 means uncapped or that targets are counted per session. */}
            <div className="mt-4 space-y-3">
              {([
                [
                  "daily_session_limit",
                  "Sessions per day",
                  1,
                  50,
                  "How many pentest runs this organization may start in a calendar day.",
                ],
                [
                  "max_allowlist_targets",
                  "Max targets per session",
                  1,
                  50,
                  "Ceiling on the allowlist a single session may run against. Defaults to 10.",
                ],
              ] as const).map(([key, label, min, max, hint]) => (
                <div key={key}>
                  <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">{label}</label>
                  <input
                    type="number"
                    aria-label={label}
                    min={min}
                    max={max}
                    value={s ? Number(s[key]) : 0}
                    onChange={(e) => setBootstrap((b) => b?.settings ? { ...b, settings: { ...b.settings, [key]: Number(e.target.value) } } : b)}
                    className="w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-gold-400/40"
                  />
                  <p className="mt-1 text-[13px] leading-4 text-slate-500">{hint}</p>
                </div>
              ))}

              {/* Session length is uncapped by default: a run ends when the
                  agent is done, and AI credits are the real limit. The input
                  only appears once an admin opts into a hard stop. */}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                    Session length
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setBootstrap((b) =>
                        b?.settings
                          ? {
                              ...b,
                              settings: {
                                ...b.settings,
                                max_session_minutes: Number(b.settings.max_session_minutes) > 0 ? 0 : 120,
                              },
                            }
                          : b,
                      )
                    }
                    className="-mr-2 rounded-md px-2 py-1.5 text-[13px] text-gold-300 underline-offset-2 hover:underline"
                  >
                    {Number(s?.max_session_minutes) > 0 ? "Remove the cap" : "Set a hard stop"}
                  </button>
                </div>
                {Number(s?.max_session_minutes) > 0 ? (
                  <>
                    <input
                      type="number"
                      aria-label="Session length in minutes"
                      min={15}
                      max={1440}
                      value={Number(s?.max_session_minutes) || 120}
                      onChange={(e) => setBootstrap((b) => b?.settings ? { ...b, settings: { ...b.settings, max_session_minutes: Number(e.target.value) } } : b)}
                      className="mt-1 w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-gold-400/40"
                    />
                    <p className="mt-1 text-[13px] leading-4 text-slate-500">
                      Sessions are torn down after this many minutes (15–1440).
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] leading-4 text-slate-500">
                    <span className="text-slate-300">Uncapped.</span> A session runs until the agent
                    finishes, you stop it, or the organization's AI credits run out.
                  </p>
                )}
              </div>
            </div>

            {/* Environment defaults */}
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-phantix-700/40 px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Default environment</p>
                  <p className="text-[12px] text-slate-500">Pre-filled when you create an engagement</p>
                </div>
                <select
                  value={s?.default_target_environment ?? "staging"}
                  onChange={(e) => setBootstrap((b) => b?.settings ? { ...b, settings: { ...b.settings, default_target_environment: e.target.value as "staging" | "production" } } : b)}
                  className="input !w-auto !py-1.5 !text-xs"
                >
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </div>

              {([
                ["allow_production_testing", "Allow production testing", "Permit AGI sessions against production targets (requires explicit ack per engagement)."],
                ["prefer_mailinator_test_emails", "Mailinator test emails", "Auto-generate *@mailinator.com test addresses and poll public inbox for OTP."],
                ["allow_state_changing", "Allow state-changing steps", "Approve/reject active steps proposed by the agent."],
                ["require_dual_control_for_active", "Audit control for active steps", "A second, different user must approve state-changing actions."],
                ["require_asset_backed_targets", "Asset-backed targets", "Only targets already in your asset inventory are allowed."],
              ] as const).map(([key, label, hint]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-phantix-700/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{label}</p>
                    <p className="text-[12px] text-slate-500">{hint}</p>
                  </div>
                  <button onClick={() => toggle(key)} aria-label={label}>
                    {s?.[key] ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} className="text-slate-500" />}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Notes</label>
              <textarea
                value={s?.notes ?? ""}
                onChange={(e) => setBootstrap((b) => b?.settings ? { ...b, settings: { ...b.settings, notes: e.target.value } } : b)}
                rows={2}
                placeholder="Staging QA only..."
                className="w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40"
              />
            </div>

            <button onClick={saveSettings} disabled={saving} className="btn-primary mt-4 w-full !py-2.5 !text-xs">
              {saving ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <CheckCircle2 size={13} className="mr-1 inline" />} Save settings
            </button>
          </Card>
        </motion.div>

        {/* ── Test accounts ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <Card>
            <CardHeader
              title="Test accounts"
              subtitle="Reusable login and registration credentials that AGI injects into sessions. Passwords are encrypted and never returned"
              action={
                <button onClick={() => setAccountModal({ open: true, editing: null })} className="btn-primary !px-3 !py-1.5 !text-xs"><Plus size={13} className="mr-1 inline" /> Add account</button>
              }
            />
            {bootstrap?.test_accounts.length === 0 ? (
              <EmptyState icon={<KeyRound size={22} />} title="No test accounts" body="Add reusable login and registration credentials so that AGI can use them automatically in each environment." />
            ) : (
              <div className="-mx-4 -mb-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Label</th>
                      <th className="th">Kind</th>
                      <th className="th">Environment</th>
                      <th className="th">Credentials</th>
                      <th className="th">Default</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bootstrap?.test_accounts.map((a) => (
                      <tr key={a.id} className={cx("border-b border-phantix-800/40 last:border-0 hover:bg-phantix-800/35", a.is_default && "bg-gold-400/[0.03]")}>
                        <td className="td whitespace-nowrap" title={a.notes || undefined}>
                          <span className="inline-flex items-center gap-2">
                            <span className="font-mono text-[13px] font-semibold text-white">{a.label}</span>
                            <StatusBadge status={a.is_active ? "active" : "rejected"} />
                          </span>
                        </td>
                        <td className="td text-xs text-slate-400">{humanize(a.account_kind)}</td>
                        <td className="td">
                          <span className={cx("chip text-[12px]", a.target_environment === "production" ? "border-severity-medium/40 bg-severity-medium/10 text-severity-medium" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300")}>{humanize(a.target_environment)}</span>
                        </td>
                        <td className="td">
                          <span
                            className="flex max-w-[22rem] items-center gap-1.5 truncate text-[13px] text-slate-400"
                            title={[a.login_url && `login: ${a.login_url}`, a.register_url && `register: ${a.register_url}`, `${a.password_set ? "password set" : "no password"} · OTP ${humanize(a.otp_mode)}`].filter(Boolean).join("\n")}
                          >
                            <KeyRound size={11} className="shrink-0" /> <span className="truncate">{a.username || a.email || "Not set"}</span>
                            <span className="text-slate-600">·</span>
                            <Lock size={11} className="shrink-0" /> {a.password_set ? "set" : "none"}
                            {a.login_url && <Globe2 size={11} className="shrink-0 text-gold-400" aria-label="Has login URL" />}
                            {a.register_url && <Mail size={11} className="shrink-0 text-gold-400" aria-label="Has register URL" />}
                          </span>
                        </td>
                        <td className="td">
                          {a.is_default ? <span className="chip border-gold-400/40 bg-gold-400/10 text-[12px] text-gold-300"><Star size={10} className="mr-1 inline" /> default</span> : <span className="text-xs text-slate-600">Not set</span>}
                        </td>
                        <td className="td text-right">
                          <div className="flex flex-wrap justify-end items-center gap-1.5">
                            {!a.is_default && (
                              <button onClick={() => void setDefault(a)} className="btn-ghost !px-2.5 !py-1.5 !text-[13px]"><Star size={12} className="mr-1 inline" /> Set default</button>
                            )}
                            <button onClick={() => setAccountModal({ open: true, editing: a })} className="btn-ghost !px-2.5 !py-1.5 !text-[13px]"><Pencil size={12} className="mr-1 inline" /> Edit</button>
                            <button onClick={() => void deleteAccount(a)} disabled={busyAccount === a.id} className="btn-ghost !px-2.5 !py-1.5 !text-[13px] text-severity-critical hover:text-severity-critical">
                              {busyAccount === a.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      <TestAccountModal
        open={accountModal.open}
        editing={accountModal.editing}
        saving={saving}
        onClose={() => setAccountModal({ open: false, editing: null })}
        onSave={saveAccount}
      />
    </div>
  );
}

// ── Test account create/edit modal ────────────────────────────────────────────
function TestAccountModal({
  open,
  editing,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: TestAccount | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: typeof emptyAccount) => void;
}) {
  const [form, setForm] = useState(emptyAccount);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? {
      label: editing.label,
      account_kind: editing.account_kind,
      target_environment: editing.target_environment,
      login_url: editing.login_url ?? "",
      register_url: editing.register_url ?? "",
      username: editing.username ?? "",
      email: editing.email ?? "",
      otp_mode: editing.otp_mode,
      is_default: editing.is_default,
      notes: editing.notes ?? "",
      password: "",
    } : emptyAccount);  }, [open, editing]);

  const field = "w-full rounded-lg border border-phantix-700/50 bg-phantix-950/60 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-gold-400/40";

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit test account: ${editing.label}` : "Add test account"} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Label *</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="staging-mobile-qa" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Environment</label>
            <select value={form.target_environment} onChange={(e) => setForm({ ...form, target_environment: e.target.value as any })} className="input !py-2 !text-xs">
              <option value="staging">Staging</option>
              <option value="production">Production</option>
              <option value="any">Any</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Kind</label>
            <select value={form.account_kind} onChange={(e) => setForm({ ...form, account_kind: e.target.value as any })} className="input !py-2 !text-xs">
              <option value="login">Login</option>
              <option value="registration">Registration</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">OTP mode</label>
            <select value={form.otp_mode} onChange={(e) => setForm({ ...form, otp_mode: e.target.value as any })} className="input !py-2 !text-xs">
              <option value="interactive">Interactive (human OTP)</option>
              <option value="mailinator">Mailinator (public inbox)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Login URL</label>
          <input value={form.login_url} onChange={(e) => setForm({ ...form, login_url: e.target.value })} placeholder="https://api-staging.example.com/login" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Register URL</label>
          <input value={form.register_url} onChange={(e) => setForm({ ...form, register_url: e.target.value })} placeholder="https://api-staging.example.com/signup" className={field} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Username</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="qa_user" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="qa@mailinator.com" className={field} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            Password {editing ? "(leave blank to keep current)" : "*"}
          </label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className={field} />
          {editing?.password_set && <p className="mt-1 text-[12px] text-slate-500">Current password is stored. It is never shown.</p>}
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-slate-500">Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Do not use production" className={field} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="accent-[rgb(var(--gold-400))]" />
          Use as the org default for this environment
        </label>

        <div className="flex items-center gap-2">
          <button onClick={() => onSave(form)} disabled={saving || !form.label.trim() || (!editing && !form.password.trim())} className="btn-primary flex-1 !py-2.5 !text-xs">
            {saving ? <Loader2 size={13} className="mr-1 inline animate-spin" /> : <ShieldCheck size={13} className="mr-1 inline" />} {editing ? "Save account" : "Create account"}
          </button>
          <button onClick={onClose} className="btn-ghost !px-4 !py-2.5 !text-xs">Cancel</button>
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-slate-500"><Lock size={10} /> Passwords are encrypted at rest and never shown again.</p>
      </div>
    </Modal>
  );
}
