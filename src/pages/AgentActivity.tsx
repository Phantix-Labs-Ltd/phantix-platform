import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Bot, ChevronLeft, ChevronRight, KeyRound, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, TableCardSkeleton } from "@/components/ui";
import {
  isDenied,
  loadAgentActivity,
  type AgentAction,
} from "@/lib/agentActivity";
import { cx, timeAgo, formatDateTime, clickableRowProps } from "@/lib/utils";

// ── Agent activity ───────────────────────────────────────────────────────────
// The agent acts as the signed-in user and never inherits authority. Every tool
// call — allowed or denied — is recorded with the run, the domain, the intent
// the operator gave, whether it was authorized, and what came back. Support and
// auditors read this to answer "what did the agent do for us, and was it within
// the permissions of the person who asked?"

const PAGE_SIZE = 50;

const DOMAIN_LABEL: Record<string, string> = {
  cross: "Chief",
  threat_model: "Threat modelling",
  soc: "SOC",
  grc: "GRC",
  vapt: "VAPT",
  ti: "Threat intel",
  asset: "Asset",
  code: "Code",
  verify: "Verification",
  consultant: "Consultant",
};

function domainLabel(domain?: string | null): string {
  if (!domain) return "Not set";
  return DOMAIN_LABEL[domain] ?? domain.replace(/_/g, " ");
}

function Outcome({ row }: { row: AgentAction }) {
  const denied = isDenied(row);
  return (
    <span
      className={cx(
        "chip",
        denied
          ? "border-severity-medium/30 bg-severity-medium/10 text-severity-medium"
          : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      )}
      title={row.error || (denied ? "Refused" : "Completed")}
    >
      {denied ? <XCircle size={10} className="mr-1 inline" /> : <ShieldCheck size={10} className="mr-1 inline" />}
      {denied ? "denied" : "done"}
    </span>
  );
}

export default function AgentActivity() {
  const [items, setItems] = useState<AgentAction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [domain, setDomain] = useState("all");
  const [tool, setTool] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await loadAgentActivity({
        status: status === "all" ? undefined : status,
        domain: domain === "all" ? undefined : domain,
        tool: tool.trim() || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(Array.isArray(res.items) ? res.items : []);
      setTotal(Number(res.total ?? 0));
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "Could not load agent activity");
    } finally {
      setLoading(false);
    }
  }, [page, status, domain, tool]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setReloadKey((k) => k + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { if (reloadKey !== 0) void load(); }, [reloadKey, load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const deniedCount = items.filter(isDenied).length;

  return (
    <div>
      <PageHeader
        title="Agent activity"
        description="What the agent did for this organization: run, domain, intent, authorization and outcome for every action."
        actions={
          <>
            <DocLink docId="howto-platform-index" label="Platform how-to index" />
            <button className="btn-ghost" onClick={() => void load()} title="Refresh">
              <RefreshCw size={15} className={cx(loading && "animate-spin")} />
            </button>
          </>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-md border border-gold-400/25 bg-gold-400/[0.06] p-3">
        <KeyRound size={14} className="mt-0.5 shrink-0 text-gold-300" />
        <p className="text-[13px] leading-5 text-gold-100/90">
          The agent acts as the signed-in user and can do only what that user's role allows. Every action that
          changes something needs a <span className="font-semibold">fresh, single-use authorization</span> bound
          to one action on one run. An approval is spent by the call it authorizes. A denied row here means a
          control held, not that something broke.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="input !w-auto !py-1.5 !text-xs"
        >
          <option value="all">All outcomes</option>
          <option value="completed">Completed</option>
          <option value="failed">Denied or failed</option>
        </select>
        <select
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setPage(0); }}
          className="input !w-auto !py-1.5 !text-xs"
        >
          <option value="all">All domains</option>
          {Object.keys(DOMAIN_LABEL).map((d) => (
            <option key={d} value={d}>{domainLabel(d)}</option>
          ))}
        </select>
        <input
          value={tool}
          onChange={(e) => { setTool(e.target.value); setPage(0); }}
          placeholder="Tool (e.g. threat_model.generate)"
          className="w-64 rounded-lg border border-phantix-700/50 bg-phantix-950/70 px-3 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-gold-400/50"
        />
        <span className="ml-auto text-[13px] text-slate-500">
          {total.toLocaleString()} actions · {deniedCount} denied on this page
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-4 py-3">
          <p className="text-sm text-red-300">Could not load agent activity: {error}</p>
          <button onClick={() => void load()} className="btn-ghost text-xs">Retry</button>
        </div>
      )}

      {loading && !items.length ? (
        <TableCardSkeleton rows={8} cols={6} title={false} />
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">When</th>
                    <th className="th">Domain</th>
                    <th className="th">Action</th>
                    <th className="th">Intent</th>
                    <th className="th">Asked by</th>
                    <th className="th">Authorized</th>
                    <th className="th">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => (
                    <React.Fragment key={row.id}>
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.015, 0.4) }}
                        className="h-10 cursor-pointer border-b border-phantix-800/40 hover:bg-phantix-800/35 focus:outline-none focus:ring-1 focus:ring-gold-400/60 focus:ring-inset"
                        onClick={() => setOpen(open === row.id ? null : row.id)}
                        {...clickableRowProps(() => setOpen(open === row.id ? null : row.id))}
                      >
                        <td className="td whitespace-nowrap text-[13px] text-slate-400" title={row.created_at ? formatDateTime(row.created_at) : ""}>
                          {timeAgo(row.created_at ?? null)}
                            {row.run_id && <span className="ml-1.5 font-mono text-[11px] text-slate-600">{String(row.run_id).slice(0, 8)}</span>}
                        </td>
                        <td className="td">
                          <span className="chip border-phantix-700 text-slate-300">{domainLabel(row.domain)}</span>
                        </td>
                        <td className="td">
                          <p className="flex items-center gap-1.5 font-mono text-[13px] text-slate-200">
                            <Bot size={11} className="text-gold-400" />
                            {row.tool ?? "Not set"}
                          </p>
                        </td>
                        <td className="td max-w-[320px] text-[13px] text-slate-400">
                          <span className="block truncate" title={row.intent || undefined}>{row.intent || <span className="text-slate-600">Not set</span>}</span>
                        </td>
                        <td className="td">
                          {row.actor_name || row.actor_email || row.actor_user_id ? (
                            <span className="whitespace-nowrap text-[13px] text-slate-300">
                                {row.actor_name || row.actor_email || `user #${row.actor_user_id}`}
                                {row.actor_role && <span className="ml-1.5 capitalize text-slate-500">{row.actor_role}</span>}
                              </span>
                          ) : (
                            <span className="text-[13px] text-slate-600" title="A company key or service call, with no named user">org-level</span>
                          )}
                        </td>
                        <td className="td">
                          {row.authorized === true ? (
                            <span className="chip border-emerald-400/30 text-emerald-300"><KeyRound size={10} className="mr-1 inline" />authorized</span>
                          ) : row.authorized === false ? (
                            <span className="chip border-phantix-700 text-slate-500">not required / none</span>
                          ) : (
                            <span className="text-[13px] text-slate-600">Not set</span>
                          )}
                        </td>
                        <td className="td"><Outcome row={row} /></td>
                      </motion.tr>
                      {open === row.id && (
                        <tr className="border-b border-phantix-800/40 bg-phantix-900/40">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="space-y-1.5">
                              {row.params && (
                                <p className="text-[13px] text-slate-400">
                                  <span className="text-slate-600">params:</span>{" "}
                                  <span className="font-mono text-slate-300">{row.params}</span>
                                </p>
                              )}
                              {row.error && (
                                <p className="text-[13px] text-severity-medium">
                                  <span className="text-slate-600">reason:</span> {row.error}
                                </p>
                              )}
                              {(row.context?.length ?? 0) > 0 && (
                                <p className="break-all font-mono text-[12px] leading-4 text-slate-600">
                                  {(row.context ?? []).join(" · ")}
                                </p>
                              )}
                              <p className="font-mono text-[12px] text-slate-600">
                                evidence {row.evidence_hash?.slice(0, 16) ?? "Not set"} · response {row.response_hash?.slice(0, 16) ?? "Not set"}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {!items.length && (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <Activity size={22} className="text-slate-600" />
                <p className="text-sm text-slate-500">No agent actions yet. Ask the agent to do a read or a write. It then appears here.</p>
              </div>
            )}
          </Card>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-300">
                {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}
              </span>{" "}
              of <span className="font-semibold text-slate-300">{total.toLocaleString()}</span> actions
            </p>
            <div className="flex items-center gap-2">
              <button className="btn-ghost !px-2.5 !py-1.5 !text-xs" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-xs text-slate-400">Page {page + 1} / {pageCount}</span>
              <button className="btn-ghost !px-2.5 !py-1.5 !text-xs" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <p className="mt-5 text-xs text-slate-500">
        Rows live in the platform audit store (<span className="font-mono">ai_audit_logs</span>), not in your
        customer security database. Sensitive parameters are redacted before the row is written.
      </p>
    </div>
  );
}
