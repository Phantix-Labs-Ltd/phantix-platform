import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, Globe, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardHeader, CopyChip } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE, delay, errorCode } from "@/lib/api";
import { cx } from "@/lib/utils";

type Domain = {
  id: number;
  domain: string;
  status: "pending" | "verified";
  method: "dns" | "http" | null;
  is_primary?: boolean;
  verified_at: string | null;
  last_checked_at: string | null;
  instructions?: { dns?: { host: string; record_type: string; value: string }; http?: { url: string; body: string } };
  check?: { dns_ok: boolean; http_ok: boolean; message?: string };
};

const ERRORS: Record<string, string> = {
  invalid_domain: "Enter a domain you own, like acme.com. IP addresses and shared suffixes can't be verified.",
  domain_exists: "That domain is already on the list.",
  domain_limit_reached: "You've reached the limit of 50 domains.",
};

/**
 * Domains the organization has proven it owns (C10). Each verified domain
 * covers itself and every subdomain for active testing. The applications link
 * here with `?verify=<domain>` so the domain is filled in already.
 */
export default function VerifiedDomainsCard({ prefill }: { prefill?: string }) {
  const { toast } = useStore();
  const [items, setItems] = useState<Domain[] | null>(null);
  const [value, setValue] = useState(prefill || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = async () => {
    if (DEMO_MODE) { setItems((cur) => cur ?? []); return; }
    try {
      const res = await api.get<{ items?: Domain[] }>("/organizations/me/domains");
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setItems(null); // backend without the endpoint: hide the card
    }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (prefill) setValue(prefill); }, [prefill]);

  // Arriving from an application with a domain to verify that's already listed:
  // open its instructions instead of offering to add it again.
  useEffect(() => {
    if (!prefill || !items) return;
    const hit = items.find((d) => d.domain === prefill.toLowerCase());
    if (hit) { setOpenId(hit.id); setValue(""); }
  }, [prefill, items]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!value.trim()) return;
    setBusy("add");
    try {
      const created = DEMO_MODE
        ? ({ id: Date.now(), domain: value.trim().toLowerCase(), status: "pending", method: null, verified_at: null, last_checked_at: null,
            instructions: { dns: { host: `_phantix.${value.trim()}`, record_type: "TXT", value: "phantix-verify=demo" }, http: { url: `https://${value.trim()}/.well-known/phantix-verify.txt`, body: "demo" } } } as Domain)
        : await api.post<Domain>("/organizations/me/domains", { domain: value.trim() });
      setItems((cur) => [...(cur || []), created]);
      setOpenId(created.id);
      setValue("");
    } catch (err) {
      setError(ERRORS[errorCode(err) || ""] || (err instanceof Error ? err.message : "Could not add the domain"));
    } finally {
      setBusy(null);
    }
  };

  const check = async (d: Domain) => {
    setBusy(`check-${d.id}`);
    setError(null);
    try {
      const res = DEMO_MODE
        ? (await delay(600), { ...d, status: "verified" as const, method: "dns" as const, verified_at: new Date().toISOString(), check: { dns_ok: true, http_ok: false } })
        : await api.post<Domain>(`/organizations/me/domains/${d.id}/check`, {});
      setItems((cur) => (cur || []).map((x) => (x.id === d.id ? res : x)));
      if (res.status === "verified") {
        toast("success", `${res.domain} verified`, "It and all its subdomains are covered for active testing.");
        setOpenId(null);
      } else {
        toast("info", "Not found yet", res.check?.message || "DNS changes can take a few minutes. Try again shortly.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the domain");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (d: Domain) => {
    setBusy(`del-${d.id}`);
    try {
      if (!DEMO_MODE) await api.delete(`/organizations/me/domains/${d.id}`);
      setItems((cur) => (cur || []).filter((x) => x.id !== d.id));
    } catch (err) {
      toast("error", "Could not remove the domain", err instanceof Error ? err.message : "");
    } finally {
      setBusy(null);
    }
  };

  if (items === null) return null;

  return (
    <Card>
      <div id="domains" className="scroll-mt-24" />
      <CardHeader
        title="Verified domains"
        subtitle="Verify every domain you want to test. You can add as many as you need, up to 50, and each one covers itself and all of its subdomains. Active tests and pentest agent targets must sit under a verified domain."
        action={<Globe size={16} className="text-slate-400" />}
      />

      {items.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-phantix-700/50 px-4 py-3 text-sm text-slate-400">
          No domains yet. Add your company domain first, then any other domains you own, such as a product domain or a
          regional site.
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-slate-500">
          {items.filter((d) => d.status === "verified").length} verified
          {items.some((d) => d.status !== "verified") && `, ${items.filter((d) => d.status !== "verified").length} waiting`}
          {" · "}
          {items.length} of 50 domains
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-phantix-700/40 rounded-md border border-phantix-700/40">
          {items.map((d) => (
            <li key={d.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 break-all font-mono text-sm text-white">{d.domain}</span>
                {d.is_primary && <span className="text-[12px] text-slate-500">company domain</span>}
                {d.status === "verified" ? (
                  <span className="inline-flex items-center gap-1 text-[13px] text-emerald-400"><CheckCircle2 size={13} /> Verified</span>
                ) : (
                  <button type="button" onClick={() => setOpenId(openId === d.id ? null : d.id)} className="inline-flex items-center gap-1 text-[13px] text-severity-medium hover:text-gold-300">
                    <Clock size={13} /> {openId === d.id ? "Hide steps" : "Finish verifying"}
                  </button>
                )}
                {!d.is_primary && (
                  <button type="button" onClick={() => void remove(d)} disabled={busy === `del-${d.id}`} className="rounded p-1 text-slate-500 hover:text-severity-critical" aria-label={`Remove ${d.domain}`}>
                    {busy === `del-${d.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>

              {d.status !== "verified" && openId === d.id && d.instructions && (
                <div className="mt-3 space-y-3 text-sm">
                  {d.instructions.dns && (
                    <div>
                      <p className="text-slate-300">Add this DNS record at your DNS provider:</p>
                      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-[auto_1fr] sm:items-center">
                        <span className="text-[12px] text-slate-500">Type</span><span className="font-mono text-xs text-slate-200">{d.instructions.dns.record_type}</span>
                        <span className="text-[12px] text-slate-500">Name</span><CopyChip value={d.instructions.dns.host} />
                        <span className="text-[12px] text-slate-500">Value</span><CopyChip value={d.instructions.dns.value} />
                      </div>
                    </div>
                  )}
                  {d.instructions.http && (
                    <p className="text-[13px] text-slate-400">
                      Or publish a file at <span className="break-all font-mono text-slate-300">{d.instructions.http.url}</span> containing{" "}
                      <span className="break-all font-mono text-slate-300">{d.instructions.http.body}</span>.
                    </p>
                  )}
                  <button type="button" onClick={() => void check(d)} disabled={busy === `check-${d.id}`} className="btn-primary !py-1.5 text-xs">
                    {busy === `check-${d.id}` ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Check now
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label className="label" htmlFor="vd-domain">{items.length ? "Add another domain" : "Add a domain"}</label>
          <input id="vd-domain" className={cx("input font-mono", prefill && value === prefill && "ring-1 ring-gold-400/50")} value={value}
            onChange={(e) => setValue(e.target.value)} placeholder="acme.com" autoComplete="off" spellCheck={false} />
        </div>
        <button className="btn-primary" disabled={busy === "add" || !value.trim()}>
          {busy === "add" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-severity-critical">{error}</p>}
    </Card>
  );
}
