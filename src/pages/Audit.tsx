import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2, RefreshCw, ChevronLeft, ChevronRight, Search, ShieldAlert } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, TableCardSkeleton } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { describeEndpoint } from "@/lib/auditExplain";
import { cx, parseTimestamp, timeAgo, titleCase } from "@/lib/utils";

// Each row reads like a sentence: a category, what happened to which record
// (the names in bold), who did it, when, and from where. The API words the
// sentence; older backends without it fall back to the route's description.

type Change = "added" | "changed" | "removed" | "viewed" | "access" | "refused";

interface DescriptionPart {
  text: string;
  bold?: boolean;
}

interface AuditRow {
  id: number;
  event_uid: string;
  organization_id: number;
  action_key: string;
  action_label: string;
  category: string;
  event_category?: string | null;
  description?: DescriptionPart[];
  description_text?: string;
  change?: Change | null;
  performed_by?: string | null;
  outcome?: string | null;
  status_code?: number | null;
  method?: string | null;
  route?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  status: string;
  initiator_name: string | null;
  initiator_title: string | null;
  authorizer_name: string | null;
  authorizer_title: string | null;
  initiated_at: string | null;
  authorised_at: string | null;
  completed_at: string | null;
  summary: string | null;
  details?: {
    path?: string;
    method?: string;
    actor_email?: string;
    token_type?: string;
    passive?: boolean;
    [k: string]: unknown;
  };
  source: string | null;
  ip_address: string | null;
  created_at: string;
}

const PAGE_SIZE = 200;

/** Categories the API files events under; the response sends the live list. */
const DEFAULT_CATEGORIES = [
  "Sign-in", "Users", "Roles", "Organization", "Domains", "Approvals", "Audit trail", "Assets",
  "Testing", "Mobile", "API endpoints", "Findings", "Risks", "Reports", "Compliance", "Detection",
  "Code", "Context", "Integrations", "Database", "Agent", "Notifications", "Billing", "Support", "Platform",
];

/** The bar at the start of each row: what kind of change it was. */
const CHANGE_META: Record<Change, { label: string; bar: string }> = {
  added: { label: "Added", bar: "bg-emerald-500" },
  changed: { label: "Changed", bar: "bg-amber-400" },
  removed: { label: "Removed", bar: "bg-rose-500" },
  access: { label: "Sign-in", bar: "bg-sky-500" },
  viewed: { label: "Viewed", bar: "bg-slate-500" },
  refused: { label: "Denied or failed", bar: "bg-red-600" },
};

function changeOf(e: AuditRow): Change {
  if (e.change) return e.change;
  if (e.outcome === "denied" || e.outcome === "failed" || e.status === "rejected") return "refused";
  if (e.details?.passive) return "viewed";
  const method = (e.method ?? e.details?.method ?? "").toUpperCase();
  if (method === "POST") return "added";
  if (method === "DELETE") return "removed";
  return "changed";
}

function categoryOf(e: AuditRow): string {
  return e.event_category || titleCase((e.category || "platform").replace(/-/g, " "));
}

/** The sentence the API wrote, or one built from the route for older backends. */
function descriptionOf(e: AuditRow): DescriptionPart[] {
  if (e.description && e.description.length > 0) return e.description;
  const desc = e.details?.path ? describeEndpoint(e.details.method ?? "GET", e.details.path) : null;
  const label = ((desc?.label ?? e.action_label) || e.action_key || "Activity").replace(/\.$/, "");
  return [{ text: `${label}.` }];
}

function performedBy(e: AuditRow): string {
  return e.performed_by ?? e.details?.actor_email ?? e.initiator_name ?? "System";
}

/** "12/10/2026 23:10" in the reader's locale. */
function eventTime(iso: string): string {
  const d = parseTimestamp(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${date} ${time}`;
}

function fullTime(iso: string | null): string {
  if (!iso) return "Not set";
  const d = parseTimestamp(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusColor(status: string): string {
  switch (String(status).toLowerCase()) {
    case "completed": case "authorized": case "approved": return "emerald";
    case "rejected": case "failed": return "red";
    case "pending": case "initiated": return "amber";
    default: return "slate";
  }
}

function StatusPill({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span className={cx(
      "chip capitalize",
      color === "emerald" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      color === "red" && "border-severity-critical/30 bg-severity-critical/10 text-red-300",
      color === "amber" && "border-amber-400/30 bg-amber-400/10 text-amber-300",
      color === "slate" && "border-slate-500/30 bg-slate-500/10 text-slate-400",
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> {status || "Not set"}
    </span>
  );
}

function Sentence({ parts }: { parts: DescriptionPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-slate-50">{p.text}</strong>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function Fact({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className={cx("mt-0.5 break-words text-[13px] text-slate-200", mono && "font-mono text-[12px]")}>{children}</dd>
    </div>
  );
}

export default function Audit() {
  const { toast, exportAuditCsv } = useStore();
  const [exporting, setExporting] = useState(false);

  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortByClass, setSortByClass] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    if (search.trim()) params.set("q", search.trim());
    if (category !== "all") params.set("event_category", category);
    if (status !== "all") params.set("status", status);
    try {
      const res = await api.get<{ items?: AuditRow[]; total?: number; event_categories?: string[] }>(
        `/audit/events?${params.toString()}`,
      );
      const rows = (res?.items ?? []) as AuditRow[];
      setItems(rows);
      setTotal(Number(res?.total ?? rows.length));
      if (res?.event_categories?.length) setCategories(res.event_categories);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setLoadError(e instanceof Error ? e.message : "Could not load audit trail");
    } finally {
      setLoading(false);
    }
  }, [page, search, category, status]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(0); setReloadKey((k) => k + 1); }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, category, status]);

  // Poll so new user activities stream in.
  useEffect(() => {
    const t = window.setInterval(() => setReloadKey((k) => k + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { if (reloadKey === 0) return; void fetchPage(); }, [reloadKey, fetchPage]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAuditCsv();
      toast("success", "Export ready", "Audit CSV downloaded. Every row carries its category, description and who performed it.");
    } catch (err) {
      toast("error", "Export failed", err instanceof Error ? err.message : "Could not download the audit trail");
    } finally {
      setExporting(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Group/order by category (class) when toggled on.
  const visible = sortByClass
    ? [...items].sort((a, b) => categoryOf(a).localeCompare(categoryOf(b)))
    : items;

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Immutable record of what was done, to which record, by whom, when, and from where."
        actions={
          <div className="flex items-center gap-2">
            <DocLink docId="howto-platform-index" label="Platform how-to index" />
            <button className="btn-ghost" onClick={() => { setReloadKey((k) => k + 1); }} title="Refresh audit trail"><RefreshCw size={15} /></button>
            <button className="btn-secondary" onClick={() => void handleExport()} disabled={exporting}>
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export CSV
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, people, records, IPs"
            aria-label="Search the audit trail"
            className="w-72 rounded-lg border border-phantix-700/50 bg-phantix-950/70 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-gold-400/50"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input !w-auto !py-1.5 !text-xs" aria-label="Event category">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto !py-1.5 !text-xs" aria-label="Status">
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending / initiated</option>
          <option value="rejected">Rejected</option>
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={sortByClass} onChange={(e) => setSortByClass(e.target.checked)} className="h-3 w-3 accent-gold-400" />
          Group by category
        </label>
        <span className="ml-auto text-[13px] text-slate-500">{total.toLocaleString()} events · {PAGE_SIZE}/page</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500" aria-label="Bar colours">
        {(Object.keys(CHANGE_META) as Change[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cx("h-3 w-[3px] rounded-full", CHANGE_META[k].bar)} aria-hidden />
            {CHANGE_META[k].label}
          </span>
        ))}
      </div>

      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-4 py-3">
          <p className="text-sm text-red-300">Could not load audit trail: {loadError}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className="btn-ghost text-xs">Retry</button>
        </div>
      )}

      {loading ? (
        <TableCardSkeleton rows={8} cols={5} title={false} />
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem]">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th w-44">Event category</th>
                    <th className="th">Event description</th>
                    <th className="th">Performed by</th>
                    <th className="th">Event time</th>
                    <th className="th">Client IP address</th>
                    <th className="th w-8"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e, i) => {
                    const change = CHANGE_META[changeOf(e)];
                    const expanded = open === e.id;
                    const desc = e.details?.path ? describeEndpoint(e.details.method ?? "GET", e.details.path) : null;
                    const refused = e.outcome === "denied" || e.outcome === "failed";
                    const method = e.method ?? e.details?.method;
                    const request = e.route ?? e.details?.path;
                    return (
                      <React.Fragment key={`${e.id}-${i}`}>
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i * 0.015, 0.4) }}
                          onClick={() => setOpen(expanded ? null : e.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              setOpen(expanded ? null : e.id);
                            }
                          }}
                          tabIndex={0}
                          aria-expanded={expanded}
                          className="cursor-pointer border-b border-phantix-800/40 align-top hover:bg-phantix-800/35"
                        >
                          <td className="td whitespace-nowrap text-[13px] text-slate-200">
                            <span className={cx("mr-2.5 inline-block h-5 w-[3px] rounded-full align-middle", change.bar)} title={change.label} aria-hidden />
                            <span className="sr-only">{change.label}: </span>
                            <span className="align-middle">{categoryOf(e)}</span>
                          </td>
                          <td className="td max-w-[34rem] text-[13px] text-slate-300">
                            <Sentence parts={descriptionOf(e)} />
                            {refused && (
                              <span className={cx(
                                "ml-2 inline-flex rounded-md px-1.5 py-0.5 align-middle text-[11px] font-medium",
                                e.outcome === "denied" ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300",
                              )}>
                                {e.outcome === "denied" ? "Denied" : "Failed"}{e.status_code ? ` (${e.status_code})` : ""}
                              </span>
                            )}
                          </td>
                          <td className="td whitespace-nowrap text-[13px] text-slate-300">{performedBy(e)}</td>
                          <td className="td whitespace-nowrap text-[13px] text-slate-300" title={`${fullTime(e.created_at)} · ${timeAgo(e.created_at)}`}>
                            {eventTime(e.created_at)}
                          </td>
                          <td className="td whitespace-nowrap font-mono text-[12px] text-slate-400">{e.ip_address ?? "–"}</td>
                          <td className="td pt-3 text-slate-500">
                            <ChevronRight size={14} className={cx("transition-transform", expanded && "rotate-90")} />
                          </td>
                        </motion.tr>
                        {expanded && (
                          <tr className="border-b border-phantix-800/40 bg-phantix-950/50">
                            <td colSpan={6} className="px-5 py-4">
                              {desc?.detail && <p className="mb-3 max-w-3xl text-[13px] text-slate-400">{desc.detail}</p>}
                              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Fact label="Alert ID" mono>#{e.id} · {e.event_uid || "Not set"}</Fact>
                                <Fact label="Status"><StatusPill status={e.status || "Not set"} /></Fact>
                                <Fact label="Initiator">{[e.initiator_name, e.initiator_title].filter(Boolean).join(" · ") || "Not set"}</Fact>
                                <Fact label="Authorizer">{e.authorizer_name ? [e.authorizer_name, e.authorizer_title].filter(Boolean).join(" · ") : "No approval required"}</Fact>
                                <Fact label="Initiated">{fullTime(e.initiated_at)}</Fact>
                                <Fact label="Completed">{fullTime(e.completed_at ?? e.created_at)}</Fact>
                                <Fact label="Record">{e.resource_type && e.resource_id ? `${titleCase(e.resource_type)} #${e.resource_id}` : "None"}</Fact>
                                <Fact label="Request" mono>{method || request ? `${method ?? ""} ${request ?? ""}`.trim() : "Not an API request"}</Fact>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <ShieldAlert size={22} className="text-slate-600" />
                <p className="text-sm text-slate-500">No audit events match.</p>
              </div>
            )}
          </Card>

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-300">{total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}</span> of{" "}
              <span className="font-semibold text-slate-300">{total.toLocaleString()}</span> events
            </p>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-xs text-slate-400">Page {page + 1} / {pageCount}</span>
              <button
                className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                disabled={page + 1 >= pageCount || loading}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Dual-control audit records are kept per organization. They are never written into your security database.
      </p>
    </div>
  );
}
