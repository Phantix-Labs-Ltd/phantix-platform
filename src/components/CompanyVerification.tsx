import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Globe, CheckCircle2, Copy, Landmark, UserCheck, Loader2, RefreshCw,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

/**
 * Company verification: prove control by domain, registry numbers (CAC / RC)
 * or a staff review. Optional --- it adds the verified badge and is asked for
 * again only where something depends on it.
 */
export default function CompanyVerification() {
  const { state, startDomainVerification, checkDomain, submitCac, skipCac, requestManualReview, toast, refreshSetup } = useStore();
  const s = state.setup;
  const [mode, setMode] = useState<"none" | "domain" | "cac" | "manual">("none");
  const [domain, setDomain] = useState(() => s.domain || extractHost(state.org.website) || "");
  const [busy, setBusy] = useState(false);
  const [rc, setRc] = useState("");
  const [cacType, setCacType] = useState("");
  const [cacDate, setCacDate] = useState("");
  const [cacStatus, setCacStatus] = useState("Active");
  const [cacAddress, setCacAddress] = useState("");
  const [tin, setTin] = useState("");
  const [notes, setNotes] = useState("");
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState(0);

  const verified =
    s.company_verified || s.domain_dns_ok || s.domain_http_ok || s.cac_submitted || s.manual_review === "approved";

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast("success", `${what} copied`);
  };

  const instr: any = s.domain_instructions || {};
  // Handle new nested API shape: { dns: { value, host, record_type }, http: { url, body }, token }
  const dnsValue = instr.dns?.value || instr.dns_txt || instr.value || instr.txt || "";
  const dnsTxt = dnsValue || (s.domain_token ? `phantix-verify=${s.domain_token}` : "");
  const dnsHost = instr.dns?.host || s.domain || domain || "";
  const dnsRecordType = instr.dns?.record_type || "TXT";
  const httpUrl = instr.http?.url || instr.http_url || instr.url || (s.domain ? `https://${s.domain}/.well-known/phantix-verify.txt` : "");
  const httpBody = instr.http?.body || instr.http_body || instr.body || instr.token || s.domain_token || "";

  return (
    <div className="space-y-4">
      <div className="card p-7">
        <StepTitle icon={<Globe size={18} />} kicker="Optional" title="Prove company control" />
        <p className="mt-2 text-sm text-slate-400">
          Choose any <strong>one</strong> mode, usually the domain. You can switch modes at any time.
        </p>

        {verified && (
          <div className="mt-4 flex items-center gap-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-300">
            <CheckCircle2 size={16} /> Company verified
            {s.domain_dns_ok && <span className="chip border-emerald-400/30 text-[12px]">DNS</span>}
            {s.domain_http_ok && <span className="chip border-emerald-400/30 text-[12px]">HTTP</span>}
            {s.cac_submitted && <span className="chip border-emerald-400/30 text-[12px]">CAC</span>}
            {s.manual_review === "approved" && <span className="chip border-emerald-400/30 text-[12px]">Manual</span>}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { id: "domain" as const, icon: <Globe size={17} />, name: "Domain", desc: "DNS TXT or well-known file", done: s.domain_dns_ok || s.domain_http_ok },
            { id: "cac" as const, icon: <Landmark size={17} />, name: "CAC / RC", desc: "Registry numbers", done: s.cac_submitted },
            { id: "manual" as const, icon: <UserCheck size={17} />, name: "Manual review", desc: "Staff approval", done: s.manual_review === "approved" },
          ].map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setMode(mode === m.id ? "none" : m.id)}
              className={cx(
                "rounded-2xl border p-4 text-left transition-all",
                mode === m.id ? "border-gold-400/60 bg-gold-400/8 shadow-glow" : "border-phantix-700/50 bg-phantix-950/40 hover:border-phantix-500/50",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cx("flex h-9 w-9 items-center justify-center rounded-lg", mode === m.id ? "bg-gold-400/15 text-gold-400" : "bg-phantix-800/70 text-phantix-300")}>
                  {m.icon}
                </span>
                {m.done && <CheckCircle2 size={15} className="text-emerald-400" />}
                {m.id === "manual" && s.manual_review === "pending" && <Loader2 size={14} className="animate-spin text-severity-medium" />}
              </div>
              <p className="mt-2.5 text-sm font-semibold text-slate-200">{m.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{m.desc}</p>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {mode === "domain" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl border border-phantix-700/50 bg-phantix-950/50 p-5">
                {!s.domain_token ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      className="input font-mono flex-1"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value.replace(/^https?:\/\//, "").split("/")[0])}
                      placeholder="yourcompany.com"
                    />
                    <button
                      type="button"
                      className="btn-primary shrink-0"
                      disabled={!domain.includes(".") || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await startDomainVerification(domain, state.org.website || undefined);
                          toast("success", "Verification started", "Add the DNS or HTTP proof, then check.");
                        } catch (err) {
                          toast("error", "Start failed", err instanceof Error ? err.message : "Could not start domain verification");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {busy ? "Issuing..." : "Start"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-300">
                      Prove control of <span className="font-mono text-gold-300">{s.domain || domain}</span> with either method:
                    </p>
                    <div className="rounded-md border border-phantix-700/50 bg-phantix-950/70 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Option A --- DNS TXT</p>
                        {s.domain_dns_ok ? <CheckCircle2 size={15} className="text-emerald-400" /> : null}
                      </div>
                      {dnsTxt ? (
                        <>
                          <div className="mt-2 flex items-center gap-2">
                            <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-gold-300">{dnsTxt}</code>
                            <button type="button" onClick={() => copy(dnsTxt, "TXT value")} className="btn-secondary !px-3 !py-2">
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="mt-1.5 text-[12px] text-slate-500">
                            {dnsRecordType} record on <span className="font-mono text-slate-400">{dnsHost || "@"}</span>
                            {instr.dns?.hint && <span className="block mt-0.5">{instr.dns.hint}</span>}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Start verification to get instructions</p>
                      )}
                    </div>
                    <div className="rounded-md border border-phantix-700/50 bg-phantix-950/70 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Option B --- HTTP well-known</p>
                        {s.domain_http_ok ? <CheckCircle2 size={15} className="text-emerald-400" /> : null}
                      </div>
                      {httpUrl ? (
                        <>
                          <div className="mt-2 flex items-center gap-2">
                            <code className="flex-1 truncate rounded-lg bg-phantix-900/80 px-3 py-2 font-mono text-xs text-gold-300">{httpUrl}</code>
                            <button type="button" onClick={() => copy(httpUrl, "URL")} className="btn-secondary !px-3 !py-2">
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="mt-1.5 text-[12px] text-slate-500">{instr.http?.content_type ? `${instr.http.content_type}` : ""}{instr.http?.hint && <span className="block mt-0.5">{instr.http.hint}</span>}</p>
                          {httpBody && (
                            <>
                              <p className="mt-1.5 text-[13px] text-slate-500">File body must be exactly: <code className="font-mono text-gold-300 text-[13px]">{httpBody.slice(0, 50)}{httpBody.length > 50 ? "..." : ""}</code></p>
                              <button type="button" className="mt-1 text-xs text-gold-400 hover:text-gold-300" onClick={() => copy(httpBody, "Token body")}>
                                Copy token body
                              </button>
                            </>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Start verification to get instructions</p>
                      )}
                    </div>
                    {checkMsg && <p className="text-xs text-slate-400">{checkMsg}</p>}
                    <div className="flex flex-wrap gap-2">
                      {(["auto", "dns", "http"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className="btn-secondary !py-2 !text-xs capitalize"
                          disabled={busy || Date.now() - lastCheckAt < 5000}
                          onClick={async () => {
                            if (Date.now() - lastCheckAt < 5000) {
                              toast("info", "Wait a few seconds", "Avoid hammering DNS/HTTP checks.");
                              return;
                            }
                            setBusy(true);
                            setLastCheckAt(Date.now());
                            try {
                              const r = await checkDomain(m);
                              setCheckMsg(r.message);
                              if (r.dns || r.http) toast("success", "Domain verified", r.message);
                              else toast("warning", "Not verified yet", r.message);
                              void refreshSetup();
                            } catch (err) {
                              toast("error", "Check failed", err instanceof Error ? err.message : "Domain check failed");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Check {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {mode === "cac" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl border border-phantix-700/50 bg-phantix-950/50 p-5">
                {s.cac_submitted ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 size={15} /> CAC / RC details recorded.
                  </p>
                ) : s.cac_skipped ? (
                  <p className="text-sm text-slate-400">CAC step skipped.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label">RC number</label>
                        <input className="input font-mono" value={rc} onChange={(e) => setRc(e.target.value)} placeholder="RC1234567" />
                      </div>
                      <div>
                        <label className="label">Company type</label>
                        <input className="input" value={cacType} onChange={(e) => setCacType(e.target.value)} placeholder="Private Limited" />
                      </div>
                      <div>
                        <label className="label">Registration date</label>
                        <input className="input" type="date" value={cacDate} onChange={(e) => setCacDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Status</label>
                        <input className="input" value={cacStatus} onChange={(e) => setCacStatus(e.target.value)} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label">Registered address</label>
                        <input className="input" value={cacAddress} onChange={(e) => setCacAddress(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">TIN</label>
                        <input className="input font-mono" value={tin} onChange={(e) => setTin(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="btn-primary flex-1"
                        disabled={!rc || busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await submitCac({
                              rc_number: rc,
                              company_type: cacType || undefined,
                              registration_date: cacDate || undefined,
                              status: cacStatus || undefined,
                              registered_address: cacAddress || undefined,
                              tin: tin || undefined,
                            });
                            toast("success", "CAC details submitted");
                          } catch (err) {
                            toast("error", "Submit failed", err instanceof Error ? err.message : "CAC submit failed");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {busy ? "Submitting..." : "Submit details"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={async () => {
                          await skipCac();
                          toast("info", "CAC skipped");
                        }}
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {mode === "manual" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 rounded-2xl border border-phantix-700/50 bg-phantix-950/50 p-5">
                {s.manual_review === "pending" ? (
                  <div className="flex items-center gap-3 text-sm text-slate-300">
                    <Loader2 size={16} className="animate-spin text-severity-medium" />
                    Awaiting staff review --- this screen refreshes automatically.
                    <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => void refreshSetup()}>
                      Refresh now
                    </button>
                  </div>
                ) : s.manual_review === "approved" ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 size={15} /> Manual review approved
                  </p>
                ) : s.manual_review === "rejected" ? (
                  <p className="text-sm text-severity-critical">Manual review was rejected. You can re-request with notes.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Notes for staff (optional)</label>
                      <textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. DNS not available on CDN..." />
                    </div>
                    <button
                      type="button"
                      className="btn-primary w-full"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await requestManualReview(notes || undefined);
                          toast("success", "Review requested");
                        } catch (err) {
                          toast("error", "Request failed", err instanceof Error ? err.message : "Could not request review");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {busy ? "Requesting..." : "Request staff review"}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}

function StepTitle({ icon, kicker, title }: { icon: React.ReactNode; kicker: string; title: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-gold-400">
        {icon} {kicker}
      </div>
      <h2 className="mt-2 font-display text-2xl font-bold text-white">{title}</h2>
    </div>
  );
}

function extractHost(website: string | null | undefined): string {
  if (!website) return "";
  try {
    const u = website.includes("://") ? new URL(website) : new URL(`https://${website}`);
    return u.hostname;
  } catch {
    return website.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}
