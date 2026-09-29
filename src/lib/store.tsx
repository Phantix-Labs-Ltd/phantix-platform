import React, { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { tokens, DEMO_MODE, delay, api, deviceId, emailFromToken, clearCorrelationId, isPendingApproval } from "./api";
import { claimExchange, newExchangeGuard } from "./deviceConfirm";
import {
  emptyOrg,
  isSecurityDbReady,
  mapConnectionsFromApi,
  mapConnectionFromApi,
  mapOrgFromApi,
  orgToUpdateBody,
} from "./org";
import type {
  AlertEvent,
  AlertSettings,
  AuditEvent,
  ChildCompany,
  DbConnection,
  DualControlAssignment,
  LoginLink,
  OrgUser,
  Organization,
  Payment,
  PendingAction,
  ServiceKeyMeta,
  SetupState,
  SupportTicket,
  ToolItem,
} from "./types";

const emptySetup = (): SetupState => ({
  privacy_accepted: false,
  privacy_accepted_at: null,
  privacy_notice_version: null,
  identity_saved: false,
  email_otp_sent: false,
  email_otp_destination: null,
  identity_verified: false,
  email_verified: false,
  company_verified: false,
  domain: null,
  domain_token: null,
  domain_dns_ok: false,
  domain_http_ok: false,
  domain_instructions: null,
  cac_submitted: false,
  cac_skipped: false,
  manual_review: "none",
  setup_complete: false,
  can_complete_setup: false,
  next_step: "privacy",
  progress_percent: 0,
  steps: [],
});

/** Demo-only seed catalog --- never used in live mode. */
const demoTools: ToolItem[] = [
  { id: 1, key: "dns_hygiene", name: "DNS Hygiene", category: "scanning", description: "Authoritative DNS checks, hygiene and exposure", subscribed: true, price_note: "Included", tier: "free", pricing_model: "free", eligible: true, monthly_price_ngn: 0 },
  { id: 2, key: "network_surface_scan", name: "Network Surface Scan", category: "scanning", description: "Port & service discovery with admin-pinned flags", subscribed: true, price_note: "Included", tier: "free", pricing_model: "free", eligible: true, monthly_price_ngn: 0 },
  { id: 3, key: "basic_asset_inventory", name: "Basic Asset Inventory", category: "scanning", description: "Asset CRUD + light discovery", subscribed: true, price_note: "Included", tier: "free", pricing_model: "free", eligible: true, monthly_price_ngn: 0 },
  { id: 4, key: "vulnerability_scanner", name: "Vulnerability Scanner", category: "scanning", description: "nmap + nuclei + vuln YAML pipeline", subscribed: false, price_note: "Included", tier: "free", pricing_model: "free", eligible: true, monthly_price_ngn: 0 },
  { id: 5, key: "cloud_security_scan", name: "Cloud Security Scan", category: "scanning", description: "CSPM-style cloud posture checks", subscribed: false, price_note: "Add-on · ₦150,000/mo", tier: "addon_subscription", pricing_model: "paid", eligible: false, eligibility_reason: "Billable add-on — requires active Premium (or coupon) first.", monthly_price_ngn: 150000 },
  { id: 6, key: "dynamic_mobile_testing", name: "Dynamic Mobile Testing", category: "scanning", description: "Mobile dynamic VAPT via AVD", subscribed: false, price_note: "Add-on · ₦250,000/mo", tier: "addon_subscription", pricing_model: "paid", eligible: false, eligibility_reason: "Billable add-on — requires active Premium (or coupon) first.", monthly_price_ngn: 250000 },
  { id: 7, key: "ai_pentest_agent", name: "AI Pentest Agent", category: "other", description: "Autonomous, human-gated pentest agent (engagement)", subscribed: false, price_note: "Add-on · quote", tier: "addon_engagement", pricing_model: "paid", eligible: false, eligibility_reason: "Engagement tool — staff quote and provision after sales acceptance.", monthly_price_ngn: 0 },
];

const demoPayments: Payment[] = [
  { id: 1, reference: "PHX-2026-0711", amount_ngn: 50000, status: "paid", period: "July 2026 (first month −50%)", created_at: "2026-07-01T09:00:00Z" },
  { id: 2, reference: "PHX-2026-0811", amount_ngn: 100000, status: "pending", period: "August 2026", created_at: "2026-08-01T09:00:00Z" },
];

const demoOrg = (): Organization => ({
  ...emptyOrg(),
  id: 11,
  name: "Demo Financial Group",
  slug: "demo-financial",
  creator_user_id: 1,
  legal_name: "Demo Financial Group Ltd",
  website: "https://example.com",
  phone: null,
  country: "NG",
  industry: "fintech",
  email: "admin@example.com",
  plan: "Scale",
  created_at: "2026-07-21T08:00:00Z",
  setup_completed: false,
});

const demoAudit = (): AuditEvent[] => [
  {
    id: 1,
    event_key: "org.register",
    category: "auth",
    action: "Organization registered",
    initiator_name: "Account owner",
    initiator_title: "Primary email",
    authorizer_name: null,
    authorizer_title: null,
    created_at: new Date().toISOString(),
  },
];

type OperateState = {
  unlocked: boolean;
  actingUser: string | null;
  actingRole: "initiator" | "authorizer" | null;
  expiresAt: number | null;
};

/** Persist operate-session metadata so a live dual-control token survives reloads. */
const OPERATE_META_KEY = "phantix_operate_meta";

function persistOperateMeta(meta: OperateState): void {
  try {
    sessionStorage.setItem(
      OPERATE_META_KEY,
      JSON.stringify({ actingUser: meta.actingUser, actingRole: meta.actingRole, expiresAt: meta.expiresAt }),
    );
  } catch { /* quota */ }
}

function readOperateMeta(): OperateState | null {
  try {
    const raw = sessionStorage.getItem(OPERATE_META_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as { actingUser?: string | null; actingRole?: OperateState["actingRole"] | null; expiresAt?: number | null };
    return {
      unlocked: Boolean(tokens.dualControl),
      actingUser: m.actingUser ?? null,
      actingRole: m.actingRole ?? null,
      expiresAt: typeof m.expiresAt === "number" ? m.expiresAt : null,
    };
  } catch {
    return null;
  }
}

function clearOperateMeta(): void {
  try { sessionStorage.removeItem(OPERATE_META_KEY); } catch { /* ignore */ }
}

type ToastKind = "success" | "error" | "info" | "warning";
type Toast = { id: number; kind: ToastKind; title: string; body?: string };

type Session = {
  authenticated: boolean;
  email: string;
  /** Org user signed in to the platform app (role-based access). */
  platformAccess?: boolean;
  /** Role that granted platform access. */
  role?: string;
  /** Admin assigned a password — force a change before anything else. */
  mustChangePassword?: boolean;
} | null;

/**
 * Set when the server ends an authenticated session mid-use (a 401 clears the
 * bearer tokens). We hold the current page in place under a card rather than
 * redirecting abruptly, so the user can return to it after signing back in.
 */
type SessionExpired = { active: boolean; returnTo: string };

interface PersistedState {
  org: Organization;
  setup: SetupState;
  users: OrgUser[];
  dualControl: DualControlAssignment;
  connections: DbConnection[];
  companies: ChildCompany[];
  serviceKey: ServiceKeyMeta | null;
  loginLinks: LoginLink[];
  identity: { id: number; slug: string; creator_user_id: number };
  audit: AuditEvent[];
  pending: PendingAction[];
  tools: ToolItem[];
  payments: Payment[];
  tickets: SupportTicket[];
  alerts: AlertEvent[];
  alertSettings: AlertSettings;
  nextId: number;
}

const STORAGE_KEY = "phantix_platform_demo_v1";

function loadPersisted(): PersistedState | null {
  if (!DEMO_MODE) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

const emptyState = (): PersistedState => ({
  org: emptyOrg(),
  setup: emptySetup(),
  users: [],
  dualControl: { configured: false, require_dual_control: false, initiator_user_id: null, authorizer_user_id: null, email_policy: null },
  connections: [],
  companies: [],
  serviceKey: null,
  loginLinks: [],
  identity: { id: 0, slug: "", creator_user_id: 0 },
  audit: [],
  pending: [],
  tools: [],
  payments: [],
  tickets: [],
  alerts: [],
  alertSettings: { alerts_enabled: true, smtp: { enabled: false, host: "", port: 587, from_email: "", from_name: "", use_tls: true }, email_recipients: [], whatsapp: { enabled: false, provider: "", recipients: [] }, telegram: { enabled: false, provider: "", recipients: [] }, notify: {} },
  nextId: 1,
});

const demoState = (): PersistedState => ({
  org: demoOrg(),
  setup: emptySetup(),
  users: [],
  dualControl: { configured: false, require_dual_control: false, initiator_user_id: null, authorizer_user_id: null, email_policy: null },
  connections: [],
  companies: [],
  serviceKey: null,
  loginLinks: [],
  identity: { id: 11, slug: "demo-financial", creator_user_id: 1 },
  audit: demoAudit(),
  pending: [],
  tools: demoTools,
  payments: demoPayments,
  tickets: [],
  alerts: [
    { id: 1, event_type: "alert_sent", severity: "high", title: "Critical vulnerability on api.example.com", status: "delivered", channels: ["email"], created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, event_type: "alert_sent", severity: "medium", title: "New unverified asset discovered", status: "delivered", channels: ["email", "whatsapp"], created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 3, event_type: "alert_failed", severity: "critical", title: "Compromised credential detected", status: "failed", channels: ["email", "telegram"], created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  alertSettings: { alerts_enabled: true, smtp: { enabled: true, host: "smtp.example.com", port: 587, from_email: "alerts@acme.ng", from_name: "SecureGraph Alerts", use_tls: true }, email_recipients: ["security@acme.ng"], whatsapp: { enabled: false, provider: "", recipients: [] }, telegram: { enabled: true, provider: "telegram_bot", recipients: ["@acme_security"] }, notify: { critical: true, high: true, medium: true, low: false, info: false } },
  nextId: 100,
});

const freshState = (): PersistedState => (DEMO_MODE ? demoState() : emptyState());

type SetupApi = Record<string, unknown>;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickBool(...vals: unknown[]): boolean {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
    if (v === "true" || v === 1) return true;
    if (v === "false" || v === 0) return false;
    const nested = asRecord(v);
    if (nested) {
      if (typeof nested.ok === "boolean") return nested.ok;
      if (typeof nested.verified === "boolean") return nested.verified;
      if (typeof nested.success === "boolean") return nested.success;
      if (typeof nested.passed === "boolean") return nested.passed;
    }
  }
  return false;
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** Normalize domain check / setup verification flags from varied API shapes. */
function parseDomainFlags(raw: unknown): { dns: boolean; http: boolean; domain: string | null; token: string | null } {
  const r = asRecord(raw) || {};
  const verification = asRecord(r.verification) || asRecord(r.verifications) || asRecord(r.domain_verification) || r;
  const modes = asRecord(verification.modes) || asRecord(r.modes);
  const dnsMode = asRecord(modes?.domain_dns) || asRecord(verification.domain_dns) || asRecord(r.dns);
  const httpMode = asRecord(modes?.domain_http) || asRecord(verification.domain_http) || asRecord(r.http);

  const dns = pickBool(
    verification.domain_dns_ok,
    verification.dns_ok,
    verification.dns_verified,
    r.domain_dns_ok,
    r.dns_ok,
    r.dns_verified,
    dnsMode?.completed,
    dnsMode?.verified,
    dnsMode?.ok,
    dnsMode,
  );
  const http = pickBool(
    verification.domain_http_ok,
    verification.http_ok,
    verification.http_verified,
    r.domain_http_ok,
    r.http_ok,
    r.http_verified,
    httpMode?.completed,
    httpMode?.verified,
    httpMode?.ok,
    httpMode,
  );
  // company/domain verified often means at least one mode passed
  const anyOk = pickBool(verification.domain_verified, r.domain_verified, r.company_verified, verification.company_verified);
  return {
    dns: dns || (anyOk && !http ? true : dns),
    http: http || (anyOk && !dns ? true : http),
    domain: pickStr(verification.domain, r.domain, verification.hostname),
    token: pickStr(verification.domain_token, verification.token, r.domain_token, r.token, verification.verification_token),
  };
}

/** Normalize GET /tools/catalog + /tools/my-tools into ToolItem[]. */
function mapToolsFromApi(raw: unknown): ToolItem[] {
  const list = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
  const items = list as Record<string, unknown>[];
  return items.map((t, i) => {
    const pricing = String(t.pricing_model ?? "free");
    const tier = String(t.tier ?? (pricing === "paid" ? "addon_subscription" : pricing === "free" ? "free" : "free"));
    const subscribed = t.subscription_status === "active" || t.provision_status === "provisioned" || t.subscribed === true;
    return {
      id: Number(t.id ?? i + 1),
      key: String(t.tool_key ?? t.key ?? ""),
      name: String(t.name ?? t.tool_name ?? t.key ?? ""),
      category: String(t.category ?? "tooling"),
      description: String(t.description ?? ""),
      subscribed,
      price_note:
        t.monthly_price_ngn && Number(t.monthly_price_ngn) > 0
          ? `Add-on · ₦${Number(t.monthly_price_ngn).toLocaleString()}/mo`
          : tier === "free"
            ? "Included"
            : "Add-on",
      tier,
      pricing_model: pricing,
      eligible: t.eligible === true || t.eligible == null,
      eligibility_reason: t.eligibility_reason ? String(t.eligibility_reason) : null,
      monthly_price_ngn: Number(t.monthly_price_ngn ?? 0),
      yearly_price_ngn: Number(t.yearly_price_ngn ?? 0),
    };
  });
}

/** Normalize GET /alerts/settings into a full AlertSettings (defensive defaults). */
function normalizeAlertSettings(raw: unknown): AlertSettings {
  const r = asRecord(raw) ?? {};
  const smtpRaw = asRecord(r.smtp) ?? {};
  const waRaw = asRecord(r.whatsapp) ?? {};
  const tgRaw = asRecord(r.telegram) ?? {};
  const notifyRaw = asRecord(r.notify) ?? {};
  const emailRecipients = Array.isArray(r.email_recipients)
    ? r.email_recipients.map(String)
    : Array.isArray(smtpRaw.email_recipients)
      ? smtpRaw.email_recipients.map(String)
      : [];
  const waRecipients = Array.isArray(waRaw.recipients) ? waRaw.recipients.map(String) : [];
  const tgRecipients = Array.isArray(tgRaw.recipients) ? tgRaw.recipients.map(String) : [];
  return {
    alerts_enabled: r.alerts_enabled !== false,
    smtp: {
      enabled: smtpRaw.enabled !== false,
      host: String(smtpRaw.host ?? ""),
      port: Number(smtpRaw.port ?? 587),
      from_email: String(smtpRaw.from_email ?? smtpRaw.fromEmail ?? ""),
      from_name: String(smtpRaw.from_name ?? smtpRaw.fromName ?? "SecureGraph Alerts"),
      use_tls: smtpRaw.use_tls !== false,
    },
    email_recipients: emailRecipients,
    whatsapp: {
      enabled: waRaw.enabled === true,
      provider: String(waRaw.provider ?? "auto"),
      recipients: waRecipients,
    },
    telegram: {
      enabled: tgRaw.enabled === true,
      provider: String(tgRaw.provider ?? "auto"),
      recipients: tgRecipients,
    },
    notify: Object.fromEntries(
      Object.entries(notifyRaw).map(([k, v]) => [k, v !== false]),
    ) as Record<string, boolean>,
  };
}

/** Normalize GET /support/tickets into SupportTicket[]. */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function mapTicketsFromApi(raw: unknown): SupportTicket[] {
  const list = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
  return (list as unknown[]).filter(isRecord).map((t) => ({
    id: Number(t.id ?? 0),
    subject: String(t.subject ?? ""),
    status: (String(t.status ?? "open") || "open") as SupportTicket["status"],
    priority: String(t.priority ?? "normal"),
    created_at: String(t.created_at ?? new Date().toISOString()),
    messages: Array.isArray(t.messages)
      ? t.messages.filter(isRecord).map((m) => ({
          from: String(m.submitter_name ?? m.from ?? "You"),
          body: String(m.body ?? m.message ?? ""),
          at: String(m.created_at ?? m.at ?? new Date().toISOString()),
        }))
      : [],
  }));
}

function mapSetupFromApi(api: SetupApi, emailFallback = ""): { org: Partial<Organization>; setup: SetupState } {
  const privacy = asRecord(api.privacy) || {};
  const identity = asRecord(api.identity) || {};
  const cac = asRecord(api.cac) || asRecord(api.cac_rc) || {};
  const manual = asRecord(api.manual_review) || {};
  const flags = parseDomainFlags(api);

  const reviewRaw =
    (typeof api.manual_review === "string" && api.manual_review) ||
    (typeof manual.status === "string" && manual.status) ||
    "none";
  const review = (["none", "pending", "approved", "rejected"].includes(reviewRaw) ? reviewRaw : "none") as SetupState["manual_review"];

  const stepsRaw = Array.isArray(api.steps) ? api.steps : [];
  const steps = stepsRaw
    .map((raw) => {
      const st = asRecord(raw);
      if (!st) return null;
      return {
        id: String(st.id ?? ""),
        title: String(st.title ?? st.id ?? ""),
        required: pickBool(st.required),
        completed: pickBool(st.completed, st.done),
        description: String(st.description ?? ""),
      };
    })
    .filter((x): x is SetupState["steps"][number] => !!x && !!x.id);

  const emailVerified = pickBool(api.email_verified, api.identity_verified, identity.verified, identity.email_verified);
  const privacyOk = pickBool(api.privacy_notice_accepted, privacy.accepted, privacy.privacy_notice_accepted);
  const setupDone = pickBool(api.setup_completed, api.setup_complete);
  const canComplete = pickBool(api.can_complete_setup) || (privacyOk && emailVerified && !setupDone);

  return {
    org: {
      id: typeof api.organization_id === "number" ? api.organization_id : 0,
      name: typeof api.organization_name === "string" ? api.organization_name : "",
      slug: typeof api.slug === "string" ? api.slug : "",
      primary_email: emailFallback,
      email: emailFallback,
    },
    setup: {
      privacy_accepted: privacyOk,
      privacy_accepted_at:
        (typeof api.privacy_notice_accepted_at === "string" && api.privacy_notice_accepted_at) ||
        (typeof privacy.accepted_at === "string" && privacy.accepted_at) ||
        null,
      privacy_notice_version:
        pickStr(api.privacy_notice_version, privacy.version, privacy.privacy_notice_version) || null,
      identity_saved: pickBool(identity.saved, api.identity_saved, !!pickStr(identity.legal_name, api.legal_name)),
      email_otp_sent: false,
      email_otp_destination:
        pickStr(api.primary_email_masked, identity.primary_email_masked, emailFallback) || null,
      identity_verified: emailVerified,
      email_verified: emailVerified,
      company_verified: pickBool(api.company_verified, flags.dns || flags.http),
      domain: flags.domain,
      domain_token: flags.token,
      domain_dns_ok: flags.dns,
      domain_http_ok: flags.http,
      domain_instructions: null,
      cac_submitted: pickBool(cac.submitted, cac.details_provided, cac.cac_submitted, api.cac_submitted, api.cac_details_provided),
      cac_skipped: pickBool(cac.skipped, cac.cac_skipped, api.cac_skipped),
      manual_review: review,
      setup_complete: setupDone,
      can_complete_setup: canComplete,
      next_step: pickStr(api.next_step) || null,
      progress_percent: typeof api.progress_percent === "number" ? api.progress_percent : privacyOk && emailVerified ? 66 : privacyOk ? 33 : 0,
      steps,
    },
  };
}

type Store = {
  session: Session;
  state: PersistedState;
  operate: OperateState;
  securityDbReady: boolean;
  sessionLoading: boolean;
  /** App session ended mid-use: hold the page under a "sign back in" card. */
  sessionExpired: SessionExpired;
  clearSessionExpired: () => void;
  /** End the app session and raise the "sign back in" card in place. */
  expireSession: () => void;
  billingEntitlements: Record<string, any> | null;
  // auth
  register: (name: string, email: string, password: string, country: string, slug: string, industry: string, secondary_email: string, primary_contact: {title: string, name: string}) => Promise<{ mfaRequired: boolean }>;
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean; destinationMasked?: string; mustChangePassword?: boolean; platformAccess?: boolean; role?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  resendLoginOtp: (email: string, password: string) => Promise<{ destinationMasked: string }>;
  resendRegisterOtp: (name: string, email: string, password: string, country: string, slug: string, industry: string, secondary_email: string, primary_contact: { title: string; name: string }) => Promise<void>;
  logout: () => void;
  hydrateSession: (email?: string) => Promise<void>;
  // setup wizard
  acceptPrivacy: (version?: string) => Promise<void>;
  saveIdentity: (fields: {
    website?: string;
    legal_name?: string;
    company_phone?: string;
    registration_number?: string;
  }) => Promise<void>;
  updateOrgProfile: (fields: Partial<Organization>) => Promise<void>;
  sendOtp: () => Promise<{ devOtp: string; destinationMasked: string; resendAfter: number }>;
  verifyOtp: (code: string) => Promise<void>;
  startDomainVerification: (domain: string, website?: string) => Promise<{
    token: string;
    domain: string;
    instructions: Record<string, unknown> | null;
  }>;
  checkDomain: (method: "auto" | "dns" | "http") => Promise<{ dns: boolean; http: boolean; message: string }>;
  submitCac: (fields: {
    rc_number?: string;
    company_type?: string;
    registration_date?: string;
    status?: string;
    registered_address?: string;
    tin?: string;
  }) => Promise<void>;
  skipCac: () => Promise<void>;
  requestManualReview: (notes?: string) => Promise<void>;
  completeSetup: () => Promise<void>;
  /** Fresh GET /organizations/me/setup only (lighter than full hydrate). */
  refreshSetup: () => Promise<void>;
  /** Full re-hydrate of org state from the API (SWR-style background refresh). */
  refreshSession: () => Promise<void>;
  // users & dual control
  createUser: (u: { full_name: string; email: string; title: string; role: string }) => Promise<OrgUser>;
  assignDualControl: (initiatorId: number, authorizerId: number) => Promise<void>;
  unlockOperate: (email: string, code: string) => Promise<void>;
  lockOperate: () => void;
  /** Opens dual-control overlay when operate session missing. Resolves true if unlocked. */
  requireDualControl: (reason?: string) => Promise<boolean>;
  dualControlPrompt: { open: boolean; reason: string };
  closeDualControlPrompt: (success: boolean) => void;
  requestDualControlOtp: (email: string) => Promise<{ destinationMasked: string; devOtp: string }>;
  verifyDualControlOtp: (code: string) => Promise<{ deviceRequired: boolean }>;
  confirmDualControlDevice: () => Promise<{ done: boolean }>;
  issueLoginLink: (userId: number) => Promise<string>;
  clearDevice: (userId: number) => Promise<void>;
  deleteOrgUser: (id: number) => Promise<{ pending: boolean }>;
  // connections
  refreshConnections: () => Promise<void>;
  refreshServiceKey: () => Promise<void>;
  createConnection: (
    c: Omit<DbConnection, "id" | "bootstrap_status" | "schema_version" | "last_test_at" | "last_test_ok" | "created_at"> & {
      username?: string;
      password?: string;
      ssl_mode?: string;
      environment?: string;
    },
  ) => Promise<void>;
  testConnection: (id: number) => Promise<void>;
  bootstrapConnection: (id: number) => Promise<{ pending: boolean }>;
  deleteConnection: (id: number) => Promise<{ pending: boolean }>;
  // companies & keys
  createCompany: (c: { name: string; industry: string; country: string }) => Promise<void>;
  deleteCompany: (id: number) => Promise<{ pending: boolean }>;
  deleteAccount: () => Promise<{ pending: boolean }>;
  rotateServiceKey: (companyId?: number) => Promise<string>;
  revokeServiceKey: () => Promise<void>;
  savePreferredServices: (services: string[]) => Promise<void>;
  /** POST /organizations/me/logo multipart field `file` (PNG/JPEG/WebP/SVG, max 2MB) */
  uploadLogo: (file: File) => Promise<string | null>;
  /** DELETE /organizations/me/logo */
  deleteLogo: () => Promise<void>;
  // misc
  toggleTool: (tool: ToolItem) => Promise<void>;
  createTicket: (subject: string, priority: string, body: string) => Promise<void>;
  decidePending: (id: number, approve: boolean) => Promise<void>;
  refreshPending: () => Promise<void>;
  refreshAudit: () => Promise<void>;
  sendTestAlert: () => Promise<void>;
  updateAlertSettings: (settings: Partial<AlertSettings>) => Promise<void>;
  exportAuditCsv: () => Promise<void>;
  resetDemo: () => void;
  // toasts
  toasts: Toast[];
  toast: (kind: ToastKind, title: string, body?: string) => void;
  dismissToast: (id: number) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => {
    if (DEMO_MODE) return loadPersisted() ?? demoState();
    // Live: never restore demo sessionStorage seed
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return emptyState();
  });
  const [session, setSession] = useState<Session>(() => {
    if (!tokens.platform) return null;
    const email = emailFromToken();
    return { authenticated: true, email };
  });
  const [operate, setOperate] = useState<OperateState>(() => {
    if (DEMO_MODE && tokens.dualControl) {
      return { unlocked: true, actingUser: "Operate user", actingRole: "initiator", expiresAt: Date.now() + 30 * 60_000 };
    }
    // Restore an existing dual-control session token so mutations reuse it
    // instead of re-opening the initiator/authorizer OTP flow on every page load.
    // The token itself is authoritative — a stale local expiry (clock skew, tab
    // hidden timers) must not force a re-code while the backend session is live.
    if (tokens.dualControl) {
      const meta = readOperateMeta();
      return {
        unlocked: true,
        actingUser: meta?.actingUser ?? "Operate user",
        actingRole: meta?.actingRole ?? "initiator",
        expiresAt: meta?.expiresAt != null && meta.expiresAt > Date.now() ? meta.expiresAt : Date.now() + 20 * 60_000,
      };
    }
    return { unlocked: false, actingUser: null, actingRole: null, expiresAt: null };
  });
  const [dualControlPrompt, setDualControlPrompt] = useState<{ open: boolean; reason: string }>({ open: false, reason: "" });
  const dcPromptResolve = useRef<((ok: boolean) => void) | null>(null);
  const dcMfaToken = useRef<string>("");
  const dcDeviceToken = useRef<string>("");
  const dcExchange = useRef(newExchangeGuard<{ done: boolean }>());
  const dcEmail = useRef<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const hydrating = useRef(false);
  // Whether a stored session existed when this page loaded. If the backend then
  // rejects it (expired/revoked while the operator was away), the page is held
  // under the "session has expired" card instead of a bare redirect to /login.
  const hadSessionAtBoot = useRef(!!tokens.platform);
  const [sessionLoading, setSessionLoading] = useState(!!(tokens.platform && !DEMO_MODE));
  const [sessionExpired, setSessionExpired] = useState<SessionExpired>({ active: false, returnTo: "" });
  const [billingEntitlements, setBillingEnts] = useState<Record<string, any> | null>(null);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired({ active: false, returnTo: "" });
  }, []);

  /**
   * End the app session and raise the "sign back in" card in place. Used both
   * when a 401 clears the bearer tokens and when the inactivity timer fires; in
   * either case the current page stays mounted so the user can pick up where
   * they left off.
   */
  const expireSession = useCallback(() => {
    tokens.platform = null;
    tokens.orgUser = null;
    tokens.email = null;
    tokens.dualControl = null;
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setOperate({ unlocked: false, actingUser: null, actingRole: null, expiresAt: null });
    setSessionExpired((prev) => (prev.active ? prev : { active: true, returnTo }));
  }, []);

  // Detect the app session ending underneath us (a 401 clears the bearer tokens
  // via the api client) and hold the current page under the expired card.
  useEffect(() => {
    const check = () => {
      if (session?.authenticated && !tokens.platform) {
        // Don't interrupt setup --- polling refreshSetup may hit transient 401s
        if (window.location.pathname === "/setup") return;
        expireSession();
      }
    };
    const interval = setInterval(check, 2000);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", check);
    };
  }, [session, expireSession]);

  const persist = useCallback((updater: (s: PersistedState) => PersistedState) => {
    setState((prev) => {
      const next = updater(prev);
      if (DEMO_MODE) {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch { /* quota */ }
      }
      return next;
    });
  }, []);

  const hydrateSession = useCallback(async (email = "") => {
    if (DEMO_MODE || !tokens.platform || hydrating.current) return;
    hydrating.current = true;
    setSessionLoading(true);
    try {
      const resolvedEmail = email || emailFromToken() || tokens.email || "";
      if (resolvedEmail) tokens.email = resolvedEmail;

      const [meRes, setupRes, connsRes, primaryRes, keyRes, usersRes, dcRes, alertsRes, alertSettingsRes, auditRes, pendingRes, entRes, identityRes, loginLinksRes, companiesRes, toolsRes, myToolsRes, ticketsRes] = await Promise.all([
        api.get<unknown>("/organizations/me").catch(() => null),
        api.get<SetupApi>("/organizations/me/setup").catch(() => null),
        api.get<unknown>("/db-connections").catch(() => null),
        api.get<unknown>("/db-connections/primary-security-storage").catch(() => null),
        api.get<unknown>("/organizations/me/service-key").catch(() =>
          api.get<unknown>("/organizations/me/service-keys").catch(() => null),
        ),
        api.get<unknown>("/org-users").catch(() => null),
        api.get<unknown>("/org-users/dual-control").catch(() => null),
        api.get<unknown>("/alerts/events").catch(() => null),
        api.get<unknown>("/alerts/settings").catch(() => null),
        api.get<unknown>("/audit/events").catch(() => null),
        api.get<unknown>("/audit/pending").catch(() => null),
        api.get<unknown>("/billing/entitlements").catch(() => null),
        api.get<unknown>("/organizations/me/identity").catch(() => null),
        api.get<unknown>("/organizations/me/login-links").catch(() => null),
        api.get<unknown>("/organizations/me/companies").catch(() => null),
        api.get<unknown>("/tools/catalog").catch(() => null),
        api.get<unknown>("/tools/my-tools").catch(() => null),
        api.get<unknown>("/support/tickets").catch(() => null),
      ]);

      if (entRes) setBillingEnts(entRes as Record<string, any>);

      const org = meRes
        ? mapOrgFromApi(meRes, resolvedEmail)
        : mapOrgFromApi({ email: resolvedEmail }, resolvedEmail);
      const mappedSetup = setupRes ? mapSetupFromApi(setupRes, resolvedEmail || org.email) : null;
      const connections = mapConnectionsFromApi(connsRes);
      // If list empty but primary endpoint returns a row, include it
      if (!connections.length && primaryRes) {
        const p = mapConnectionFromApi(primaryRes);
        if (p) connections.push(p);
      }

      let serviceKey: ServiceKeyMeta | null = null;
      if (keyRes) {
        const keyObj = Array.isArray(keyRes) ? keyRes[0] : keyRes;
        if (keyObj && typeof keyObj === "object") {
          const k = keyObj as Record<string, unknown>;
          serviceKey = {
            id: Number(k.id ?? 0),
            prefix: String(k.prefix ?? k.key_prefix ?? "pk_live_..."),
            active: k.active !== false,
            created_at: String(k.created_at ?? ""),
            last_used_at: (k.last_used_at as string) ?? null,
          };
        }
      }

      const usersRaw = Array.isArray(usersRes)
        ? usersRes
        : ((usersRes as { items?: unknown[] })?.items ?? []);
      const users: OrgUser[] = (usersRaw as Record<string, unknown>[]).map((u) => ({
        id: Number(u.id ?? 0),
        full_name: String(u.full_name ?? u.name ?? ""),
        email: String(u.email ?? ""),
        title: String(u.title ?? ""),
        role: String(u.role ?? "viewer"),
        otp_only: u.otp_only !== false,
        is_active: u.is_active !== false,
        last_login_at: (u.last_login_at as string) ?? null,
      }));

      let dualControl: DualControlAssignment = {
        configured: false,
        require_dual_control: false,
        initiator_user_id: null,
        authorizer_user_id: null,
        email_policy: null,
      };
      if (dcRes && typeof dcRes === "object") {
        // Handle both flat and paginated { items: [...] } responses
        const raw = Array.isArray(dcRes) ? dcRes[0] : ((dcRes as { items?: unknown[] })?.items?.[0]) ?? dcRes;
        const d = raw as Record<string, unknown>;
        const initId = Number(d.initiator_user_id ?? (d.initiator as { id?: number })?.id ?? 0) || null;
        const authId = Number(d.authorizer_user_id ?? (d.authorizer as { id?: number })?.id ?? 0) || null;
        const ep = d.email_policy as { allowed_domains?: string[]; registration_emails_exempt?: string[] } | undefined;
        dualControl = {
          configured: Boolean(d.configured ?? (initId && authId)),
          require_dual_control: Boolean(d.require_dual_control ?? true),
          initiator_user_id: initId,
          authorizer_user_id: authId,
          email_policy: ep ? {
            allowed_domains: Array.isArray(ep.allowed_domains) ? ep.allowed_domains : [],
            registration_emails_exempt: Array.isArray(ep.registration_emails_exempt) ? ep.registration_emails_exempt : [],
          } : null,
        };
      }

      const displayEmail = resolvedEmail || org.email || "";

      // Identity chips (org id / slug / creator) --- doc 02 §3.1
      let identity: { id: number; slug: string; creator_user_id: number } = { id: org.id ?? 0, slug: org.slug ?? "", creator_user_id: 0 };
      if (identityRes && typeof identityRes === "object") {
        const idObj = identityRes as Record<string, unknown>;
        identity = {
          id: Number(idObj.id ?? idObj.organization_id ?? org.id ?? 0),
          slug: String(idObj.slug ?? org.slug ?? ""),
          creator_user_id: Number(idObj.creator_user_id ?? 0),
        };
      }

      // Login links history --- doc 02 §3.4
      let loginLinks: LoginLink[] = [];
      if (loginLinksRes) {
        const rawLinks = Array.isArray(loginLinksRes) ? loginLinksRes : ((loginLinksRes as { items?: unknown[] })?.items ?? []);
        loginLinks = (rawLinks as Record<string, unknown>[]).map((l) => ({
          id: Number(l.id ?? 0),
          user_id: Number(l.user_id ?? 0),
          user_name: String(l.user_name ?? l.full_name ?? ""),
          created_at: String(l.created_at ?? new Date().toISOString()),
          used_at: (l.used_at as string) ?? null,
          status: ["active", "used", "expired"].includes(String(l.status ?? "active"))
            ? (l.status as LoginLink["status"])
            : "active",
        }));
      }

      // Child companies --- doc 02 §3.2
      let companies: ChildCompany[] = [];
      if (companiesRes) {
        const rawCompanies = Array.isArray(companiesRes) ? companiesRes : ((companiesRes as { items?: unknown[] })?.items ?? []);
        companies = (rawCompanies as Record<string, unknown>[]).map((c) => ({
          id: Number(c.id ?? 0),
          name: String(c.name ?? ""),
          slug: String(c.slug ?? ""),
          industry: String(c.industry ?? ""),
          country: String(c.country ?? ""),
          key_prefix: (c.key_prefix as string) ?? null,
          created_at: String(c.created_at ?? new Date().toISOString()),
        }));
      }

      persist((s) => ({
        ...s,
        org: {
          ...org,
          ...(mappedSetup?.org ?? {}),
          email: displayEmail || org.email,
          primary_email: displayEmail || org.email,
          setup_completed: mappedSetup?.setup.setup_complete ?? org.setup_completed,
          identity_verified: mappedSetup?.setup.identity_verified ?? org.identity_verified,
          privacy_notice_accepted: mappedSetup?.setup.privacy_accepted ?? org.privacy_notice_accepted,
        },
        setup: mappedSetup
          ? {
              ...mappedSetup.setup,
              email_otp_destination: mappedSetup.setup.email_otp_destination || displayEmail || null,
              setup_complete: mappedSetup.setup.setup_complete || org.setup_completed,
              identity_verified: mappedSetup.setup.identity_verified || org.identity_verified || org.email_verified,
              privacy_accepted: mappedSetup.setup.privacy_accepted || org.privacy_notice_accepted,
            }
          : {
              ...s.setup,
              setup_complete: org.setup_completed,
              identity_verified: org.identity_verified || org.email_verified,
              privacy_accepted: org.privacy_notice_accepted,
            },
        connections,
        serviceKey: serviceKey ?? s.serviceKey,
        users: users.length ? users : s.users,
        dualControl: dualControl.configured ? dualControl : s.dualControl,
        identity,
        loginLinks,
        companies: companies.length ? companies : s.companies,
        alerts: Array.isArray(alertsRes) ? (alertsRes as unknown as AlertEvent[]) : (((alertsRes as { items?: unknown[] })?.items ?? []) as AlertEvent[]),
        alertSettings: alertSettingsRes ? normalizeAlertSettings(alertSettingsRes) : s.alertSettings,
        audit: Array.isArray(auditRes) ? (auditRes as unknown as AuditEvent[]) : (((auditRes as { items?: unknown[] })?.items ?? []) as AuditEvent[]),
        pending: Array.isArray(pendingRes) ? (pendingRes as unknown as PendingAction[]) : s.pending,
        tools: (() => {
          if (!toolsRes) return s.tools;
          const catalog = mapToolsFromApi(toolsRes);
          if (!myToolsRes) return catalog;
          const mine = mapToolsFromApi(myToolsRes);
          const subscribedKeys = new Set(
            mine.filter((t) => t.subscribed || t.key).map((t) => t.key).filter(Boolean),
          );
          // Prefer explicit subscribed flags from my-tools; also treat any returned row as provisioned.
          const mineByKey = new Map(mine.map((t) => [t.key, t]));
          for (const t of mine) {
            if (t.key) subscribedKeys.add(t.key);
          }
          return catalog.map((t) => {
            const fromMine = mineByKey.get(t.key);
            if (!fromMine && !subscribedKeys.has(t.key)) return t;
            return { ...t, subscribed: true };
          });
        })(),
        tickets: ticketsRes ? mapTicketsFromApi(ticketsRes) : s.tickets,
      }));
      setSession({ authenticated: true, email: displayEmail });
    } catch {
      const fallback = email || emailFromToken() || tokens.email || "";
      if (fallback) {
        tokens.email = fallback;
        setSession({ authenticated: true, email: fallback });
        persist((s) => ({ ...s, org: { ...s.org, email: fallback, primary_email: fallback } }));
      }
    } finally {
      // The stored session was rejected (expired or revoked while the operator
      // was away). Keep the page mounted and raise the card, so they choose to
      // sign in again rather than being dropped on /login with no explanation.
      if (hadSessionAtBoot.current && !tokens.platform) expireSession();
      hydrating.current = false;
      setSessionLoading(false);
    }
  }, [persist, expireSession]);

  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, title, body }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const logAudit = useCallback(
    (event_key: string, category: string, action: string) => {
      persist((s) => ({
        ...s,
        audit: [
          { id: s.nextId, event_key, category, action, initiator_name: "Account owner", initiator_title: "Company JWT", authorizer_name: null, authorizer_title: null, created_at: new Date().toISOString() },
          ...s.audit,
        ],
        nextId: s.nextId + 1,
      }));
    },
    [persist],
  );

  // ── Auth ────────────────────────────────────────────────────────────────
  const register = useCallback(
    async (name: string, email: string, _password: string, country: string, slug: string, industry: string, secondary_email: string, primary_contact: {title: string, name: string}) => {
      if (DEMO_MODE) {
        await delay(700);
        persist((s) => ({
          ...s,
          org: { ...s.org, name, email, primary_email: email, country, slug, industry },
          setup: emptySetup(),
          audit: [{ id: s.nextId, event_key: "org.register", category: "auth", action: `Organization registered: ${name}`, initiator_name: email, initiator_title: "Primary email", authorizer_name: null, authorizer_title: null, created_at: new Date().toISOString() }, ...s.audit],
          nextId: s.nextId + 1,
        }));
        tokens.platform = "demo.company.jwt";
        tokens.email = email;
        setSession({ authenticated: true, email });
        return { mfaRequired: false };
      }
      await api.post("/organizations/register", { name, email, password: _password, country, slug, industry, secondary_email, primary_contact });
      // Per 01_ORG_SETUP_IMPLEMENTATION.md §3.1: register returns 201 + org profile, NO JWT.
      // Do NOT auto-login --- the user signs in on /login (email prefilled).
      persist((s) => ({
        ...s,
        org: { ...s.org, name, email, primary_email: email, country, slug, industry },
      }));
      return { mfaRequired: false };
    },
    [persist, hydrateSession],
  );

  const login = useCallback(async (email: string, password: string) => {
    if (DEMO_MODE) {
      await delay(650);
      if (!email.includes("@")) throw new Error("Enter a valid company email");
      sessionStorage.setItem("mfa_token", "demo-mfa");
      return { mfaRequired: true, destinationMasked: "" };
    }
    const res = await api.postForm<{
      access_token?: string;
      mfa_required?: boolean;
      mfa_token?: string;
      destination_masked?: string;
      organization_id?: number;
      organization_slug?: string;
      platform_access?: boolean;
      must_change_password?: boolean;
      role?: string;
      experience?: { organization_name?: string };
    }>("/organizations/login", { username: email, password });
    if (res.access_token) {
      tokens.platform = res.access_token;
      tokens.orgUser = null;
      tokens.email = email;
      const mustChangePassword = Boolean(res.must_change_password);
      setState(emptyState());
      setSessionExpired({ active: false, returnTo: "" });
      setSession({
        authenticated: true,
        email,
        mustChangePassword,
        platformAccess: Boolean(res.platform_access),
        role: res.role,
      });
      persist((s) => ({
        ...s,
        org: {
          ...s.org,
          id: res.organization_id ?? 0,
          name: res.experience?.organization_name || "",
          slug: res.organization_slug || "",
          email,
          primary_email: email,
        },
        setup: emptySetup(),
      }));
      // A forced change short-circuits the normal hydrate → setup redirect.
      if (!mustChangePassword) await hydrateSession(email);
      return {
        mfaRequired: false,
        destinationMasked: "",
        mustChangePassword,
        platformAccess: Boolean(res.platform_access),
        role: res.role,
      };
    }
    sessionStorage.setItem("mfa_token", res.mfa_token ?? "");
    return { mfaRequired: true, destinationMasked: res.destination_masked || "" };
  }, [persist, hydrateSession]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (DEMO_MODE) {
        await delay(400);
        setSession((s) => (s ? { ...s, mustChangePassword: false } : s));
        return;
      }
      await api.post("/org-users/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSession((s) => (s ? { ...s, mustChangePassword: false } : s));
    },
    [],
  );

  const verifyMfa = useCallback(async (code: string) => {
    if (DEMO_MODE) {
      await delay(700);
      if (code.length !== 6) throw new Error("Enter the 6-digit code");
      tokens.platform = "demo.company.jwt";
      setSessionExpired({ active: false, returnTo: "" });
      setSession({ authenticated: true, email: state.org.email || state.org.primary_email || "" });
      return;
    }
    const res = await api.post<{
      access_token: string;
      organization_id?: number;
      organization_slug?: string;
      experience?: { organization_name?: string };
      must_change_password?: boolean;
      platform_access?: boolean;
    }>("/organizations/login/mfa", {
      mfa_token: sessionStorage.getItem("mfa_token"),
      code,
    });
    tokens.platform = res.access_token;
    const email = session?.email || emailFromToken(res.access_token) || tokens.email || "";
    if (email) tokens.email = email;
    setState(emptyState());
    setSessionExpired({ active: false, returnTo: "" });
    setSession({
      authenticated: true,
      email,
      mustChangePassword: Boolean(res.must_change_password),
    });
    persist((s) => ({
      ...s,
      org: {
        ...s.org,
        id: res.organization_id ?? 0,
        name: res.experience?.organization_name || "",
        slug: res.organization_slug || "",
        primary_email: email,
      },
      setup: emptySetup(),
    }));
    await hydrateSession(email);
  }, [state.org.primary_email, session?.email, persist, hydrateSession]);

  // Re-submit email+password to trigger a fresh login MFA code.
  const resendLoginOtp = useCallback(async (email: string, password: string): Promise<{ destinationMasked: string }> => {
    if (DEMO_MODE) {
      await delay(650);
      sessionStorage.setItem("mfa_token", "demo-mfa");
      return { destinationMasked: "" };
    }
    const res = await api.postForm<{
      mfa_required?: boolean;
      mfa_token?: string;
      destination_masked?: string;
      access_token?: string;
    }>("/organizations/login", { username: email, password });
    sessionStorage.setItem("mfa_token", res.mfa_token ?? "");
    return { destinationMasked: res.destination_masked || "" };
  }, []);

  // Re-submit registration to trigger a fresh email verification code.
  const resendRegisterOtp = useCallback(async (
    name: string,
    email: string,
    password: string,
    country: string,
    slug: string,
    industry: string,
    secondary_email: string,
    primary_contact: { title: string; name: string },
  ): Promise<void> => {
    if (DEMO_MODE) { await delay(650); sessionStorage.setItem("mfa_token", "demo-mfa"); return; }
    await api.post("/organizations/register", { name, email, password, country, slug, industry, secondary_email, primary_contact });
  }, []);

  const logout = useCallback(() => {
    tokens.platform = null;
    tokens.orgUser = null;
    tokens.dualControl = null;
    tokens.email = null;
    clearCorrelationId();
    setSession(null);
    clearSessionExpired();
    setOperate({ unlocked: false, actingUser: null, actingRole: null, expiresAt: null });
    if (!DEMO_MODE) setState(emptyState());
  }, [clearSessionExpired]);

  // ── Setup wizard ─────────────────────────────────────────────────────────
  const acceptPrivacy = useCallback(async (version?: string) => {
    if (DEMO_MODE) {
      await delay(400);
      persist((s) => ({ ...s, setup: { ...s.setup, privacy_accepted: true, privacy_accepted_at: new Date().toISOString(), next_step: "email_otp" } }));
      logAudit("setup.privacy_accept", "setup", "Accepted the privacy notice");
      return;
    }
    let v = version;
    if (!v) {
      const p = await api.get<{ version?: string }>("/organizations/privacy");
      v = p?.version;
    }
    if (!v) throw new Error("Could not load privacy notice version");
    await api.post("/organizations/me/setup/privacy/accept", { accepted: true, notice_version: v });
    persist((s) => ({ ...s, setup: { ...s.setup, privacy_accepted: true, privacy_accepted_at: new Date().toISOString() } }));
    await hydrateSession(session?.email || state.org.primary_email);
  }, [persist, logAudit, hydrateSession, session?.email, state.org.primary_email]);

  const refreshSetup = useCallback(async () => {
    if (DEMO_MODE || !tokens.platform) return;
    try {
      const setupRes = await api.get<SetupApi>("/organizations/me/setup");
      const mapped = mapSetupFromApi(setupRes, emailFromToken() || tokens.email || "");
      persist((s) => ({
        ...s,
        org: {
          ...s.org,
          ...mapped.org,
          email: s.org.email || mapped.org.email || mapped.org.primary_email || "",
        },
        setup: {
          ...mapped.setup,
          domain_instructions: s.setup.domain_instructions,
          domain_token: mapped.setup.domain_token || s.setup.domain_token,
          email_otp_destination: mapped.setup.email_otp_destination || s.setup.email_otp_destination,
          email_otp_sent: s.setup.email_otp_sent || mapped.setup.email_otp_sent,
        },
      }));
    } catch { /* keep */ }
  }, [persist]);

  const refreshSession = useCallback(async () => {
    if (DEMO_MODE || !tokens.platform) return;
    const email = session?.email || emailFromToken() || tokens.email || "";
    if (email) tokens.email = email;
    await hydrateSession(email);
  }, [hydrateSession, session?.email]);

  const saveIdentity = useCallback(
    async (fields: {
      website?: string;
      legal_name?: string;
      company_phone?: string;
      registration_number?: string;
    }) => {
      const body = {
        website: fields.website || undefined,
        legal_name: fields.legal_name || undefined,
        company_phone: fields.company_phone || undefined,
        registration_number: fields.registration_number || undefined,
      };
      if (DEMO_MODE) {
        await delay(400);
        persist((s) => ({
          ...s,
          org: {
            ...s.org,
            website: fields.website || s.org.website,
            legal_name: fields.legal_name || s.org.legal_name,
            phone: fields.company_phone || s.org.phone,
            company_phone: fields.company_phone || s.org.company_phone,
            registration_number: fields.registration_number || s.org.registration_number,
          },
          setup: { ...s.setup, identity_saved: true },
        }));
        return;
      }
      await api.post("/organizations/me/setup/identity", body);
      persist((s) => ({
        ...s,
        org: {
          ...s.org,
          website: fields.website ?? s.org.website,
          legal_name: fields.legal_name ?? s.org.legal_name,
          phone: fields.company_phone ?? s.org.phone,
          company_phone: fields.company_phone ?? s.org.company_phone,
          registration_number: fields.registration_number ?? s.org.registration_number,
        },
        setup: { ...s.setup, identity_saved: true },
      }));
      await refreshSetup();
    },
    [persist, refreshSetup],
  );

  const updateOrgProfile = useCallback(
    async (fields: Partial<Organization>) => {
      if (DEMO_MODE) {
        await delay(500);
        persist((s) => ({ ...s, org: { ...s.org, ...fields } }));
        return;
      }
      const body = orgToUpdateBody({ ...state.org, ...fields });
      const res = await api.put<unknown>("/organizations/me", body, { dualControl: true });
      const mapped = res ? mapOrgFromApi(res, state.org.email) : mapOrgFromApi({ ...state.org, ...fields }, state.org.email);
      persist((s) => ({ ...s, org: { ...s.org, ...mapped, ...fields } }));
    },
    [persist, state.org],
  );

  const savePreferredServices = useCallback(
    async (services: string[]) => {
      const allowed = new Set([
        "penetration_testing",
        "vulnerability_management",
        "red_team",
        "blue_team",
        "purple_team",
        "mssp",
        "soc_as_a_service",
        "incident_response",
        "threat_intelligence",
        "security_awareness",
        "compliance_audit",
        "cloud_security",
        "application_security",
        "ot_security",
        "other",
      ]);
      const preferred_services = services.filter((s) => allowed.has(s));
      if (DEMO_MODE) {
        await delay(400);
        persist((s) => ({ ...s, org: { ...s.org, preferred_services } }));
        return;
      }
      await api.put("/organizations/me/preferred-services", { preferred_services }, { dualControl: true });
      persist((s) => ({ ...s, org: { ...s.org, preferred_services } }));
    },
    [persist],
  );

  const sendOtp = useCallback(async () => {
    if (DEMO_MODE) {
      await delay(600);
      const devOtp = String(Math.floor(100000 + Math.random() * 900000));
      sessionStorage.setItem("dev_otp", devOtp);
      const dest = state.org.email || state.org.primary_email || null;
      persist((s) => ({ ...s, setup: { ...s.setup, email_otp_sent: true, email_otp_destination: dest } }));
      return { devOtp, destinationMasked: dest ? dest.replace(/(.{2}).+(@.+)/, "$1***$2") : "", resendAfter: 45 };
    }
    const res = await api.post<{
      dev_otp?: string;
      destination_masked?: string;
      resend_after_seconds?: number;
    }>("/organizations/me/setup/otp/send", { channel: "email" });
    const dest =
      res?.destination_masked ||
      state.org.email ||
      state.org.primary_email ||
      session?.email ||
      emailFromToken() ||
      tokens.email ||
      "";
    if (dest && !dest.includes("*")) tokens.email = dest;
    persist((s) => ({
      ...s,
      setup: {
        ...s.setup,
        email_otp_sent: true,
        email_otp_destination: res?.destination_masked || dest || s.setup.email_otp_destination,
      },
    }));
    return {
      devOtp: import.meta.env.DEV ? res?.dev_otp || "" : "",
      destinationMasked: res?.destination_masked || dest,
      resendAfter: res?.resend_after_seconds ?? 45,
    };
  }, [persist, state.org.email, state.org.primary_email, session?.email]);

  const verifyOtp = useCallback(
    async (code: string) => {
      if (DEMO_MODE) {
        await delay(650);
        const expected = sessionStorage.getItem("dev_otp");
        if (expected && code !== expected) throw new Error("That code isn't right --- check the email and try again");
        persist((s) => ({
          ...s,
          setup: {
            ...s.setup,
            identity_verified: true,
            email_verified: true,
            can_complete_setup: s.setup.privacy_accepted,
            next_step: "complete",
          },
        }));
        logAudit("setup.email_otp", "setup", "Verified company email via OTP");
        return;
      }
      const res = await api.post<{
        verified?: boolean;
        email_verified?: boolean;
        identity_verified?: boolean;
        message?: string;
      }>("/organizations/me/setup/otp/verify", { channel: "email", code });
      if (res && res.verified === false) throw new Error(res.message || "Verification failed");
      persist((s) => ({
        ...s,
        setup: {
          ...s.setup,
          identity_verified: true,
          email_verified: true,
          can_complete_setup: s.setup.privacy_accepted,
        },
        org: { ...s.org, email_verified: true, identity_verified: true },
      }));
      await refreshSetup();
    },
    [persist, logAudit, refreshSetup],
  );

  const startDomainVerification = useCallback(
    async (domain: string, website?: string) => {
      if (DEMO_MODE) {
        await delay(600);
        const token = `phx_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
        const instructions = {
          dns_txt: `phantix-verify=${token}`,
          http_url: `https://${domain}/.well-known/phantix-verify.txt`,
          http_body: token,
        };
        persist((s) => ({
          ...s,
          setup: {
            ...s.setup,
            domain,
            domain_token: token,
            domain_dns_ok: false,
            domain_http_ok: false,
            domain_instructions: instructions,
          },
        }));
        return { token, domain, instructions };
      }
      const res = await api.post<Record<string, unknown>>("/organizations/me/setup/verify/domain/start", {
        domain: domain || undefined,
        website: website || undefined,
      });
      const flags = parseDomainFlags(res);
      const token = flags.token || pickStr(res.token, res.verification_token) || "";
      const verifiedDomain = flags.domain || pickStr(res.verification_domain, res.domain) || domain;
      const instructions =
        (asRecord(res.instructions) as Record<string, unknown> | null) ||
        ({
          dns_txt: token ? `phantix-verify=${token}` : null,
          http_url: verifiedDomain ? `https://${verifiedDomain}/.well-known/phantix-verify.txt` : null,
          http_body: token || null,
        } as Record<string, unknown>);
      persist((s) => ({
        ...s,
        setup: {
          ...s.setup,
          domain: verifiedDomain,
          domain_token: token,
          domain_dns_ok: false,
          domain_http_ok: false,
          domain_instructions: instructions,
        },
      }));
      return { token, domain: verifiedDomain, instructions };
    },
    [persist],
  );

  const checkDomain = useCallback(
    async (method: "auto" | "dns" | "http") => {
      if (DEMO_MODE) {
        await delay(1400);
        persist((s) => {
          const dnsOk = s.setup.domain_dns_ok || method !== "http";
          const httpOk = s.setup.domain_http_ok || method !== "dns";
          return {
            ...s,
            setup: {
              ...s.setup,
              domain_dns_ok: dnsOk,
              domain_http_ok: httpOk,
              company_verified: dnsOk || httpOk,
            },
          };
        });
        logAudit("setup.domain_verify", "setup", "Domain verification check passed");
        return { dns: method !== "http", http: method !== "dns", message: "Demo check passed" };
      }
      const res = await api.post<Record<string, unknown>>("/organizations/me/setup/verify/domain/check", { method });
      const flags = parseDomainFlags(res);
      const verified = pickBool(res.verified, res.company_verified);
      const dns = flags.dns || (verified && method !== "http");
      const http = flags.http || (verified && method !== "dns");
      const message = pickStr(res.message) || (dns || http ? "Domain verified" : "Not verified yet --- check DNS/HTTP and try again");
      persist((s) => ({
        ...s,
        setup: {
          ...s.setup,
          domain: flags.domain || s.setup.domain,
          domain_token: flags.token || s.setup.domain_token,
          domain_dns_ok: dns || s.setup.domain_dns_ok,
          domain_http_ok: http || s.setup.domain_http_ok,
          company_verified: verified || dns || http || s.setup.company_verified,
        },
        org: {
          ...s.org,
          domain_verified: verified || dns || http || s.org.domain_verified,
          company_verified: verified || s.org.company_verified,
        },
      }));
      await refreshSetup();
      if (!dns && !http && !verified) {
        // soft fail --- still return so UI can show message
      }
      return { dns: dns || false, http: http || false, message };
    },
    [persist, logAudit, refreshSetup],
  );

  const submitCac = useCallback(
    async (fields: {
      rc_number?: string;
      company_type?: string;
      registration_date?: string;
      status?: string;
      registered_address?: string;
      tin?: string;
    }) => {
      if (DEMO_MODE) {
        await delay(500);
        persist((s) => ({ ...s, setup: { ...s.setup, cac_submitted: true, company_verified: true } }));
        logAudit("setup.cac", "setup", "Submitted CAC / RC details");
        return;
      }
      // API accepts rc_number (and related CAC fields) or skip
      await api.post("/organizations/me/setup/cac", {
        rc_number: fields.rc_number || undefined,
        company_type: fields.company_type || undefined,
        registration_date: fields.registration_date || undefined,
        status: fields.status || undefined,
        registered_address: fields.registered_address || undefined,
        tin: fields.tin || undefined,
      });
      persist((s) => ({ ...s, setup: { ...s.setup, cac_submitted: true } }));
      await refreshSetup();
    },
    [persist, logAudit, refreshSetup],
  );

  const skipCac = useCallback(async () => {
    if (DEMO_MODE) {
      await delay(250);
      persist((s) => ({ ...s, setup: { ...s.setup, cac_skipped: true } }));
      return;
    }
    await api.post("/organizations/me/setup/cac", { skip: true });
    persist((s) => ({ ...s, setup: { ...s.setup, cac_skipped: true } }));
    await refreshSetup();
  }, [persist, refreshSetup]);

  const requestManualReview = useCallback(async (notes?: string) => {
    if (DEMO_MODE) {
      await delay(500);
      persist((s) => ({ ...s, setup: { ...s.setup, manual_review: "pending" } }));
      logAudit("setup.manual_review", "setup", "Requested manual company review");
      return;
    }
    await api.post("/organizations/me/setup/verify/manual-review", { notes: notes || undefined });
    persist((s) => ({ ...s, setup: { ...s.setup, manual_review: "pending" } }));
    await refreshSetup();
  }, [persist, logAudit, refreshSetup]);

  const completeSetup = useCallback(async () => {
    if (DEMO_MODE) {
      await delay(600);
      persist((s) => {
        if (!s.setup.privacy_accepted || !s.setup.identity_verified) return s;
        return { ...s, setup: { ...s.setup, setup_complete: true, can_complete_setup: false }, org: { ...s.org, setup_completed: true } };
      });
      logAudit("setup.complete", "setup", "Completed organization setup");
      return;
    }
    await api.post("/organizations/me/setup/complete", {});
    persist((s) => ({
      ...s,
      setup: { ...s.setup, setup_complete: true, can_complete_setup: false, progress_percent: 100 },
      org: { ...s.org, setup_completed: true },
    }));
    await hydrateSession(session?.email || state.org.email || state.org.primary_email);
  }, [persist, logAudit, hydrateSession, session?.email, state.org.email, state.org.primary_email]);

  // ── Users & dual control ─────────────────────────────────────────────────
  function extractId(res: Record<string, unknown>): number {
    const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
    return n(res.id) || n(res.user_id) || n((res.user as Record<string, unknown> | undefined)?.id)
      || n((res.data as Record<string, unknown> | undefined)?.id)
      || n((res.items as Record<string, unknown>[] | undefined)?.[0]?.id) || 0;
  }

  const createUser = useCallback(
    async (u: { full_name: string; email: string; title: string; role: string }) => {
      if (DEMO_MODE) {
        await delay(500);
        let created: OrgUser | null = null;
        persist((s) => {
          const id = s.nextId;
          created = { id, full_name: u.full_name, email: u.email, title: u.title, role: u.role, otp_only: true, is_active: true, last_login_at: null };
          return {
            ...s,
            users: [...s.users, created!],
            audit: [{ id: id + 500, event_key: "org_user.create", category: "people", action: `Created org user: ${u.full_name} (${u.title})`, initiator_name: "Account owner", initiator_title: "Company JWT", authorizer_name: null, authorizer_title: null, created_at: new Date().toISOString() }, ...s.audit],
            nextId: id + 1,
          };
        });
        return created!;
      }
      // New user creation after dual-control is assigned must carry the operate
      // session header so it is queued for the authorizer's approval.
      const res = await api.post<Record<string, unknown>>("/org-users", {
        full_name: u.full_name,
        email: u.email,
        title: u.title,
        role: u.role,
      }, { dualControl: true });
      let id = extractId(res);
      let full_name = String(res.full_name ?? res.name ?? u.full_name);
      let email = String(res.email ?? u.email);
      let title = String(res.title ?? u.title);
      let role = String(res.role ?? u.role);
      // If ID not found in POST response, fetch from GET to get the real server ID
      if (!id) {
        try {
          const usersRes = await api.get<unknown>("/org-users");
          const raw = Array.isArray(usersRes) ? usersRes : ((usersRes as { items?: unknown[] })?.items ?? []);
          const match = (raw as Record<string, unknown>[]).find(
            (x) => String(x.email ?? "").toLowerCase() === u.email.toLowerCase(),
          );
          if (match) {
            id = Number(match.id ?? 0);
            full_name = String(match.full_name ?? match.name ?? full_name);
            email = String(match.email ?? email);
            title = String(match.title ?? title);
            role = String(match.role ?? role);
          }
        } catch { /* use POST values */ }
      }
      const created: OrgUser = { id, full_name, email, title, role, otp_only: true, is_active: true, last_login_at: null };
      persist((s) => ({
        ...s,
        users: [...s.users.filter((x) => x.id !== id), created],
      }));
      return created;
    },
    [persist],
  );

  const assignDualControl = useCallback(
    async (initiatorId: number, authorizerId: number) => {
      if (initiatorId === authorizerId) throw new Error("Initiator and authorizer must be two different people");
      if (DEMO_MODE) {
        await delay(550);
        persist((s) => ({
          ...s,
          dualControl: { configured: true, require_dual_control: true, initiator_user_id: initiatorId, authorizer_user_id: authorizerId, email_policy: s.dualControl.email_policy },
        }));
        logAudit("dual_control.assign", "people", "Assigned initiator + authorizer slots");
        tokens.dualControl = null;
        setOperate({ unlocked: false, actingUser: null, actingRole: null, expiresAt: null });
        return;
      }
      // Company JWT is only accepted for first-time bootstrap (dual control not
      // yet configured) — once configured, the backend requires the unlocked
      // operate session (X-Dual-Control-Session) even for a company-JWT caller
      // (app/core/org_rbac_dependencies.py's require_bootstrap_or_operator).
      // Sending it unconditionally is a no-op pre-bootstrap (no token exists
      // yet) and the fix needed post-bootstrap: without it, reassignment 403s
      // with the raw backend "Dual-control is already configured…" message
      // instead of ever attaching the session it's telling the caller to use.
      await api.put("/org-users/dual-control", {
        initiator_user_id: initiatorId,
        authorizer_user_id: authorizerId,
        require_dual_control: true,
      }, { dualControl: true });
      // Guardrail: verify the backend actually stored the assignment (DUAL_CONTROL_SETUP_FE §Phase 2)
      try {
        const dcCheck = await api.get<unknown>("/org-users/dual-control");
        const raw = Array.isArray(dcCheck) ? dcCheck[0] : ((dcCheck as { items?: unknown[] })?.items?.[0]) ?? dcCheck;
        const d = raw as Record<string, unknown>;
        const configured = Boolean(d.configured);
        const initObj = d.initiator as { id?: number } | undefined;
        const authObj = d.authorizer as { id?: number } | undefined;
        if (!configured || !initObj?.id || !authObj?.id) {
          throw new Error(
            "Audit control setup failed --- the backend did not confirm the assignment. " +
            "Make sure both users exist with organization-domain emails (your company email, not personal). " +
            "If the issue persists, contact support.",
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Audit control setup failed")) throw e;
      }
      persist((s) => ({
        ...s,
        dualControl: { configured: true, require_dual_control: true, initiator_user_id: initiatorId, authorizer_user_id: authorizerId, email_policy: s.dualControl.email_policy },
      }));
      logAudit("dual_control.assign", "people", "Assigned initiator + authorizer slots");
      tokens.dualControl = null;
      setOperate({ unlocked: false, actingUser: null, actingRole: null, expiresAt: null });
    },
    [persist, logAudit],
  );

  const applyOperateSession = useCallback(
    (payload: {
      access_token?: string;
      session_token?: string;
      dual_control_session?: string;
      inactivity_expires_at?: string;
      user?: { full_name?: string; email?: string; id?: number };
    }) => {
      if (payload.access_token) tokens.orgUser = payload.access_token;
      const sessionTok = payload.session_token || payload.dual_control_session;
      if (sessionTok) tokens.dualControl = sessionTok;
      const email = payload.user?.email || dcEmail.current;
      const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      const isInitiator = user ? state.dualControl.initiator_user_id === user.id : true;
      const isAuthorizer = user ? state.dualControl.authorizer_user_id === user.id : false;
      let expiresAt = Date.now() + 30 * 60_000;
      if (payload.inactivity_expires_at) {
        const t = Date.parse(payload.inactivity_expires_at);
        if (!Number.isNaN(t)) expiresAt = t;
      }
      setOperate({
        unlocked: true,
        actingUser: payload.user?.full_name || user?.full_name || email || "Operate user",
        actingRole: isAuthorizer && !isInitiator ? "authorizer" : "initiator",
        expiresAt,
      });
      persistOperateMeta({
        unlocked: true,
        actingUser: payload.user?.full_name || user?.full_name || email || "Operate user",
        actingRole: isAuthorizer && !isInitiator ? "authorizer" : "initiator",
        expiresAt,
      });
      if (user) {
        persist((s) => ({
          ...s,
          users: s.users.map((u) => (u.id === user.id ? { ...u, last_login_at: new Date().toISOString() } : u)),
        }));
      }
    },
    [persist, state.users, state.dualControl],
  );

  const unlockOperate = useCallback(
    async (email: string, code: string) => {
      if (DEMO_MODE) {
        await delay(800);
        const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user) throw new Error("No organization user with that email");
        const isInitiator = state.dualControl.initiator_user_id === user.id;
        const isAuthorizer = state.dualControl.authorizer_user_id === user.id;
        if (state.dualControl.configured && !isInitiator && !isAuthorizer) {
          throw new Error("Only the assigned initiator or authorizer can open operate sessions");
        }
        if (code.length !== 6) throw new Error("Enter the 6-digit code");
        tokens.orgUser = "demo.org_user.jwt";
        tokens.dualControl = `dc_${crypto.randomUUID()}`;
        setOperate({
          unlocked: true,
          actingUser: user.full_name,
          actingRole: isInitiator ? "initiator" : isAuthorizer ? "authorizer" : "initiator",
          expiresAt: Date.now() + 30 * 60_000,
        });
        persist((s) => ({ ...s, users: s.users.map((u) => (u.id === user.id ? { ...u, last_login_at: new Date().toISOString() } : u)) }));
        return;
      }
      dcEmail.current = email;
      const loginRes = await api.post<{
        mfa_required?: boolean;
        mfa_token?: string;
        destination_masked?: string;
        access_token?: string;
        session_token?: string;
      }>("/org-users/auth/login", {
        email,
        purpose: "dual_control",
        device_id: deviceId(),
      });
      if (loginRes.access_token || loginRes.session_token) {
        applyOperateSession(loginRes);
        return;
      }
      const mfaTok = loginRes.mfa_token || "";
      const mfaRes = await api.post<{
        access_token?: string;
        session_token?: string;
        dual_control_session?: string;
        device_verification_required?: boolean;
        device_token?: string;
        inactivity_expires_at?: string;
        user?: { full_name?: string; email?: string; id?: number };
      }>("/org-users/auth/login/mfa", {
        mfa_token: mfaTok,
        code,
        device_id: deviceId(),
      });
      if (mfaRes.device_verification_required && mfaRes.device_token) {
        throw new Error("Device verification required --- use the dual-control overlay");
      }
      applyOperateSession(mfaRes);
    },
    [persist, state.users, state.dualControl, applyOperateSession],
  );

  const closeDualControlPrompt = useCallback((success: boolean) => {
    setDualControlPrompt({ open: false, reason: "" });
    const resolve = dcPromptResolve.current;
    dcPromptResolve.current = null;
    resolve?.(success);
  }, []);

  const requireDualControl = useCallback(
    (reason = "This action requires an active dual-control operate session.") => {
      // Platform = **Audit control**. Only the organization's primary user can
      // sign in here, so the backend no longer requires an authorizer or an
      // operate session on this surface (X-Client-Surface: platform). Resolve
      // immediately so callers proceed; the applications keep full dual control.
      void reason;
      return Promise.resolve(true);
    },
    [],
  );

  // Slide the operate expiry on real activity. Backend inactivity window is what
  // actually matters — this keeps the FE in sync so it stops asking for a fresh
  // code on every action while the operate session is still valid.
  useEffect(() => {
    const onActivity = () => {
      setOperate((prev) => {
        if (!prev.unlocked) return prev;
        const next = { ...prev, expiresAt: Date.now() + 20 * 60_000 };
        persistOperateMeta(next);
        return next;
      });
    };
    window.addEventListener("phantix:operate-activity", onActivity);
    return () => window.removeEventListener("phantix:operate-activity", onActivity);
  }, []);

  // Lock only when the backend reports the operate session is gone/expired.
  // Auto-open the unlock overlay so the user can continue without re-navigating
  // (the org/org-user session stays signed in — only the operate token is cleared).
  useEffect(() => {
    const onExpired = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      tokens.dualControl = null;
      clearOperateMeta();
      setOperate({ unlocked: false, actingUser: null, actingRole: null, expiresAt: null });
      void requireDualControl(msg || "Operate session ended. Unlock to continue — you stay signed in.");
    };
    window.addEventListener("phantix:dual-control-session-expired", onExpired);
    return () => window.removeEventListener("phantix:dual-control-session-expired", onExpired);
  }, [requireDualControl]);

  // 403 dual-control (header missing, session still fine): open the unlock overlay
  // so the user can operate and retry — do not clear the operate token here.
  useEffect(() => {
    const onRequired = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      void requireDualControl(msg || "This action is recorded to the audit trail.");
    };
    window.addEventListener("phantix:operate-required", onRequired);
    return () => window.removeEventListener("phantix:operate-required", onRequired);
  }, [requireDualControl]);

  const requestDualControlOtp = useCallback(
    async (email: string) => {
      dcEmail.current = email;
      if (DEMO_MODE) {
        await delay(500);
        const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (state.users.length && !user) throw new Error("No organization user with that email");
        if (user && state.dualControl.configured) {
          const ok =
            state.dualControl.initiator_user_id === user.id || state.dualControl.authorizer_user_id === user.id;
          if (!ok) throw new Error("Only the assigned initiator or authorizer can open operate sessions");
        }
        const devOtp = String(Math.floor(100000 + Math.random() * 900000));
        sessionStorage.setItem("dc_dev_otp", devOtp);
        dcMfaToken.current = "demo-dc-mfa";
        return { destinationMasked: email.replace(/(.{2}).+(@.+)/, "$1***$2"), devOtp };
      }
      const res = await api.post<{
        mfa_required?: boolean;
        mfa_token?: string;
        destination_masked?: string;
        dev_otp?: string;
        access_token?: string;
        session_token?: string;
      }>("/org-users/auth/login", {
        email,
        purpose: "dual_control",
        device_id: deviceId(),
      });
      if (res.access_token || res.session_token) {
        applyOperateSession(res);
        return { destinationMasked: res.destination_masked || email, devOtp: "" };
      }
      dcMfaToken.current = res.mfa_token || "";
      if (!dcMfaToken.current) throw new Error("No MFA challenge returned");
      return {
        destinationMasked: res.destination_masked || email.replace(/(.{2}).+(@.+)/, "$1***$2"),
        devOtp: res.dev_otp || "",
      };
    },
    [state.users, state.dualControl, applyOperateSession],
  );

  const verifyDualControlOtp = useCallback(
    async (code: string) => {
      if (DEMO_MODE) {
        await delay(600);
        const expected = sessionStorage.getItem("dc_dev_otp");
        if (expected && code !== expected) throw new Error("That code isn't right");
        const email = dcEmail.current;
        const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        tokens.orgUser = "demo.org_user.jwt";
        tokens.dualControl = `dc_${crypto.randomUUID()}`;
        setOperate({
          unlocked: true,
          actingUser: user?.full_name || email || "Operate user",
          actingRole:
            user && state.dualControl.authorizer_user_id === user.id && state.dualControl.initiator_user_id !== user.id
              ? "authorizer"
              : "initiator",
          expiresAt: Date.now() + 30 * 60_000,
        });
        return { deviceRequired: false };
      }
      const res = await api.post<{
        access_token?: string;
        session_token?: string;
        dual_control_session?: string;
        device_verification_required?: boolean;
        device_token?: string;
        inactivity_expires_at?: string;
        user?: { full_name?: string; email?: string; id?: number };
      }>("/org-users/auth/login/mfa", {
        mfa_token: dcMfaToken.current,
        code,
        device_id: deviceId(),
      });
      if (res.device_verification_required && res.device_token) {
        dcDeviceToken.current = res.device_token;
        return { deviceRequired: true };
      }
      applyOperateSession(res);
      if (!tokens.dualControl) throw new Error("Operate session was not issued");
      return { deviceRequired: false };
    },
    [state.users, state.dualControl, applyOperateSession],
  );

  const confirmDualControlDevice = useCallback(
    async (): Promise<{ done: boolean }> => {
      if (DEMO_MODE) {
        tokens.dualControl = `dc_${crypto.randomUUID()}`;
        tokens.orgUser = "demo.org_user.jwt";
        setOperate({
          unlocked: true,
          actingUser: dcEmail.current || "Operate user",
          actingRole: "initiator",
          expiresAt: Date.now() + 30 * 60_000,
        });
        return { done: true };
      }
      // Poll the device-confirm status — the user opens the org-specific link
      // from email; once it's confirmed the backend issues the operate session.
      const challenge = dcDeviceToken.current;
      const exchange = async (): Promise<{ done: boolean }> => {
        const res = await api.post<{
          confirmed?: boolean;
          already_completed?: boolean;
          access_token?: string;
          session_token?: string;
          dual_control_session?: string;
          inactivity_expires_at?: string;
          user?: { full_name?: string; email?: string; id?: number };
        }>("/org-users/auth/device-status", {
          challenge,
          device_id: deviceId(),
        });
        if (!res || res.confirmed === false || !res.access_token) return { done: false };
        applyOperateSession(res);
        if (!tokens.dualControl) throw new Error("Operate session was not issued");
        return { done: true };
      };
      // Single-use: the overlay fires this from a timer, a refocus check and
      // two cross-tab signals at once, and a second exchange would revoke the
      // operate session the first one just issued.
      return claimExchange(dcExchange.current, challenge, exchange, (r) => r.done);
    },
    [applyOperateSession],
  );

  const lockOperate = useCallback(() => {
    if (!DEMO_MODE && tokens.dualControl) {
      void api.post("/org-users/auth/logout", {}).catch(() => {});
    }
    tokens.dualControl = null;
    clearOperateMeta();
    // keep orgUser for identity reads if needed; clear dual session only
    setOperate({ unlocked: false, actingUser: null, actingRole: null, expiresAt: null });
  }, []);

  const issueLoginLink = useCallback(
    async (userId: number) => {
      if (DEMO_MODE) {
        await delay(500);
        const secret = `ll_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
        const user = state.users.find((u) => u.id === userId);
        const url = `https://app.phantixlabs.com/login?org=${state.org.slug}&u=${userId}&t=${secret}`;
        persist((s) => ({
          ...s,
          loginLinks: [{ id: s.nextId, user_id: userId, user_name: user?.full_name ?? "", created_at: new Date().toISOString(), used_at: null, status: "active" }, ...s.loginLinks],
          nextId: s.nextId + 1,
        }));
        return url;
      }
      // App login requires an active service key (per backend enforcement)
      if (!state.serviceKey) {
        throw new Error(
          "App access requires an active service key. " +
          "Go to Identity & Keys → create a service key before issuing login links.",
        );
      }
      // Requires org Bearer; dual-control session when configured
      const needsDc = state.dualControl.configured && !!tokens.dualControl;
      const res = await api.post<{ login_url?: string; url?: string; login_link?: string; token?: string; message?: string }>(
        `/organizations/me/users/${userId}/login-link`,
        {},
        needsDc ? { dualControl: true } : undefined,
      );
      const url = res?.login_url ?? res?.url ?? res?.login_link ?? "";
      if (!url) throw new Error(res?.message || "Login link was not returned --- ensure you have an active operate session.");
      const user = state.users.find((u) => u.id === userId);
      persist((s) => ({
        ...s,
        loginLinks: [{ id: s.nextId, user_id: userId, user_name: user?.full_name ?? "", created_at: new Date().toISOString(), used_at: null, status: "active" }, ...s.loginLinks],
        nextId: s.nextId + 1,
      }));
      return url;
    },
    [persist, state.users, state.org.slug, state.dualControl.configured],
  );

  const clearDevice = useCallback(
    async (userId: number) => {
      if (DEMO_MODE) {
        await delay(400);
        const user = state.users.find((u) => u.id === userId);
        logAudit("org_user.clear_device", "people", `Cleared device bind for ${user?.full_name ?? userId}`);
        return;
      }
      await api.delete(`/organizations/me/users/${userId}/device`, { dualControl: true });
      const user = state.users.find((u) => u.id === userId);
      logAudit("org_user.clear_device", "people", `Cleared device bind for ${user?.full_name ?? userId}`);
    },
    [logAudit, state.users],
  );

  const deleteOrgUser = useCallback(
    async (id: number) => {
      if (DEMO_MODE) {
        await delay(400);
        const user = state.users.find((u) => u.id === id);
        persist((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
        logAudit("org_user.delete", "people", `Removed org user: ${user?.full_name ?? id}`);
        return { pending: false };
      }
      // Per platform API: DELETE /org-users/{id} is a soft deactivation, and it
      // parks for authorizer approval when dual-control is configured.
      const res = await api.delete<Record<string, unknown>>(`/org-users/${id}`, { dualControl: true });
      if (isPendingApproval(res)) return { pending: true };
      const user = state.users.find((u) => u.id === id);
      persist((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
      logAudit("org_user.delete", "people", `Removed org user: ${user?.full_name ?? id}`);
      return { pending: false };
    },
    [persist, logAudit, state.users],
  );

  // ── Connections ──────────────────────────────────────────────────────────
  const refreshConnections = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      const [connsRes, primaryRes] = await Promise.all([
        api.get<unknown>("/db-connections"),
        api.get<unknown>("/db-connections/primary-security-storage").catch(() => null),
      ]);
      const connections = mapConnectionsFromApi(connsRes);
      if (!connections.length && primaryRes) {
        const p = mapConnectionFromApi(primaryRes);
        if (p) connections.push(p);
      }
      persist((s) => ({ ...s, connections }));
    } catch { /* keep existing */ }
  }, [persist]);

  const refreshServiceKey = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      const keyRes = await api.get<unknown>("/organizations/me/service-key").catch(() =>
        api.get<unknown>("/organizations/me/service-keys").catch(() => null),
      );
      if (keyRes) {
        const keyObj = Array.isArray(keyRes) ? keyRes[0] : keyRes;
        if (keyObj && typeof keyObj === "object") {
          const k = keyObj as Record<string, unknown>;
          const svcKey: ServiceKeyMeta = {
            id: Number(k.id ?? 0),
            prefix: String(k.prefix ?? k.key_prefix ?? "pk_live_..."),
            active: k.active !== false,
            created_at: String(k.created_at ?? ""),
            last_used_at: (k.last_used_at as string) ?? null,
          };
          persist((s) => ({ ...s, serviceKey: svcKey }));
        }
      }
    } catch { /* keep existing */ }
  }, [persist]);

  const createConnection = useCallback(
    async (
      c: Omit<DbConnection, "id" | "bootstrap_status" | "schema_version" | "last_test_at" | "last_test_ok" | "created_at"> & {
        username?: string;
        password?: string;
        ssl_mode?: string;
        environment?: string;
      },
    ) => {
      if (DEMO_MODE) {
        await delay(600);
        persist((s) => ({
          ...s,
          connections: [
            ...s.connections.map((x) => (c.is_primary ? { ...x, is_primary: false } : x)),
            {
              name: c.name,
              connection_purpose: c.connection_purpose,
              db_type: c.db_type,
              host: c.host,
              port: c.port,
              database_name: c.database_name,
              target_schema: c.target_schema,
              is_primary: c.is_primary,
              id: s.nextId,
              bootstrap_status: "not_bootstrapped",
              schema_version: null,
              last_test_at: null,
              last_test_ok: false,
              created_at: new Date().toISOString(),
            },
          ],
          nextId: s.nextId + 1,
        }));
        logAudit("db_connection.create", "connections", `Created connection: ${c.name}`);
        return;
      }
      const needsDc = !!tokens.dualControl;
      await api.post<unknown>(
        "/db-connections",
        {
          name: c.name,
          connection_purpose: c.connection_purpose,
          db_type: c.db_type,
          host: c.host,
          port: c.port,
          database_name: c.database_name,
          username: c.username || undefined,
          password: c.password || undefined,
          ssl_mode: c.ssl_mode || "prefer",
          target_schema: c.target_schema || "phantix",
          is_primary: c.is_primary,
          environment: c.environment || "production",
        },
        needsDc ? { dualControl: true } : undefined,
      );
      await refreshConnections();
      logAudit("db_connection.create", "connections", `Created connection: ${c.name}`);
    },
    [persist, logAudit, refreshConnections],
  );

  const testConnection = useCallback(
    async (id: number) => {
      if (DEMO_MODE) {
        await delay(1200);
        persist((s) => ({
          ...s,
          connections: s.connections.map((c) => (c.id === id ? { ...c, last_test_at: new Date().toISOString(), last_test_ok: true } : c)),
        }));
        return;
      }
      const needsDc = !!tokens.dualControl;
      // Per 01_ORG_SETUP_IMPLEMENTATION.md §7.1 / 02_PLATFORM §4: test?auto_bootstrap=true
      // probes connectivity AND applies the security schema in one call.
      const res = await api.post<Record<string, unknown>>(`/db-connections/${id}/test?auto_bootstrap=true`, undefined, needsDc ? { dualControl: true } : undefined);
      const row = mapConnectionFromApi(res);
      persist((s) => ({
        ...s,
        connections: s.connections.map((c) =>
          c.id === id
            ? row && row.bootstrap_status === "ready"
              ? { ...c, ...row, last_test_at: new Date().toISOString(), last_test_ok: true }
              : { ...c, last_test_at: new Date().toISOString(), last_test_ok: true }
            : c,
        ),
      }));
      await refreshConnections();
    },
    [persist, refreshConnections],
  );

  const bootstrapConnection = useCallback(
    async (id: number) => {
      if (DEMO_MODE) {
        await delay(1600);
        persist((s) => ({
          ...s,
          connections: s.connections.map((c) => (c.id === id ? { ...c, bootstrap_status: "ready" as const, schema_version: "1.4.2" } : c)),
        }));
        logAudit("db_connection.bootstrap", "connections", "Bootstrapped the security database");
        return { pending: false };
      }
      const needsDc = !!tokens.dualControl;
      const res = await api.post<Record<string, unknown>>(`/db-connections/${id}/bootstrap`, undefined, needsDc ? { dualControl: true } : undefined);
      // §2.2 parked: 2xx + pending:true → nothing ran; it is filed for an authorizer.
      if (isPendingApproval(res)) return { pending: true };
      const row = mapConnectionFromApi(res);
      persist((s) => ({
        ...s,
        connections: s.connections.map((c) =>
          c.id === id
            ? row
              ? { ...c, ...row, bootstrap_status: row.bootstrap_status === "not_bootstrapped" ? "ready" : row.bootstrap_status }
              : { ...c, bootstrap_status: "ready" as const, schema_version: c.schema_version || "1.4.2" }
            : c,
        ),
      }));
      await refreshConnections();
      logAudit("db_connection.bootstrap", "connections", "Bootstrapped security schema");
      return { pending: false };
    },
    [persist, logAudit, refreshConnections],
  );

  const deleteConnection = useCallback(
    async (id: number) => {
      if (DEMO_MODE) {
        await delay(350);
        persist((s) => ({ ...s, connections: s.connections.filter((c) => c.id !== id) }));
        logAudit("db_connection.delete", "connections", `Deleted connection #${id}`);
        return { pending: false };
      }
      const needsDc = !!tokens.dualControl;
      const res = await api.delete<Record<string, unknown>>(`/db-connections/${id}`, needsDc ? { dualControl: true } : undefined);
      if (isPendingApproval(res)) return { pending: true };
      persist((s) => ({ ...s, connections: s.connections.filter((c) => c.id !== id) }));
      logAudit("db_connection.delete", "connections", `Deleted connection #${id}`);
      return { pending: false };
    },
    [persist, logAudit],
  );

  // ── Companies & keys ─────────────────────────────────────────────────────
  const createCompany = useCallback(
    async (c: { name: string; industry: string; country: string }) => {
      if (DEMO_MODE) {
        await delay(500);
        persist((s) => ({
          ...s,
          companies: [...s.companies, { id: s.nextId, name: c.name, slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), industry: c.industry || null, country: c.country || null, key_prefix: null, created_at: new Date().toISOString() }],
          nextId: s.nextId + 1,
        }));
        logAudit("company.create", "tenancy", `Created child company: ${c.name}`);
        return;
      }
      const res = await api.post<Record<string, unknown>>(
        "/organizations/me/companies",
        { name: c.name, industry: c.industry || undefined, country: c.country || undefined },
        { dualControl: true },
      );
      persist((s) => ({
        ...s,
        companies: [...s.companies, {
          id: Number(res.id ?? s.nextId),
          name: String(res.name ?? c.name),
          slug: String(res.slug ?? c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
          industry: String(res.industry ?? c.industry ?? ""),
          country: String(res.country ?? c.country ?? ""),
          key_prefix: null,
          created_at: String(res.created_at ?? new Date().toISOString()),
        }],
      }));
      logAudit("company.create", "tenancy", `Created child company: ${c.name}`);
    },
    [persist, logAudit],
  );

  const deleteCompany = useCallback(
    async (id: number) => {
      if (DEMO_MODE) {
        await delay(400);
        const company = state.companies.find((c) => c.id === id);
        persist((s) => ({ ...s, companies: s.companies.filter((c) => c.id !== id) }));
        logAudit("company.delete", "tenancy", `Deleted child company: ${company?.name ?? id}`);
        return { pending: false };
      }
      const res = await api.delete<Record<string, unknown>>(`/organizations/me/companies/${id}`, { dualControl: true });
      if (isPendingApproval(res)) return { pending: true };
      const company = state.companies.find((c) => c.id === id);
      persist((s) => ({ ...s, companies: s.companies.filter((c) => c.id !== id) }));
      logAudit("company.delete", "tenancy", `Deleted child company: ${company?.name ?? id}`);
      return { pending: false };
    },
    [persist, logAudit, state.companies],
  );

  const deleteAccount = useCallback(
    async () => {
      if (DEMO_MODE) {
        await delay(600);
        logAudit("org.erasure_request", "privacy", "Filed organization erasure request");
        return { pending: true };
      }
      // The backend exposes no immediate org-delete route: whole-account removal
      // is a formal data-subject erasure request (NDPA §34–37) that staff fulfil.
      // File it and keep the operator signed in — nothing is deleted yet.
      await api.post<Record<string, unknown>>(
        "/organizations/me/data-subject-request",
        {
          request_type: "erasure",
          details: "Account erasure requested from the platform Danger Zone.",
        },
        { dualControl: true },
      );
      logAudit("org.erasure_request", "privacy", "Filed organization erasure request");
      return { pending: true };
    },
    [logAudit],
  );

  const rotateServiceKey = useCallback(
    async (companyId?: number) => {
      if (DEMO_MODE) {
        await delay(600);
        const secret = `pk_live_${crypto.randomUUID().replace(/-/g, "")}`;
        if (companyId) {
          persist((s) => ({ ...s, companies: s.companies.map((c) => (c.id === companyId ? { ...c, key_prefix: `${secret.slice(0, 12)}...` } : c)) }));
        } else {
          persist((s) => ({
            ...s,
            serviceKey: { id: s.nextId, prefix: `${secret.slice(0, 12)}...`, active: true, created_at: new Date().toISOString(), last_used_at: null },
            nextId: s.nextId + 1,
          }));
        }
        logAudit("service_key.rotate", "tenancy", "Rotated service key");
        return secret;
      }
      // Per TWO_PLATFORM_AUTH.md: POST /organizations/me/service-key creates-or-rotates
      // for the org; a child company's key lives at /organizations/companies/{id}/service-key.
      const path = companyId ? `/organizations/companies/${companyId}/service-key` : "/organizations/me/service-key";
      const keyName = companyId
        ? state.companies.find((c) => c.id === companyId)?.name ?? state.org.name
        : state.org.name;
      const res = await api.post<{ api_key?: string; key_prefix?: string; secret?: string; key?: string; service_key?: string; prefix?: string }>(
        path,
        { name: keyName, scopes: ["assets:read", "scans:read", "scans:write", "reports:generate", "risk:read", "vapt:read", "compliance:read", "audit:read", "alerts:read", "ai:read", "users:read", "connections:read", "billing:read"], grace_hours: 168 },
        { dualControl: true },
      );
      const secret = res?.api_key ?? res?.secret ?? res?.key ?? res?.service_key ?? "";
      if (!secret) throw new Error("Service key was not returned by the backend");
      const prefix = res?.key_prefix ?? (secret.includes("_") ? `${secret.slice(0, secret.indexOf("_") + 13)}...` : `${secret.slice(0, 12)}...`);
      if (companyId) {
        persist((s) => ({ ...s, companies: s.companies.map((c) => (c.id === companyId ? { ...c, key_prefix: prefix } : c)) }));
      } else {
        persist((s) => ({
          ...s,
          serviceKey: { id: s.serviceKey?.id ?? s.nextId, prefix, active: true, created_at: new Date().toISOString(), last_used_at: null },
        }));
      }
      logAudit("service_key.rotate", "tenancy", "Rotated service key");
      return secret;
    },
    [persist, logAudit, state.org.name, state.companies],
  );

  const revokeServiceKey = useCallback(async () => {
    if (DEMO_MODE) {
      await delay(400);
      persist((s) => ({ ...s, serviceKey: null }));
      logAudit("service_key.revoke", "tenancy", "Revoked service key");
      return;
    }
    const keyId = state.serviceKey?.id;
    if (!keyId) throw new Error("No active service key to revoke");
    await api.delete(`/organizations/me/service-key/${keyId}`, { dualControl: true });
    persist((s) => ({ ...s, serviceKey: null }));
    logAudit("service_key.revoke", "tenancy", "Revoked service key");
  }, [persist, logAudit, state.serviceKey?.id]);

  const uploadLogo = useCallback(
    async (file: File) => {
      if (DEMO_MODE) {
        await delay(600);
        const url = URL.createObjectURL(file);
        persist((s) => ({ ...s, org: { ...s.org, logo_url: url } }));
        logAudit("org.logo.upload", "tenancy", "Uploaded company logo");
        return url;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.postMultipart<unknown>("/organizations/me/logo", fd, { dualControl: true });
      const mapped = mapOrgFromApi(res, state.org.email);
      const logoUrl = mapped.logo_url;
      persist((s) => ({ ...s, org: { ...s.org, ...mapped, logo_url: logoUrl } }));
      logAudit("org.logo.upload", "tenancy", "Uploaded company logo");
      return logoUrl;
    },
    [persist, logAudit, state.org.email],
  );

  const deleteLogo = useCallback(async () => {
    if (DEMO_MODE) {
      await delay(350);
      persist((s) => ({ ...s, org: { ...s.org, logo_url: null } }));
      logAudit("org.logo.delete", "tenancy", "Removed company logo");
      return;
    }
    const res = await api.delete<unknown>("/organizations/me/logo", { dualControl: true });
    if (res) {
      const mapped = mapOrgFromApi(res, state.org.email);
      persist((s) => ({ ...s, org: { ...s.org, ...mapped, logo_url: null } }));
    } else {
      persist((s) => ({ ...s, org: { ...s.org, logo_url: null } }));
    }
    logAudit("org.logo.delete", "tenancy", "Removed company logo");
  }, [persist, logAudit, state.org.email]);

  // ── Misc ─────────────────────────────────────────────────────────────────
  const toggleTool = useCallback(
    async (tool: ToolItem) => {
      if (DEMO_MODE) {
        await delay(350);
        persist((s) => ({ ...s, tools: s.tools.map((t) => (t.id === tool.id ? { ...t, subscribed: !t.subscribed } : t)) }));
        return;
      }
      if (!(await requireDualControl("Tool subscription changes require a dual-control operate session."))) return;
      const nextSubscribed = !tool.subscribed;
      // Optimistic update: flip the toggle immediately; roll back on failure.
      persist((s) => ({ ...s, tools: s.tools.map((t) => (t.id === tool.id ? { ...t, subscribed: nextSubscribed } : t)) }));
      const opts = { dualControl: true };
      const tier = tool.tier ?? (tool.pricing_model === "paid" ? "addon_subscription" : "free");
      try {
        if (nextSubscribed) {
          if (tool.eligible === false) {
            throw new Error(tool.eligibility_reason || "This tool is not available to your organization yet.");
          }
          if (tier === "addon_subscription" || tool.pricing_model === "paid") {
            // Paid add-on → activate via subscription (provisions immediately).
            await api.post("/tools/subscribe", { tool_key: tool.key, billing_cycle: "monthly" }, opts);
          } else {
            // Free / premium_included → auto-provision. Engagement tools → quote-only request.
            await api.post("/tools/request", { tool_key: tool.key }, opts);
          }
        }
        // Unsubscribe: no cancel endpoint exists; keep local toggle only.
      } catch (e) {
        // Roll back on failure
        persist((s) => ({ ...s, tools: s.tools.map((t) => (t.id === tool.id ? { ...t, subscribed: tool.subscribed } : t)) }));
        throw e instanceof Error ? e : new Error("Tool update failed");
      }
    },
    [persist, requireDualControl],
  );

  const createTicket = useCallback(
    async (subject: string, priority: string, body: string) => {
      if (DEMO_MODE) {
        await delay(500);
        persist((s) => ({
          ...s,
          tickets: [{ id: s.nextId, subject, priority, status: "open" as const, created_at: new Date().toISOString(), messages: [{ from: "You", body, at: new Date().toISOString() }] }, ...s.tickets],
          nextId: s.nextId + 1,
        }));
        return;
      }
      const res = await api.post<Record<string, unknown>>("/support/tickets", { subject, priority, body }, { dualControl: true });
      persist((s) => ({
        ...s,
        tickets: [{ id: Number(res.id ?? s.nextId), subject, priority, status: "open" as const, created_at: String(res.created_at ?? new Date().toISOString()), messages: [{ from: "You", body, at: new Date().toISOString() }] }, ...s.tickets],
      }));
    },
    [persist],
  );

  const decidePending = useCallback(
    async (id: number, approve: boolean) => {
      if (DEMO_MODE) {
        await delay(450);
        persist((s) => ({ ...s, pending: s.pending.map((p) => (p.id === id ? { ...p, status: approve ? "authorized" as const : "rejected" as const } : p)) }));
        return;
      }
      const path = approve ? `/audit/pending/${id}/authorize` : `/audit/pending/${id}/reject`;
      await api.post(path, undefined, { dualControl: true });
      persist((s) => ({ ...s, pending: s.pending.map((p) => (p.id === id ? { ...p, status: approve ? "authorized" as const : "rejected" as const } : p)) }));
    },
    [persist],
  );

  const refreshPending = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      const pendingRes = await api.get<unknown>("/audit/pending");
      const items = Array.isArray(pendingRes)
        ? (pendingRes as unknown as PendingAction[])
        : (((pendingRes as { items?: unknown[] })?.items ?? []) as PendingAction[]);
      persist((s) => ({ ...s, pending: items }));
    } catch { /* keep current list */ }
  }, [persist]);

  const refreshAudit = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      const auditRes = await api.get<unknown>("/audit/events?limit=200");
      const items = Array.isArray(auditRes)
        ? (auditRes as unknown as AuditEvent[])
        : (((auditRes as { items?: unknown[] })?.items ?? []) as AuditEvent[]);
      if (items.length > 0) persist((s) => ({ ...s, audit: items }));
    } catch { /* keep current list */ }
  }, [persist]);

  const sendTestAlert = useCallback(async () => {
    if (DEMO_MODE) {
      await delay(400);
      return;
    }
    // Per app-pages/alerts.md: test with severity critical → hits email + WA + Telegram
    // when enabled and live; medium → email only.
    await api.post("/alerts/test", {
      severity: "critical",
      title: "[TEST] SecureGraph Critical Alert",
      body: "This is a test critical alert. If you received this, your email, WhatsApp, and Telegram channels are configured correctly."
    }, { dualControl: true });
  }, []);

  const updateAlertSettings = useCallback(async (settings: Partial<AlertSettings>) => {
    if (DEMO_MODE) {
      await delay(400);
      persist((s) => ({ ...s, alertSettings: { ...s.alertSettings, ...settings } }));
      return;
    }
    const needsDc = !!tokens.dualControl;
    await api.put("/alerts/settings", settings, needsDc ? { dualControl: true } : undefined);
    persist((s) => ({ ...s, alertSettings: { ...s.alertSettings, ...settings } }));
  }, [persist]);

  const exportAuditCsv = useCallback(async () => {
    if (DEMO_MODE) return;
    const blob = await api.download("/audit/export?format=csv");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phantix-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const resetDemo = useCallback(() => {
    if (!DEMO_MODE) return;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("dev_otp");
    setState(demoState());
  }, []);

  // Live: rehydrate org/setup from API when a company JWT already exists
  React.useEffect(() => {
    if (!DEMO_MODE && tokens.platform) {
      void hydrateSession(session?.email || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const securityDbReady = isSecurityDbReady(state.connections);

  const value = useMemo<Store>(
    () => ({
      session, state, operate, securityDbReady, sessionLoading, sessionExpired, clearSessionExpired, expireSession, billingEntitlements,
      register, login, changePassword, verifyMfa, resendLoginOtp, resendRegisterOtp, logout, hydrateSession, refreshSession,
      acceptPrivacy, saveIdentity, updateOrgProfile, sendOtp, verifyOtp, startDomainVerification, checkDomain, submitCac, skipCac, requestManualReview, completeSetup, refreshSetup,
      createUser, assignDualControl, unlockOperate, lockOperate,
      requireDualControl, dualControlPrompt, closeDualControlPrompt,
      requestDualControlOtp, verifyDualControlOtp, confirmDualControlDevice,
      issueLoginLink, clearDevice, deleteOrgUser,
      refreshConnections, refreshServiceKey, createConnection, testConnection, bootstrapConnection, deleteConnection,
      createCompany, deleteCompany, deleteAccount, rotateServiceKey, revokeServiceKey, savePreferredServices, uploadLogo, deleteLogo,
      toggleTool, createTicket, decidePending, refreshPending, refreshAudit, sendTestAlert, updateAlertSettings, exportAuditCsv, resetDemo,
      toasts, toast, dismissToast,
    }),
    [session, state, operate, securityDbReady, sessionExpired, clearSessionExpired, expireSession, toasts, dualControlPrompt,
      register, login, changePassword, verifyMfa, resendLoginOtp, resendRegisterOtp, logout, hydrateSession, refreshSession, acceptPrivacy, saveIdentity, updateOrgProfile, sendOtp, verifyOtp,
      startDomainVerification, checkDomain, submitCac, skipCac, requestManualReview, completeSetup, refreshSetup,
      createUser, assignDualControl, unlockOperate, lockOperate,
      requireDualControl, closeDualControlPrompt, requestDualControlOtp, verifyDualControlOtp, confirmDualControlDevice,
      issueLoginLink, clearDevice, deleteOrgUser,
      refreshConnections, refreshServiceKey, createConnection, testConnection, bootstrapConnection, deleteConnection,
      createCompany, deleteCompany, deleteAccount, rotateServiceKey, revokeServiceKey, savePreferredServices, uploadLogo, deleteLogo,
      toggleTool, createTicket, decidePending, refreshPending, refreshAudit, sendTestAlert, updateAlertSettings, exportAuditCsv, resetDemo,
      toast, dismissToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within StoreProvider");
  return s;
}

// ── Toast viewport ────────────────────────────────────────────────────────────
const icons: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="text-emerald-400" size={18} />,
  error: <XCircle className="text-severity-critical" size={18} />,
  warning: <AlertTriangle className="text-severity-medium" size={18} />,
  info: <Info className="text-severity-low" size={18} />,
};

export function ToastViewport() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex w-[360px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass-bright rounded-md p-3.5 shadow-card flex items-start gap-3"
          >
            <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-slate-400 leading-5">{t.body}</p>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 rounded-md p-1 text-slate-500 hover:text-slate-200 hover:bg-phantix-700/50">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
