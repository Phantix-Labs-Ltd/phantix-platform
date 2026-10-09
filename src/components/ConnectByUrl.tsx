import React, { useMemo, useState } from "react";
import { Database, ExternalLink, Loader2, PenLine } from "lucide-react";
import { useStore } from "@/lib/store";

export type Provider = "neon" | "supabase" | "other";

export const PROVIDERS: { id: Provider; name: string; blurb: string; signup?: string; steps: string[] }[] = [
  {
    id: "neon",
    name: "Neon",
    blurb: "Serverless PostgreSQL. A free project is enough to start.",
    signup: "https://console.neon.tech/signup",
    steps: ["Create a free project.", "On the project dashboard, select Connect.", "Copy the connection string and paste it below."],
  },
  {
    id: "supabase",
    name: "Supabase",
    blurb: "PostgreSQL with a free tier. Connect through the Session pooler.",
    signup: "https://supabase.com/dashboard/sign-up",
    steps: ["Create a free project and set a database password.", "Select Connect at the top of the project.", "Copy the Session pooler URI, put your password in it, and paste it below."],
  },
  {
    id: "other",
    name: "Other PostgreSQL",
    blurb: "Amazon RDS, Azure, Google Cloud SQL or your own server with a public endpoint.",
    steps: ["Create an empty database and a user that owns it.", "Make sure SecureGraph can reach it over TLS.", "Paste its postgresql:// URL below."],
  },
];

export const isProvider = (v: string | undefined): v is Provider => v === "neon" || v === "supabase" || v === "other";

export type ParsedPgUrl = { host: string; port: number; database: string; username: string; password: string; sslMode: string };

/** Parse a postgres:// or postgresql:// URL; null when it is not one. */
export function parsePostgresUrl(raw: string): ParsedPgUrl | null {
  const value = raw.trim().replace(/^psql\s+/, "").replace(/^['"]|['"]$/g, "");
  if (!/^postgres(ql)?:\/\//i.test(value)) return null;
  try {
    const u = new URL(value);
    const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!u.hostname || !database) return null;
    return {
      host: u.hostname,
      port: Number(u.port) || 5432,
      database,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      sslMode: u.searchParams.get("sslmode") || "require",
    };
  } catch {
    return null;
  }
}

const providerFromHost = (host: string): Provider =>
  /neon\.tech$/i.test(host) ? "neon" : /supabase\.(co|com)$/i.test(host) ? "supabase" : "other";

/**
 * Paste a provider's connection URL: SecureGraph saves it as the primary
 * security database, then the caller walks it through test and prepare. The
 * host is kept as a name (not resolved to an IP) because Neon and Supabase
 * route by hostname.
 */
export default function ConnectByUrl({ provider, guard, onManual, onCreated }: {
  provider: Provider;
  guard: () => Promise<boolean>;
  onManual: () => void;
  onCreated: (id: number) => void;
}) {
  const { createConnection, toast } = useStore();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => parsePostgresUrl(url), [url]);
  const active = PROVIDERS.find((p) => p.id === provider)!;

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!parsed) return setError("Paste a URL that starts with postgresql://");
    if (!parsed.password) return setError("The URL has no password. Put your database password in it.");
    if (!(await guard())) return;
    setBusy(true);
    try {
      const id = await createConnection({
        name: `${PROVIDERS.find((p) => p.id === providerFromHost(parsed.host))!.name} security store`,
        connection_purpose: "security_data_storage",
        db_type: "postgresql",
        host: parsed.host,
        port: parsed.port,
        database_name: parsed.database,
        target_schema: "phantix",
        is_primary: true,
        username: parsed.username,
        password: parsed.password,
        ssl_mode: parsed.sslMode,
        environment: "production",
      });
      setUrl("");
      toast("success", "Security database saved", "Next, test it and prepare it.");
      if (id) onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect. Check the URL and that the database accepts connections.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-400">
        {active.signup && (
          <li>
            <a href={active.signup} target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-300">
              Open {active.name} <ExternalLink size={12} className="inline" />
            </a>{" "}
            and sign in or create an account.
          </li>
        )}
        {active.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>

      <form onSubmit={connect} className="mt-5 space-y-3">
        <div>
          <label className="label" htmlFor="qc-url">Connection URL</label>
          <input
            id="qc-url"
            className="input font-mono text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="postgresql://user:password@host/dbname?sslmode=require"
            autoComplete="off"
            spellCheck={false}
          />
          {parsed && (
            <p className="mt-1.5 break-all font-mono text-[12px] text-slate-500">
              {parsed.username || "(no user)"}@{parsed.host}:{parsed.port}/{parsed.database} · ssl {parsed.sslMode}
            </p>
          )}
        </div>
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || !url.trim()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
            {busy ? "Saving..." : "Connect"}
          </button>
          <button type="button" onClick={onManual} className="btn-alt">
            <PenLine size={15} /> Enter details manually
          </button>
        </div>
        <p className="text-[12px] text-slate-500">Credentials are stored encrypted. SecureGraph only writes to its own schema.</p>
      </form>
    </div>
  );
}
