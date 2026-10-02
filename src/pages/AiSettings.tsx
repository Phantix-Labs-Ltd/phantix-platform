import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, CheckCircle2, Loader2, Bot, ToggleLeft, ToggleRight, ShieldCheck, GitPullRequest } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, CardHeader, CollapsibleCard, Modal, PageSkeleton } from "@/components/ui";
import { api, DEMO_MODE, delay } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

type AiStatus = {
  enabled: boolean;
  agent_enabled: boolean;
  default_provider: string;
  ai_pentest_ready: boolean;
  mode: string;
  providers: { id: string; configured: boolean }[];
  monthly_tokens: number;
  /** Monthly token ceiling (`token_budget` from GET /ai/usage). */
  monthly_token_budget: number;
  monthly_cost_usd: number;
  /** Same spend in Naira — the product prices in NGN. */
  monthly_cost_ngn: number | null;
  monthly_spend_limit_usd: number;
  /** False once a budget is exhausted (AI calls are refused, not degraded). */
  ai_allowed: boolean;
  free_models_enabled: boolean;
  continuous_pr_enabled: boolean;
  free_plan: boolean;
};

const demoAi: AiStatus = {
  enabled: true,
  agent_enabled: true,
  default_provider: "deepseek",
  ai_pentest_ready: true,
  mode: "balanced",
  providers: [
    { id: "deepseek", configured: true },
    { id: "openai", configured: false },
    { id: "anthropic", configured: false },
  ],
  monthly_tokens: 128_400,
  monthly_token_budget: 1_000_000,
  monthly_cost_usd: 6.42,
  monthly_cost_ngn: 9630,
  monthly_spend_limit_usd: 50,
  ai_allowed: true,
  free_models_enabled: false,
  continuous_pr_enabled: false,
  free_plan: true,
};

export default function AiSettings() {
  const { toast, requireDualControl } = useStore();
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentSaving, setAgentSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (DEMO_MODE) {
          await delay(300);
          if (!cancelled) setAi(demoAi);
          return;
        }
        const [settings, usage, models] = await Promise.all([
          api.get<Record<string, unknown>>("/ai/settings").catch(() => null),
          api.get<Record<string, unknown>>("/ai/usage").catch(() => null),
          api.get<Record<string, unknown>>("/ai/models").catch(() => null),
        ]);
        if (cancelled) return;
        const providersRaw = Array.isArray(settings?.providers)
          ? (settings.providers as { id?: string; name?: string; configured?: boolean }[])
          : [];
        const enabledProviders = Array.isArray(settings?.enabled_providers)
          ? (settings.enabled_providers as unknown[]).map(String)
          : [];
        setAi({
          enabled: Boolean(settings?.ai_enabled ?? settings?.enabled ?? false),
          agent_enabled: Boolean(settings?.agent_enabled ?? false),
          default_provider: String(settings?.default_provider ?? settings?.mode ?? ""),
          ai_pentest_ready: Boolean(settings?.ai_pentest_ready ?? false),
          mode: String(settings?.mode ?? "balanced"),
          providers: providersRaw.length
            ? providersRaw.map((p) => ({
                id: String(p.id ?? p.name ?? "provider"),
                configured: Boolean(p.configured),
              }))
            : enabledProviders.map((id) => ({ id, configured: true })),
          // GET /ai/usage returns tokens_used / cost_usd / token_budget / spend_limit_usd
          // (not "monthly_tokens" / "monthly_cost_usd") — reading the wrong keys
          // left the usage card pinned at 0 tokens / $0.00.
          monthly_tokens: Number(usage?.tokens_used ?? 0),
          monthly_token_budget: Number(usage?.token_budget ?? 0),
          monthly_cost_usd: Number(usage?.cost_usd ?? 0),
          monthly_cost_ngn: usage?.cost_ngn != null ? Number(usage.cost_ngn) : null,
          monthly_spend_limit_usd: Number(usage?.spend_limit_usd ?? 0),
          ai_allowed: usage?.allowed !== false,
          free_models_enabled: Boolean(settings?.free_models_enabled),
          continuous_pr_enabled: Boolean(settings?.continuous_pr_enabled),
          free_plan: Boolean(models?.free_plan),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAgent = async () => {
    if (!(await requireDualControl("Turning the SecureGraph Agent on/off requires a dual-control operate session."))) return;
    setAgentSaving(true);
    const next = !ai!.agent_enabled;
    try {
      if (DEMO_MODE) { await delay(300); }
      else { await api.put("/ai/settings", { agent_enabled: next }, { dualControl: true }); }
      setAi((a) => a ? { ...a, agent_enabled: next } : a);
      toast("success", next ? "SecureGraph Agent enabled" : "SecureGraph Agent disabled", next ? "Operators can use the agent in the Command Centre." : "The agent is hidden from the Command Centre.");
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    } finally {
      setAgentSaving(false);
    }
  };

  const [modeSaving, setModeSaving] = useState(false);
  const saveMode = async () => {
    if (!(await requireDualControl("Changing AI mode requires a dual-control operate session."))) return;
    setModeSaving(true);
    try {
      if (!DEMO_MODE) await api.put("/ai/settings", { mode: ai!.mode }, { dualControl: true });
      toast("success", "AI mode updated", ai!.mode);
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    } finally {
      setModeSaving(false);
    }
  };

  // ── Free open-source models (org-admin opt-in) ──────────────────────────────
  type FreeAgreement = {
    title: string;
    summary: string;
    acceptance_required_copy: string;
    sections: { id: string; title: string; body: string }[];
  };
  const [freeAgreement, setFreeAgreement] = useState<FreeAgreement | null>(null);
  const [freeModalOpen, setFreeModalOpen] = useState(false);
  const [freeSaving, setFreeSaving] = useState(false);

  const openFreeAgreement = async () => {
    try {
      setFreeAgreement(await api.get<FreeAgreement>("/ai/free-model-agreement"));
      setFreeModalOpen(true);
    } catch (e) {
      toast("error", "Could not load the agreement", e instanceof Error ? e.message : "");
    }
  };

  const enableFreeModels = async () => {
    if (!(await requireDualControl("Enabling free open-source models requires a dual-control operate session."))) return;
    setFreeSaving(true);
    try {
      if (!DEMO_MODE) {
        await api.post("/ai/free-model-agreement/accept", {});
        await api.put("/ai/settings", { free_models_enabled: true }, { dualControl: true });
      }
      setAi((a) => (a ? { ...a, free_models_enabled: true } : a));
      setFreeModalOpen(false);
      toast("success", "Free models enabled", "Operators can now choose a free open-source model in the Command Centre.");
    } catch (e) {
      toast("error", "Could not enable free models", e instanceof Error ? e.message : "");
    } finally {
      setFreeSaving(false);
    }
  };

  const [cpSaving, setCpSaving] = useState(false);
  const toggleContinuousPr = async (next: boolean) => {
    if (!(await requireDualControl("Enabling Continuous PR requires a dual-control operate session."))) return;
    setCpSaving(true);
    try {
      if (!DEMO_MODE) await api.put("/ai/settings", { continuous_pr_enabled: next }, { dualControl: true });
      setAi((a) => (a ? { ...a, continuous_pr_enabled: next } : a));
      toast("success", next ? "Continuous PR enabled" : "Continuous PR disabled", next ? "SecureGraph can open app-signed draft PRs for your developers to merge." : undefined);
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    } finally {
      setCpSaving(false);
    }
  };

  const disableFreeModels = async () => {
    if (!(await requireDualControl("Disabling free open-source models requires a dual-control operate session."))) return;
    setFreeSaving(true);
    try {
      if (!DEMO_MODE) await api.put("/ai/settings", { free_models_enabled: false }, { dualControl: true });
      setAi((a) => (a ? { ...a, free_models_enabled: false } : a));
      toast("success", "Free models disabled");
    } catch (e) {
      toast("error", "Could not disable free models", e instanceof Error ? e.message : "");
    } finally {
      setFreeSaving(false);
    }
  };

  if (loading || !ai) {
    return (
      <PageSkeleton variant="settings" rows={3} className="!mx-0 !max-w-none" />
    );
  }

  return (
    <div>
      <PageHeader
        title="AI governance"
        description="Org AI settings and usage. Narratives only --- AI never determines security facts or scores."
        actions={<DocLink docId="howto-platform-index" label="Platform how-to index" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader title="AI engine" subtitle="Provider and mode for this tenant" action={<Sparkles size={16} className="text-gold-400" />} />
            {/* Four facts in one divided strip, not four boxed tiles. */}
            <div className="grid grid-cols-2 divide-phantix-700/40 rounded-md border border-phantix-700/40 bg-phantix-950/50 sm:grid-cols-4 sm:divide-x">
              {[
                ["Status", ai.enabled ? "Enabled" : "Disabled"],
                ["Default provider", ai.default_provider || "---"],
                ["Mode", ai.mode || "---"],
                ["Pentest AI", ai.ai_pentest_ready ? "Ready" : "Gated"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0 px-3 py-2">
                  <p className="truncate text-[12px] uppercase tracking-wider text-slate-500">{k}</p>
                  <p className="truncate text-sm font-medium capitalize text-slate-200">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="label">Providers</p>
              <div className="flex flex-wrap gap-2">
                {ai.providers.length === 0 ? (
                  <span className="text-xs text-slate-500">No providers reported</span>
                ) : (
                  ai.providers.map((p) => (
                    <span
                      key={p.id}
                      className={cx(
                        "chip",
                        p.configured
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : "border-phantix-700/50 bg-phantix-900/50 text-slate-500",
                      )}
                    >
                      {p.configured && <CheckCircle2 size={11} />} {p.id}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="mt-4">
              <label className="label">AI mode</label>
              <div className="flex gap-2">
              <select
                className="input flex-1"
                value={ai.mode}
                onChange={(e) => setAi((a) => (a ? { ...a, mode: e.target.value } : a))}
              >
                <option value="economy">Economy</option>
                <option value="balanced">Balanced</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <button
                className="btn-secondary shrink-0"
                onClick={() => void saveMode()}
                disabled={modeSaving}
              >
                {modeSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save AI mode
              </button>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="space-y-4">
          {/* Interactive controls first — the usage figures below are reference. */}
          {/* SecureGraph Agent toggle */}
          <Card className="border-gold-400/25">
            <CardHeader title="SecureGraph Agent" subtitle="Conversational security assistant for the Command Centre" action={<Bot size={16} className="text-gold-400" />} />
            <div className="flex items-center justify-between gap-4 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-200">{ai.agent_enabled ? "Enabled" : "Disabled"}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {ai.agent_enabled
                    ? "Operators can chat with SecureGraph Agent from the Command Centre sidebar."
                    : "The agent is hidden from the Command Centre. Toggle on to let operators use it."}
                </p>
              </div>
              <button onClick={toggleAgent} disabled={agentSaving} className="shrink-0" aria-label="Toggle SecureGraph Agent">
                {agentSaving ? <Loader2 size={22} className="animate-spin text-gold-400" /> : ai.agent_enabled ? <ToggleRight size={26} className="text-emerald-400" /> : <ToggleLeft size={26} className="text-slate-500" />}
              </button>
            </div>
          </Card>

          {/* Free open-source models — org-admin opt-in before operators can use them */}
          <Card className="border-emerald-400/25">
            <CardHeader title="Free open-source models" subtitle="Lower-cost fallback for free-plan organizations" action={<ShieldCheck size={16} className="text-emerald-400" />} />
            {!ai.free_plan ? (
              <p className="text-xs leading-5 text-slate-500">
                Available on the free plan only. Your organization is on a paid plan, so direct-contract models are used.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-3.5 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{ai.free_models_enabled ? "Enabled" : "Not enabled"}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {ai.free_models_enabled
                        ? "Operators can choose a free open-source model. These are less capable and prompts are processed by a third-party pool."
                        : "Free, less capable open-source models (Nemotron, MiMo, Llama, Qwen). Opt in to let operators use them when credits run out."}
                    </p>
                  </div>
                  <button
                    onClick={() => (ai.free_models_enabled ? void disableFreeModels() : void openFreeAgreement())}
                    disabled={freeSaving}
                    className="shrink-0"
                    aria-label="Toggle free open-source models"
                  >
                    {freeSaving ? <Loader2 size={22} className="animate-spin text-emerald-400" /> : ai.free_models_enabled ? <ToggleRight size={26} className="text-emerald-400" /> : <ToggleLeft size={26} className="text-slate-500" />}
                  </button>
                </div>
                {!ai.free_models_enabled && (
                  <p className="mt-3 text-[13px] leading-4 text-slate-500">
                    Enabling requires accepting the free-tier agreement and a dual-control session.
                  </p>
                )}
              </>
            )}
          </Card>

          {/* Continuous PR — org opt-in; opens app-signed draft PRs */}
          <Card className="border-gold-400/25">
            <CardHeader title="Continuous PR" subtitle="Ephemeral clone → app-signed commit → draft PR" action={<GitPullRequest size={16} className="text-gold-400" />} />
            <div className="flex items-center justify-between gap-4 rounded-md border border-phantix-700/40 bg-phantix-950/50 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-200">{ai.continuous_pr_enabled ? "Enabled" : "Disabled"}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {ai.continuous_pr_enabled
                    ? "SecureGraph can apply AutoFix patches and open a draft PR for your developers to review and merge. It never merges automatically."
                    : "When enabled, SecureGraph opens app-signed AutoFix PRs on your repositories for developers to merge."}
                </p>
              </div>
              <button onClick={() => void toggleContinuousPr(!ai.continuous_pr_enabled)} disabled={cpSaving} className="shrink-0" aria-label="Toggle Continuous PR">
                {cpSaving ? <Loader2 size={22} className="animate-spin text-gold-400" /> : ai.continuous_pr_enabled ? <ToggleRight size={26} className="text-emerald-400" /> : <ToggleLeft size={26} className="text-slate-500" />}
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-4 text-slate-500">
              Requires the GitHub App write permissions (requested on demand) and a deployment signing key. Every PR is parked for an authorizer before it runs, and only your developers merge.
            </p>
          </Card>

          {/* Reference info — collapsed by default so the controls above are
              reachable without scrolling. */}
          <CollapsibleCard
            title="Usage this month"
            subtitle="Cost visibility: every call is audited with the prompt version and model"
            defaultOpen={false}
          >
            <div className="flex flex-wrap items-end gap-8">
              <div>
                <p className="font-display text-3xl font-bold text-white">{(ai.monthly_tokens ?? 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500">
                  tokens used{ai.monthly_token_budget ? ` of ${ai.monthly_token_budget.toLocaleString()}` : ""}
                </p>
              </div>
              <div>
                <p className="font-display text-3xl font-bold text-gold-300">${(ai.monthly_cost_usd ?? 0).toFixed(2)}</p>
                <p className="text-xs text-slate-500">
                  estimated cost
                  {ai.monthly_cost_ngn != null ? ` · ₦${Math.round(ai.monthly_cost_ngn).toLocaleString()}` : ""}
                </p>
              </div>
              {ai.monthly_spend_limit_usd > 0 && (
                <div>
                  <p className="font-display text-3xl font-bold text-slate-200">${ai.monthly_spend_limit_usd.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">monthly spend cap</p>
                </div>
              )}
            </div>
            {ai.ai_allowed === false && (
              <p className="mt-3 rounded-md border border-severity-medium/30 bg-severity-medium/10 px-3 py-2 text-[13px] text-severity-medium">
                Budget reached for this cycle. AI calls are refused until credits are topped up or the cycle resets.
              </p>
            )}
            <div className="mt-5 space-y-2 text-xs leading-5 text-slate-400">
              <p>· PII is redacted before any provider call</p>
              <p>· Hallucination heuristics + cost/budget gates on every request</p>
              <p>· AI pentesting activates only when a DeepSeek key is configured</p>
              <p>· Finding explanations and executive summaries land in reports via the bus</p>
            </div>
          </CollapsibleCard>
        </motion.div>
      </div>

      <Modal
        open={freeModalOpen}
        onClose={() => !freeSaving && setFreeModalOpen(false)}
        title={freeAgreement?.title ?? "Free-tier open-source models agreement"}
        wide
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <p>{freeAgreement?.summary}</p>
          </div>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {(freeAgreement?.sections ?? []).map((s) => (
              <div key={s.id}>
                <p className="text-xs font-semibold text-slate-200">{s.title}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="rounded-md border border-phantix-700/40 bg-phantix-950/50 p-2 text-[13px] leading-4 text-slate-300">
            {freeAgreement?.acceptance_required_copy}
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" disabled={freeSaving} onClick={() => setFreeModalOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={freeSaving} onClick={() => void enableFreeModels()}>
              {freeSaving ? <Loader2 size={14} className="mr-1.5 inline animate-spin" /> : <CheckCircle2 size={14} className="mr-1.5 inline" />}
              I agree. Enable free models.
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
