import React, { useState } from "react";
import { Globe, CheckCircle2, Copy, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

/** Extract a bare host from a website URL or a domain-ish string. */
function hostOf(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return v.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
}

/**
 * Domain verification — prove control of the company domain with a DNS TXT record
 * or a well-known file. Self-contained: starting and checking both write to the
 * org setup state, so the setup wizard and this card stay in lockstep.
 */
export default function DomainVerificationCard() {
  const { state, startDomainVerification, checkDomain, refreshSetup, toast } = useStore();
  const s = state.setup;

  const [domain, setDomain] = useState(() => s.domain || hostOf(state.org.website));
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<null | "auto" | "dns" | "http">(null);
  const [lastCheckAt, setLastCheckAt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const verified = s.domain_dns_ok || s.domain_http_ok || state.org.domain_verified;

  const instr = (s.domain_instructions ?? {}) as any;
  const dnsValue = instr.dns?.value || instr.dns_txt || instr.value || instr.txt || (s.domain_token ? `phantix-verify=${s.domain_token}` : "");
  const dnsHost = instr.dns?.host || s.domain || domain;
  const dnsType = instr.dns?.record_type || "TXT";
  const httpUrl = instr.http?.url || instr.http_url || instr.url || (s.domain ? `https://${s.domain}/.well-known/phantix-verify.txt` : "");
  const httpBody = instr.http?.body || instr.http_body || instr.body || instr.token || s.domain_token || "";

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast("success", `${what} copied`);
  };

  const start = async () => {
    const target = hostOf(domain);
    if (!target) {
      toast("error", "Enter your domain", "For example: acme.com");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await startDomainVerification(target, state.org.website || undefined);
      toast("success", "Verification started", "Publish the record or file below, then run a check.");
    } catch (err) {
      toast("error", "Could not start verification", err instanceof Error ? err.message : "");
    } finally {
      setBusy(false);
    }
  };

  const check = async (method: "auto" | "dns" | "http") => {
    if (Date.now() - lastCheckAt < 5000) {
      toast("info", "Wait a few seconds", "Avoid hammering DNS/HTTP checks.");
      return;
    }
    setChecking(method);
    setLastCheckAt(Date.now());
    try {
      const r = await checkDomain(method);
      setMessage(r.message);
      if (r.dns || r.http) toast("success", "Domain verified", r.message);
      else toast("warning", "Not verified yet", r.message);
      void refreshSetup();
    } catch (err) {
      toast("error", "Check failed", err instanceof Error ? err.message : "");
    } finally {
      setChecking(null);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Domain verification"
        subtitle={verified ? "Your company domain is verified" : "Prove control of your company domain to verify the organization"}
        action={<Globe size={16} className={verified ? "text-emerald-400" : "text-slate-500"} />}
      />

      {verified ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-emerald-400/30 bg-emerald-400/8 px-4 py-3">
          <CheckCircle2 size={17} className="shrink-0 text-emerald-400" />
          <div className="min-w-[12rem] flex-1">
            <p className="text-sm font-medium text-emerald-300">
              {s.domain || state.org.website || "Company domain"} verified
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Domain control is on record for this organization. Re-run a check any time the DNS entries change.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary !px-3 !py-2 !text-xs"
            disabled={checking !== null}
            onClick={() => void check("auto")}
          >
            {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-check
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input font-mono"
              placeholder="acme.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <button type="button" className="btn-primary shrink-0" disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Start verification
            </button>
          </div>
          {dnsValue || httpUrl ? (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-phantix-700/40 bg-phantix-950/50 p-4">
                <p className="text-xs font-semibold text-slate-200">
                  Option A · DNS record {s.domain_dns_ok && <CheckCircle2 size={13} className="ml-1 inline text-emerald-400" />}
                </p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-gold-300">{dnsType} {dnsHost}</code>
                    <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => copy(dnsHost, "Record name")}>
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-slate-300">{dnsValue}</code>
                    <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => copy(dnsValue, "Record value")}>
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-slate-500">
                  Add this TXT record at your DNS provider, then run a DNS check.
                </p>
              </div>

              <div className="rounded-xl border border-phantix-700/40 bg-phantix-950/50 p-4">
                <p className="text-xs font-semibold text-slate-200">
                  Option B · Well-known file {s.domain_http_ok && <CheckCircle2 size={13} className="ml-1 inline text-emerald-400" />}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-gold-300">{httpUrl}</code>
                  <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => copy(httpUrl, "URL")}>
                    <Copy size={14} />
                  </button>
                </div>
                {httpBody && (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-slate-300">{httpBody}</code>
                    <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => copy(httpBody, "File body")}>
                      <Copy size={14} />
                    </button>
                  </div>
                )}
                <p className="mt-2 text-[13px] leading-5 text-slate-500">
                  Serve this file with the exact body above, then run an HTTP check.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Start verification to get your DNS record and well-known file. Either one proves domain control.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(["auto", "dns", "http"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className="btn-secondary !py-2 !text-xs capitalize"
                disabled={checking !== null || Date.now() - lastCheckAt < 5000}
                onClick={() => void check(m)}
              >
                {checking === m ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Check {m}
              </button>
            ))}
            {message && <span className={cx("text-xs", verified ? "text-emerald-300" : "text-slate-400")}>{message}</span>}
          </div>
        </>
      )}
    </Card>
  );
}