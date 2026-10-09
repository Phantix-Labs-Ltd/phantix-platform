import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Database, Plus, ShieldCheck, Loader2, Trash2, Zap, Info, ArrowLeft, ArrowRight } from "lucide-react";
import DocLink from "@/components/DocLink";
import ConnectionForm, { ENGINES, PURPOSES, type Engine, type Purpose } from "@/components/ConnectionForm";
import ConnectorsCard from "@/components/ConnectorsCard";
import ConnectorInstallGuide from "@/components/ConnectorInstallGuide";
import AllowlistDriftBanner from "@/components/AllowlistDriftBanner";
import { listConnectors, type Connector } from "@/lib/connectors";
import { PageHeader, Card, CollapsibleCard, StatusBadge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { useConnectionGuard } from "@/lib/useConnectionGuard";
import { timeAgo, cx, humanize } from "@/lib/utils";

/**
 * Security database. Until one is connected and prepared there is one thing to
 * do, so the page offers only that: the guided journey (/connections/new).
 * Once it is ready the page manages connections, connectors and drivers.
 */
export default function Connections() {
  const { state, securityDbReady, refreshConnections } = useStore();
  const guard = useConnectionGuard();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  // Connector to preselect when the connection form opens from a connector.
  const [presetConnector, setPresetConnector] = useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    void listConnectors()
      .then((list) => { if (alive) setConnectors(list); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const [drivers, setDrivers] = useState<{ db_type: string; live: boolean; note?: string }[]>([]);
  const [optionHints, setOptionHints] = useState<any>(null);
  const [params] = useSearchParams();
  const fromQuickScan = params.get("from") === "quick-scan";
  const journeyQs = fromQuickScan ? "?from=quick-scan" : "";

  React.useEffect(() => {
    if (!DEMO_MODE) {
      void refreshConnections();
      api.get<any>("/db-connections/drivers")
        .then((r) => {
          const items = Array.isArray(r) ? r : (r?.items ?? []);
          setDrivers(items.map((d: any) => ({ db_type: String(d.db_type ?? d.engine ?? ""), live: Boolean(d.live ?? d.live_probe ?? d.installed ?? false), note: d.note ? String(d.note) : undefined })));
        })
        .catch(() => { /* keep empty */ });
      api.get<any>("/db-connections/connection-option-hints")
        .then((r) => setOptionHints(r))
        .catch(() => { /* optional reference */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A security database saved earlier but not prepared yet: finish that one.
  const unfinished = state.connections.find((c) => c.connection_purpose === "security_data_storage" && c.bootstrap_status !== "ready") || null;

  if (!securityDbReady) {
    return (
      <div>
        <PageHeader
          title="Security database"
          description="Your findings, assets and evidence live in a database you own. Scans, VAPT and saved findings need it; Quick Scans work without one."
          actions={<DocLink docId="howto-platform-06" label="Connections how-to" />}
        />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold-400/10 blur-[70px]" />
            <div className="relative flex flex-wrap items-center gap-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gold-400/15 text-gold-400">
                <Database size={22} />
              </span>
              <div className="min-w-[14rem] flex-1">
                <p className="font-display text-lg font-bold text-white">
                  {unfinished ? `Finish setting up ${unfinished.name}` : "Connect your security database"}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {unfinished
                    ? "It is saved but not prepared yet. Test it and let SecureGraph create its schema."
                    : "A few guided steps: where it runs, how SecureGraph reaches it, then the database itself."}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary w-full justify-center sm:w-auto"
                onClick={() => navigate(unfinished ? `/connections/new/prepare/${unfinished.id}${journeyQs}` : `/connections/new${journeyQs}`)}
              >
                {unfinished ? "Finish setup" : "Connect database"} <ArrowRight size={15} />
              </button>
            </div>
            {unfinished && (
              <Link to={`/connections/new${journeyQs}`} className="relative mt-4 inline-block text-[13px] text-slate-400 hover:text-slate-200">
                Connect a different database instead
              </Link>
            )}
          </Card>
        </motion.div>

        {/* What was added before, kept out of the way of the one action above. */}
        {state.connections.length > 0 && (
          <CollapsibleCard className="mt-5" title={`Existing connections (${state.connections.length})`} defaultOpen={false}>
            <ConnectionsTable guard={guard} />
          </CollapsibleCard>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Security database"
        description="Bring your own dedicated database. This is the bootstrap gate for scans, VAPT and findings. A config-inspection connection reads security metadata only, never business rows."
        actions={
          <>
            <DocLink docId="howto-platform-06" label="Connections how-to" />
            <button className="btn-primary" onClick={async () => { if (await guard()) setCreateOpen(true); }}>
              <Plus size={15} /> Add another connection
            </button>
          </>
        }
      />

      {/* Gate banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-3"
      >
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
        <p className="text-xs leading-5 text-slate-400">
          <strong className="text-emerald-300">Bootstrap gate: ready.</strong> The primary security store is connected. Scans, VAPT and findings are unblocked.
        </p>
        {fromQuickScan && (
          <Link to="/get-started" className="btn-primary ml-auto shrink-0 !py-1.5 text-xs">
            Back to your Quick Scan <ArrowRight size={13} />
          </Link>
        )}
      </motion.div>

      <AllowlistDriftBanner manage />

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <ConnectionsTable guard={guard} />
      </motion.div>

      <ConnectorsCard
        guard={guard}
        onChange={setConnectors}
        onAddDatabase={async (id) => { if (await guard()) { setPresetConnector(id); setCreateOpen(true); } }}
      />
      <CollapsibleCard
        className="mb-5"
        title="Connector installation procedure"
        subtitle="Docker, Docker Compose or Kubernetes, with prerequisites and troubleshooting"
        defaultOpen={false}
      >
        <ConnectorInstallGuide />
      </CollapsibleCard>

      {optionHints?.by_db_type && (
        <CollapsibleCard
          className="mb-5"
          title="Connection options"
          subtitle="Engine-specific options beyond username and password"
          action={<Info size={16} className="text-slate-400" />}
          defaultOpen={false}
        >
          {optionHints.note && <p className="text-xs leading-5 text-slate-400">{optionHints.note}</p>}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(optionHints.by_db_type).map(([engine, opts]) => (
              <div key={engine} className="rounded-md border border-phantix-700/40 bg-phantix-950/40 p-2">
                <p className="text-xs font-semibold capitalize text-slate-200">{engine}</p>
                <p className="mt-1 break-words font-mono text-[12px] leading-4 text-slate-500">
                  {Array.isArray(opts) ? opts.join(", ") : typeof opts === "object" ? Object.keys(opts as object).join(", ") : String(opts)}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Driver availability */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-6">
        <CollapsibleCard defaultOpen={false} title="Driver availability for your engine" action={<Info size={14} className="text-gold-400" />}>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const list = DEMO_MODE
                ? [["postgresql or supabase", true], ["sqlite", true], ["mysql or mariadb", true], ["mssql", false], ["mongodb", false], ["firestore", false]] as [string, boolean][]
                : drivers.length
                  ? drivers.map((d) => [d.db_type, d.live] as [string, boolean])
                  : [["loading drivers...", false] as [string, boolean]];
              return list.map(([name, ok]) => (
                <span key={String(name)} className={cx("chip", ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-phantix-700/50 bg-phantix-900/50 text-slate-500")}>
                  {String(name)} {ok ? "· live" : "· optional"}
                </span>
              ));
            })()}
          </div>
          <p className="mt-3 text-[13px] leading-4 text-slate-500">
            Credentials can be stored encrypted without the optional driver; live tests need the package. Connections
            need more than a username and password. See connection-option-hints: ssl_mode, search_path, odbc_driver.
          </p>
        </CollapsibleCard>
      </motion.div>

      <CreateConnectionModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setPresetConnector(null); }}
        onSecurityDbCreated={(id) => navigate(`/connections/new/prepare/${id}${journeyQs}`)}
        onStartJourney={() => navigate(`/connections/new${journeyQs}`)}
        connectors={connectors}
        presetConnector={presetConnector}
      />
    </div>
  );
}

/** Every connection with its test, prepare and delete actions. */
function ConnectionsTable({ guard }: { guard: () => Promise<boolean> }) {
  const { state, testConnection, bootstrapConnection, deleteConnection, toast } = useStore();
  const [busyId, setBusyId] = useState<number | null>(null);

  if (state.connections.length === 0) {
    return <p className="text-sm text-slate-500">No connections yet.</p>;
  }
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-phantix-700/40">
              <th className="th">Name</th>
              <th className="th">Engine</th>
              <th className="th">Host:Port · DB</th>
              <th className="th">Purpose</th>
              <th className="th">Last test</th>
              <th className="th">Status</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {state.connections.map((c) => (
              <tr key={c.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", c.bootstrap_status === "ready" ? "bg-emerald-400/12 text-emerald-400" : "bg-phantix-800/70 text-phantix-300")}>
                      <Database size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="font-medium text-slate-100">{c.name}</span>
                        {c.is_primary && <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300">primary</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="td font-mono text-xs text-slate-400">{c.db_type}</td>
                <td className="td whitespace-nowrap font-mono text-xs text-slate-500">{c.host}:{c.port}/{c.database_name}</td>
                <td
                  className="td whitespace-nowrap text-[13px] text-slate-400"
                  title={c.connection_purpose === "security_data_storage" ? "Own dedicated schema" : "Roles, privileges, policies"}
                >
                  {humanize(c.connection_purpose)}
                </td>
                <td className="td whitespace-nowrap text-xs text-slate-500">
                  {c.last_test_at ? `${c.last_test_ok ? "passed" : "failed"} ${timeAgo(c.last_test_at)}` : "Not set"}
                </td>
                <td className="td"><StatusBadge status={c.bootstrap_status} /></td>
                <td className="td text-right">
                  <div className="flex flex-wrap justify-end items-center gap-1.5">
                    <button
                      className="btn-secondary !px-2.5 !py-1.5 !text-xs"
                      disabled={busyId === c.id}
                      onClick={async () => {
                        if (!(await guard())) return;
                        setBusyId(c.id);
                        try {
                          await testConnection(c.id);
                          toast("success", "Connectivity OK", "Live probe succeeded.");
                        } catch (err) {
                          toast("error", "Test failed", err instanceof Error ? err.message : "Connection test failed");
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Test
                    </button>
                    {c.connection_purpose === "security_data_storage" && c.bootstrap_status !== "ready" && (
                      <button
                        className="btn-primary !px-2.5 !py-1.5 !text-xs"
                        disabled={busyId === c.id}
                        onClick={async () => {
                          if (!(await guard())) return;
                          setBusyId(c.id);
                          try {
                            const boot = await bootstrapConnection(c.id);
                            if (boot?.pending) {
                              toast("info", "Sent for approval", "Schema bootstrap is parked for an authorizer. Approve it from Authorizations to finish.");
                            } else {
                              toast("success", "Schema bootstrapped", "Security database ready: assets, scans, findings, risks, evidence.");
                            }
                          } catch (err) {
                            toast("error", "Bootstrap failed", err instanceof Error ? err.message : "Bootstrap failed");
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : null}
                        Bootstrap schema
                      </button>
                    )}
                    <button
                      className="btn-ghost !p-1.5 text-slate-500 hover:text-severity-critical"
                      aria-label="Delete connection"
                      title="Delete connection"
                      onClick={async () => {
                        if (!(await guard())) return;
                        try {
                          const del = await deleteConnection(c.id);
                          if (del?.pending) {
                            toast("info", "Sent for approval", "Connection removal is parked for an authorizer. Approve it from Authorizations.");
                          } else {
                            toast("info", "Connection deleted");
                          }
                        } catch (err) {
                          toast("error", "Delete failed", err instanceof Error ? err.message : "Delete failed");
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Another connection once the security database is ready: usually a
 * config-inspection connection, in any supported engine. A new security
 * database goes through the guided journey instead, so a hosted one cannot skip
 * the allowlist; only one behind an existing connector is added here.
 */
function CreateConnectionModal({ open, onClose, onSecurityDbCreated, onStartJourney, connectors, presetConnector }: {
  open: boolean;
  onClose: () => void;
  onSecurityDbCreated: (id: number) => void;
  onStartJourney: () => void;
  connectors: Connector[];
  presetConnector?: string | null;
}) {
  // Step 1 picks what the database is for, step 2 its type; the details form
  // only shows once both are chosen.
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  React.useEffect(() => {
    if (!open) return;
    if (presetConnector) {
      // Opened from a connector: a PostgreSQL security database behind it.
      setPurpose("security_data_storage");
      setEngine(ENGINES[0]);
    } else {
      setEngine(null); setPurpose(null);
    }
  }, [open, presetConnector]);

  return (
    <Modal open={open} onClose={onClose} title={purpose && engine ? `Add ${engine.name} ${purpose === "security_data_storage" ? "security database" : "config inspection connection"}` : "Add database connection"} wide>
      {!purpose ? (
        <div>
          <p className="text-sm text-slate-400">What should SecureGraph use this database for?</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PURPOSES.map((p) => (
              <button
                type="button"
                key={p.value}
                onClick={() => {
                  if (p.value === "security_data_storage") {
                    onClose();
                    onStartJourney();
                    return;
                  }
                  setPurpose(p.value);
                }}
                className="group rounded-md border border-phantix-700/50 bg-phantix-950/40 p-4 text-left transition-all hover:border-gold-400/50 hover:bg-gold-400/5"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <p.icon size={15} className="text-gold-400" /> {p.name}
                  <ArrowRight size={14} className="ml-auto text-slate-600 transition-colors group-hover:text-gold-300" />
                </p>
                <p className="mt-1.5 text-[13px] leading-5 text-slate-500">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ) : !engine ? (
        <div>
          <button type="button" onClick={() => setPurpose(null)} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
            <ArrowLeft size={14} /> Change what this database is for
          </button>
          <p className="mt-3 text-sm text-slate-400">Which type of database are you connecting?</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ENGINES.map((e) => (
              <button
                type="button"
                key={e.value}
                onClick={() => setEngine(e)}
                className="group rounded-md border border-phantix-700/50 bg-phantix-950/40 p-4 text-left transition-all hover:border-gold-400/50 hover:bg-gold-400/5"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Database size={15} className="text-gold-400" /> {e.name}
                  <ArrowRight size={14} className="ml-auto text-slate-600 transition-colors group-hover:text-gold-300" />
                </p>
                <p className="mt-1.5 text-[13px] leading-5 text-slate-500">{e.desc}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ConnectionForm
          purpose={purpose}
          engine={engine}
          connectors={connectors}
          via={presetConnector ? "connector" : undefined}
          connectorId={presetConnector ?? undefined}
          onBack={purpose === "security_data_storage" ? () => { setPurpose(null); setEngine(null); } : () => setEngine(null)}
          backLabel={purpose === "security_data_storage" ? "Change what this database is for" : "Choose a different database type"}
          onSaved={(id) => {
            onClose();
            // A security database goes straight into test → prepare.
            if (id && purpose === "security_data_storage") onSecurityDbCreated(id);
          }}
        />
      )}
    </Modal>
  );
}
