import { useCallback } from "react";
import { useStore } from "@/lib/store";

/**
 * Database connections need audit control when dual control is on: an assigned
 * initiator and authorizer, and an unlocked operate session. Resolves true when
 * the caller may go ahead (solo mode always may).
 */
export function useConnectionGuard(): () => Promise<boolean> {
  const { state, operate, toast, requireDualControl } = useStore();
  return useCallback(async () => {
    if (state.dualControl.policy_mode === "off") return true;
    if (!state.dualControl.configured) {
      toast("warning", "Audit control required", "Set up audit control on the People page before you manage database connections.");
      return false;
    }
    if (operate.unlocked) return true;
    return requireDualControl("Manage security database connections requires a dual-control operate session.");
  }, [state.dualControl.policy_mode, state.dualControl.configured, operate.unlocked, toast, requireDualControl]);
}
