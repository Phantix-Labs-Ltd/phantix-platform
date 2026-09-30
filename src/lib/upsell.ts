// Features Free cannot use, and the plan that unlocks each — ported from the
// Command Centre app's entitlements module when its /plans page moved here.
// The copy is the *reason a person is here*, not a marketing line — it names
// what they tried to do and what it needs.
export interface UpsellFeature {
  key: string;
  label: string;
  plan: "starter" | "growth" | "enterprise" | "engagement";
  blurb: string;
}

export const UPSELL_FEATURES: Record<string, UpsellFeature> = {
  continuous_pr: {
    key: "continuous_pr",
    label: "Continuous pull request review",
    plan: "growth",
    blurb: "SecureGraph reviews every push, not only an on-demand check. Continuous pull request review is a Growth capability.",
  },
  continuous_pentest: {
    key: "continuous_pentest",
    label: "Continuous and recurring pentest",
    plan: "growth",
    blurb: "Re-tested on a schedule so a fix is confirmed, not assumed. Recurring pentest is Growth.",
  },
  cloud_security_scan: {
    key: "cloud_security_scan",
    label: "Cloud posture packs",
    plan: "growth",
    blurb: "Multi-cloud posture from connected accounts. Cloud packs are part of Growth.",
  },
  container_security_scan: {
    key: "container_security_scan",
    label: "Container and Kubernetes posture",
    plan: "growth",
    blurb: "Image and cluster posture with a container runtime. Container packs are Growth.",
  },
  secrets_and_sca: {
    key: "secrets_and_sca",
    label: "Secrets, SCA and SAST",
    plan: "growth",
    blurb: "Six-layer code security: secrets, dependencies, IaC and SAST. Part of Growth.",
  },
  compliance_workbench: {
    key: "compliance_workbench",
    label: "Compliance workbench",
    plan: "growth",
    blurb: "Evidence collection, mappings and audit packaging sit in the Growth workbench.",
  },
  soc_alert_console: {
    key: "soc_alert_console",
    label: "SOC alert console",
    plan: "growth",
    blurb: "Detection queue and analyst console. The SOC console is a Growth capability.",
  },
  ai_pentest_agent: {
    key: "ai_pentest_agent",
    label: "Autonomous Pentest Agent",
    plan: "growth",
    blurb: "Governed agent sessions against your own assets are part of Growth.",
  },
  dynamic_mobile: {
    key: "dynamic_mobile",
    label: "Dynamic mobile and AVD testing",
    plan: "engagement",
    blurb: "Runtime mobile analysis is a project engagement. Request a quote.",
  },
};

export function upsellFor(key?: string | null): UpsellFeature | null {
  if (!key) return null;
  return UPSELL_FEATURES[key] ?? null;
}

export function upsellPlanLabel(plan: UpsellFeature["plan"]): string {
  if (plan === "engagement") return "Engagement";
  return plan[0].toUpperCase() + plan.slice(1);
}
