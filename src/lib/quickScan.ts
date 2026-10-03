/**
 * Quick Scan (self-serve onboarding contract C5): a passive, single-person
 * first scan of a domain or GitHub repo. Results are a preview until they are
 * imported into the organization's own security database.
 */
import { api, DEMO_MODE, delay } from "./api";

export type QuickScanTargetType = "domain" | "github_repo";
export type QuickScanStatus = "queued" | "running" | "done" | "failed";
export type StepState = "pending" | "running" | "done" | "failed" | "skipped";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type QuickScanAsset = { type: string; value: string; source?: string };
export type QuickScanFinding = {
  id?: string | number;
  title: string;
  severity: Severity;
  asset?: string;
  detail?: string;
  recommendation?: string;
};
export type QuickScan = {
  id: string | number;
  target_type: QuickScanTargetType;
  target: string;
  status: QuickScanStatus;
  progress: { step: string; state: StepState }[];
  assets: QuickScanAsset[];
  findings: QuickScanFinding[];
  /** When the preview copy is purged if never imported. */
  expires_at?: string | null;
  imported_at?: string | null;
  error?: string | null;
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/** Strip scheme, path and port so "https://Acme.io/login" scans "acme.io". */
export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#:].*$/, "").replace(/\.$/, "");
}

export const isValidDomain = (d: string) => /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);

/** "owner/repo" from a GitHub URL or the short form. */
export function normalizeRepo(input: string): string {
  return input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
}

export const isValidRepo = (r: string) => /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(r);

// ── Normalizing the API shape ───────────────────────────────────────────────

/** Display names for the backend's step keys. */
const STEP_LABELS: Record<string, string> = {
  dns: "DNS records",
  tls: "TLS certificate",
  http_headers: "HTTP security headers",
  ct_subdomains: "Subdomains (certificate logs)",
  email_auth: "Email security (SPF, DMARC)",
  repo_metadata: "Repository metadata",
  dependency_manifests: "Dependencies and known vulnerabilities",
};

const SEVERITIES = new Set<Severity>(["critical", "high", "medium", "low", "info"]);

type RawScan = Omit<QuickScan, "status" | "assets" | "findings"> & {
  status: string;
  assets?: Record<string, unknown>[];
  findings?: Record<string, unknown>[];
};

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * The backend reports `completed` / `imported` / `expired` and findings in the
 * funnel shape (`target`, `evidence`, `remediation`); the page works with one
 * shape, so everything is mapped here.
 */
function normalize(raw: RawScan): QuickScan {
  const status: QuickScanStatus =
    raw.status === "queued" || raw.status === "running" ? raw.status
      : raw.status === "completed" || raw.status === "imported" || raw.status === "done" ? "done"
        : "failed";
  return {
    ...raw,
    status,
    error: raw.status === "expired" ? "This preview expired. Run the scan again to see fresh results." : raw.error,
    progress: (raw.progress || []).map((p) => ({ step: STEP_LABELS[p.step] || p.step, state: p.state })),
    assets: (raw.assets || []).map((a) => {
      const meta = (a.metadata && typeof a.metadata === "object" ? a.metadata : {}) as Record<string, unknown>;
      const source = str(a.source) && a.source !== "quick_scan" ? str(a.source) : str(meta.source) || str(meta.via);
      return { type: str(a.type) || str(a.asset_type) || "asset", value: str(a.value) || str(a.name) || "", source };
    }).filter((a) => a.value),
    findings: (raw.findings || []).map((f, i) => {
      const sev = String(f.severity || "").toLowerCase() as Severity;
      return {
        id: (f.id as string | number | undefined) ?? i,
        title: str(f.title) || "Untitled finding",
        severity: SEVERITIES.has(sev) ? sev : "info",
        asset: str(f.asset) || str(f.target),
        detail: str(f.detail) || str(f.evidence),
        recommendation: str(f.recommendation) || str(f.remediation),
      };
    }),
  };
}

// ── API ─────────────────────────────────────────────────────────────────────

export async function startQuickScan(target_type: QuickScanTargetType, target: string): Promise<QuickScan> {
  if (DEMO_MODE) return demoStart(target_type, target);
  const res = await api.post<Partial<RawScan> & { id: QuickScan["id"] }>("/quick-scans", { target_type, target });
  // 202 carries only { id, status }: show the steps as pending until the first poll.
  return normalize({ target_type, target, progress: [], ...res, status: res.status || "queued" } as RawScan);
}

export async function getQuickScan(id: QuickScan["id"]): Promise<QuickScan> {
  if (DEMO_MODE) return demoGet();
  return normalize(await api.get<RawScan>(`/quick-scans/${id}`));
}

/** The organization's most recent Quick Scan, or null when there is none. */
export async function latestQuickScan(): Promise<QuickScan | null> {
  if (DEMO_MODE) return demoScan;
  try {
    // 404 quick_scan_not_found when the org has none (caught below).
    const res = await api.get<RawScan | RawScan[] | { items?: RawScan[] } | null>("/quick-scans?latest=1");
    const one = !res ? null : Array.isArray(res) ? res[0] : "items" in res ? res.items?.[0] : "id" in res ? res : null;
    return one ? normalize(one) : null;
  } catch {
    return null;
  }
}

/** Move the preview into the security database (409 security_db_missing until connected). */
export async function importQuickScan(id: QuickScan["id"]): Promise<void> {
  if (DEMO_MODE) {
    await delay(800);
    if (demoScan) demoScan = { ...demoScan, imported_at: new Date().toISOString() };
    return;
  }
  await api.post(`/quick-scans/${id}/import`, {});
}

// ── Demo simulation ─────────────────────────────────────────────────────────

const DOMAIN_STEPS = ["DNS records", "TLS certificate", "HTTP security headers", "Subdomains (certificate logs)", "Email security (SPF, DMARC)"];
const REPO_STEPS = ["Repository metadata", "Dependency manifests", "Known vulnerable packages", "Exposed secrets patterns"];

let demoScan: QuickScan | null = null;
let demoStartedAt = 0;

async function demoStart(target_type: QuickScanTargetType, target: string): Promise<QuickScan> {
  await delay(500);
  demoStartedAt = Date.now();
  const steps = target_type === "domain" ? DOMAIN_STEPS : REPO_STEPS;
  demoScan = {
    id: "demo-qs-1", target_type, target, status: "queued",
    progress: steps.map((step) => ({ step, state: "pending" })), assets: [], findings: [],
    expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  };
  return demoScan;
}

async function demoGet(): Promise<QuickScan> {
  await delay(250);
  if (!demoScan) throw new Error("No Quick Scan running");
  if (demoScan.status === "done") return demoScan;
  const n = demoScan.progress.length;
  const finished = Math.min(n, Math.floor((Date.now() - demoStartedAt) / 1400));
  const progress = demoScan.progress.map((p, i) => ({ ...p, state: (i < finished ? "done" : i === finished ? "running" : "pending") as StepState }));
  const done = finished >= n;
  demoScan = { ...demoScan, status: done ? "done" : "running", progress, ...(done ? demoResults(demoScan) : {}) };
  return demoScan;
}

function demoResults(s: QuickScan): Pick<QuickScan, "assets" | "findings"> {
  if (s.target_type === "github_repo") {
    return {
      assets: [{ type: "repository", value: s.target, source: "GitHub" }],
      findings: [
        { title: "Dependency with a known critical vulnerability", severity: "critical", asset: s.target, detail: "lodash 4.17.15 is affected by prototype pollution.", recommendation: "Upgrade lodash to 4.17.21 or later." },
        { title: "No branch protection on the default branch", severity: "medium", asset: s.target, recommendation: "Require reviews before merging to main." },
        { title: "No SECURITY.md policy", severity: "low", asset: s.target, recommendation: "Tell researchers how to report a vulnerability." },
      ],
    };
  }
  const d = s.target;
  return {
    assets: [
      { type: "domain", value: d, source: "You" },
      { type: "subdomain", value: `www.${d}`, source: "DNS" },
      { type: "subdomain", value: `api.${d}`, source: "Certificate logs" },
      { type: "subdomain", value: `staging.${d}`, source: "Certificate logs" },
      { type: "mail", value: `mx1.${d}`, source: "DNS" },
    ],
    findings: [
      { title: "Staging environment is publicly reachable", severity: "high", asset: `staging.${d}`, detail: "Listed in certificate logs and answers on port 443.", recommendation: "Put staging behind SSO or an IP allow-list." },
      { title: "No DMARC policy", severity: "medium", asset: d, detail: "Anyone can send mail that appears to come from this domain.", recommendation: "Publish a DMARC record, starting with p=none and moving to p=reject." },
      { title: "Content-Security-Policy header missing", severity: "medium", asset: `www.${d}`, recommendation: "Add a CSP to limit where scripts can load from." },
      { title: "TLS certificate expires in 18 days", severity: "low", asset: `api.${d}`, recommendation: "Check that auto-renewal is working." },
      { title: "Server version disclosed in headers", severity: "info", asset: `www.${d}`, recommendation: "Remove the version from the Server header." },
    ],
  };
}
