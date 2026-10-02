import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Github, Plus, RefreshCw, Lock, Unlock, ExternalLink, Search, Loader2, GitBranch, ShieldCheck, Clock, CheckCircle2, Wallet, Settings2, ArrowRight } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, CardHeader, StatusBadge, Modal, Tabs, SkeletonCard } from "@/components/ui";
import { api, DEMO_MODE, delay, isPendingApproval } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface InstallInfo { install_url: string; state: string; configured: boolean; }
interface DiscoverableInstall { installation_id: number; account_login: string; account_type: string; repository_selection: string | null; }
interface Installation {
  connected: boolean;
  status: string;
  approval_status: string | null;
  installation_status: string | null;
  account_login: string;
  account_type: string;
  installation_id: string;
  pat_fallback: boolean;
  can_list_repos: boolean;
  can_analyze: boolean;
  setup_action: string | null;
  message: string;
  discoverable_installations: DiscoverableInstall[];
}
interface Repo { id: number; full_name: string; name: string; private: boolean; can_analyze: boolean; requires_premium: boolean; default_branch: string; }

const demoInstall: Installation = { connected: true, status: "connected", approval_status: "approved", installation_status: "active", account_login: "acme-dev", account_type: "User", installation_id: "987654", pat_fallback: false, can_list_repos: true, can_analyze: true, setup_action: "install", message: "GitHub App connected", discoverable_installations: [] };
const demoRepos: Repo[] = [
  { id: 1, full_name: "acme-dev/api-gateway", name: "api-gateway", private: true, can_analyze: true, requires_premium: false, default_branch: "main" },
  { id: 2, full_name: "acme-dev/web-portal", name: "web-portal", private: false, can_analyze: true, requires_premium: false, default_branch: "main" },
  { id: 3, full_name: "acme-dev/internal-tools", name: "internal-tools", private: true, can_analyze: false, requires_premium: true, default_branch: "main" },
];

const POLL_MS = 20000;

export default function GithubIntegration() {
  const { toast, requireDualControl } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [install, setInstall] = useState<Installation | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeRepo, setUpgradeRepo] = useState<Repo | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"repos" | "branch">("repos");
  const [loadError, setLoadError] = useState("");
  const [justConnected, setJustConnected] = useState(false);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const installRef = useRef<Installation | null>(null);
  installRef.current = install;

  const mapInstall = (inst: any): Installation => ({
    connected: Boolean(inst?.connected),
    status: String(inst?.status ?? "not_connected"),
    approval_status: inst?.approval_status ?? null,
    installation_status: inst?.installation_status ?? null,
    account_login: String(inst?.account_login ?? ""),
    account_type: String(inst?.account_type ?? ""),
    installation_id: String(inst?.installation_id ?? ""),
    pat_fallback: Boolean(inst?.pat_fallback),
    can_list_repos: inst?.can_list_repos !== false,
    can_analyze: inst?.can_analyze !== false,
    setup_action: inst?.setup_action ?? null,
    message: String(inst?.message ?? ""),
    discoverable_installations: Array.isArray(inst?.discoverable_installations)
      ? (inst.discoverable_installations as DiscoverableInstall[])
      : [],
  });

  // OAuth callback: GitHub redirects back with installation_id/setup_action/state (+ org hints)
  useEffect(() => {
    const installationId = searchParams.get("installation_id");
    const state = searchParams.get("state");
    const setupAction = searchParams.get("setup_action");
    const accountLogin = searchParams.get("account_login");
    const accountType = searchParams.get("account_type");
    const requestId = searchParams.get("request_id");
    const requestedByLogin = searchParams.get("requested_by_login");
    if (!installationId && !setupAction) return;
    setConnecting(true);
    (async () => {
      try {
        if (DEMO_MODE) { await delay(300); setInstall(demoInstall); }
        else {
          await api.post("/github/callback", {
            installation_id: installationId ? Number(installationId) : undefined,
            state: state || "",
            setup_action: setupAction || "",
            account_login: accountLogin || "",
            account_type: accountType || "",
            request_id: requestId ? Number(requestId) : undefined,
            requested_by_login: requestedByLogin || "",
          });
        }
        setSearchParams({}, { replace: true });
        await load();
      } catch (e) {
        toast("error", "Callback failed", e instanceof Error ? e.message : "Could not complete GitHub connection");
      } finally {
        setConnecting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      if (DEMO_MODE) { await delay(300); setInstall(demoInstall); setRepos(demoRepos); return; }
      const inst = await api.get<any>("/github/installation?refresh=true");
      setInstall(mapInstall(inst));
      const status = String(inst?.status ?? "not_connected");
      if (status === "connected" || status === "suspended") {
        try {
          const reposRes = await api.get<any>("/github/repositories?refresh=false");
          const items = reposRes?.items ?? reposRes ?? [];
          setRepos(items.map((r: any) => ({ id: Number(r.id ?? r.repo_id), full_name: String(r.full_name ?? ""), name: String(r.name ?? ""), private: Boolean(r.private ?? r.is_private), can_analyze: r.can_analyze !== false, requires_premium: Boolean(r.requires_premium), default_branch: String(r.default_branch ?? "main") })));
        } catch (e: any) {
          const code = e?.detail?.code ?? e?.detail?.detail?.code;
          if (code !== "github_awaiting_approval") setRepos([]);
          else setRepos([]);
        }
      } else {
        setRepos([]);
      }
    } catch (e) {
      setInstall(null);
      setRepos([]);
      setLoadError(e instanceof Error ? e.message : "Could not load GitHub integration");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // When the user returns to this tab after installing the app in the new tab,
  // refresh the connection immediately.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onFocus = () => {
      const cur = installRef.current;
      if (!cur?.connected || cur.status === "awaiting_approval" || cur.status === "suspended") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // While the user is finishing the install in the new tab, poll so the
  // connection is picked up automatically the moment GitHub records it.
  useEffect(() => {
    if (!justConnected) return;
    const t = window.setInterval(() => { void load(); }, 6000);
    const stop = window.setTimeout(() => setJustConnected(false), 90_000);
    return () => { window.clearInterval(t); window.clearTimeout(stop); };
  }, [justConnected, load]);

  // Poll every 20s while awaiting org approval
  const awaiting = install?.status === "awaiting_approval";
  useEffect(() => {
    if (!awaiting) return;
    const t = window.setInterval(() => { load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [awaiting, load]);

  const connect = async () => {
    setConnecting(true);
    try {
      if (DEMO_MODE) { await delay(400); setInstall(demoInstall); return; }
      const res = await api.get<InstallInfo>("/github/install-url");
      if (!res.configured) { toast("error", "GitHub App not configured", "The GitHub App is not set up on the server yet."); return; }
      // Redirect in the same tab — the OAuth callback returns to this page
      // (/integrations/github/callback) so the sidebar and page stay intact.
      window.location.href = res.install_url;
    } catch (e) { toast("error", "Connect failed", e instanceof Error ? e.message : ""); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    // DELETE /github/installation is dual-control exempt (per FE contract §2.2).
    try {
      if (DEMO_MODE) { await delay(300); } else { await api.delete("/github/installation"); }
      setInstall({ connected: false, status: "not_connected", approval_status: null, installation_status: null, account_login: "", account_type: "", installation_id: "", pat_fallback: false, can_list_repos: false, can_analyze: false, setup_action: null, message: "", discoverable_installations: [] });
      setRepos([]);
      toast("success", "Disconnected");
    } catch (e) { toast("error", "Disconnect failed"); }
  };

  const sync = async () => {
    setRefreshing(true);
    try {
      if (DEMO_MODE) { await delay(500); return; }
      await api.post("/github/repositories/sync", {});
      await load();
    } catch (e) { toast("error", "Sync failed"); }
    finally { setRefreshing(false); }
  };

  const linkInstall = async (installationId: number) => {
    setLinkingId(installationId);
    try {
      if (DEMO_MODE) { await delay(400); setInstall(demoInstall); return; }
      await api.post("/github/callback", { installation_id: installationId, setup_action: "install" });
      toast("success", "Installation linked");
      await load();
    } catch (e) { toast("error", "Link failed", e instanceof Error ? e.message : ""); }
    finally { setLinkingId(null); }
  };

  const analyze = async (repo: Repo) => {
    if (!repo.can_analyze) { setUpgradeRepo(repo); setUpgradeOpen(true); return; }
    // Analyze is a mutating op — dual-control session required when configured.
    if (!(await requireDualControl("Analyzing a repository requires a dual-control operate session."))) return;
    setAnalyzing(repo.id);
    try {
      if (DEMO_MODE) { await delay(800); toast("success", "Analysis queued", `${repo.full_name}`); return; }
      await api.post("/github/repositories/analyze", { repo_id: repo.id, full_name: repo.full_name, analysis_profile: "full" }, { dualControl: true });
      toast("success", "Analysis queued", `${repo.full_name}`);
    } catch (e: any) {
      const code = e?.detail?.code ?? e?.detail?.detail?.code;
      if (code === "github_private_requires_premium") { setUpgradeRepo(repo); setUpgradeOpen(true); }
      else toast("error", "Analyze failed", e instanceof Error ? e.message : "");
    }
    finally { setAnalyzing(null); }
  };

  const filtered = repos.filter((r) => r.full_name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="GitHub"
        description="Connect the SecureGraph GitHub App to inventory and analyze your repositories. This is the primary integration. A personal access token is the legacy method."
        actions={
          <>
            <DocLink docId="howto-platform-10" label="GitHub how-to" />
            <button onClick={load} className="btn-ghost" aria-label="Refresh GitHub status" title="Refresh"><RefreshCw size={15} /></button>
          </>
        }
      />

      {loadError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-4 py-3">
          <p className="text-sm text-red-300">Could not load GitHub integration: {loadError}</p>
          <button onClick={load} className="btn-ghost text-xs">Retry</button>
        </div>
      )}

      {loading ? <SkeletonCard className="h-64" /> : !install?.connected ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-phantix-800/70 text-gold-400"><Github size={30} /></span>
            <h2 className="mt-5 font-display text-2xl font-bold text-white">Connect your GitHub account</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              Install the SecureGraph App on GitHub to inventory repositories and run security analysis. Private repos are available on the Premium plan.
            </p>
            <button onClick={connect} disabled={connecting} className="btn-primary mt-6"><Github size={16} /> {connecting ? "Opening GitHub..." : "Connect GitHub"}</button>

            {/* Discoverable (already-installed) GitHub Apps to link */}
            {(install?.discoverable_installations?.length ?? 0) > 0 && (
              <div className="mx-auto mt-6 max-w-md rounded-md border border-gold-400/25 bg-gold-400/5 p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">
                  {install!.discoverable_installations.length} unlinked GitHub installation{install!.discoverable_installations.length === 1 ? "" : "s"} found
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  The App is already installed on one of your GitHub accounts. Link it instead of reinstalling it.
                </p>
                <div className="mt-3 space-y-2">
                  {install!.discoverable_installations.map((d) => (
                    <div key={d.installation_id} className="flex items-center gap-3 rounded-lg border border-phantix-700/40 bg-phantix-950/50 px-3 py-2.5">
                      <Github size={15} className="shrink-0 text-gold-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">{d.account_login}</p>
                        <p className="text-[12px] text-slate-500">{d.account_type || "GitHub App"}{d.repository_selection ? ` · ${d.repository_selection}` : ""}</p>
                      </div>
                      <button
                        onClick={() => void linkInstall(d.installation_id)}
                        disabled={linkingId === d.installation_id}
                        className="btn-secondary shrink-0 !px-3 !py-1.5 !text-xs"
                      >
                        {linkingId === d.installation_id ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {justConnected && (
              <div className="mx-auto mt-5 max-w-md rounded-md border border-phantix-600/40 bg-phantix-800/40 px-4 py-3 text-left">
                <div className="flex items-start gap-2">
                  <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-gold-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">GitHub opened in a new tab</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Complete the install there, then come back. SecureGraph refreshes automatically. Installed already?
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => void load()} disabled={loading} className="btn-secondary !py-1.5 !text-xs">
                        <RefreshCw size={12} className={cx(loading && "animate-spin")} /> Check connection now
                      </button>
                      <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer" className="btn-ghost !text-xs"><ExternalLink size={12} /> Open GitHub</a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!justConnected && !awaiting && (
              <div className="mx-auto mt-5 flex max-w-md items-center justify-center gap-2 text-xs text-slate-500">
                <CheckCircle2 size={13} className="text-gold-400" />
                Installed the app already?
                <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 font-semibold text-gold-400 hover:text-gold-300">
                  <RefreshCw size={12} className={cx(loading && "animate-spin")} /> Refresh status
                </button>
              </div>
            )}

            {/* Awaiting org approval */}
            {awaiting && (
              <div className="mx-auto mt-5 max-w-md rounded-md border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-left">
                <div className="flex items-start gap-2">
                  <Clock size={16} className="mt-0.5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">Awaiting GitHub org approval</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Waiting for a GitHub organization owner to approve the SecureGraph app. This page refreshes automatically.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer" className="btn-ghost !text-xs"><ExternalLink size={12} /> Open GitHub</a>
                      <button onClick={load} className="btn-ghost !text-xs"><RefreshCw size={12} /> Check now</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rejected / suspended */}
            {install?.status === "rejected" && (
              <div className="mx-auto mt-5 max-w-md rounded-md border border-severity-critical/30 bg-severity-critical/10 px-4 py-3 text-left">
                <p className="text-sm font-medium text-red-300">GitHub install request denied or cancelled</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Ask an organization owner to install the app, then connect again.</p>
                <button onClick={connect} disabled={connecting} className="btn-primary mt-3 !text-xs">{connecting ? "Redirecting..." : "Connect again"}</button>
              </div>
            )}
            {install?.status === "suspended" && (
              <div className="mx-auto mt-5 max-w-md rounded-md border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-left">
                <p className="text-sm font-medium text-amber-300">Installation suspended on GitHub</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">The GitHub App installation was suspended. Resume it in GitHub App settings to continue.</p>
                <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer" className="btn-ghost mt-3 !text-xs"><ExternalLink size={12} /> Open GitHub App settings</a>
              </div>
            )}

            {/* PAT fallback */}
            {install?.pat_fallback && (
              <div className="mx-auto mt-5 max-w-md rounded-md border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-left">
                <p className="text-xs text-amber-300">Legacy PAT is connected. Migrate to the GitHub App for private-repo analysis and better coverage.</p>
                <button onClick={connect} disabled={connecting} className="btn-primary mt-2 !text-xs">{connecting ? "Redirecting..." : "Migrate to GitHub App"}</button>
              </div>
            )}
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-5">
          {/* Connection card */}
          <Card>
            <CardHeader title="Connected account" subtitle="GitHub App installation" action={<StatusBadge status="connected" />} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-400/10 text-emerald-400"><GitBranch size={19} /></span>
                <div>
                  <p className="font-semibold text-slate-100">{install.account_login}</p>
                  <p className="text-xs text-slate-500">{install.account_type || "GitHub App"} · {install.installation_id ? `install ${install.installation_id}` : ""}</p>
                </div>
              </div>
              <button onClick={disconnect} className="btn-ghost text-xs text-severity-critical">Disconnect</button>
            </div>
            {install.pat_fallback && <p className="mt-3 text-xs text-amber-400">Using the legacy personal access token fallback. Connect the App to enable private repository analysis.</p>}
          </Card>

          <Tabs
            tabs={[
              { id: "repos", label: "Repositories" },
              { id: "branch", label: "Branch Reviewer" },
            ]}
            active={view}
            onChange={(id) => setView(id as "repos" | "branch")}
          />

          {view === "repos" ? (
          /* Repo list */
          <Card>
            <CardHeader
              title="Repositories"
              subtitle={`${repos.length} repos synced`}
              action={<button onClick={sync} disabled={refreshing} className="btn-ghost text-xs"><RefreshCw size={12} className={cx(refreshing && "animate-spin")} /> Sync</button>}
            />
            <div className="mb-3 flex items-center gap-2 rounded-md border border-phantix-700/50 bg-phantix-950/50 px-3 py-2">
              <Search size={14} className="text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search repositories..." className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500" />
            </div>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No repositories. Connect a GitHub account to see repos.</p>
            ) : (
              <div className="-mx-4 -mb-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-phantix-700/40">
                      <th className="th">Repository</th>
                      <th className="th">Branch</th>
                      <th className="th">Visibility</th>
                      <th className="th">Review status</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b border-phantix-800/40 last:border-0 hover:bg-phantix-800/35">
                        <td className="td">
                          <div className="flex min-w-0 items-center gap-2">
                            <GitBranch size={15} className="shrink-0 text-gold-400" />
                            <p className="truncate font-medium text-slate-200">{r.full_name}</p>
                          </div>
                        </td>
                        <td className="td font-mono text-xs text-slate-400">{r.default_branch}</td>
                        <td className="td">
                          {r.private ? <span className="chip border-amber-400/30 bg-amber-400/10 text-amber-300"><Lock size={10} className="mr-1 inline" /> Private</span> : <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300"><Unlock size={10} className="mr-1 inline" /> Public</span>}
                        </td>
                        <td className="td">
                          {r.requires_premium ? <span className="chip border-gold-400/30 bg-gold-400/10 text-gold-300"><ShieldCheck size={10} className="mr-1 inline" /> Premium</span> : <span className="text-xs text-slate-500">Included</span>}
                        </td>
                        <td className="td text-right">
                          <button onClick={() => analyze(r)} disabled={analyzing === r.id} className={cx("btn-primary !px-3 !py-1.5 !text-xs", !r.can_analyze && "opacity-60")}>
                            {analyzing === r.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Analyze
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          ) : (
          <BranchReviewer repos={repos} />
          )}
        </div>
      )}

      {/* Upgrade modal */}
      <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title="Private repo requires Premium">
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-md bg-gold-400/10 border border-gold-400/25">
            <Lock size={16} className="text-gold-400" />
            <p className="text-sm text-slate-300"><strong className="text-gold-300">{upgradeRepo?.full_name}</strong> is a private repository. Analyzing private repos requires the Premium plan.</p>
          </div>
          <p className="text-xs leading-5 text-slate-400">Free plan includes public repository analysis only. Upgrade to Premium for private repo security scanning and continuous assurance.</p>
          <button className="btn-primary w-full" onClick={() => { setUpgradeOpen(false); window.location.href = "/billing"; }}>Upgrade to Premium</button>
        </div>
      </Modal>
    </div>
  );
}

// ── Branch Security Reviewer (agentic) ────────────────────────────────────────
interface BranchReviewSettings {
  id?: number;
  organization_id?: number;
  github_repository_id: number;
  watched_branch: string;
  enabled: boolean;
  post_github_comment: boolean;
  repository?: { id: number; full_name?: string; name?: string; private?: boolean } | null;
}
interface BranchWallet { id?: number; organization_id?: number; balance_ngn: number; updated_at?: string | null; }

const demoWallet: BranchWallet = { id: 1, organization_id: 1, balance_ngn: 125000, updated_at: new Date().toISOString() };

function BranchReviewer({ repos }: { repos: Repo[] }) {
  const { toast, requireDualControl } = useStore();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Record<number, BranchReviewSettings>>({});
  const [wallet, setWallet] = useState<BranchWallet | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [amount, setAmount] = useState("50000");
  const [topping, setTopping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (DEMO_MODE) { await delay(300); setWallet(demoWallet); setSettings({}); setLoading(false); return; }
      const [settingsRes, walletRes] = await Promise.all([
        api.get<any>("/github/branch-reviews/settings"),
        api.get<any>("/github/branch-reviews/wallet"),
      ]);
      const map: Record<number, BranchReviewSettings> = {};
      for (const item of settingsRes?.items ?? []) map[Number(item.github_repository_id)] = item as BranchReviewSettings;
      setSettings(map);
      setWallet(walletRes as BranchWallet);
    } catch (e) {
      toast("error", "Could not load branch review", e instanceof Error ? e.message : "");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const repoName = (repoId: number) => repos.find((r) => r.id === repoId)?.full_name ?? String(repoId);

  const save = async (repo: Repo, patch: Partial<BranchReviewSettings>) => {
    if (!(await requireDualControl("Saving branch review settings requires a dual-control operate session."))) return;
    setSavingId(repo.id);
    try {
      if (DEMO_MODE) { await delay(400); }
      else {
        const res = await api.put<Record<string, unknown>>(`/github/repositories/${repo.id}/review-settings`, {
          watched_branch: patch.watched_branch ?? settings[repo.id]?.watched_branch ?? repo.default_branch,
          enabled: patch.enabled ?? settings[repo.id]?.enabled ?? true,
          post_github_comment: patch.post_github_comment ?? settings[repo.id]?.post_github_comment ?? false,
        }, { dualControl: true });
        if (isPendingApproval(res)) {
          await load();
          toast("info", "Sent for approval", `${repoName(repo.id)} review settings are parked for an authorizer.`);
          return;
        }
      }
      await load();
      toast("success", "Saved", repoName(repo.id));
    } catch (e) {
      toast("error", "Save failed", e instanceof Error ? e.message : "");
    } finally {
      setSavingId(null);
    }
  };

  const topUp = async () => {
    if (!(await requireDualControl("Topping up the branch review wallet requires a dual-control operate session."))) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast("error", "Enter an amount", "Top-up amount must be greater than zero (NGN)."); return; }
    setTopping(true);
    try {
      if (DEMO_MODE) { await delay(600); setWallet((w) => w ? { ...w, balance_ngn: w.balance_ngn + amt } : w); }
      else {
        const res = await api.post<any>("/github/branch-reviews/wallet/top-up", { amount_ngn: amt }, { dualControl: true });
        toast("success", "Payment started", "Complete the Paystack payment to credit the wallet.");
        if (res?.wallet) setWallet(res.wallet);
      }
      setTopUpOpen(false);
    } catch (e) {
      toast("error", "Top-up failed", e instanceof Error ? e.message : "");
    } finally {
      setTopping(false);
    }
  };

  const balanceNgn = wallet?.balance_ngn ?? 0;
  const enabledCount = Object.values(settings).filter((s) => s.enabled).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="!p-4">
              <div className="skeleton h-7 w-20 rounded" />
              <div className="skeleton mt-2 h-3 w-24 rounded" />
            </Card>
          ))
        ) : (
          <>
            <Card className="!p-4">
              <div className="flex items-center gap-2">
                <Wallet size={15} className="text-gold-400" />
                <p className="text-2xl font-semibold text-white">₦{balanceNgn.toLocaleString()}</p>
              </div>
              <p className="mt-1 text-xs text-slate-400">Wallet balance</p>
            </Card>
            <Card className="!p-4">
              <p className="text-2xl font-semibold text-emerald-400">{enabledCount}</p>
              <p className="mt-1 text-xs text-slate-400">Repos watched</p>
            </Card>
            <Card className="!p-4">
              <p className="text-2xl font-semibold text-slate-200">{repos.length}</p>
              <p className="mt-1 text-xs text-slate-400">Synced repos</p>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader
          title="Watched branches"
          subtitle="Agentic review runs on each push to the watched branch. Per-push cost is deducted from the wallet."
          action={
            <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={() => setTopUpOpen(true)}>
              <Plus size={12} /> Top up wallet
            </button>
          }
        />

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-4 py-3" style={{ opacity: 1 - i * 0.15 }}>
                <div className="skeleton h-4 w-4 shrink-0 rounded" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-52 max-w-[60%] rounded" />
                  <div className="skeleton h-2.5 w-32 rounded" />
                </div>
                <div className="skeleton h-7 w-24 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        ) : repos.length === 0 ? (
          <EmptyRepoNote />
        ) : (
          <div className="-mx-4 -mb-4 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-phantix-700/40">
                  <th className="th">Repository</th>
                  <th className="th">Watched branch</th>
                  <th className="th">Review status</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {repos.map((repo) => {
                  const s = settings[repo.id];
                  const configured = Boolean(s);
                  return (
                    <tr key={repo.id} className="border-b border-phantix-800/40 last:border-0 hover:bg-phantix-800/35">
                      <td className="td">
                        <div className="flex min-w-0 items-center gap-2">
                          <GitBranch size={15} className="shrink-0 text-gold-400" />
                          <p className="truncate font-medium text-slate-200">{repo.full_name}</p>
                        </div>
                      </td>
                      <td className="td font-mono text-xs text-gold-300">{s?.watched_branch ?? repo.default_branch}</td>
                      <td className="td">
                        {configured && (s!.enabled ? <StatusBadge status="active" /> : <StatusBadge status="draft" />)}
                        {s?.post_github_comment && <p className="mt-0.5 text-[12px] text-slate-500">posts PR comment</p>}
                      </td>
                      <td className="td text-right">
                        <div className="flex flex-wrap justify-end items-center gap-1.5">
                          {savingId === repo.id ? (
                            <Loader2 size={15} className="animate-spin text-gold-400" />
                          ) : configured && s!.enabled ? (
                            <button className="btn-ghost !px-2.5 !py-1.5 !text-xs" onClick={() => void save(repo, { enabled: false })}>
                              <Lock size={11} /> Pause
                            </button>
                          ) : (
                            <button className="btn-secondary !px-2.5 !py-1.5 !text-xs" onClick={() => void save(repo, { enabled: true, watched_branch: s?.watched_branch ?? repo.default_branch })}>
                              <Settings2 size={11} /> {configured ? "Resume" : "Watch"}
                            </button>
                          )}
                          <button
                            className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                            onClick={() => void save(repo, { watched_branch: s?.watched_branch === "main" ? "develop" : "main" })}
                            title="Toggle watched branch between main and develop"
                          >
                            <ArrowRight size={11} /> {s?.watched_branch ?? repo.default_branch}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={topUpOpen} onClose={() => setTopUpOpen(false)} title="Top up branch review wallet">
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-400">Adds to your prepaid wallet. Each reviewed push deducts credits for the size tier of the repository.</p>
          <div>
            <label className="label">Amount (NGN)</label>
            <input className="input" type="number" min={1000} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {["50000", "100000", "250000"].map((v) => (
              <button key={v} className={cx("chip", amount === v ? "border-gold-400/50 bg-gold-400/10 text-gold-300" : "text-slate-400")} onClick={() => setAmount(v)}>
                ₦{Number(v).toLocaleString()}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setTopUpOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={topping} onClick={() => void topUp()}>
              {topping ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Pay with Paystack
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EmptyRepoNote() {
  return (
    <p className="py-8 text-center text-sm text-slate-500">
      Sync repositories first. Branch review runs on repositories connected through the GitHub App.
    </p>
  );
}
