import React, { useState } from "react";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Connector } from "@/lib/connectors";
import { cx } from "@/lib/utils";

export const PURPOSES = [
  { value: "security_data_storage", name: "Security database", icon: ShieldCheck, desc: "SecureGraph stores your findings, assets and evidence here, in its own dedicated schema on a PostgreSQL database. Your organization's primary connection." },
  { value: "config_inspection", name: "Config inspection", icon: Info, desc: "SecureGraph checks this database's security settings, such as roles, privileges and policies, read-only. It never reads your business data." },
] as const;
export type Purpose = (typeof PURPOSES)[number]["value"];

export const ENGINES = [
  { value: "postgresql", name: "PostgreSQL", port: 5432, desc: "Open-source relational database, including Supabase, Neon, Amazon RDS and Azure Database for PostgreSQL." },
  { value: "mysql", name: "MySQL or MariaDB", port: 3306, desc: "Widely used relational database, including Amazon Aurora MySQL and PlanetScale." },
  { value: "mssql", name: "Microsoft SQL Server", port: 1433, desc: "Microsoft's relational database, including Azure SQL Database." },
  { value: "mongodb", name: "MongoDB", port: 27017, desc: "Document database that stores JSON-like records, including MongoDB Atlas." },
] as const;
export type Engine = (typeof ENGINES)[number];

type Via = "direct" | "connector";

/**
 * The details of one database connection: address, credentials, TLS. How
 * SecureGraph reaches it (directly or through a connector) is asked here only
 * when the caller has not already decided it (`via` given = fixed).
 */
export default function ConnectionForm({
  purpose, engine, connectors, via: fixedVia, connectorId: fixedConnectorId, onBack, backLabel, onSaved,
}: {
  purpose: Purpose;
  engine: Engine;
  connectors: Connector[];
  via?: Via;
  connectorId?: string;
  onBack?: () => void;
  backLabel?: string;
  onSaved: (id: number | null) => void;
}) {
  const { createConnection, toast, state, requireDualControl, operate } = useStore();
  const [busy, setBusy] = useState(false);
  // How SecureGraph reaches the database: directly, or through a connector on
  // the organization's private network (PostgreSQL only for now).
  const [via, setVia] = useState<Via>(fixedVia ?? "direct");
  const [connectorId, setConnectorId] = useState(fixedConnectorId ?? "");
  const usable = connectors.filter((c) => c.status !== "revoked");
  const [resolvingHost, setResolvingHost] = useState<string | null>(null);
  const throughConnector = via === "connector" && engine.value === "postgresql";

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
          if (throughConnector && !connectorId) {
            toast("warning", "Choose a connector", "Pick the connector this database is reached through.");
            setBusy(false);
            return;
          }
          let host = String(f.get("host")).trim();
          // A host behind a connector is a private name or address: never look it up publicly.
          if (!throughConnector) host = await resolveHost(host);
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
            network_mode: throughConnector ? "connector" : "direct",
            connector_id: throughConnector ? connectorId : null,
            environment: String(f.get("environment") || "production"),
          });
          toast("success", "Connection saved", "Credentials stored encrypted.");
          onSaved(id);
        } catch (err) {
          toast("error", "Could not save connection", err instanceof Error ? err.message : "Request failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft size={14} /> {backLabel ?? "Back"}
        </button>
      )}
      <input type="hidden" name="db_type" value={engine.value} />
      {/* One column on phones (two cramped host/database values); two from sm up. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input name="name" className="input" placeholder="SecureGraph Store" required />
        </div>
        {engine.value === "postgresql" && !fixedVia && (
          <div className="sm:col-span-2">
            <p className="label">How does SecureGraph reach this database?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                ["direct", "Directly", "It has a public endpoint, such as Neon or Supabase."],
                ["connector", "Through a connector", "It is on a private network. Nothing is opened inbound."],
              ] as const).map(([v, label, desc]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVia(v)}
                  aria-pressed={via === v}
                  className={cx("rounded-md border p-3 text-left transition-colors", via === v ? "border-gold-400/60 bg-gold-400/[0.06]" : "border-phantix-700/50 hover:border-phantix-500/50")}
                >
                  <p className="text-sm font-semibold text-slate-100">{label}</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">{desc}</p>
                </button>
              ))}
            </div>
            {via === "connector" && (
              usable.length ? (
                <select className="input mt-2" value={connectorId} onChange={(e) => setConnectorId(e.target.value)} required>
                  <option value="">Choose a connector</option>
                  {usable.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.status === "online" ? " (online)" : ` (${c.status})`}</option>
                  ))}
                </select>
              ) : (
                <p className="mt-2 text-[13px] text-severity-medium">No connectors yet. Close this and use Add connector under Connectors first.</p>
              )
            )}
          </div>
        )}
        <div>
          <label className="label">{throughConnector ? "Host, as the connector sees it" : "Host"}</label>
          <input name="host" className="input font-mono" placeholder={throughConnector ? "10.0.3.12 or db.internal" : "10.20.0.14 or db.example.com"} required />
          {resolvingHost && <p className="text-[12px] text-phantix-400 mt-1 animate-pulse-soft">Resolving {resolvingHost} → IPv4...</p>}
          <p className="text-[12px] text-slate-500 mt-0.5">
            {throughConnector
              ? "The connector connects to this address on your network. It must be in the connector's SG_ALLOWED_TARGETS."
              : "DNS resolves hostnames to IPv4 automatically before the connection starts"}
          </p>
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
  );
}
