/**
 * Launch waitlist (backend: /funnel/waitlist, public).
 *
 * While registration is closed, a visitor leaves a work email and may ask for
 * a passive Quick Scan of its domain. The browser keeps a status token for the
 * entry; the scan's findings are never returned, only its progress.
 */
import { api } from "./api";

export type WaitlistState = "joined" | "scanning" | "prioritized" | "scan_failed";

export interface WaitlistStatus {
  domain: string;
  status: WaitlistState;
  prioritized: boolean;
  scan: { status: string; steps: { step: string; state: string }[] } | null;
}

const TOKEN_KEY = "sg_waitlist_token";

export function savedWaitlistToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function saveWaitlistToken(token: string | null): void {
  try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* this visit only */ }
}

export async function joinWaitlist(email: string): Promise<{ token: string; domain: string; status: WaitlistState }> {
  return api.post("/funnel/waitlist", { email });
}

export async function startWaitlistScan(token: string): Promise<WaitlistStatus> {
  return api.post(`/funnel/waitlist/${encodeURIComponent(token)}/scan`, {});
}

export async function waitlistStatus(token: string): Promise<WaitlistStatus> {
  return api.get(`/funnel/waitlist/${encodeURIComponent(token)}`);
}
