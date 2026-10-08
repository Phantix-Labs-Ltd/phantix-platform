/**
 * Onboarding milestones (self-serve onboarding contract C4).
 *
 * The server records when each milestone first happened; the checklist on the
 * dashboard and the first-run redirect both read from here. A backend without
 * the endpoint yields `null`, and every caller treats that as "no checklist".
 */
import { api, DEMO_MODE, delay } from "./api";
import { ATTACK_URL } from "./config";

export type MilestoneKey =
  | "email_verified"
  | "first_asset"
  | "quick_scan_done"
  | "security_db_connected"
  | "first_finding_viewed"
  | "teammate_invited"
  | "dual_control_enabled"
  | "first_vapt";

export type Milestone = { key: MilestoneKey; done_at: string | null; optional?: boolean };
export type Onboarding = { milestones: Milestone[]; dismissed: boolean };

/** What each milestone is called on the checklist and where it is done.
 *  An absolute URL opens that application (VAPT runs in Attack). */
export const MILESTONE_META: Record<MilestoneKey, { label: string; detail: string; to: string }> = {
  email_verified:        { label: "Verify your email", detail: "Confirms you own the sign-in address.", to: "/setup" },
  first_asset:           { label: "Add a domain or repo", detail: "What you want SecureGraph to watch.", to: "/get-started" },
  quick_scan_done:       { label: "Run a Quick Scan", detail: "Passive checks: DNS, TLS, headers, subdomains.", to: "/get-started" },
  security_db_connected: { label: "Connect your security database", detail: "Neon or Supabase take about two minutes.", to: "/connections" },
  first_finding_viewed:  { label: "Review your first findings", detail: "See what an attacker would see first.", to: "/get-started" },
  teammate_invited:      { label: "Invite a teammate", detail: "Share findings and split the work.", to: "/users" },
  dual_control_enabled:  { label: "Turn on dual control", detail: "Optional: a second person approves risky actions.", to: "/identity#dual-control" },
  first_vapt:            { label: "Run your first VAPT", detail: "Active testing on a verified target.", to: `${ATTACK_URL}/vapt` },
};

/** Checklist row added by the browser (no server milestone): a verified domain. */
export const DOMAIN_ITEM = { label: "Verify your domain", detail: "Active testing needs a domain you own.", to: "/identity#domains" };

/** Whether the organization has at least one verified domain (null: unknown). */
export async function hasVerifiedDomain(): Promise<boolean | null> {
  if (DEMO_MODE) return false;
  try {
    const res = await api.get<{ items?: { status?: string }[] }>("/organizations/me/domains");
    return Array.isArray(res?.items) ? res.items.some((d) => d.status === "verified") : null;
  } catch {
    return null;
  }
}

export const isDone = (o: Onboarding | null, key: MilestoneKey) =>
  Boolean(o?.milestones.find((m) => m.key === key)?.done_at);

const DEMO_KEY = "sg_demo_onboarding";

function demoOnboarding(): Onboarding {
  try {
    const saved = localStorage.getItem(DEMO_KEY);
    if (saved) return JSON.parse(saved) as Onboarding;
  } catch { /* fall through to a fresh list */ }
  const keys = Object.keys(MILESTONE_META) as MilestoneKey[];
  return {
    milestones: keys.map((key) => ({
      key,
      done_at: key === "email_verified" ? new Date().toISOString() : null,
      optional: key === "dual_control_enabled" || undefined,
    })),
    dismissed: false,
  };
}

function saveDemo(o: Onboarding) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(o)); } catch { /* demo only */ }
}

export async function fetchOnboarding(): Promise<Onboarding | null> {
  if (DEMO_MODE) return demoOnboarding();
  try {
    const res = await api.get<Onboarding>("/organizations/me/onboarding");
    return Array.isArray(res?.milestones) ? res : null;
  } catch {
    return null;
  }
}

/** Record a milestone only the browser can see (e.g. findings viewed). */
export async function recordMilestone(key: MilestoneKey): Promise<void> {
  if (DEMO_MODE) {
    const o = demoOnboarding();
    saveDemo({ ...o, milestones: o.milestones.map((m) => (m.key === key && !m.done_at ? { ...m, done_at: new Date().toISOString() } : m)) });
    await delay(150);
    return;
  }
  await api.post("/organizations/me/onboarding/events", { key }).catch(() => undefined);
}

export async function dismissOnboarding(): Promise<void> {
  if (DEMO_MODE) { saveDemo({ ...demoOnboarding(), dismissed: true }); return; }
  await api.post("/organizations/me/onboarding/dismiss", {});
}
