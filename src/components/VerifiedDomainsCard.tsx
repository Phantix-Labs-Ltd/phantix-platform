import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Clock, Copy, Globe, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
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

/** One labelled value to paste at the DNS provider, with its own copy button. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-1 flex items-start gap-2 rounded-md border border-phantix-700/60 bg-phantix-950/70 px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-5 text-slate-100">{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-gold-300 hover:bg-gold-400/10"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * Domains the organization has proven it owns (C10). Each verified domain
 * covers itself and every subdomain for active testing. The applications link
 * here with `?verify=<domain>` so the domain is filled in already.
 */
export default function VerifiedDomainsCard({
  prefill, onVerifiedChange, verifyLabel,
}: {
  prefill?: string;
  /** Label the add button as the start of verification (first-run wizard). */
  verifyLabel?: boolean;
  /** Called with how many domains are verified, whenever the list changes. */
  onVerifiedChange?: (verified: number) => void;
}) {
  const { toast } = useStore();
  const [items, setItems] = useState<Domain[] | null>(null);
  const [value, setValue] = useState(prefill || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  // One domain at a time: the box shows for the first domain, then again only
  // when "Add another domain" is pressed after one is verified.
  const [adding, setAdding] = useState(false);

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
  useEffect(() => {
    if (items) onVerifiedChange?.(items.filter((d) => d.status === "verified").length);
  }, [items, onVerifiedChange]);

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
    const name = value.trim().toLowerCase();
    if (!name) return;
    if (/[\s,;]/.test(name)) return setError("Enter one domain at a time. You can add another once this one is verified.");
    setBusy("add");
    try {
      const created = DEMO_MODE
        ? ({ id: Date.now(), domain: name, status: "pending", method: null, verified_at: null, last_checked_at: null,
            instructions: { dns: { host: `_phantix.${name}`, record_type: "TXT", value: "phantix-verify=demo" }, http: { url: `https://${name}/.well-known/phantix-verify.txt`, body: "demo" } } } as Domain)
        : await api.post<Domain>("/organizations/me/domains", { domain: name });
      setItems((cur) => [...(cur || []), created]);
      setOpenId(created.id);
      setValue("");
      setAdding(false);
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
        subtitle={<span className="text-[13px] leading-5 text-slate-400">Each verified domain covers itself and all of its subdomains. You can add up to 50.</span>}
        action={<Globe size={16} className="text-slate-400" />}
      />

      {items.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-phantix-700/50 px-4 py-3 text-sm text-slate-400">
          No domains yet. Start with your company domain. Once it is verified you can add more, such as a product domain
          or a regional site.
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-slate-400">
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
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full border border-severity-medium/30 bg-severity-medium/10 px-2 py-0.5 text-[12px] font-medium text-severity-medium">
                      <Clock size={12} /> Not verified yet
                    </span>
                    <button type="button" onClick={() => setOpenId(openId === d.id ? null : d.id)} className="inline-flex items-center gap-1 text-[13px] text-slate-300 hover:text-white" aria-expanded={openId === d.id}>
                      {openId === d.id ? "Hide steps" : "Show steps"}
                      <ChevronDown size={14} className={cx("transition-transform", openId === d.id && "rotate-180")} />
                    </button>
                  </>
                )}
                {!d.is_primary && (
                  <button type="button" onClick={() => void remove(d)} disabled={busy === `del-${d.id}`} className="rounded p-1 text-slate-500 hover:text-severity-critical" aria-label={`Remove ${d.domain}`}>
                    {busy === `del-${d.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>

              {d.status !== "verified" && openId === d.id && d.instructions && (
                <ol className="mt-4 space-y-5 text-sm">
                  {d.instructions.dns && (
                    <li>
                      <p className="font-medium text-slate-100">
                        <span className="mr-2 text-gold-400">1.</span>Add this {d.instructions.dns.record_type} record at your DNS provider
                      </p>
                      <div className="mt-3 space-y-3 sm:pl-5">
                        <CopyField label="Type" value={d.instructions.dns.record_type} />
                        <CopyField label="Name / Host" value={d.instructions.dns.host} />
                        <CopyField label="Value" value={d.instructions.dns.value} />
                      </div>
                      {d.instructions.http && (
                        <details className="mt-3 sm:pl-5">
                          <summary className="cursor-pointer text-[13px] text-slate-300 hover:text-white">Can't edit DNS? Publish a file instead</summary>
                          <div className="mt-3 space-y-3">
                            <CopyField label="File URL" value={d.instructions.http.url} />
                            <CopyField label="File contents" value={d.instructions.http.body} />
                          </div>
                        </details>
                      )}
                    </li>
                  )}
                  <li>
                    <p className="font-medium text-slate-100">
                      <span className="mr-2 text-gold-400">{d.instructions.dns ? "2." : "1."}</span>Verify
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-slate-400 sm:pl-5">
                      DNS changes usually show up within a few minutes, sometimes longer. Check again if it isn't found yet.
                    </p>
                    <div className="sm:pl-5">
                      <button type="button" onClick={() => void check(d)} disabled={busy === `check-${d.id}`} className="btn-primary mt-3">
                        {busy === `check-${d.id}` ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Verify now
                      </button>
                    </div>
                  </li>
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}

      {(() => {
        const verifiedCount = items.filter((d) => d.status === "verified").length;
        const showForm = items.length === 0 || adding || Boolean(prefill && value === prefill);
        if (!showForm) {
          return verifiedCount > 0 ? (
            <button type="button" onClick={() => { setAdding(true); setError(null); }} className="btn-alt mt-4 w-full">
              <Plus size={15} /> Add another domain
            </button>
          ) : (
            <p className="mt-4 text-[13px] text-slate-400">Verify this domain first, then you can add another.</p>
          );
        }
        return (
          <form onSubmit={add} className="mt-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <label className="label" htmlFor="vd-domain">{items.length ? "Another domain you own" : "Your domain"}</label>
                <input id="vd-domain" autoFocus={adding} className={cx("input font-mono", prefill && value === prefill && "ring-1 ring-gold-400/50")} value={value}
                  onChange={(e) => setValue(e.target.value)} placeholder="acme.com" autoComplete="off" spellCheck={false} />
              </div>
              <button className={cx("btn-primary", verifyLabel && "!py-2.5 px-5")} disabled={busy === "add" || !value.trim()}>
                {busy === "add" ? <Loader2 size={15} className="animate-spin" /> : verifyLabel ? <ShieldCheck size={15} /> : <Plus size={15} />}
                {verifyLabel ? "Verify now" : "Add"}
              </button>
            </div>
            {adding && items.length > 0 && (
              <button type="button" onClick={() => { setAdding(false); setValue(""); setError(null); }} className="mt-2 text-[13px] text-slate-400 hover:text-slate-200">
                Cancel
              </button>
            )}
          </form>
        );
      })()}
      {error && <p className="mt-2 text-sm text-severity-critical">{error}</p>}
    </Card>
  );
}
