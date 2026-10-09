import React, { useMemo, useState } from "react";
import { CheckCircle2, Database, ExternalLink, Loader2, PenLine } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

type Provider = "neon" | "supabase" | "other";

const PROVIDERS: { id: Provider; name: string; signup?: string; steps: string[] }[] = [
  {
    id: "neon",
    name: "Neon",
    signup: "https://console.neon.tech/signup",
    steps: ["Create a free project.", "On the project dashboard, select Connect.", "Copy the connection string and paste it below."],
  },
  {
    id: "supabase",
    name: "Supabase",
    signup: "https://supabase.com/dashboard/sign-up",
    steps: ["Create a free project and set a database password.", "Select Connect at the top of the project.", "Copy the Session pooler URI, put your password in it, and paste it below."],
  },
  {
    id: "other",
    name: "Other PostgreSQL",
    steps: ["Create an empty database and a user that owns it.", "Make sure SecureGraph can reach it over TLS.", "Paste its postgresql:// URL below."],
  },
];

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
 * Two-minute path to a security database: pick a provider, paste its URL, and
 * SecureGraph saves, tests and prepares it in one go. The host is kept as a
 * name (not resolved to an IP) because Neon and Supabase route by hostname.
 */
export default function QuickConnectDatabase({ guard, onManual }: { guard: () => Promise<boolean>; onManual: () => void }) {
  const { createConnection, testConnection, toast, markMilestone } = useStore();
  const [provider, setProvider] = useState<Provider>("neon");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<null | "saving" | "testing">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const parsed = useMemo(() => parsePostgresUrl(url), [url]);
  const active = PROVIDERS.find((p) => p.id === provider)!;

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!parsed) return setError("Paste a URL that starts with postgresql://");
    if (!parsed.password) return setError("The URL has no password. Put your database password in it.");
    if (!(await guard())) return;
    setBusy("saving");
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
      if (id) {
        setBusy("testing");
        await testConnection(id);
      }
      setUrl("");
      setDone(true);
      void markMilestone("security_db_connected");
      toast("success", "Security database connected", "It's ready for scans and findings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect. Check the URL and that the database accepts connections.");
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <Card className="mb-5">
        <p className="flex items-center gap-2.5 text-sm text-emerald-300">
          <CheckCircle2 size={16} /> Connected and prepared. Your findings will be stored here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-5">
      <CardHeader
        title="Connect in about two minutes"
        subtitle="Your findings live in a database you own. A free Neon or Supabase project is enough to start."
        action={<Database size={16} className="text-slate-400" />}
      />
      <div role="tablist" aria-label="Database provider" className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={provider === p.id}
            onClick={() => setProvider(p.id)}
            className={cx(
              "rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors",
              provider === p.id ? "border-gold-400/50 bg-gold-400/10 text-white" : "border-phantix-700/50 text-slate-400 hover:text-slate-200",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-400">
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
          <button className="btn-primary" disabled={!!busy || !url.trim()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
            {busy === "saving" ? "Saving..." : busy === "testing" ? "Testing and preparing..." : "Connect"}
          </button>
          <button type="button" onClick={onManual} className="btn-alt">
            <PenLine size={15} /> Enter details manually
          </button>
        </div>
        <p className="text-[12px] text-slate-500">Credentials are stored encrypted. SecureGraph only writes to its own schema.</p>
      </form>
    </Card>
  );
}
