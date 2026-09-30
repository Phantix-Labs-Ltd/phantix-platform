import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

type Item = { key: string; label: string; done: boolean; hint?: string };

/**
 * Profile completion notice for organization admins.
 *
 * Progress is derived from the tenant profile + setup state the platform already
 * holds — nothing extra is fetched. Shown until every item is complete, with the
 * outstanding work listed in plain language so an admin knows exactly what to do.
 */
export function buildProfileChecklist(org: any, setup: any): Item[] {
  const contact = org?.primary_contact ?? null;
  const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "" && v !== false;
  return [
    {
      key: "identity",
      label: "Company identity",
      done: has(org?.name) && has(org?.legal_name) && has(org?.registration_number) && has(org?.company_type),
      hint: "Legal name, registration number and company type",
    },
    {
      key: "industry",
      label: "Industry and company size",
      done: has(org?.industry) && has(org?.employee_count_range),
      hint: "Industry and headcount band",
    },
    {
      key: "web",
      label: "Website and description",
      done: has(org?.website) && has(org?.description),
      hint: "Public website and a short description",
    },
    {
      key: "contact",
      label: "Primary contact",
      done: has(contact?.name) && has(contact?.email),
      hint: "Name and email of the primary contact",
    },
    {
      key: "mailbox",
      label: "Security mailbox",
      done: has(org?.security_mailbox),
      hint: "Where security notifications should land",
    },
    {
      key: "posture",
      label: "Security posture",
      done: has(org?.security_team_size) || has(org?.security_maturity) || has(org?.has_ciso) || has(org?.has_dedicated_security_team),
      hint: "Team size, maturity level or CISO presence",
    },
    {
      key: "verification",
      label: "Company verification",
      done: Boolean(org?.company_verified || org?.domain_verified || setup?.cac_submitted || setup?.manual_review === "approved"),
      hint: "Domain, registry details or a manual review",
    },
    {
      key: "domain",
      label: "Domain verified",
      done: Boolean(org?.domain_verified || setup?.domain_dns_ok || setup?.domain_http_ok),
      hint: "Publish the DNS record or well-known file",
    },
    {
      key: "branding",
      label: "Report branding",
      done: has(org?.logo_url),
      hint: "Logo used on report covers and footers",
    },
    {
      key: "privacy",
      label: "Privacy notice accepted",
      done: Boolean(org?.privacy_notice_accepted || setup?.privacy_accepted),
      hint: "Acknowledge the data-handling notice",
    },
  ];
}
export default function ProfileCompletionNotice({ className }: { className?: string }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);

  const items = buildProfileChecklist(state.org, state.setup);
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);
  const missing = items.filter((i) => !i.done);

  if (missing.length === 0) return null;

  return (
    <div className={cx("mb-5", className)}>
      <div className="rounded-2xl border border-gold-400/30 bg-gold-400/[0.06] px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold-400/15 text-gold-400">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100">Company profile {pct}% complete</p>
            <p className="text-sm text-slate-400">
              {missing.length} item{missing.length === 1 ? "" : "s"} still needed. Verification and branding unlock
              the full platform experience.
            </p>
            <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-phantix-800/80">
              <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="btn-secondary !px-3 !py-2 !text-xs"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Hide items" : "What's missing"}
              <ChevronDown size={13} className={cx("transition-transform", open && "rotate-180")} />
            </button>
            <Link to="/identity" className="btn-primary !px-3.5 !py-2 !text-xs">
              Complete profile <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {open && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {items.map((i) => (
              <div
                key={i.key}
                className={cx(
                  "flex items-start gap-2 rounded-lg border px-3 py-2",
                  i.done ? "border-emerald-400/20 bg-emerald-400/5" : "border-phantix-700/50 bg-phantix-950/50",
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {i.done ? (
                    <CheckCircle2 size={14} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={14} className="text-gold-400" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={cx("block text-[13px] font-medium", i.done ? "text-slate-300" : "text-slate-200")}>
                    {i.label}
                  </span>
                  {i.hint && <span className="block text-[12px] leading-4 text-slate-500">{i.hint}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}