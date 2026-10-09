import React, { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { api, DEMO_MODE } from "@/lib/api";

interface Guide { key: string; name: string; steps: string[]; note?: string | null; docs_url?: string | null }
interface NetworkAccess { available: boolean; egress_ips: string[]; cidrs: string[]; providers: Guide[]; note?: string | null }

const DEMO: NetworkAccess = {
  available: true,
  egress_ips: ["203.0.113.10", "203.0.113.11"],
  cidrs: ["203.0.113.10/32", "203.0.113.11/32"],
  providers: [],
};

let cached: Promise<NetworkAccess | null> | null = null;
function loadNetworkAccess(): Promise<NetworkAccess | null> {
  if (DEMO_MODE) return Promise.resolve(DEMO);
  cached ??= api.get<NetworkAccess>("/db-connections/network-access").catch(() => {
    cached = null;
    return null;
  });
  return cached;
}

/**
 * The addresses SecureGraph connects from, for a Neon or Supabase allowlist.
 * They are NAT egress addresses, served only to signed-in organizations; no
 * server uses them, so allowlisting them exposes nothing.
 */
export default function EgressAllowlist({ provider }: { provider: "neon" | "supabase" }) {
  const [data, setData] = useState<NetworkAccess | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadNetworkAccess().then((v) => { if (alive) setData(v); });
    return () => { alive = false; };
  }, []);

  if (!data?.available) return null;
  const guide = data.providers.find((p) => p.key === provider);
  const list = provider === "supabase" ? data.cidrs : data.egress_ips;

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="mt-4 rounded-md border border-emerald-400/25 bg-emerald-400/[0.04] p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
        <ShieldCheck size={15} className="text-emerald-400" /> Recommended: only let SecureGraph in
      </p>
      <p className="mt-1 text-[13px] leading-5 text-slate-400">
        Allowlist these addresses in {provider === "neon" ? "Neon" : "Supabase"} so your database refuses every other
        connection. SecureGraph connects from any of them, so add them all.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {list.map((ip) => (
          <li key={ip}>
            <button
              type="button"
              onClick={() => copy(ip)}
              className="inline-flex items-center gap-1.5 rounded-md border border-phantix-700/60 bg-phantix-950/70 px-2.5 py-1 font-mono text-[13px] text-slate-100 hover:border-gold-400/40"
              aria-label={`Copy ${ip}`}
            >
              {ip} {copied === ip ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-slate-500" />}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => copy(list.join(", "))} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] text-gold-300 hover:bg-gold-400/10">
            {copied === list.join(", ") ? <Check size={12} /> : <Copy size={12} />} Copy all
          </button>
        </li>
      </ul>
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
    </div>
  );
}
