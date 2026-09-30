import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2, Circle, Users, Database, Building2, KeyRound, ArrowRight,
  ShieldCheck, ScrollText, Rocket, AlertTriangle, Copy,
} from "lucide-react";
import DocLink from "@/components/DocLink";
import ProfileCompletionNotice, { buildProfileChecklist } from "@/components/ProfileCompletionNotice";
import { Card, CardHeader, CollapsibleCard, CompletionDonut, AnimatedNumber, StatusBadge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useSmartPoll } from "@/lib/usePolling";
import { APP_URL } from "@/lib/links";
import { timeAgo, cx } from "@/lib/utils";

export default function Dashboard() {
  const { state, securityDbReady, operate, toast, refreshSession } = useStore();
  const navigate = useNavigate();
  const dc = state.dualControl;
  const twoUsers = state.users.length >= 2;

  // Smart polling: keep tenant overview fresh in the background (SWR-style).
  // Skip the first tick (hydrateSession runs on mount) and poll every 60s;
  // slows to 5min when the tab is hidden.
  const skipFirstPoll = React.useRef(true);
  useSmartPoll(async () => {
    if (skipFirstPoll.current) { skipFirstPoll.current = false; return; }
    try { await refreshSession(); } catch { /* keep last data */ }
  }, { intervalMs: 60000, hiddenIntervalMs: 300000 });

  const checklist = [
    { done: state.setup.setup_complete, label: "Organization setup complete", to: "/dashboard" },
    { done: twoUsers, label: "Two dual-control people created", to: "/users" },
    { done: dc.configured, label: "Initiator + authorizer assigned", to: "/users" },
    { done: operate.unlocked, label: "First operate unlock completed", to: "/users" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const gettingStartedDone = doneCount === checklist.length;

  // Profile completion — the same checklist the notice uses, shown as a gauge
  // once the getting-started steps are behind the admin.
  const profileItems = buildProfileChecklist(state.org, state.setup);
  const profileDone = profileItems.filter((i) => i.done).length;
  const profilePct = Math.round((profileDone / profileItems.length) * 100);
  const profileMissing = profileItems.filter((i) => !i.done).length;

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">{state.org.name}</p>
          <h1 className="mt-1 font-display text-[26px] font-bold tracking-tight text-white">Tenant overview</h1>
          <p className="mt-1 text-sm text-slate-400">Management home --- keys, people and connections. Product operations live in the Command Centre.</p>
        </div>
        <DocLink docId="howto-platform-index" label="Platform how-to index" />
      </motion.div>

      {/* Profile completion — the admin's outstanding setup work, in plain language */}
      <ProfileCompletionNotice />

      {/* Security DB gate */}
      {!securityDbReady && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-5">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-severity-medium/30 bg-severity-medium/8 px-5 py-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-severity-medium/15 text-severity-medium">
              <AlertTriangle size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-100">Security database not ready</p>
              <p className="text-sm text-slate-400">
                Scans, VAPT and findings are blocked until a <span className="font-mono text-xs">security_data_storage</span> connection
                is bootstrapped. This gate is enforced by the platform, not just the UI.
              </p>
            </div>
            <Link to="/connections" className="btn-primary">Connect security DB <ArrowRight size={15} /></Link>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Getting started → profile completion status once every step is done. */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          {gettingStartedDone ? (
            <Card className="flex h-full flex-col">
              <CardHeader
                title="Profile completion status"
                subtitle={profileMissing === 0 ? "Your organization profile is complete" : `${profileMissing} profile item${profileMissing === 1 ? "" : "s"} still to complete`}
                action={<ShieldCheck size={16} className="text-gold-400" />}
              />
              <div className="flex flex-1 flex-col items-center justify-center gap-5 py-2">
                <CompletionDonut value={profilePct} label="complete" sublabel={`${profileDone} of ${profileItems.length} items`} />
                <Link to="/identity" className="btn-secondary !px-3.5 !py-2 !text-xs">
                  Review profile <ArrowRight size={13} />
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="h-full">
              <CardHeader
                title="Getting started"
                subtitle={`${doneCount} of ${checklist.length} complete`}
                action={<ShieldCheck size={16} className="text-gold-400" />}
              />
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-phantix-700/50">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(doneCount / checklist.length) * 100}%` }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gold-400"
                />
              </div>
              <div className="space-y-2">
                {checklist.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => !c.done && navigate(c.to)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
                      c.done ? "border-emerald-400/20 bg-emerald-400/5 text-slate-400" : "border-phantix-700/50 bg-phantix-950/40 text-slate-200 hover:border-gold-400/40",
                    )}
                  >
                    {c.done ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> : <Circle size={16} className="shrink-0 text-slate-600" />}
                    <span className={c.done ? "line-through opacity-70" : ""}>{c.label}</span>
                    {!c.done && <ArrowRight size={14} className="ml-auto shrink-0 text-gold-400" />}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="grid grid-cols-2 gap-4">
          {[
            { icon: <Users size={17} />, label: "Org users", value: state.users.length, to: "/users", accent: "text-phantix-300 bg-phantix-700/40" },
            { icon: <Database size={17} />, label: "Connections", value: state.connections.length, to: "/connections", accent: "text-emerald-400 bg-emerald-400/12" },
            { icon: <Building2 size={17} />, label: "Companies", value: 1 + state.companies.length, to: "/companies", accent: "text-gold-400 bg-gold-400/12" },
            { icon: <KeyRound size={17} />, label: "Service keys", value: (state.serviceKey ? 1 : 0) + state.companies.filter((c) => c.key_prefix).length, to: "/identity", accent: "text-severity-low bg-severity-low/12" },
          ].map((s) => (
            <Link key={s.label} to={s.to} className="card group p-5 transition-all hover:-translate-y-0.5 hover:border-phantix-500/60">
              <span className={cx("flex h-10 w-10 items-center justify-center rounded-md", s.accent)}>{s.icon}</span>
              <p className="mt-3 font-display text-3xl font-bold text-white"><AnimatedNumber value={s.value} /></p>
              <p className="mt-0.5 text-xs text-slate-500 group-hover:text-slate-400">{s.label}</p>
            </Link>
          ))}
        </motion.div>

        {/* Identity quick card */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="h-full">
            <CardHeader title="Tenant identity" subtitle="Quote these on support tickets" />
            <div className="space-y-2.5">
              {[
                ["Tenant ID", `#${state.org.id}`],
                ["Slug", state.org.slug],
                ["Creator", state.org.creator_user_id != null ? `#${state.org.creator_user_id}` : "Not set"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-4 py-3">
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{k}</span>
                  <button
                    className="flex min-w-0 items-center gap-2 font-mono text-sm text-slate-200 hover:text-gold-300"
                    onClick={() => { navigator.clipboard?.writeText(v).catch(() => {}); toast("success", "Copied"); }}
                  >
                    <span className="break-all text-right">{v}</span>
                    <Copy size={12} className="shrink-0 text-slate-600" />
                  </button>
                </div>
              ))}
            </div>
            <Link to="/identity" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300">
              Manage identity and keys <ArrowRight size={12} />
            </Link>
          </Card>
        </motion.div>
      </div>

      {/* Bottom row */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Recent audit */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <CollapsibleCard title="Recent activity" action={<ScrollText size={15} className="text-slate-500" />}>
            <div className="space-y-3">
              {state.audit.slice(0, 4).map((e) => (
                <div key={e.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-300">{e.action}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{e.initiator_name} · {timeAgo(e.created_at)}</p>
                  </div>
                </div>
              ))}
              {state.audit.length === 0 && <p className="text-sm text-slate-500">No activity yet.</p>}
            </div>
            <Link to="/audit" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-400 hover:text-gold-300">
              Full audit trail <ArrowRight size={12} />
            </Link>
          </CollapsibleCard>
        </motion.div>

        {/* Next step / launch */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold-400/10 blur-[70px]" />
            <CardHeader title="Ready for operations?" subtitle="The Command Centre is where scans, campaigns, risks and reports live" />
            <div className="relative flex flex-wrap items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-400">
                <Rocket size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 text-slate-300">
                  {securityDbReady
                    ? "Your security database is ready --- the Command Centre is unblocked."
                    : "Connect and bootstrap your security database first --- the platform blocks scans and VAPT without it."}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={securityDbReady ? "ready" : "pending"} />
                  <span className="text-xs text-slate-500">{securityDbReady ? "bootstrap gate passed" : "bootstrap gate"}</span>
                </div>
              </div>
              <a href={`${APP_URL}/dashboard`} target="_blank" rel="noreferrer" className="btn-primary">
                Launch Command Centre <ArrowRight size={15} />
              </a>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
