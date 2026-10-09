/**
 * Dual-control policy (backend: /organizations/me/dual-control-policy).
 *
 *   off      — solo mode: one person acts, sensitive actions ask for a code.
 *   on       — a second person (the authorizer) approves sensitive actions.
 *   enforced — on, and the plan does not allow turning it off.
 *
 * Turning it on needs the initiator and authorizer roles assigned
 * (dual_control_slots_missing otherwise). Turning it off needs the
 * authorizer's approval, so it may come back as a pending change.
 */
import { api, DEMO_MODE, delay } from "./api";

export type PolicyMode = "off" | "on" | "enforced";
export type DualControlPolicy = { mode: PolicyMode; can_disable: boolean; pending_change: { mode?: PolicyMode; requested_at?: string } | null };

/** The current policy; null on a backend without it. */
export async function loadDualControlPolicy(demoMode: PolicyMode = "off"): Promise<DualControlPolicy | null> {
  if (DEMO_MODE) return { mode: demoMode, can_disable: true, pending_change: null };
  try {
    return await api.get<DualControlPolicy>("/organizations/me/dual-control-policy");
  } catch {
    return null;
  }
}

export async function setDualControlPolicy(mode: PolicyMode): Promise<DualControlPolicy> {
  if (DEMO_MODE) { await delay(400); return { mode, can_disable: true, pending_change: null }; }
  return api.put<DualControlPolicy>("/organizations/me/dual-control-policy", { mode });
}
