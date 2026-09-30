import React, { useState } from "react";
import { motion } from "framer-motion";
import { Database, Plus, ShieldCheck, AlertTriangle, Loader2, Trash2, Zap, Info } from "lucide-react";
import DocLink from "@/components/DocLink";
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
  const [busyId, setBusyId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<{ db_type: string; live: boolean; note?: string }[]>([]);
  const [optionHints, setOptionHints] = useState<any>(null);

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
            <><strong className="text-severity-medium">Bootstrap gate: blocked.</strong> Create a security_data_storage connection, test it, then bootstrap. Until then the platform refuses scans and VAPT --- this is not just a UI state.</>
          )}
        </p>
      </motion.div>

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

      <CreateConnectionModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateConnectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createConnection, toast, state, requireDualControl, operate } = useStore();
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState<"security_data_storage" | "config_inspection">("security_data_storage");
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
    <Modal open={open} onClose={onClose} title="Add database connection" wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          // Enforce dual control
          if (!state.dualControl.configured) {
            toast("warning", "Audit control required", "Set up the audit controller on the People page first.");
            return;
          }
          if (state.dualControl.configured && !operate.unlocked) {
            const ok = await requireDualControl("Managing security database connections requires a dual-control operate session.");
            if (!ok) return;
          }
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            let host = String(f.get("host")).trim();
            host = await resolveHost(host);
            await createConnection({
              name: String(f.get("name")),
              connection_purpose: purpose,
              db_type: String(f.get("db_type")),
              host: String(f.get("host")),
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
            toast("success", "Connection saved", "Credentials stored encrypted. Next: test, then prepare the security database.");
          } catch (err) {
            toast("error", "Could not save connection", err instanceof Error ? err.message : "Request failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Name</label>
            <input name="name" className="input" defaultValue="SecureGraph Store" required />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            {([
              ["security_data_storage", "Security data storage", "SecureGraph writes findings, assets and evidence to its own dedicated schema"],
              ["config_inspection", "Config inspection", "Read-only security posture, never business rows"],
            ] as const).map(([v, label, desc]) => (
              <button
                type="button"
                key={v}
                onClick={() => setPurpose(v)}
                className={cx("rounded-md border p-3.5 text-left transition-all", purpose === v ? "border-gold-400/60 bg-gold-400/8" : "border-phantix-700/50 bg-phantix-950/40 hover:border-phantix-500/50")}
              >
                <p className="text-sm font-semibold text-slate-200">{label}</p>
                <p className="mt-1 text-[13px] leading-4 text-slate-500">{desc}</p>
              </button>
            ))}
          </div>
          <div>
            <label className="label">Engine</label>
            <select name="db_type" className="input">
              <option value="postgresql">postgresql</option>
              <option value="mysql">mysql</option>
              <option value="mssql">mssql</option>
              <option value="mongodb">mongodb</option>
            </select>
          </div>
          <div>
            <label className="label">Host</label>
            <input name="host" className="input font-mono" placeholder="10.20.0.14 or db.example.com" required />
            {resolvingHost && <p className="text-[12px] text-phantix-400 mt-1 animate-pulse-soft">Resolving {resolvingHost} → IPv4...</p>}
            <p className="text-[12px] text-slate-500 mt-0.5">DNS resolves hostnames to IPv4 automatically before the connection starts</p>
          </div>
          <div>
            <label className="label">Port</label>
            <input name="port" type="number" className="input font-mono" defaultValue={5432} required />
          </div>
          <div>
            <label className="label">Database</label>
            <input name="database_name" className="input font-mono" defaultValue="phantix_security" required />
          </div>
          <div>
            <label className="label">Target schema</label>
            <input name="target_schema" className="input font-mono" defaultValue="phantix" />
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
    </Modal>
  );
}
