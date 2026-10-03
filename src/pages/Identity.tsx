import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2, KeyRound, RefreshCw, ImagePlus, AlertTriangle, CheckCircle2, Layers, Save, User,
  ShieldCheck, Download, Loader2, Send, FileText,
} from "lucide-react";
import TypeToConfirm from "@/components/TypeToConfirm";
import DocLink from "@/components/DocLink";
import CompanyVerification from "@/components/CompanyVerification";
import DualControlPolicyCard from "@/components/DualControlPolicyCard";
import VerifiedDomainsCard from "@/components/VerifiedDomainsCard";
import ProfileCompletionNotice from "@/components/ProfileCompletionNotice";
import { PageHeader, Card, CardHeader, CollapsibleCard, StatusBadge, Modal, CopyChip, KeyValueList, Tabs, EmptyState, Spinner } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, mediaUrl } from "@/lib/api";
import type { Organization, OrgContact } from "@/lib/types";
import { COMPANY_TYPES, COMPANY_TYPE_LABELS } from "@/lib/org";
import { timeAgo, cx, humanize } from "@/lib/utils";

/** Allowed by PUT /organizations/me/preferred-services (API enum). */
const DEFAULT_SERVICE_CATALOG = [
  { key: "penetration_testing", name: "Penetration testing", desc: "Engagement-style assessments and VAPT" },
  { key: "vulnerability_management", name: "Vulnerability management", desc: "Continuous vulnerability discovery and management" },
  { key: "red_team", name: "Red team", desc: "Adversary simulation" },
  { key: "blue_team", name: "Blue team", desc: "Detection and defense operations" },
  { key: "purple_team", name: "Purple team", desc: "Collaborative attack/defense" },
  { key: "mssp", name: "MSSP", desc: "Managed security service provider" },
  { key: "soc_as_a_service", name: "SOC as a service", desc: "Outsourced security operations centre" },
  { key: "incident_response", name: "Incident response", desc: "IR retainers and playbooks" },
  { key: "threat_intelligence", name: "Threat intelligence", desc: "Intel feeds and analysis" },
  { key: "security_awareness", name: "Security awareness", desc: "Training and phishing simulations" },
  { key: "compliance_audit", name: "Compliance and audit", desc: "Frameworks, GRC, evidence" },
  { key: "cloud_security", name: "Cloud security", desc: "CSPM and cloud posture" },
  { key: "application_security", name: "Application security", desc: "AppSec and secure SDLC" },
  { key: "ot_security", name: "OT security", desc: "Industrial and operational technology" },
  { key: "other", name: "Other", desc: "Custom or unlisted services" },
];

const ALLOWED_SERVICES = new Set(DEFAULT_SERVICE_CATALOG.map((s) => s.key));

/** Allowed by PUT /organizations/me (infrastructure_types enum). Anything
 *  outside this set (e.g. a stale "container"/"serverless" pick from before
 *  the enum changed) gets dropped before saving, or the whole PUT 422s. */
const INFRASTRUCTURE_TYPES = ["cloud", "on_prem", "hybrid", "saas", "ot_ics", "mobile"];

const industries = [
  "technology", "financial_services", "fintech", "healthcare", "government",
  "education", "retail", "manufacturing", "telecom", "energy", "other",
];

const employeeRanges = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+", ""];
const revenueRanges = ["under-100k", "100k-1m", "1m-10m", "10m-50m", "50m+", ""];
// Company type is a backend enum (PUT /organizations/me) — the canonical list
// and its labels live in lib/org.ts so every surface stays in lockstep.
const maturityLevels = ["initial", "developing", "defined", "managed", "optimizing", ""];
const contactTitles = ["mr", "mrs", "ms", "miss", "dr", "prof", "eng"];

function emptyContact(): OrgContact {
  return { title: "mr", name: "", email: "", phone: null, whatsapp_username: null, telegram_username: null };
}

export default function Identity() {
  const {
    state, rotateServiceKey, revokeServiceKey, updateOrgProfile, savePreferredServices,
    uploadLogo, deleteLogo, toast, operate, requireDualControl, hydrateSession,
  } = useStore();
  // Applications link here to set something up: /identity?verify=acme.com#domains
  // or /identity#dual-control. Open the tab that holds it and scroll to it.
  const location = useLocation();
  const verifyPrefill = new URLSearchParams(location.search).get("verify") || undefined;
  const deepLinked = verifyPrefill || location.hash === "#domains" || location.hash === "#dual-control";
  const [tab, setTab] = useState(deepLinked ? "verification" : "overview");
  useEffect(() => {
    if (!deepLinked) return;
    setTab("verification");
    const id = location.hash ? location.hash.slice(1) : "domains";
    // Cards load their data first; wait a moment before scrolling to the anchor.
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    return () => window.clearTimeout(t);
  }, [deepLinked, location.hash]);
  const [keyModal, setKeyModal] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [preferred, setPreferred] = useState<string[]>(() =>
    (state.org.preferred_services ?? ["vulnerability_management", "penetration_testing", "compliance_audit"]).filter((k) =>
      ALLOWED_SERVICES.has(k),
    ),
  );
  const [catalogItems, setCatalogItems] = useState(DEFAULT_SERVICE_CATALOG);

  // Preferred-services catalog from the backend (admin-editable experience configs),
  // falling back to the static list when unavailable.
  useEffect(() => {
    void api
      .get<any>("/organizations/services-catalog")
      .then((rows) => {
        const items = Array.isArray(rows) ? rows : [];
        if (!items.length) return;
        setCatalogItems(
          items.map((r: any, i: number) => ({
            key: String(r.key ?? r.service_key ?? `service_${i}`),
            name: String(r.name ?? r.label ?? r.key ?? "Service"),
            desc: String(r.description ?? r.desc ?? ""),
          })),
        );
      })
      .catch(() => undefined);
  }, []);

  const [form, setForm] = useState<Organization>(state.org);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [removeLogoOpen, setRemoveLogoOpen] = useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const key = state.serviceKey;

  const onLogoSelected = async (file: File | null) => {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type) && !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
      toast("error", "Invalid file", "Use PNG, JPEG, WebP, or SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast("error", "File too large", "Logo must be 2MB or smaller.");
      return;
    }
    if (state.dualControl.configured && !operate.unlocked) {
      if (!(await requireDualControl("Uploading a company logo requires a dual-control operate session."))) return;
    }
    setLogoBusy(true);
    try {
      await uploadLogo(file);
      toast("success", "Logo uploaded", "Your logo now appears on report covers and footers.");
    } catch (err) {
      const st = (err as { status?: number })?.status;
      toast("error", st === 502 || st === 503 ? "Storage unavailable" : "Upload failed", st === 502 || st === 503 ? "Storage unavailable. Try again." : err instanceof Error ? err.message : "Could not upload logo");
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const onLogoRemoveClick = async () => {
    if (state.dualControl.configured && !operate.unlocked) {
      if (!(await requireDualControl("Removing the company logo requires a dual-control operate session."))) return;
    }
    setRemoveLogoOpen(true);
  };

  const onLogoRemove = async () => {
    if (state.dualControl.configured && !operate.unlocked) {
      if (!(await requireDualControl("Removing the company logo requires a dual-control operate session."))) return;
    }
    setLogoBusy(true);
    try {
      await deleteLogo();
      toast("success", "Logo removed", "Your logo was removed from reports and footers.");
    } catch (err) {
      const st = (err as { status?: number })?.status;
      toast("error", st === 502 || st === 503 ? "Storage unavailable" : "Remove failed", st === 502 || st === 503 ? "Storage unavailable. Try again." : err instanceof Error ? err.message : "Could not remove logo");
    } finally {
      setLogoBusy(false);
    }
  };

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  const normalize: Record<string, string> = {
    soc2: "soc_2", health: "phi", payment_cards: "pci",
  };

  useEffect(() => {
    const org = { ...state.org };
    const normalizeList = (field: "compliance_frameworks" | "data_types_handled") => {
      if (org[field]) {
        org[field] = org[field].map((v) => normalize[v] ?? v).filter((v) => v);
      }
    };
    normalizeList("compliance_frameworks");
    normalizeList("data_types_handled");
    setForm(org);
    if (state.org.preferred_services?.length) {
      setPreferred(state.org.preferred_services.filter((k) => ALLOWED_SERVICES.has(k)));
    }
  }, [state.org]);

  const set = <K extends keyof Organization>(k: K, v: Organization[K]) => setForm((f) => ({ ...f, [k]: v }));

  const setContact = (which: "primary_contact" | "secondary_contact", field: keyof OrgContact, value: string) => {
    setForm((f) => {
      const cur = f[which] ?? emptyContact();
      return { ...f, [which]: { ...cur, [field]: value || null } };
    });
  };

  const toggleList = (field: "compliance_frameworks" | "data_types_handled" | "infrastructure_types" | "cloud_providers", value: string) => {
    setForm((f) => {
      const cur = new Set(f[field] ?? []);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      return { ...f, [field]: Array.from(cur) };
    });
  };

  const saveProfile = async () => {
    if (state.dualControl.configured && !operate.unlocked) {
      if (!(await requireDualControl("Updating organization profile requires a dual-control operate session."))) return;
    }
    setBusy(true);
    try {
      // Drop any infrastructure_types value the backend no longer accepts
      // (e.g. a stale "container"/"serverless" pick from before the enum
      // changed to cloud/on_prem/hybrid/saas/ot_ics/mobile) --- otherwise a
      // profile saved under the old options can never be saved again.
      const normalized = {
        ...form,
        infrastructure_types: (form.infrastructure_types ?? []).filter((v) => INFRASTRUCTURE_TYPES.includes(v)),
      };
      await updateOrgProfile(normalized);
      if (normalized.infrastructure_types.length !== (form.infrastructure_types ?? []).length) {
        setForm(normalized);
      }
      toast("success", "Profile saved", "SecureGraph updated your company profile.");
    } catch (err) {
      toast("error", "Save failed", err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Identity and profile"
        description="Your company profile: identity, contacts, security posture, branding, and service key."
        actions={<DocLink docId="howto-platform-08" label="Identity how-to" />}
      />

      <ProfileCompletionNotice />

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "profile", label: "Company profile" },
          { id: "security", label: "Security posture" },
          { id: "verification", label: "Verification and access" },
          { id: "keys", label: "Keys and branding" },
          { id: "privacy", label: "Privacy and data" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader title="Tenant identity" subtitle="Registered identity details for this organization" action={<Building2 size={16} className="text-slate-500" />} />
              <KeyValueList
                rows={[
                  ["Organization", state.org.name],
                  ["Tenant ID", `#${state.identity?.id ?? state.org.id}`],
                  ["Slug", state.identity?.slug || state.org.slug],
                  ["Creator user ID", state.identity?.creator_user_id ? `#${state.identity.creator_user_id}` : "---"],
                  ["Primary email", state.org.email || state.org.primary_email || "---"],
                  ["Secondary email", state.org.secondary_email || "---"],
                  ["Country", state.org.country || "---"],
                  ["Industry", state.org.industry || "---"],
                  ["Plan", state.org.plan || "---"],
                ].map(([k, v]) => [k, <CopyChip key={k} value={String(v)} />] as const)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["Setup", state.org.setup_completed || state.setup.setup_complete],
                  ["Email OTP", state.org.email_verified || state.org.identity_verified || state.setup.identity_verified],
                  ["Company", state.org.company_verified],
                  ["Domain", state.org.domain_verified],
                  ["Privacy", state.org.privacy_notice_accepted || state.setup.privacy_accepted],
                ].map(([label, ok]) => (
                  <span key={String(label)} className={cx("chip", ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-phantix-700/50 text-slate-500")}>
                    {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {String(label)}
                  </span>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
            <Card>
              <CardHeader title="Primary contact" subtitle="Registration and security contact" action={<User size={16} className="text-slate-500" />} />
              {state.org.primary_contact ? (
                <div className="space-y-2 text-sm text-slate-300">
                  <p className="font-semibold text-slate-100 capitalize">
                    {state.org.primary_contact.title} {state.org.primary_contact.name}
                  </p>
                  <p className="text-xs text-slate-500">{state.org.primary_contact.email}</p>
                  {state.org.primary_contact.phone && <p className="text-xs text-slate-500">{state.org.primary_contact.phone}</p>}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No primary contact on file --- edit Company profile.</p>
              )}
              <KeyValueList
                className="mt-3 text-sm"
                rows={[
                  ["Website", <span key="w" className="block truncate text-slate-200">{state.org.website || "---"}</span>],
                  ["Phone", <span key="p" className="text-slate-200">{state.org.phone || "---"}</span>],
                  ["Legal name", <span key="l" className="text-slate-200">{state.org.legal_name || "---"}</span>],
                ]}
              />
              <button className="btn-secondary mt-3 w-full !py-2" onClick={() => setTab("profile")}>Edit full profile</button>
            </Card>
          </motion.div>
        </div>
      )}

      {tab === "profile" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <Card>
            <CardHeader title="Company details" subtitle="Legal and registration details for this organization" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name"><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Legal name"><input className="input" value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value || null)} /></Field>
              <Field label="Registration number"><input className="input" value={form.registration_number ?? ""} onChange={(e) => set("registration_number", e.target.value || null)} /></Field>
              <Field label="Tax ID"><input className="input" value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value || null)} /></Field>
              <Field label="Company type">
                <select className="input" value={form.company_type ?? ""} onChange={(e) => set("company_type", e.target.value || null)}>
                  <option value="">---</option>
                  {COMPANY_TYPES.map((t) => <option key={t} value={t}>{COMPANY_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
              <Field label="Year founded"><input className="input" type="number" value={form.year_founded ?? ""} onChange={(e) => set("year_founded", e.target.value ? Number(e.target.value) : null)} /></Field>
              <Field label="Industry">
                <select className="input" value={form.industry} onChange={(e) => set("industry", e.target.value)}>
                  {industries.map((i) => <option key={i} value={i}>{humanize(i)}</option>)}
                </select>
              </Field>
              <Field label="Sub-industry"><input className="input" value={form.sub_industry ?? ""} onChange={(e) => set("sub_industry", e.target.value || null)} /></Field>
              <Field label="Employees">
                <select className="input" value={form.employee_count_range ?? ""} onChange={(e) => set("employee_count_range", e.target.value || null)}>
                  <option value="">---</option>
                  {employeeRanges.filter(Boolean).map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                </select>
              </Field>
              <Field label="Annual revenue">
                <select className="input" value={form.annual_revenue_range ?? ""} onChange={(e) => set("annual_revenue_range", e.target.value || null)}>
                  <option value="">---</option>
                  {revenueRanges.filter(Boolean).map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                </select>
              </Field>
              <Field label="Website"><input className="input" value={form.website ?? ""} onChange={(e) => set("website", e.target.value || null)} /></Field>
              <Field label="Phone"><input className="input" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value || null)} /></Field>
              <Field label="Secondary email"><input className="input" value={form.secondary_email ?? ""} onChange={(e) => set("secondary_email", e.target.value || null)} /></Field>
              <Field label="Timezone"><input className="input" placeholder="Africa/Lagos" value={form.timezone ?? ""} onChange={(e) => set("timezone", e.target.value || null)} /></Field>
              <Field label="Country"><input className="input" value={form.country} onChange={(e) => set("country", e.target.value)} /></Field>
              <Field label="City"><input className="input" value={form.city ?? ""} onChange={(e) => set("city", e.target.value || null)} /></Field>
              <Field label="State or province"><input className="input" value={form.state_province ?? ""} onChange={(e) => set("state_province", e.target.value || null)} /></Field>
              <Field label="Postal code"><input className="input" value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value || null)} /></Field>
              <div className="sm:col-span-2">
                <Field label="Address line 1"><input className="input" value={form.address_line1 ?? ""} onChange={(e) => set("address_line1", e.target.value || null)} /></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Address line 2"><input className="input" value={form.address_line2 ?? ""} onChange={(e) => set("address_line2", e.target.value || null)} /></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Description"><textarea className="input min-h-[80px]" value={form.description ?? ""} onChange={(e) => set("description", e.target.value || null)} /></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Internal notes"><textarea className="input min-h-[60px]" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Contacts" subtitle="Primary and secondary people" />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {(["primary_contact", "secondary_contact"] as const).map((which) => {
                const c = form[which] ?? emptyContact();
                return (
                  <div key={which} className="rounded-md border border-phantix-700/40 bg-phantix-950/40 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{which === "primary_contact" ? "Primary" : "Secondary"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="input" value={c.title ?? "mr"} onChange={(e) => setContact(which, "title", e.target.value)}>
                        {contactTitles.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                      </select>
                      <input className="input" placeholder="Full name" value={c.name ?? ""} onChange={(e) => setContact(which, "name", e.target.value)} />
                      <input className="input col-span-2" placeholder="email" value={c.email ?? ""} onChange={(e) => setContact(which, "email", e.target.value)} />
                      <input className="input" placeholder="phone" value={c.phone ?? ""} onChange={(e) => setContact(which, "phone", e.target.value)} />
                      <input className="input" placeholder="whatsapp" value={c.whatsapp_username ?? ""} onChange={(e) => setContact(which, "whatsapp_username", e.target.value)} />
                      <input className="input col-span-2" placeholder="telegram" value={c.telegram_username ?? ""} onChange={(e) => setContact(which, "telegram_username", e.target.value)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <button className="btn-primary" disabled={busy} onClick={() => void saveProfile()}>
            <Save size={15} /> {busy ? "Saving..." : "Save company profile"}
          </button>
        </motion.div>
      )}

      {tab === "security" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <Card>
            <CardHeader title="Security and compliance posture" subtitle="Used for recommendations and experience" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Security mailbox"><input className="input" value={form.security_mailbox ?? ""} onChange={(e) => set("security_mailbox", e.target.value || null)} /></Field>
              <Field label="Security maturity">
                <select className="input" value={form.security_maturity ?? ""} onChange={(e) => set("security_maturity", e.target.value || null)}>
                  <option value="">---</option>
                  {maturityLevels.filter(Boolean).map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
                </select>
              </Field>
              <Field label="Security team size"><input className="input" value={form.security_team_size ?? ""} onChange={(e) => set("security_team_size", e.target.value || null)} /></Field>
              <Field label="Critical assets summary"><input className="input" value={form.critical_assets_summary ?? ""} onChange={(e) => set("critical_assets_summary", e.target.value || null)} /></Field>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.has_dedicated_security_team} onChange={(e) => set("has_dedicated_security_team", e.target.checked)} />
                Dedicated security team
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.has_ciso} onChange={(e) => set("has_ciso", e.target.checked)} />
                Has CISO
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.previous_breach} onChange={(e) => set("previous_breach", e.target.checked)} />
                Previous breach
              </label>
              <div className="sm:col-span-2">
                <Field label="Breach notes"><textarea className="input min-h-[60px]" value={form.previous_breach_notes ?? ""} onChange={(e) => set("previous_breach_notes", e.target.value || null)} /></Field>
              </div>
            </div>

            <ChipGroup
              title="Compliance frameworks"
              options={["iso_27001", "soc_2", "pci_dss", "gdpr", "ndpr", "hipaa", "nist_csf", "cis_controls", "cbn_risk_based", "swift_csp", "iso_27701", "other"]}
              selected={form.compliance_frameworks ?? []}
              onToggle={(v) => toggleList("compliance_frameworks", v)}
            />
            <ChipGroup
              title="Data types handled"
              options={["pii", "phi", "pci", "financial", "credentials", "intellectual_property", "government", "biometric", "other"]}
              selected={form.data_types_handled ?? []}
              onToggle={(v) => toggleList("data_types_handled", v)}
            />
            <ChipGroup
              title="Infrastructure"
              options={INFRASTRUCTURE_TYPES}
              selected={form.infrastructure_types ?? []}
              onToggle={(v) => toggleList("infrastructure_types", v)}
            />
            <ChipGroup
              title="Cloud providers"
              options={["aws", "gcp", "azure", "digitalocean", "other"]}
              selected={form.cloud_providers ?? []}
              onToggle={(v) => toggleList("cloud_providers", v)}
            />
          </Card>
          <button className="btn-primary" disabled={busy} onClick={() => void saveProfile()}>
            <Save size={15} /> {busy ? "Saving..." : "Save security posture"}
          </button>
        </motion.div>
      )}

      {tab === "keys" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Left: service key, domain verification, branding — stacked */}
          <div className="space-y-5 lg:col-span-2">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader title="Service key" subtitle="Exactly one active key per company" action={<KeyRound size={16} className="text-slate-500" />} />
              {key ? (
                <>
                  <div className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-sm text-slate-200">{key.prefix}</span>
                        <p className="mt-0.5 text-[12px] text-slate-600">De-identified --- the full key was shown only at creation</p>
                      </div>
                      <StatusBadge status="active" />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Created {timeAgo(key.created_at)} · {key.last_used_at ? `last used ${timeAgo(key.last_used_at)}` : "never used"}
                    </p>
                  </div>
                  <div className="mt-4 flex gap-2.5">
                    <button
                      className="btn-primary flex-1"
                      onClick={async () => {
                        if (!operate.unlocked && !(await requireDualControl("Service key rotation requires a dual-control operate session."))) return;
                        setKeyModal(await rotateServiceKey());
                      }}
                    >
                      <RefreshCw size={14} /> Rotate
                    </button>
                    <button className="btn-danger" onClick={() => setRevokeOpen(true)}>Revoke</button>
                  </div>
                </>
              ) : (
                <button
                  className="btn-primary w-full"
                  onClick={async () => {
                    if (!operate.unlocked && !(await requireDualControl("Creating a service key requires a dual-control operate session."))) return;
                    setKeyModal(await rotateServiceKey());
                  }}
                >
                  <KeyRound size={14} /> Create service key
                </button>
              )}
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
            <Card>
              <CardHeader title="Report branding" subtitle="PNG, JPEG, WebP or SVG. Up to 2 MB, shown on report covers and footers" action={<ImagePlus size={16} className="text-slate-500" />} />
              <div className="flex items-center gap-4 rounded-md border border-phantix-700/40 bg-phantix-950/50 p-3.5">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-phantix-800/70">
                  {state.org.logo_url ? (
                    <img src={mediaUrl(state.org.logo_url)} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="font-display text-lg font-bold text-gold-400">{(state.org.name || "?").slice(0, 1)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-200">{state.org.name}</p>
                  <p className="text-xs text-slate-500">Used on report cover pages and footers</p>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                    className="hidden"
                    onChange={(e) => void onLogoSelected(e.target.files?.[0] ?? null)}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary !py-2 !text-xs"
                      disabled={logoBusy}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {logoBusy ? "Working..." : "Upload logo"}
                    </button>
                    {state.org.logo_url && (
                      <button type="button" className="btn-ghost !py-2 !text-xs text-severity-critical" disabled={logoBusy} onClick={() => void onLogoRemoveClick()}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
          </div>

          {/* Right: preferred services only */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <Card>
              <CardHeader title="Preferred services" subtitle="Shapes navigation and modules" action={<Layers size={16} className="text-slate-500" />} />
              <div className="space-y-2">
                {catalogItems.map((s) => {
                  const on = preferred.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setPreferred((p) => (on ? p.filter((k) => k !== s.key) : [...p, s.key]))}
                      className={cx(
                        "flex w-full items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-colors",
                        on ? "border-gold-400/40 bg-gold-400/8" : "border-phantix-700/40 bg-phantix-950/40 hover:border-phantix-500/50",
                      )}
                    >
                      <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-gold-400/50 bg-gold-400/20 text-gold-300" : "border-phantix-600 text-transparent")}>
                        <CheckCircle2 size={12} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-slate-200">{s.name}</span>
                        <span className="block text-[13px] text-slate-500">{s.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                className="btn-primary mt-4 w-full"
                onClick={async () => {
                  if (state.dualControl.configured && !operate.unlocked) {
                    if (!(await requireDualControl("Updating preferred services requires dual-control."))) return;
                  }
                  try {
                    await savePreferredServices(preferred);
                    toast("success", "Preferences saved", "Your preferred services were saved.");
                  } catch (err) {
                    toast("error", "Save failed", err instanceof Error ? err.message : "Request failed");
                  }
                }}
              >
                Save preferred services
              </button>
            </Card>
          </motion.div>
        </div>
      )}

      {tab === "verification" && (
        <div className="space-y-4">
          <VerifiedDomainsCard prefill={verifyPrefill} />
          <CompanyVerification />
          <DualControlPolicyCard />
        </div>
      )}

      {tab === "privacy" && <DataSubjectPanel />}

      {/* GitHub/Cloudflare-style file-delete gate — the logo is a stored file. */}
      <TypeToConfirm
        open={removeLogoOpen}
        title="Remove the company logo?"
        message={
          <>
            This deletes the logo file from your organisation's stored media. It is used on report cover pages and
            footers, so every generated report after removal will fall back to the placeholder. This cannot be undone.
          </>
        }
        confirmLabel="Remove logo"
        busy={logoBusy}
        onCancel={() => setRemoveLogoOpen(false)}
        onConfirm={() => void onLogoRemove()}
      />

      <Modal open={!!keyModal} onClose={() => setKeyModal(null)} title="Service key created">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-severity-medium/30 bg-severity-medium/10 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-severity-medium" />
            <p className="text-xs leading-5 text-slate-300">Copy now --- the full secret is shown once.</p>
          </div>
          <div className="rounded-md border border-phantix-700/50 bg-phantix-950/70 p-3.5 font-mono text-sm text-gold-300 break-all">{keyModal}</div>
          <button
            className="btn-primary w-full"
            onClick={() => {
              navigator.clipboard?.writeText(keyModal ?? "").catch(() => {});
              toast("success", "Copied");
              setKeyModal(null);
            }}
          >
            Copy and close
          </button>
        </div>
      </Modal>

      <Modal open={revokeOpen} onClose={() => setRevokeOpen(false)} title="Revoke service key?">
        <p className="text-sm text-slate-400">Integrations using this key will stop immediately. Login links are unaffected.</p>
        <div className="mt-5 flex gap-2.5">
          <button
            className="btn-danger flex-1"
            onClick={async () => {
              if (!operate.unlocked && !(await requireDualControl("Revoking a service key requires dual-control."))) return;
              await revokeServiceKey();
              setRevokeOpen(false);
              toast("info", "Key revoked");
            }}
          >
            Revoke permanently
          </button>
          <button className="btn-ghost" onClick={() => setRevokeOpen(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function ChipGroup({
  title, options, selected, onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const labels: Record<string, string> = {
    iso_27001: "ISO 27001", soc_2: "SOC 2", pci_dss: "PCI DSS", gdpr: "GDPR",
    ndpr: "NDPR", hipaa: "HIPAA", nist_csf: "NIST CSF", cis_controls: "CIS Controls",
    cbn_risk_based: "CBN Risk-Based", swift_csp: "SWIFT CSP", iso_27701: "ISO 27701",
    pii: "PII", phi: "PHI", pci: "PCI", financial: "Financial",
    credentials: "Credentials", intellectual_property: "Intellectual Property",
    government: "Government", biometric: "Biometric",
    cloud: "Cloud", on_prem: "On-Premises", hybrid: "Hybrid", saas: "SaaS",
    ot_ics: "OT/ICS", mobile: "Mobile",
  };
  return (
    <div className="mt-5">
      <p className="label">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={cx("chip", on ? "border-gold-400/40 bg-gold-400/10 text-gold-300" : "border-phantix-700/50 text-slate-500")}
            >
              {labels[o] ?? o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Privacy & data (staging-rollout §2) ──────────────────────────────────────
// NDPA §34–37 data-subject requests: POST/GET /api/v1/organizations/me/
// data-subject-request beside the privacy notice (GET /organizations/privacy)
// and the self-service export (GET /organizations/me/data-export).

type DsrType = "access" | "rectification" | "erasure" | "portability" | "restriction" | "objection";

const DSR_TYPES: { id: DsrType; label: string; helper: string }[] = [
  { id: "access", label: "Access my data", helper: "See what personal data we hold about you." },
  { id: "rectification", label: "Correct my data", helper: "Fix inaccurate or incomplete personal data." },
  { id: "erasure", label: "Delete my data", helper: "Ask us to erase your personal data." },
  { id: "portability", label: "Take my data elsewhere", helper: "Receive a machine-readable copy." },
  { id: "restriction", label: "Restrict processing", helper: "Limit how your data is used while we review." },
  { id: "objection", label: "Object to processing", helper: "Object to a specific use of your data." },
];

interface DsrRow {
  id: number;
  reference: string;
  request_type: DsrType;
  details?: string | null;
  contact_email?: string | null;
  status: string;
  created_at?: string;
}

const DSR_STATUS_CLASSES: Record<string, string> = {
  received: "border-gold-400/30 bg-gold-400/10 text-gold-300",
  in_progress: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  completed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
  rejected: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
};

function DataSubjectPanel() {
  const { toast } = useStore();
  const [type, setType] = useState<DsrType | null>(null);
  const [details, setDetails] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<DsrRow[] | null>(null);
  const [noticeVersion, setNoticeVersion] = useState<string | null>(null);

  const refresh = React.useCallback(() => {
    api.get<DsrRow[]>("/organizations/me/data-subject-request").then(setRows).catch(() => setRows([]));
  }, []);

  React.useEffect(() => {
    api.get<{ version?: string }>("/organizations/privacy").then((p) => setNoticeVersion(p?.version ?? null)).catch(() => {});
    refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    setSubmitting(true);
    try {
      await api.post("/organizations/me/data-subject-request", {
        request_type: type,
        details: details.trim() || null,
        contact_email: contactEmail.trim() || null,
      });
      toast("success", "Request received", `${DSR_TYPES.find((t) => t.id === type)?.label}. We will respond on the contact details on file.`);
      setType(null);
      setDetails("");
      refresh();
    } catch (err) {
      toast("error", "Could not submit request", err instanceof Error ? err.message : "Try again");
    } finally {
      setSubmitting(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const blob = await api.download("/organizations/me/data-export");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "phantix-my-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast("success", "Download started", "Your data export is ready.");
    } catch (err) {
      toast("error", "Export failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader
            title="Raise a data subject request"
            subtitle={noticeVersion ? `Privacy notice v${noticeVersion}` : "NDPA §34–37. In product, not by email"}
            action={
              <button type="button" onClick={() => void exportData()} disabled={exporting} className="btn-secondary !px-3 !py-1.5 text-xs">
                {exporting ? <Loader2 size={13} className="mr-1.5 inline animate-spin" /> : <Download size={13} className="mr-1.5 inline" />}
                Download my data
              </button>
            }
          />
          <form onSubmit={submit} className="space-y-4 px-5 pb-5">
            <div className="grid gap-2 sm:grid-cols-1">
              {DSR_TYPES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setType(r.id)}
                  className={cx(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    type === r.id ? "border-gold-400/50 bg-gold-400/10" : "border-phantix-700/60 bg-phantix-900/40 hover:border-phantix-600",
                  )}
                >
                  <p className={cx("text-sm font-medium", type === r.id ? "text-gold-300" : "text-slate-200")}>{r.label}</p>
                  <p className="mt-0.5 text-[13px] leading-4 text-slate-500">{r.helper}</p>
                </button>
              ))}
            </div>
            <div>
              <label className="label">Details (optional)</label>
              <textarea className="input min-h-[64px] resize-y" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything that helps us act on your request." />
            </div>
            <div>
              <label className="label">Contact email (optional)</label>
              <input type="email" className="input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <button type="submit" className="btn-primary w-full !py-2.5" disabled={!type || submitting}>
              {submitting ? <Loader2 size={14} className="mr-1.5 inline animate-spin" /> : <Send size={14} className="mr-1.5 inline" />}
              Submit request
            </button>
          </form>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <CollapsibleCard defaultOpen={false} title="Your requests" subtitle="Reference · type · status" action={<ShieldCheck size={16} className="text-slate-500" />}>
          <div className="px-5 pb-5">
            {rows === null ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : rows.length === 0 ? (
              <EmptyState icon={<FileText size={20} />} title="No requests yet" body="Raise a request on the left and track its status here." />
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-phantix-900/50 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200">
                        <span className="font-mono text-gold-400">{r.reference}</span>
                        <span className="mx-2 text-slate-600">·</span>
                        {DSR_TYPES.find((t) => t.id === r.request_type)?.label ?? r.request_type}
                      </p>
                      {r.details && <p className="mt-0.5 truncate text-[13px] text-slate-500">{r.details}</p>}
                    </div>
                    <span className={cx("chip !px-2 !py-0.5 text-[12px] capitalize", DSR_STATUS_CLASSES[r.status] ?? "border-phantix-700/60 bg-phantix-800/60 text-slate-300")}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleCard>
      </motion.div>
    </div>
  );
}
