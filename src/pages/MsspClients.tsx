import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Building2, Clock, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { PageHeader, Card, StatusBadge, EmptyState, SkeletonCard } from "@/components/ui";
import { Pagination, usePaged } from "@/components/Pagination";
import { useStore } from "@/lib/store";
import { timeAgo, cx } from "@/lib/utils";
import { useResource } from "@/lib/useResource";
import {
  isFeatureError,
  loadMsspPortfolio,
  refreshMsspPortfolio,
  type MsspPortfolio,
  type MsspPortfolioRow,
} from "@/lib/mssp";

/**
 * MSSP → Clients.
 *
 * Reads the portfolio summary store only. A client row is a handful of numbers
 * (posture, open counts, last scan, data-plane health), never the client's
 * findings — drilling into a client is a separate, logged act. A client that has
 * not reported is shown as such; it is never omitted, because a missing row looks
 * like "no problems".
 */
export default function MsspClients() {
  const { toast } = useStore();
  const EMPTY: MsspPortfolio = {
    clients: [],
    counts: { total: 0, reporting: 0, stale: 0, failing: 0 },
    cap: { max_clients: null, clients_used: 0 },
    read_model: "",
  };
  const [notMssp, setNotMssp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, refresh: reload } = useResource<MsspPortfolio>(async () => {
    try {
      return await loadMsspPortfolio();
    } catch (e) {
      // A standard organization gets 403 organization_feature_required: explain it.
      if (isFeatureError(e)) {
        setNotMssp(true);
        return EMPTY;
      }
      throw e;
    }
  }, EMPTY);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const out = await refreshMsspPortfolio();
      reload();
      toast(
        "success",
        "Snapshots refreshed",
        `${out.refreshed.length} client${out.refreshed.length === 1 ? "" : "s"} updated${
          out.failed.length ? ` · ${out.failed.length} failed` : ""
        }`,
      );
    } catch (e) {
      toast("error", "Refresh failed", e instanceof Error ? e.message : undefined);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Clients" description="Managed client organizations." />
        <SkeletonCard />
        <SkeletonCard className="mt-3" />
      </div>
    );
  }
  if (notMssp) {
    return (
      <div>
        <PageHeader title="Clients" description="Managed client organizations." />
        <EmptyState
          icon={<Building2 size={22} />}
          title="This is an MSSP surface"
          body="Client management is available to organizations registered as an MSSP. Ask your account manager if that should be you."
        />
      </div>
    );
  }
  if (error && !notMssp) {
    return (
      <div>
        <PageHeader title="Clients" description="Managed client organizations." />
        <Card className="flex flex-wrap items-center gap-3">
          <AlertTriangle size={16} className="text-red-300" />
          <p className="flex-1 text-sm text-slate-300">{error}</p>
          <button className="btn-secondary" onClick={reload}>Try again</button>
        </Card>
      </div>
    );
  }
  if (!data) return null;

  const { counts, cap } = data;
  const { pageItems, pagination } = usePaged(data.clients, "mssp-clients", counts.total);
  const capLabel =
    cap.max_clients === null
      ? "No client cap set"
      : `${cap.clients_used}/${cap.max_clients} clients`;

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Your client organizations, from the portfolio summary store. Numbers only — a client's findings stay in that client's own store."
        actions={
          <>
            <button className="btn-secondary" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw size={14} className={cx("mr-1 inline", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh now"}
            </button>
            <span className="chip">{capLabel}</span>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Clients", counts.total, <Users size={15} key="u" />],
            ["Reporting", counts.reporting, <ShieldCheck size={15} key="s" />],
            ["Stale", counts.stale, <Clock size={15} key="c" />],
            ["Not reporting", counts.failing, <AlertTriangle size={15} key="a" />],
          ] as const
        ).map(([label, value, icon]) => (
          <Card key={label} className="!p-3">
            <p className="flex items-center gap-1.5 text-[12px] text-slate-500">{icon}{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-slate-100">{value}</p>
          </Card>
        ))}
      </div>

      {data.clients.length === 0 ? (
        <EmptyState
          icon={<Building2 size={22} />}
          title="No client organizations yet"
          body="Onboard a client from Companies, then refresh to see its first snapshot."
        />
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-phantix-700/50 text-[12px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Client</th>
                <th className="px-3 py-2.5">Posture</th>
                <th className="px-3 py-2.5">Open</th>
                <th className="px-3 py-2.5">Last scan</th>
                <th className="px-3 py-2.5">Data plane</th>
                <th className="px-3 py-2.5">Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <ClientRow key={row.organization_id} row={row} />
              ))}
            </tbody>
          </table>
          <div className="border-t border-phantix-700/40 px-3 py-2">
            <Pagination {...pagination} itemLabel="clients" />
          </div>
        </Card>
      )}

      <p className="mt-3 text-[12px] leading-4 text-slate-600">
        Snapshots refresh on a schedule and are marked stale after six hours. A client
        that cannot be reached is reported with its error rather than dropped.
      </p>
    </div>
  );
}

function ClientRow({ row }: { row: MsspPortfolioRow }) {
  const stateTone =
    row.state === "ready"
      ? row.stale
        ? "warning"
        : "success"
      : row.state === "unknown"
        ? "neutral"
        : "danger";
  const stateLabel =
    row.state === "ready" ? (row.stale ? "Stale" : "Reporting") : row.state.replace(/_/g, " ");
  const badge = stateTone === "success" ? "active" : stateTone === "warning" ? "stale" : stateTone === "danger" ? "failed" : "unknown";

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border-b border-phantix-800/40 last:border-0"
    >
      <td className="px-3 py-2.5">
        <p className="font-medium text-slate-200">{row.name ?? `Client ${row.organization_id}`}</p>
        {row.error && (
          <p className="mt-0.5 max-w-[26rem] truncate text-[12px] text-red-300/80" title={row.error}>
            {row.error}
          </p>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-300">
        {row.posture_score == null ? "—" : Math.round(row.posture_score)}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-slate-200">{row.open_total}</span>
        {row.open_criticals > 0 && (
          <span className="ml-2 text-[12px] text-red-300">{row.open_criticals} critical</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-400">
        {row.last_scan_at ? timeAgo(row.last_scan_at) : "never"}
      </td>
      <td className="px-3 py-2.5 text-slate-400">
        {row.data_plane ?? "—"}
        {row.connector_state === "connector" && (
          <span className="ml-1.5 chip">connector</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={badge} />
        <span className="ml-1.5 text-[11px] text-slate-500">{stateLabel}</span>
        <p className="mt-0.5 text-[11px] text-slate-600">
          {row.refreshed_at ? timeAgo(row.refreshed_at) : "never"}
        </p>
      </td>
    </motion.tr>
  );
}
