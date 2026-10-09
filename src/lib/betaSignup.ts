/**
 * Registration phase (backend: GET /organizations/register/beta, public).
 *
 *   beta    — registering means joining the sandbox: the opt-in is required.
 *   closed  — the beta is full; nobody can register until it is reopened.
 *   general — open to everyone, no opt-in.
 *
 * The backend enforces the phase on every sign-up; this only shapes the form.
 */
import { useCallback, useEffect, useState } from "react";
import { api, DEMO_MODE } from "./api";

export type SignupPhase = "beta" | "closed" | "general";
export interface SignupStatus { phase: SignupPhase; target: number; completed: number; remaining: number }

export async function loadSignupStatus(): Promise<SignupStatus | null> {
  if (DEMO_MODE) return null;
  try {
    const res = await api.get<Partial<SignupStatus>>("/organizations/register/beta");
    const phase = res?.phase;
    if (phase !== "beta" && phase !== "closed" && phase !== "general") return null;
    return { phase, target: Number(res.target ?? 0), completed: Number(res.completed ?? 0), remaining: Number(res.remaining ?? 0) };
  } catch {
    // Older backend or a blip: show the normal form; the backend still decides.
    return null;
  }
}

/** The phase for a sign-up form; `null` while loading or when unknown. */
export function useSignupStatus() {
  const [status, setStatus] = useState<SignupStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    void loadSignupStatus().then((s) => { setStatus(s); setLoaded(true); });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { status, loaded, reload };
}
