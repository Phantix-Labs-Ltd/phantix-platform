// ── Documentation catalog ──────────────────────────────────────────────────
// Renders the in-app "Learn more" guides for platform admins, sourced from
// docs/how-to/platform/ at the monorepo root (shared with Command Centre —
// not duplicated per app).

import howtoIndex from "@docs/docs/how-to/platform/README.md?raw";
import howto01 from "@docs/docs/how-to/platform/01-register-and-sign-in.md?raw";
import howto02 from "@docs/docs/how-to/platform/02-complete-setup-wizard.md?raw";
import howto03 from "@docs/docs/how-to/platform/03-add-a-user.md?raw";
import howto04 from "@docs/docs/how-to/platform/04-assign-dual-control.md?raw";
import howto05 from "@docs/docs/how-to/platform/05-issue-app-login-link.md?raw";
import howto06 from "@docs/docs/how-to/platform/06-connect-security-database.md?raw";
import howto07 from "@docs/docs/how-to/platform/07-connect-config-database.md?raw";
import howto08 from "@docs/docs/how-to/platform/08-identity-keys-branding.md?raw";
import howto09 from "@docs/docs/how-to/platform/09-unlock-operate.md?raw";
import howto10 from "@docs/docs/how-to/platform/10-connect-github.md?raw";
import howto11 from "@docs/docs/how-to/platform/11-billing-and-subscribe.md?raw";
import howto12 from "@docs/docs/how-to/platform/12-configure-alerts.md?raw";
import howto13 from "@docs/docs/how-to/platform/13-sandbox-feedback.md?raw";
import howto14 from "@docs/docs/how-to/platform/14-install-connector.md?raw";

export interface DocEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  content: string;
  badge?: string;
}

export const docCategories = [
  { id: "how-to-platform", label: "How-to", blurb: "Step-by-step admin tasks with process flows" },
] as const;

export const docs: DocEntry[] = [
  { id: "howto-platform-index", title: "Platform how-tos", description: "The full task index for company and security admins.", category: "how-to-platform", content: howtoIndex, badge: "Start here" },
  { id: "howto-platform-01", title: "Register and sign in", description: "Register during the beta, join the waitlist, and sign in.", category: "how-to-platform", content: howto01 },
  { id: "howto-platform-02", title: "Complete the setup", description: "Email code, Quick Scan, security database, plan, applications and login links.", category: "how-to-platform", content: howto02 },
  { id: "howto-platform-03", title: "Add a new user", description: "Invite people into the organization.", category: "how-to-platform", content: howto03 },
  { id: "howto-platform-04", title: "Assign audit control", description: "Set the initiator and authorizer who control the audit trail.", category: "how-to-platform", content: howto04 },
  { id: "howto-platform-05", title: "Issue a Command Centre login link", description: "Get operators into the product app.", category: "how-to-platform", content: howto05 },
  { id: "howto-platform-06", title: "Connect a security database", description: "The guided journey: hosted with an allowlist, or private through a connector.", category: "how-to-platform", content: howto06 },
  { id: "howto-platform-07", title: "Connect a config database", description: "Optional config-inspection database connection.", category: "how-to-platform", content: howto07 },
  { id: "howto-platform-08", title: "Identity, service keys and brand assets", description: "Tenant identity, keys and brand assets.", category: "how-to-platform", content: howto08 },
  { id: "howto-platform-09", title: "Audit control", description: "Who controls the audit trail on the platform.", category: "how-to-platform", content: howto09 },
  { id: "howto-platform-10", title: "Connect GitHub", description: "Install the GitHub App for repository analysis.", category: "how-to-platform", content: howto10 },
  { id: "howto-platform-11", title: "Billing and subscribe", description: "Plans, payments, and subscription management.", category: "how-to-platform", content: howto11 },
  { id: "howto-platform-12", title: "Set up alert channels", description: "Email, WhatsApp and Telegram alert delivery.", category: "how-to-platform", content: howto12 },
  { id: "howto-platform-13", title: "BETA sandbox feedback", description: "Report issues and feedback from the sandbox.", category: "how-to-platform", content: howto13 },
  { id: "howto-platform-14", title: "Install the SecureGraph Connector", description: "Reach a database on a private network without opening an inbound port.", category: "how-to-platform", content: howto14 },
];

export function getDoc(id: string): DocEntry | undefined {
  return docs.find((d) => d.id === id);
}

// ── Doc cross-linking ────────────────────────────────────────────────────────
// The markdown source files link to each other with relative file paths
// (e.g. `[01-register-and-sign-in.md](./01-register-and-sign-in.md)`). Those
// break in the web UI, so we map the source filename → the `/docs/:id` route
// and rewrite them on render.

const DOC_ID_BY_FILE: Record<string, string> = {
  "README.md": "howto-platform-index",
  "01-register-and-sign-in.md": "howto-platform-01",
  "02-complete-setup-wizard.md": "howto-platform-02",
  "03-add-a-user.md": "howto-platform-03",
  "04-assign-dual-control.md": "howto-platform-04",
  "05-issue-app-login-link.md": "howto-platform-05",
  "06-connect-security-database.md": "howto-platform-06",
  "07-connect-config-database.md": "howto-platform-07",
  "08-identity-keys-branding.md": "howto-platform-08",
  "09-unlock-operate.md": "howto-platform-09",
  "10-connect-github.md": "howto-platform-10",
  "11-billing-and-subscribe.md": "howto-platform-11",
  "12-configure-alerts.md": "howto-platform-12",
  "13-sandbox-feedback.md": "howto-platform-13",
  "14-install-connector.md": "howto-platform-14",
};

/**
 * Map a markdown cross-reference (e.g. `./01-register-and-sign-in.md`) to a
 * `/docs/:id` route so in-content doc links navigate in-app instead of 404ing.
 */
export function resolveDocHref(href: string): string {
  if (!href) return href;
  if (/^https?:\/\//i.test(href) || href.startsWith("#") || /^\/docs\//.test(href)) return href;
  if (/\.\/(platform|command-centre)\/?$/i.test(href)) return "/docs/howto-platform-index";
  if (/\.md$/i.test(href)) {
    const base = href.split("/").pop() ?? "";
    const target = DOC_ID_BY_FILE[base] ?? DOC_ID_BY_FILE[base.toLowerCase()];
    if (target) return `/docs/${target}`;
  }
  return href;
}

export interface TocItem {
  depth: number;
  text: string;
  id: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (line.trim().startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+)$/.exec(line);
    if (m) {
      const text = m[2].replace(/\*\*/g, "").replace(/`/g, "").trim();
      items.push({ depth: m[1].length, text, id: slugify(text) });
    }
  }
  return items;
}
