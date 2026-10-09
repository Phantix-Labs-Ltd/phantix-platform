import React, { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { api, ApiError, DEMO_MODE, tokens } from "@/lib/api";
import { cx } from "@/lib/utils";

export type AllowlistProvider = "neon" | "supabase" | "other";

interface Guide { key: string; name: string; steps: string[]; note?: string | null; docs_url?: string | null }
/** The org's last allowlist confirmation (newer backends). */
export interface AllowlistAttestation { provider: string; ips: string[]; attested_at?: string | null }
export interface NetworkAccess {
  available: boolean;
  egress_ips: string[];
  cidrs: string[];
  providers: Guide[];
  note?: string | null;
  attestation?: AllowlistAttestation | null;
  /** Current addresses the last confirmation did not cover (added since). */
  unconfirmed_ips?: string[];
}

const DEMO: NetworkAccess = {
  available: true,
  egress_ips: ["203.0.113.10", "203.0.113.11"],
  cidrs: ["203.0.113.10/32", "203.0.113.11/32"],
  providers: [],
};

/** Steps for any other PostgreSQL host, for a backend that only sends Neon and Supabase. */
const OTHER_GUIDE: Guide = {
  key: "other",
  name: "Other PostgreSQL",
  steps: [
    "Open the firewall, security group or network rules in front of your database.",
    "Allow inbound connections on the database port from each address below, and from nowhere else.",
    "If PostgreSQL itself filters clients (pg_hba.conf), allow the same addresses there.",
  ],
};

let cached: Promise<NetworkAccess> | null = null;
/** The addresses to allowlist, fetched once per page unless `fresh`. */
export function loadNetworkAccess(fresh = false): Promise<NetworkAccess> {
  if (DEMO_MODE) return Promise.resolve(DEMO);
  if (fresh) cached = null;
  cached ??= api.get<NetworkAccess>("/db-connections/network-access").catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

/**
 * Record that the admin allowlisted these addresses. An older backend without
 * the endpoint (404/405) is not a reason to stop: the ticks were still required.
 */
async function attestAllowlist(provider: AllowlistProvider, ips: string[]): Promise<void> {
  if (DEMO_MODE) return;
  try {
    // A write like any connection change: it carries the operate session when there is one.
    await api.post("/db-connections/network-access/attest", { provider, ips }, tokens.dualControl ? { dualControl: true } : undefined);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return;
    throw err;
  }
}

/**
 * The addresses SecureGraph connects from, as a checklist. A hosted database
 * must allow every one of them, so Continue stays locked until each address is
 * ticked; the ticks are then recorded in the audit trail. They are NAT egress
 * addresses, served only to signed-in organizations; no server uses them, so
 * allowlisting them exposes nothing.
 *
 * `confirmed` lists addresses the admin confirmed before: they start ticked, so
 * only addresses added since need ticking.
 */
export default function EgressAllowlist({ provider, onContinue, confirmed, continueLabel = "Continue to add the database" }: {
  provider: AllowlistProvider;
  onContinue: () => void;
  confirmed?: string[];
  continueLabel?: string;
}) {
  const [data, setData] = useState<NetworkAccess | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmedKey = (confirmed ?? []).join(",");
  const load = useCallback((fresh = false) => {
    setLoadError(false);
    setData(null);
    loadNetworkAccess(fresh)
      .then((v) => {
        setData(v);
        // Supabase lists /32 ranges; a confirmed address ticks its range.
        const done = new Set(confirmedKey ? confirmedKey.split(",") : []);
        const list = v.available ? (provider === "supabase" ? v.cidrs : v.egress_ips) : [];
        setTicked(new Set(list.filter((item) => done.has(item.replace(/\/32$/, "")))));
      })
      .catch(() => setLoadError(true));
  }, [provider, confirmedKey]);
  useEffect(() => { load(); }, [load]);

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  };

  // Without the list there is nothing to tick, so the step blocks rather than
  // letting a database through unprotected.
  if (loadError) {
    return (
      <div role="alert" className="rounded-md border border-severity-critical/30 bg-severity-critical/10 p-4">
        <p className="text-sm text-severity-critical">We couldn't load the addresses to allowlist. You need them before you can add the database.</p>
        <button type="button" className="btn-secondary mt-3 !py-1.5 text-xs" onClick={() => load()}>
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin text-gold-400" /> Loading the addresses...</p>;
  }

  const list = data.available ? (provider === "supabase" ? data.cidrs : data.egress_ips) : [];
  const guide = data.providers.find((p) => p.key === provider) ?? (provider === "other" ? OTHER_GUIDE : undefined);
  const allTicked = list.every((ip) => ticked.has(ip));
  const toggle = (ip: string) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(ip)) next.add(ip);
      return next;
    });

  const confirm = async () => {
    if (!allTicked || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (list.length) await attestAllowlist(provider, data.egress_ips);
      onContinue();
    } catch (err) {
      const code = err instanceof ApiError ? (err.detail as { error?: string } | undefined)?.error : undefined;
      if (code === "allowlist_incomplete") {
        // The addresses changed since this page loaded: start the ticks again.
        setError("Our addresses changed. Check the updated list and tick each one again.");
        load(true);
      } else {
        setError(err instanceof Error ? err.message : "Could not record the allowlist");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {list.length === 0 ? (
        <p className="rounded-md border border-phantix-700/50 p-4 text-[13px] leading-5 text-slate-400">
          {data.note || "This environment has no fixed outbound addresses, so there is nothing to allowlist."}
        </p>
      ) : (
        <div className="rounded-md border border-emerald-400/25 bg-emerald-400/[0.04] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
            <ShieldCheck size={15} className="text-emerald-400" /> Only let SecureGraph in
          </p>
          <p className="mt-1 text-[13px] leading-5 text-slate-400">
            Add every address below to your database's allowlist, so it refuses every other connection. SecureGraph
            connects from any of them. Tick each one once it is added.
          </p>
          {guide && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-slate-400">
              {guide.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          )}
          {(guide?.note || guide?.docs_url) && (
            <p className="mt-2 text-[12px] text-slate-500">
              {guide.note}{" "}
              {guide.docs_url && (
                <a href={guide.docs_url} target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-300">
                  {guide.name} guide <ExternalLink size={11} className="inline" />
                </a>
              )}
            </p>
          )}
          <ul className="mt-4 space-y-2">
            {list.map((ip) => (
              <li key={ip} className="flex items-center gap-3">
                <label className={cx(
                  "flex flex-1 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                  ticked.has(ip) ? "border-emerald-400/40 bg-emerald-400/5" : "border-phantix-700/60 bg-phantix-950/70",
                )}>
                  <input type="checkbox" className="h-4 w-4 accent-gold-400" checked={ticked.has(ip)} onChange={() => toggle(ip)} />
                  <span className="font-mono text-[13px] text-slate-100">{ip}</span>
                  <span className="ml-auto text-[12px] text-slate-500">{ticked.has(ip) ? "Added" : "Not ticked"}</span>
                </label>
                <button
                  type="button"
                  onClick={() => copy(ip)}
                  className="rounded-md p-2 text-slate-500 hover:text-gold-300"
                  aria-label={`Copy ${ip}`}
                >
                  {copied === ip ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => copy(list.join(", "))} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] text-gold-300 hover:bg-gold-400/10">
            {copied === list.join(", ") ? <Check size={12} /> : <Copy size={12} />} Copy all
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-severity-critical">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={!allTicked || busy} onClick={() => void confirm()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} {continueLabel} <ArrowRight size={15} />
        </button>
        {!allTicked && (
          <span className="text-[13px] text-slate-500">
            {list.length - list.filter((ip) => ticked.has(ip)).length} of {list.length} still to tick
          </span>
        )}
      </div>
    </div>
  );
}
