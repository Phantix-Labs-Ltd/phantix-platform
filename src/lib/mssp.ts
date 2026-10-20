// MSSP surfaces (portal): portfolio read model + per-client authorization.
//
// The portfolio endpoint reads a *summary store* — it never opens a client's
// database — so this page is cheap to load and safe to leave open. Authorization
// and scope is the legal record: signing an RoE, declaring blackouts and pressing
// the emergency stop are human acts, and every call here is audited server-side.
import { api } from "./api";

export type ScopeCode =
  | "authorization_required"
  | "outside_testing_window"
  | "blackout_window"
  | "target_not_authorized"
  | "scope_targets_unresolved"
  | "testing_stopped";

export interface MsspPortfolioRow {
  organization_id: number;
  name: string | null;
  state: "ready" | "unreachable" | "no_data_plane" | "unknown";
  error: string | null;
  posture_score: number | null;
  open_criticals: number;
  open_high: number;
  open_total: number;
  last_scan_at: string | null;
  data_plane: string | null;
  data_plane_status: string | null;
  connector_state: "direct" | "connector" | null;
  refreshed_at: string | null;
  source: string | null;
  stale: boolean;
}

export interface MsspPortfolio {
  clients: MsspPortfolioRow[];
  counts: { total: number; reporting: number; stale: number; failing: number };
  cap: { max_clients: number | null; clients_used: number };
  read_model: string;
}

export interface ScopeAuthorization {
  id: number;
  reference: string;
  version: number;
  status: "draft" | "active" | "superseded" | "revoked" | "expired";
  signer_name: string;
  signer_email: string;
  signed_at: string | null;
  document_sha256: string | null;
  window_start: string | null;
  window_end: string | null;
  targets: { id: number; value: string; target_type: string; status: string }[];
}

export interface ScopeStatus {
  enforcement_enabled: boolean;
  can_test: boolean;
  blocked_reason: string | null;
  blocked_code: ScopeCode | null;
  authorization: ScopeAuthorization | null;
  active_stop: {
    active: boolean;
    reason: string;
    started_by: string | null;
    started_at: string | null;
  } | null;
  next_blackout: {
    id: number;
    starts_at: string;
    ends_at: string;
    reason: string | null;
    applies_to: string;
  } | null;
  target_count: number;
}

/** A standard organization gets 403 `organization_feature_required` here. */
export function isFeatureError(e: unknown): boolean {
  const err = e as { status?: number; detail?: { error?: string } };
  return err?.status === 403 && err?.detail?.error === "organization_feature_required";
}

export const loadMsspPortfolio = () => api.get<MsspPortfolio>("/mssp/portfolio");

export const refreshMsspPortfolio = (limit = 50) =>
  api.post<{ requested: number; refreshed: number[]; failed: unknown[] }>(
    `/mssp/portfolio/refresh?limit=${limit}`,
  );

export const loadScopeStatus = () => api.get<ScopeStatus>("/vapt/scope/");

export const loadAuthorizations = () =>
  api.get<ScopeAuthorization[]>("/vapt/scope/authorizations");

export const emergencyStop = (reason: string, cancelRunning = true) =>
  api.post<{ active: boolean; cancelled_scan_jobs: number[]; cancelled_campaigns: number[] }>(
    "/vapt/scope/stop",
    { reason, cancel_running: cancelRunning },
  );

export const clearEmergencyStop = () => api.post<{ active: boolean }>("/vapt/scope/stop/clear");


// ── NDPA pack, testing SLAs, assignments, report schedule ──────────────────

export interface SubProcessor {
  name: string;
  purpose?: string;
  location?: string;
  url?: string | null;
}

export interface CompliancePack {
  organization_id: number;
  status: string;
  dpa_version: string | null;
  dpa_location: string | null;
  ropa_reference: string | null;
  sub_processors: SubProcessor[];
  retention_summary: string | null;
  breach_contact_email: string | null;
  breach_notice_hours: number;
  notes: string | null;
  dpa_signed_by: string | null;
  dpa_signed_at: string | null;
  prepared_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface SlaPolicy {
  retest_hours: number;
  verification_hours: number;
  remediation_confirmation_hours: number;
  coverage_days: number;
  report_delivery_hours: number;
  notes?: string | null;
}

export interface SlaStatus {
  policy: Record<string, number | null>;
  measured: {
    last_completed_test_at: string | null;
    coverage_due_at: string | null;
    coverage_met: boolean;
    open_criticals: number;
  };
  not_measured: Record<string, string>;
}

export interface Assignment {
  id: number;
  user_id: number;
  email: string | null;
  client_organization_id: number;
  client_name: string | null;
  active: boolean;
}

export interface ReportSchedule {
  enabled: boolean;
  cadence: "weekly" | "monthly" | "quarterly";
  weekday: number;
  day_of_month: number;
  recipients: string[];
  include_sla: boolean;
  sender_name: string | null;
  notes: string | null;
  last_sent_at: string | null;
  last_error: string | null;
}

export const loadCompliancePack = () => api.get<CompliancePack>("/organizations/compliance-pack");
export const saveCompliancePack = (body: Partial<CompliancePack>) =>
  api.put<CompliancePack>("/organizations/compliance-pack", body);
export const signDpa = (body: { dpa_version: string; signed_by: string; dpa_location?: string }) =>
  api.post<CompliancePack>("/organizations/compliance-pack/dpa/sign", body);

export const loadSlaPolicy = () => api.get<SlaPolicy>("/organizations/testing-sla");
export const saveSlaPolicy = (body: SlaPolicy) =>
  api.put<SlaPolicy>("/organizations/testing-sla", body);
export const loadSlaStatus = () =>
  api.get<SlaStatus>("/organizations/testing-sla/status");

export const loadAssignments = () => api.get<Assignment[]>("/mssp/assignments");
export const addAssignment = (body: { user_id: number; client_organization_id: number }) =>
  api.post<Assignment>("/mssp/assignments", body);
export const removeAssignment = (id: number) => api.delete<Assignment>(`/mssp/assignments/${id}`);

export const loadReportSchedule = () =>
  api.get<ReportSchedule>("/organizations/report-schedule");
export const saveReportSchedule = (body: ReportSchedule) =>
  api.put<ReportSchedule>("/organizations/report-schedule", body);
export const sendReportNow = () =>
  api.post<{ ok: boolean; error?: string; subject: string; recipients: string[] }>(
    "/organizations/report-schedule/send-now",
  );
