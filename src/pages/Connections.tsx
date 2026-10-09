import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Database, Plus, ShieldCheck, AlertTriangle, Loader2, Trash2, Zap, Info, ArrowLeft, ArrowRight } from "lucide-react";
import DocLink from "@/components/DocLink";
import QuickConnectDatabase from "@/components/QuickConnectDatabase";
import SecurityDbSetupModal from "@/components/SecurityDbSetupModal";
import { PageHeader, Card, CollapsibleCard, StatusBadge, Modal, EmptyState } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { timeAgo, cx, humanize } from "@/lib/utils";

export default function Connections() {
  const {
    state, testConnection, bootstrapConnection, deleteConnection, operate, securityDbReady,
    toast, requireDualControl, refreshConnections, hydrateSession,
  } = useStore();
  const [createOpen, setCreateOpen] = useState(false);
  // A security database just added: walk through test → prepare → continue.
  const [setupId, setSetupId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<{ db_type: string; live: boolean; note?: string }[]>([]);
  const [optionHints, setOptionHints] = useState<any>(null);
  const [params] = useSearchParams();
  const fromQuickScan = params.get("from") === "quick-scan";

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

  /** Dual control must be set up before managing DB connections. */
  const guard = async () => {
    if (state.dualControl.policy_mode === "off") return true;
    if (!state.dualControl.configured) {
      toast("warning", "Audit control required", "Set up audit control on the People page before you manage database connections.");
      return false;
    }
    if (operate.unlocked) return true;
    return requireDualControl("Manage security database connections requires a dual-control operate session.");
  };

  return (
    <div>
      <PageHeader
        title="Security database"
        description="Bring your own dedicated database. This is the bootstrap gate for scans, VAPT and findings. A config-inspection connection reads security metadata only, never business rows."
        actions={
          <>
            <DocLink docId="howto-platform-06" label="Connections how-to" />
            <button className="btn-primary" onClick={async () => { if (await guard()) setCreateOpen(true); }}>
              <Plus size={15} /> Add connection
            </button>
          </>
        }
      />

      {/* Gate banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cx(
          "mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3",
          securityDbReady ? "border-emerald-400/25 bg-emerald-400/5" : "border-severity-medium/30 bg-severity-medium/8",
        )}
      >
        {securityDbReady ? <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-severity-medium" />}
        <p className="text-xs leading-5 text-slate-400">
          {securityDbReady ? (
            <><strong className="text-emerald-300">Bootstrap gate: ready.</strong> The primary security store is connected --- scans, VAPT and findings are unblocked.</>
          ) : (
            <><strong className="text-severity-medium">Not connected yet.</strong> Full scans, VAPT and saved findings need a security database. Quick Scans work without one.</>
          )}
        </p>
        {securityDbReady && fromQuickScan && (
          <Link to="/get-started" className="btn-primary ml-auto shrink-0 !py-1.5 text-xs">
            Back to your Quick Scan <ArrowRight size={13} />
          </Link>
        )}
      </motion.div>

      {!securityDbReady && (
        <QuickConnectDatabase guard={guard} onManual={async () => { if (await guard()) setCreateOpen(true); }} onCreated={setSetupId} />
      )}

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

      {state.connections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Database size={22} />}
            title="No connections yet"
            body="Register your dedicated security database (PostgreSQL recommended). Credentials are stored encrypted."
            action={<button className="btn-primary" onClick={async () => { if (await guard()) setCreateOpen(true); }}><Plus size={15} /> Add the first connection</button>}
          />
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
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
        </motion.div>
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

      <CreateConnectionModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={setSetupId} />
      <SecurityDbSetupModal connectionId={setupId} onClose={() => setSetupId(null)} />
    </div>
  );
}

const PURPOSES = [
  { value: "security_data_storage", name: "Security database", icon: ShieldCheck, desc: "SecureGraph stores your findings, assets and evidence here, in its own dedicated schema on a PostgreSQL database. Your organization's primary connection." },
  { value: "config_inspection", name: "Config inspection", icon: Info, desc: "SecureGraph checks this database's security settings, such as roles, privileges and policies, read-only. It never reads your business data." },
] as const;
type Purpose = (typeof PURPOSES)[number]["value"];

const ENGINES = [
  { value: "postgresql", name: "PostgreSQL", port: 5432, desc: "Open-source relational database, including Supabase, Neon, Amazon RDS and Azure Database for PostgreSQL." },
  { value: "mysql", name: "MySQL or MariaDB", port: 3306, desc: "Widely used relational database, including Amazon Aurora MySQL and PlanetScale." },
  { value: "mssql", name: "Microsoft SQL Server", port: 1433, desc: "Microsoft's relational database, including Azure SQL Database." },
  { value: "mongodb", name: "MongoDB", port: 27017, desc: "Document database that stores JSON-like records, including MongoDB Atlas." },
] as const;
type Engine = (typeof ENGINES)[number];

function CreateConnectionModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { createConnection, toast, state, requireDualControl, operate } = useStore();
  const [busy, setBusy] = useState(false);
  // Step 1 picks what the database is for, step 2 its type; the details form
  // only shows once both are chosen.
  const [engine, setEngine] = useState<Engine | null>(null);
  React.useEffect(() => { if (open) { setEngine(null); setPurpose(null); } }, [open]);
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [resolvingHost, setResolvingHost] = useState<string | null>(null);

  const resolveHost = async (host: string): Promise<string> => {
    // Skip if already an IP address
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return host;
    setResolvingHost(host);
    try {
      const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`);
      const data = await res.json();
      if (data.Answer?.length > 0) {
        const ipv4 = data.Answer.find((a: any) => a.type === 1)?.data;
        if (ipv4) {
          toast("info", "DNS resolved", `${host} → ${ipv4}`);
          return ipv4;
        }
      }
      // No A record found --- pass original host (backend may handle it)
      toast("warning", "No IPv4 record", `${host} could not be resolved. SecureGraph passes it as is`);
      return host;
    } catch {
      toast("warning", "DNS lookup failed", `Could not resolve ${host}. SecureGraph passes it as is`);
      return host;
    } finally {
      setResolvingHost(null);
    }
  };

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
                  setPurpose(p.value);
                  // The security database is always PostgreSQL, so it skips the type step.
                  if (p.value === "security_data_storage") setEngine(ENGINES[0]);
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
      <form
        key={`${engine.value}-${purpose}`}
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          // Capture the form element synchronously: React nulls ``e.currentTarget``
          // once this async handler awaits, so ``new FormData(e.currentTarget)``
          // threw "parameter 1 is not of type 'HTMLFormElement'" after dual-control.
          const form = e.currentTarget;
          // Enforce dual control (solo mode has none to enforce)
          if (state.dualControl.policy_mode !== "off" && !state.dualControl.configured) {
            toast("warning", "Audit control required", "Set up the audit controller on the People page first.");
            return;
          }
          if (state.dualControl.configured && !operate.unlocked) {
            const ok = await requireDualControl("Managing security database connections requires a dual-control operate session.");
            if (!ok) return;
          }
          const f = new FormData(form);
          setBusy(true);
          try {
            let host = String(f.get("host")).trim();
            host = await resolveHost(host);
            const id = await createConnection({
              name: String(f.get("name")),
              connection_purpose: purpose,
              db_type: String(f.get("db_type")),
              host,
              port: Number(f.get("port")),
              database_name: String(f.get("database_name")),
              target_schema: String(f.get("target_schema")) || "phantix",
              is_primary: purpose === "security_data_storage",
              username: String(f.get("username") || ""),
              password: String(f.get("password") || ""),
              ssl_mode: String(f.get("ssl_mode") || "prefer"),
              environment: String(f.get("environment") || "production"),
            });
            onClose();
            toast("success", "Connection saved", "Credentials stored encrypted.");
            // A security database goes straight into test → prepare → continue.
            if (id && purpose === "security_data_storage") onCreated(id);
          } catch (err) {
            toast("error", "Could not save connection", err instanceof Error ? err.message : "Request failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {purpose === "security_data_storage" ? (
          <button type="button" onClick={() => { setPurpose(null); setEngine(null); }} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
            <ArrowLeft size={14} /> Change what this database is for
          </button>
        ) : (
          <button type="button" onClick={() => setEngine(null)} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
            <ArrowLeft size={14} /> Choose a different database type
          </button>
        )}
        <input type="hidden" name="db_type" value={engine.value} />
        {/* One column on phones (two cramped host/database values); two from sm up. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Name</label>
            <input name="name" className="input" placeholder="SecureGraph Store" required />
          </div>
          <div>
            <label className="label">Host</label>
            <input name="host" className="input font-mono" placeholder="10.20.0.14 or db.example.com" required />
            {resolvingHost && <p className="text-[12px] text-phantix-400 mt-1 animate-pulse-soft">Resolving {resolvingHost} → IPv4...</p>}
            <p className="text-[12px] text-slate-500 mt-0.5">DNS resolves hostnames to IPv4 automatically before the connection starts</p>
          </div>
          <div>
            <label className="label">Port</label>
            <input name="port" type="number" className="input font-mono" placeholder={String(engine.port)} required />
          </div>
          <div>
            <label className="label">Database</label>
            <input name="database_name" className="input font-mono" placeholder="phantix_security" required />
          </div>
          <div>
            <label className="label">Target schema</label>
            <input name="target_schema" className="input font-mono" placeholder="phantix" />
          </div>
          <div>
            <label className="label">Username</label>
            <input name="username" className="input font-mono" placeholder="phantix_writer" required />
          </div>
          <div>
            <label className="label">Password</label>
            <input name="password" type="password" className="input" placeholder="••••••••" required />
          </div>
          <div>
            <label className="label">SSL mode</label>
            <select name="ssl_mode" className="input">
              <option value="prefer">prefer</option>
              <option value="require">require</option>
              <option value="disable">disable</option>
            </select>
          </div>
          <div>
            <label className="label">Environment</label>
            <select name="environment" className="input">
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
            </select>
          </div>
        </div>
        <div className="rounded-md border border-phantix-700/50 bg-phantix-950/50 p-3.5 text-xs leading-5 text-slate-500">
          Least privilege: SecureGraph only needs access to its own dedicated schema, never your application
          tables.
        </div>
        <button className="btn-primary w-full" disabled={busy}>{resolvingHost ? "Resolving DNS..." : busy ? "Saving..." : "Save connection"}</button>
      </form>
      )}
    </Modal>
  );
}
