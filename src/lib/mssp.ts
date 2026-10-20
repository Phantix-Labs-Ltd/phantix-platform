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
