import type { DbConnection, OrgContact, Organization } from "./types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "true") return true;
  if (v === 0 || v === "false") return false;
  return fallback;
}

function strArr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => String(x)).filter(Boolean);
}

function mapContact(raw: unknown): OrgContact | null {
  const r = asRecord(raw);
  if (!r) return null;
  return {
    title: str(r.title),
    name: str(r.name),
    email: str(r.email),
    phone: str(r.phone),
    whatsapp_username: str(r.whatsapp_username),
    telegram_username: str(r.telegram_username),
  };
}

export function emptyOrg(): Organization {
  return {
    id: 0,
    name: "",
    slug: "",
    creator_user_id: null,
    legal_name: null,
    registration_number: null,
    tax_id: null,
    company_type: null,
    year_founded: null,
    industry: "",
    sub_industry: null,
    employee_count_range: null,
    annual_revenue_range: null,
    website: null,
    phone: null,
    description: null,
    logo_url: null,
    email: "",
    secondary_email: null,
    country: "NG",
    address_line1: null,
    address_line2: null,
    city: null,
    state_province: null,
    postal_code: null,
    timezone: null,
    notes: null,
    primary_contact: null,
    secondary_contact: null,
    security_mailbox: null,
    has_dedicated_security_team: false,
    has_ciso: false,
    security_team_size: null,
    security_maturity: null,
    compliance_frameworks: null,
    data_types_handled: null,
    infrastructure_types: null,
    cloud_providers: null,
    preferred_services: null,
    critical_assets_summary: null,
    previous_breach: false,
    previous_breach_notes: null,
    setup_completed: false,
    email_verified: false,
    identity_verified: false,
    company_verified: false,
    domain_verified: false,
    privacy_notice_accepted: false,
    cac_rc_number: null,
    cac_details_provided: false,
    cac_skipped: false,
    manual_review_status: "none",
    is_active: true,
    plan: "",
    created_at: "",
    updated_at: null,
  };
}

/** Map GET /organizations/me (or partial) into Organization. */
// ── Controlled vocabulary: company_type (mirrors backend CompanyType enum) ────
// PUT /organizations/me validates company_type against this exact enum
// (schemas/organization.py::CompanyType). The platform must only ever send
// one of these values — or null.
export const COMPANY_TYPES = [
  "private_limited",
  "public_limited",
  "llc",
  "partnership",
  "sole_proprietorship",
  "ngo",
  "government",
  "startup",
  "other",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  private_limited: "Private limited company (LTD)",
  public_limited: "Public limited company (PLC)",
  llc: "Limited liability company (LLC)",
  partnership: "Partnership",
  sole_proprietorship: "Sole proprietorship",
  ngo: "NGO or nonprofit",
  government: "Government or public sector",
  startup: "Startup",
  other: "Other",
};

/** Legacy / free-text variants → the canonical backend enum; unknown → null. */
export function normalizeCompanyType(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!v) return null;
  if ((COMPANY_TYPES as readonly string[]).includes(v)) return v;
  const legacy: Record<string, CompanyType> = {
    sole_proprietor: "sole_proprietorship",
    sole_trader: "sole_proprietorship",
    individual: "sole_proprietorship",
    nonprofit: "ngo",
    non_profit: "ngo",
    charity: "ngo",
    foundation: "ngo",
    ltd: "private_limited",
    limited: "private_limited",
    private_ltd: "private_limited",
    private_company_limited_by_shares: "private_limited",
    plc: "public_limited",
    public_ltd: "public_limited",
    limited_liability_company: "llc",
    gov: "government",
    public_sector: "government",
    parastatal: "government",
    technology_startup: "startup",
  };
  return legacy[v] ?? null;
}

/** Map GET /organizations/me (or partial) into Organization. */
export function mapOrgFromApi(raw: unknown, emailFallback = ""): Organization {
  const r = asRecord(raw) || {};
  const base = emptyOrg();
  const email = str(r.email) || emailFallback || "";
  const phone = str(r.phone) || str(r.company_phone);
  return {
    ...base,
    id: num(r.id) ?? 0,
    name: str(r.name) || str(r.company_name) || "",
    slug: str(r.slug) || "",
    creator_user_id: num(r.creator_user_id),
    legal_name: str(r.legal_name),
    registration_number: str(r.registration_number),
    tax_id: str(r.tax_id),
    company_type: normalizeCompanyType(r.company_type),
    year_founded: num(r.year_founded),
    industry: str(r.industry) || "",
    sub_industry: str(r.sub_industry),
    employee_count_range: str(r.employee_count_range),
    annual_revenue_range: str(r.annual_revenue_range),
    website: str(r.website),
    phone,
    description: str(r.description),
    logo_url: str(r.logo_url),
    email,
    secondary_email: str(r.secondary_email),
    country: str(r.country) || "NG",
    address_line1: str(r.address_line1),
    address_line2: str(r.address_line2),
    city: str(r.city),
    state_province: str(r.state_province),
    postal_code: str(r.postal_code),
    timezone: str(r.timezone),
    notes: str(r.notes),
    primary_contact: mapContact(r.primary_contact),
    secondary_contact: mapContact(r.secondary_contact),
    security_mailbox: str(r.security_mailbox),
    has_dedicated_security_team: bool(r.has_dedicated_security_team),
    has_ciso: bool(r.has_ciso),
    security_team_size: str(r.security_team_size),
    security_maturity: str(r.security_maturity),
    compliance_frameworks: strArr(r.compliance_frameworks),
    data_types_handled: strArr(r.data_types_handled),
    infrastructure_types: strArr(r.infrastructure_types),
    cloud_providers: strArr(r.cloud_providers),
    preferred_services: strArr(r.preferred_services),
    critical_assets_summary: str(r.critical_assets_summary),
    previous_breach: bool(r.previous_breach),
    previous_breach_notes: str(r.previous_breach_notes),
    setup_completed: bool(r.setup_completed ?? r.setup_complete),
    email_verified: bool(r.email_verified),
    identity_verified: bool(r.identity_verified),
    company_verified: bool(r.company_verified),
    domain_verified: bool(r.domain_verified),
    privacy_notice_accepted: bool(r.privacy_notice_accepted),
    cac_rc_number: str(r.cac_rc_number),
    cac_details_provided: bool(r.cac_details_provided),
    cac_skipped: bool(r.cac_skipped),
    manual_review_status: str(r.manual_review_status) || "none",
    is_active: bool(r.is_active, true),
    plan: str(r.plan) || str(r.plan_name) || "",
    created_at: str(r.created_at) || "",
    updated_at: str(r.updated_at),
    company_phone: phone,
    primary_email: email,
  };
}

export function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const r = asRecord(raw);
  if (!r) return [];
  for (const k of ["items", "data", "results", "rows", "connections", "users", "companies"]) {
    if (Array.isArray(r[k])) return r[k] as T[];
  }
  return [];
}

function mapBootstrap(raw: unknown): DbConnection["bootstrap_status"] {
  const s = String(raw ?? "").toLowerCase();
  if (["ready", "bootstrapped", "complete", "completed", "ok", "success"].includes(s)) return "ready";
  if (["pending", "running", "in_progress", "bootstrapping"].includes(s)) return "pending";
  if (["failed", "error"].includes(s)) return "failed";
  return "not_bootstrapped";
}

export function mapConnectionFromApi(raw: unknown): DbConnection | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = num(r.id);
  if (id == null) return null;
  const purpose = String(r.connection_purpose ?? "security_data_storage");
  return {
    id,
    name: str(r.name) || `Connection #${id}`,
    connection_purpose: purpose === "config_inspection" ? "config_inspection" : "security_data_storage",
    db_type: str(r.db_type) || "postgresql",
    host: str(r.host) || "",
    port: num(r.port) ?? 5432,
    database_name: str(r.database_name) || str(r.database) || "",
    target_schema: str(r.target_schema) || "phantix",
    is_primary: bool(r.is_primary, purpose !== "config_inspection"),
    bootstrap_status: mapBootstrap(r.bootstrap_status ?? r.status ?? r.schema_status),
    schema_version: str(r.schema_version),
    last_test_at: str(r.last_test_at),
    last_test_ok: bool(r.last_test_ok ?? r.last_test_passed),
    created_at: str(r.created_at) || new Date().toISOString(),
  };
}

export function mapConnectionsFromApi(raw: unknown): DbConnection[] {
  return asList<unknown>(raw)
    .map(mapConnectionFromApi)
    .filter((c): c is DbConnection => !!c);
}

/** True when a security_data_storage connection is bootstrapped ready. */
export function isSecurityDbReady(connections: DbConnection[], primary?: unknown): boolean {
  if (connections.some((c) => c.connection_purpose === "security_data_storage" && c.bootstrap_status === "ready")) {
    return true;
  }
  // GET /db-connections/primary-security-storage may return the primary row
  const p = mapConnectionFromApi(primary);
  if (p && p.bootstrap_status === "ready") return true;
  const pr = asRecord(primary);
  if (pr) {
    const status = mapBootstrap(pr.bootstrap_status ?? pr.status);
    if (status === "ready") return true;
    if (bool(pr.ready) || bool(pr.is_ready) || bool(pr.bootstrapped)) return true;
  }
  return false;
}

/** Body for PUT /organizations/me --- only editable profile fields. */
export function orgToUpdateBody(org: Partial<Organization>): Record<string, unknown> {
  const contact = (c: OrgContact | null | undefined) =>
    c
      ? {
          title: c.title || undefined,
          name: c.name || undefined,
          email: c.email || undefined,
          phone: c.phone || undefined,
          whatsapp_username: c.whatsapp_username || undefined,
          telegram_username: c.telegram_username || undefined,
        }
      : undefined;

  return {
    name: org.name,
    legal_name: org.legal_name,
    registration_number: org.registration_number,
    tax_id: org.tax_id,
    company_type: normalizeCompanyType(org.company_type),
    year_founded: org.year_founded,
    industry: org.industry,
    sub_industry: org.sub_industry,
    employee_count_range: org.employee_count_range,
    annual_revenue_range: org.annual_revenue_range,
    website: org.website,
    phone: org.phone,
    description: org.description,
    secondary_email: org.secondary_email,
    country: org.country,
    address_line1: org.address_line1,
    address_line2: org.address_line2,
    city: org.city,
    state_province: org.state_province,
    postal_code: org.postal_code,
    timezone: org.timezone,
    notes: org.notes,
    primary_contact: contact(org.primary_contact),
    secondary_contact: contact(org.secondary_contact),
    security_mailbox: org.security_mailbox,
    has_dedicated_security_team: org.has_dedicated_security_team,
    has_ciso: org.has_ciso,
    security_team_size: org.security_team_size,
    security_maturity: org.security_maturity,
    compliance_frameworks: org.compliance_frameworks,
    data_types_handled: org.data_types_handled,
    infrastructure_types: org.infrastructure_types,
    cloud_providers: org.cloud_providers,
    preferred_services: org.preferred_services?.filter((s) =>
      [
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
      ].includes(s),
    ),
    critical_assets_summary: org.critical_assets_summary,
    previous_breach: org.previous_breach,
    previous_breach_notes: org.previous_breach_notes,
  };
}
