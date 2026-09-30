import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wrench, CheckCircle2, Plus, Lock } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, CardHeader, StatusBadge, EmptyState, CardListSkeleton } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx, timeAgo } from "@/lib/utils";

function toolLabel(t: { tier?: string; pricing_model?: string }): string {
  const tier = t.tier ?? (t.pricing_model === "paid" ? "addon_subscription" : "free");
  if (tier === "addon_subscription") return "Subscribe";
  if (tier === "addon_engagement") return "Request";
  return "Enable";
}

export default function Tools() {
  const { state, toggleTool, toast } = useStore();
  const [subs, setSubs] = useState<any[]>([]);
  const [subsLoading, setSubsLoading] = useState(!DEMO_MODE);

  // Paid tool subscriptions for this org (GET /tools/subscriptions).
  useEffect(() => {
    if (DEMO_MODE) return;
    void api
      .get<any[]>("/tools/subscriptions")
      .then((rows) => setSubs(Array.isArray(rows) ? rows : []))
      .catch(() => setSubs([]))
      .finally(() => setSubsLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Tool catalog"
        description="Scanner tooling subscriptions, separate from platform membership. SecureGraph staff curate the catalog. You subscribe per company."
        actions={<DocLink docId="howto-platform-index" label="Platform how-to index" />}
      />

      <div className="mb-5">
        <Card>
          <CardHeader title="Your paid subscriptions" subtitle="Active tool add-ons and their status" action={<CheckCircle2 size={16} className="text-emerald-400" />} />
          {subsLoading ? (
            <CardListSkeleton rows={3} />
          ) : subs.length === 0 ? (
            <EmptyState icon={<Wrench size={20} />} title="No paid subscriptions" body="Subscribe to a paid add-on below to unlock its scanner or console." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Tool</th>
                    <th className="th">Status</th>
                    <th className="th">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s: any) => (
                    <tr key={s.id} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                      <td className="td text-sm text-slate-200">{s.tool_name || s.tool_key || `Tool #${s.tool_id}`}</td>
                      <td className="td"><span className="chip text-[12px] border-emerald-400/30 bg-emerald-400/10 text-emerald-300">{s.status || "active"}</span></td>
                      <td className="td text-xs text-slate-500">{s.created_at ? timeAgo(s.created_at) : "Not set"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {state.tools.map((t, i) => {
          const locked = !t.subscribed && t.eligible === false;
          return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card hover className={cx("h-full", t.subscribed && "border-emerald-400/20")}>
                <div className="flex items-start justify-between">
                  <span className={cx("flex h-11 w-11 items-center justify-center rounded-md", t.subscribed ? "bg-emerald-400/12 text-emerald-400" : "bg-phantix-800/70 text-phantix-300")}>
                    <Wrench size={17} />
                  </span>
                  <StatusBadge status={t.subscribed ? "subscribed" : locked ? "pending" : "draft"} />
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-slate-100">{t.name}</h3>
                <p className="mt-0.5 text-[13px] font-medium uppercase tracking-wider text-slate-600">{t.category}</p>
                <p className="mt-2 text-[13px] leading-5 text-slate-400">{t.description}</p>
                {locked && t.eligibility_reason && (
                  <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-4 text-amber-300/80">
                    <Lock size={11} className="mt-0.5 shrink-0" /> {t.eligibility_reason}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{t.price_note}</span>
                  <button
                    disabled={locked}
                    className={t.subscribed ? "btn-ghost !px-3 !py-1.5 !text-xs" : locked ? "btn-ghost !px-3 !py-1.5 !text-xs opacity-50" : "btn-primary !px-3.5 !py-1.5 !text-xs"}
                    onClick={async () => {
                      try {
                        await toggleTool(t);
                        toast("success", t.subscribed ? "Disabled locally" : `${t.name} activated`, t.subscribed ? "Cancelling is not available yet. This change applies to this session only." : "Subscription request sent");
                      } catch (err) {
                        toast("error", "Action failed", err instanceof Error ? err.message : "Could not update tool subscription");
                      }
                    }}
                  >
                    {t.subscribed ? "Disable" : <>{locked ? <><Lock size={12} /> Locked</> : <><Plus size={12} /> {toolLabel(t)}</>}</>}
                  </button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-slate-500">
        Free tools auto-provision on enable. Paid add-ons activate a monthly subscription. Engagement tools submit a
        request for staff provisioning.
      </p>
    </div>
  );
}
