// First-run order after the Quick Scan:
//   People and audit control (dual control on only) → service key → security database.
// The security database page refuses changes until audit control is set when dual
// control is on (solo mode has no audit controller to assign), and the
// applications need the org's service key, so the steps run in that order.

import type { useStore } from "./store";

type StoreState = ReturnType<typeof useStore>["state"];

export const SERVICE_KEY_STEP = "/get-started/service-key";
export const AUDIT_CONTROL_STEP = "/users?onboarding=1";
// `from=quick-scan` makes the database page offer "Back to your Quick Scan" once
// connected, so the scan results can be saved.
export const SECURITY_DB_STEP = "/connections?from=quick-scan";

/** Dual control is on and nobody has been assigned as initiator/authorizer yet. */
export function needsAuditControl(state: StoreState): boolean {
  return state.dualControl.policy_mode !== "off" && !state.dualControl.configured;
}

/** Where the first run goes next once the Quick Scan is done. */
export function nextAfterQuickScan(state: StoreState): string {
  if (needsAuditControl(state)) return AUDIT_CONTROL_STEP;
  if (!state.serviceKey?.active) return SERVICE_KEY_STEP;
  return SECURITY_DB_STEP;
}

/** Button label for that next step. */
export function nextStepLabel(path: string): string {
  if (path === AUDIT_CONTROL_STEP) return "Set up audit control";
  if (path === SERVICE_KEY_STEP) return "Create service key";
  return "Connect a database";
}
