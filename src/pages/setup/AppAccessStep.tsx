import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Copy, ExternalLink, Loader2, Mail, MailCheck, UserPlus, Users } from "lucide-react";
import { useStore, type LoginLinkResult } from "@/lib/store";
import { SERVICE_KEY_STEP } from "@/lib/firstRun";
import { APP_URL } from "@/lib/links";
import { cx } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AddUserModal } from "@/pages/Users";

/**
 * First-run step after the Quick Scan results are saved: create the people who
 * use the applications, then email each one a login link. Nobody is sent to the
 * applications until at least one link is out, because the applications only
 * accept users who arrive through their link.
 */
export default function AppAccessStep() {
  const { state, session, issueLoginLink, toast } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  // Links issued on this page: shows "Sent" at once and keeps a link to copy
  // when the email could not be delivered.
  const [sent, setSent] = useState<Record<number, LoginLinkResult>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const myEmail = (session?.email || state.org.email || "").toLowerCase();
  // The signed-in owner first: they need their own link to get into the apps.
  const users = state.users
    .filter((u) => u.is_active !== false)
    .sort((a, b) => Number(b.email.toLowerCase() === myEmail) - Number(a.email.toLowerCase() === myEmail));
  const me = users.find((u) => u.email.toLowerCase() === myEmail) || null;
  const hasKey = Boolean(state.serviceKey?.active);
  const linkFor = (userId: number) =>
    state.loginLinks.find((l) => l.user_id === userId && l.status !== "expired");
  const hasLink = (userId: number) => Boolean(sent[userId] || linkFor(userId));
  const anySent = users.some((u) => hasLink(u.id));
  const withoutLink = users.filter((u) => !hasLink(u.id));

  const send = async (userId: number, quiet = false): Promise<boolean> => {
    try {
      const result = await issueLoginLink(userId);
      setSent((s) => ({ ...s, [userId]: result }));
      if (!quiet) {
        toast(
          result.emailed ? "success" : "warning",
          result.emailed ? "Login link sent" : "Email not delivered",
          result.emailed ? `Sent to ${result.email}.` : "Copy the link and share it over a secure channel.",
        );
      }
      return true;
    } catch (err) {
      toast("error", "Could not send the login link", err instanceof Error ? err.message : "");
      return false;
    }
  };

  const sendOne = async (userId: number) => {
    setSendingId(userId);
    try { await send(userId); } finally { setSendingId(null); }
  };

  const sendAll = async () => {
    setSendingAll(true);
    let ok = 0;
    try {
      for (const u of withoutLink) {
        setSendingId(u.id);
        if (await send(u.id, true)) ok++;
      }
    } finally {
      setSendingId(null);
      setSendingAll(false);
    }
    if (ok) toast("success", `${ok} login link${ok === 1 ? "" : "s"} sent`, "Each user gets theirs by email.");
  };

  const copy = (userId: number, url: string) => {
    try { void navigator.clipboard?.writeText(url); } catch { /* clipboard unavailable */ }
    setCopiedId(userId);
    toast("success", "Login link copied");
  };

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <header className="relative flex items-center justify-between px-4 py-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-9 w-9 shrink-0" />
          <span className="truncate font-display text-[15px] font-bold text-white">{state.org.name || "SecureGraph"}</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 size={15} /> Your Quick Scan results are saved to your security database.
        </p>

        <div className="card mt-4 p-7">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-400">Next step</p>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold text-white">
            <Users size={20} className="text-gold-400" /> Give your team access
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The applications only let people in through a login link. Create a user for each person, then email them their
            link. They open it from their inbox, set a password and sign in.
          </p>

          {!hasKey && (
            <div className="mt-5 flex flex-wrap items-start gap-3 rounded-md border border-severity-medium/30 bg-severity-medium/[0.06] px-4 py-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-severity-medium" />
              <p className="min-w-[12rem] flex-1 text-sm text-slate-300">
                Login links do not work until your organization has a service key.
              </p>
              <Link to={SERVICE_KEY_STEP} className="btn-primary shrink-0 !py-1.5 text-sm">Create service key</Link>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-100">1. App users</p>
            <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => setAddOpen(true)}>
              <UserPlus size={14} /> Add user
            </button>
          </div>

          {users.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-phantix-700/60 px-4 py-6 text-center text-sm text-slate-500">
              No users yet. Add the people who will use SecureGraph.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-phantix-700/40 rounded-md border border-phantix-700/50">
              {users.map((u) => {
                const fresh = sent[u.id];
                const done = hasLink(u.id);
                const busy = sendingId === u.id;
                return (
                  <li key={u.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-[10rem] flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {u.full_name}
                          {u.id === me?.id && <span className="ml-2 rounded bg-gold-400/15 px-1.5 py-0.5 text-[11px] font-semibold text-gold-300">You</span>}
                        </p>
                        <p className="truncate text-[13px] text-slate-500">{u.email} · {u.role}</p>
                      </div>
                      {done && !busy && (
                        <span className={cx("flex items-center gap-1.5 text-[13px]", fresh && !fresh.emailed ? "text-severity-medium" : "text-emerald-300")}>
                          {fresh && !fresh.emailed ? <AlertTriangle size={13} /> : <MailCheck size={13} />}
                          {fresh && !fresh.emailed ? "Not delivered" : "Link sent"}
                        </span>
                      )}
                      <button
                        type="button"
                        className={cx(done ? "btn-ghost" : "btn-primary", "!px-3 !py-1.5 text-[13px]")}
                        disabled={!hasKey || busy || sendingAll}
                        onClick={() => void sendOne(u.id)}
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                        {busy ? "Sending..." : done ? "Send again" : "Email login link"}
                      </button>
                    </div>
                    {fresh && !fresh.emailed && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-gold-400/30 bg-gold-400/[0.06] p-2">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs text-gold-200">{fresh.url}</code>
                        <button type="button" className="btn-ghost shrink-0 !px-2 !py-1 text-xs" onClick={() => copy(u.id, fresh.url)}>
                          {copiedId === u.id ? <Check size={12} /> : <Copy size={12} />} {copiedId === u.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {withoutLink.length > 1 && hasKey && (
            <button type="button" className="btn-secondary mt-3 w-full" disabled={sendingAll} onClick={() => void sendAll()}>
              {sendingAll ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Email login links to all {withoutLink.length} users without one
            </button>
          )}

          <p className="mt-6 text-sm font-semibold text-slate-100">2. Open your email</p>
          {me && hasLink(me.id) ? (
            <div className="mt-2 rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-4 py-3 text-sm text-slate-300">
              <p className="flex items-center gap-2 font-medium text-emerald-300"><MailCheck size={15} /> Your link is in {me.email}</p>
              <p className="mt-1.5">
                Open that email on this computer and click the link. It takes you into SecureGraph, where you set your
                app password. Everyone else does the same with their own email.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-400">
              {me
                ? "Email yourself a login link first (the row marked You). That link is how you get into SecureGraph."
                : "Email at least one login link first. Each person opens their own link from their inbox."}
            </p>
          )}
          {anySent ? (
            <a href={`${APP_URL}/login`} className="btn-secondary mt-4 w-full !py-3">
              Already set your app password? Sign in to SecureGraph <ExternalLink size={15} />
            </a>
          ) : (
            <button type="button" disabled className="btn-secondary mt-4 w-full !py-3">
              Sign in to SecureGraph <ArrowRight size={15} />
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-sm">
          <Link to="/dashboard" className="text-slate-500 hover:text-slate-300">Skip to dashboard</Link>
        </p>
      </main>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
