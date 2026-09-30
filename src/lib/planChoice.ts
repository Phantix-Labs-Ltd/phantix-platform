/**
 * The plan a new organization picks during setup.
 *
 * The setup wizard is where the choice is made (Free / Starter / Growth);
 * writing it here lets the choice survive a refresh mid-wizard and pre-select
 * the right plan on Billing, where the actual payment happens. Prices shown in
 * the wizard come from /billing/plans when the API answers, with these as the
 * offline fallback.
 */
export type PlanChoice = "free" | "starter" | "growth";

const KEY = "phantix_plan_choice";

export const PLAN_CHOICES: Array<{
  key: PlanChoice;
  name: string;
  /** Fallback price in NGN/month (live value from /billing/plans wins). */
  priceNgn: number | null;
  priceNote: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}> = [
  {
    key: "free",
    name: "Free",
    priceNgn: 0,
    priceNote: "No card required",
    tagline: "Know your attack surface, at no cost.",
    features: [
      "Asset inventory with fair-use caps",
      "Light DNS and network hygiene scans",
      "Dual control, MFA and immutable audit",
      "500 one-time AI credits",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    priceNgn: 9_900,
    priceNote: "per month",
    tagline: "Assess like an attacker. VAPT with verified findings.",
    features: [
      "Everything in Free",
      "Scoped, approval-gated VAPT campaigns",
      "Verified findings with remediation guidance",
      "5,000 AI credits per month",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    priceNgn: 19_900,
    priceNote: "per month",
    tagline: "Keep testing. Continuous security every week.",
    highlight: true,
    features: [
      "Everything in Starter",
      "Continuous pentest and pull request review",
      "Multi-cloud and Kubernetes posture",
      "20,000 AI credits per month",
    ],
  },
];

/** The plan chosen during setup, or null when the choice has not been made. */
export function readPlanChoice(): PlanChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "free" || v === "starter" || v === "growth" ? v : null;
  } catch {
    return null;
  }
}

export function writePlanChoice(plan: PlanChoice): void {
  try { localStorage.setItem(KEY, plan); } catch { /* storage unavailable */ }
}

/** True when the plan is paid (i.e. needs a trip through Billing). */
export function isPaidPlan(plan: PlanChoice): boolean {
  return plan !== "free";
}

export function planLabel(plan: PlanChoice): string {
  return PLAN_CHOICES.find((p) => p.key === plan)?.name ?? plan;
}
