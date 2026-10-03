// ── Platform surface types (platform.phantixlabs.com) ───────────────────────────

export interface OrgContact {
  title: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_username: string | null;
  telegram_username: string | null;
}

/** Full company profile --- mirrors GET/PUT /organizations/me */
export interface Organization {
  id: number;
  name: string;
  slug: string;
  creator_user_id: number | null;
  legal_name: string | null;
  registration_number: string | null;
  tax_id: string | null;
  company_type: string | null;
  year_founded: number | null;
  industry: string;
  sub_industry: string | null;
  employee_count_range: string | null;
  annual_revenue_range: string | null;
  website: string | null;
  phone: string | null;
  description: string | null;
  logo_url: string | null;
  email: string;
  secondary_email: string | null;
  country: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  timezone: string | null;
  notes: string | null;
  primary_contact: OrgContact | null;
  secondary_contact: OrgContact | null;
  security_mailbox: string | null;
  has_dedicated_security_team: boolean;
  has_ciso: boolean;
  security_team_size: string | null;
  security_maturity: string | null;
  compliance_frameworks: string[] | null;
  data_types_handled: string[] | null;
  infrastructure_types: string[] | null;
  cloud_providers: string[] | null;
  preferred_services: string[] | null;
  critical_assets_summary: string | null;
  previous_breach: boolean;
  previous_breach_notes: string | null;
  setup_completed: boolean;
  email_verified: boolean;
  identity_verified: boolean;
  company_verified: boolean;
  domain_verified: boolean;
  privacy_notice_accepted: boolean;
  cac_rc_number: string | null;
  cac_details_provided: boolean;
  cac_skipped: boolean;
  manual_review_status: string;
  is_active: boolean;
  plan: string;
  created_at: string;
  updated_at: string | null;
  /** @deprecated use phone */
  company_phone?: string | null;
  /** @deprecated use email */
  primary_email?: string;
}

export interface OrgUser {
  id: number;
  full_name: string;
  email: string;
  title: string;
  role: string;
  otp_only: boolean;
  is_active: boolean;
  last_login_at: string | null;
  /** Per-application role override: { application: role_key }. */
  application_roles?: Record<string, string>;
}

export interface ChildCompany {
  id: number;
  name: string;
  slug: string;
  industry: string | null;
  country: string | null;
  key_prefix: string | null;
  created_at: string;
}

export interface ServiceKeyMeta {
  id: number;
  prefix: string;
  active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface LoginLink {
  id: number;
  user_id: number;
  user_name: string;
  created_at: string;
  used_at: string | null;
  status: "active" | "used" | "expired";
}

export interface DbConnection {
  id: number;
  name: string;
  connection_purpose: "security_data_storage" | "config_inspection";
  db_type: string;
  host: string;
  port: number;
  database_name: string;
  target_schema: string;
  is_primary: boolean;
  bootstrap_status: "ready" | "pending" | "failed" | "not_bootstrapped";
  schema_version: string | null;
  last_test_at: string | null;
  last_test_ok: boolean;
  created_at: string;
}

export interface AuditEvent {
  id: number;
  event_key: string;
  category: string;
  action: string;
  initiator_name: string | null;
  initiator_title: string | null;
  authorizer_name: string | null;
  authorizer_title: string | null;
  created_at: string;
}

export interface PendingAction {
  id: number;
  action_key: string;
  action_label: string;
  category: string;
  initiated_by: string;
  status: "pending" | "authorized" | "rejected";
  created_at: string;
}

export interface ToolItem {
  id: number;
  key: string;
  name: string;
  category: string;
  description: string;
  subscribed: boolean;
  price_note: string;
  tier?: string;
  pricing_model?: string;
  eligible?: boolean;
  eligibility_reason?: string | null;
  monthly_price_ngn?: number;
  yearly_price_ngn?: number;
}

export interface Payment {
  id: number;
  reference: string;
  amount_ngn: number;
  status: "paid" | "pending" | "failed";
  period: string;
  created_at: string;
}

export interface SupportTicket {
  id: number;
  subject: string;
  status: "open" | "pending" | "closed" | "resolved" | string;
  priority: string;
  created_at: string;
  messages: { from: string; body: string; at: string }[];
}

export interface SetupState {
  privacy_accepted: boolean;
  privacy_accepted_at: string | null;
  privacy_notice_version: string | null;
  identity_saved: boolean;
  email_otp_sent: boolean;
  email_otp_destination: string | null;
  identity_verified: boolean;
  email_verified: boolean;
  company_verified: boolean;
  domain: string | null;
  domain_token: string | null;
  domain_dns_ok: boolean;
  domain_http_ok: boolean;
  /** Copyable instructions from domain/start (DNS TXT + HTTP). */
  domain_instructions: Record<string, unknown> | null;
  cac_submitted: boolean;
  cac_skipped: boolean;
  manual_review: "none" | "pending" | "approved" | "rejected";
  setup_complete: boolean;
  /** Server: privacy + email OTP done, not yet completed. */
  can_complete_setup: boolean;
  next_step: string | null;
  progress_percent: number;
  steps: { id: string; title: string; required: boolean; completed: boolean; description: string }[];
}

export interface DualControlAssignment {
  configured: boolean;
  require_dual_control: boolean;
  /** Org policy: "off" is solo mode (no approver). null = backend predates it, behaves like "on". */
  policy_mode?: "off" | "on" | "enforced" | null;
  initiator_user_id: number | null;
  authorizer_user_id: number | null;
  email_policy: DualControlEmailPolicy | null;
}

export interface DualControlEmailPolicy {
  allowed_domains: string[];
  registration_emails_exempt: string[];
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface AlertEvent {
  id: number;
  event_type: string;
  severity: Severity;
  title: string;
  status: "pending" | "delivered" | "failed";
  channels: string[];
  created_at: string;
}

export interface AlertSettings {
  alerts_enabled: boolean;
  smtp: { enabled: boolean; host: string; port: number; from_email: string; from_name: string; use_tls: boolean };
  email_recipients: string[];
  whatsapp: { enabled: boolean; provider: string; recipients: string[] };
  telegram: { enabled: boolean; provider: string; recipients: string[] };
  notify: Record<string, boolean>;
}
