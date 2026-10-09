import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Lock, ExternalLink, ShieldCheck, Loader2 } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, CardHeader, EmptyState, CardListSkeleton } from "@/components/ui";
import { useStore } from "@/lib/store";
import { api, ApiError, publicDetailCopy } from "@/lib/api";
import { cx } from "@/lib/utils";

/**
 * Applications — which of Core / Attack / Defend / Code this company uses.
 *
 * Two gates decide what an operator sees, and this page owns the second one:
 * the plan says what the company *may* have, the admin says what it *does*
 * have. Core is the entry point and cannot be switched off. Per-user access is
 * a role question and is set on People & Control, not here.
 */

type ApplicationKey = "core" | "attack" | "defend" | "code";

interface Surface {
  path: string;
  label: string;
  group: string;
}

interface ApplicationCard {
  key: ApplicationKey;
  label: string;
  tagline: string;
  description: string;
  capabilities: string[];
  order: number;
  base: boolean;
  entitled: boolean;
  /** The plan allows it, switched on or not. Older backends omit it. */
  available?: boolean;
  accessible: boolean;
  reason: string | null;
  open_url: string;
  surfaces?: Surface[];
}

interface Snapshot {
  applications: ApplicationCard[];
  enabled: ApplicationKey[];
  default: ApplicationKey;
}

/** Whether the organization may switch this application on (its plan allows it). */
const canSwitchOn = (card: { entitled: boolean; available?: boolean }) => card.available ?? card.entitled;

export default function Applications() {
  const { toast } = useStore();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ApplicationKey | "">("");

  useEffect(() => {
    void api
      .get<Snapshot>("/organizations/me/applications")
      .then((v) => setSnap(v))
      .catch(() => setSnap(null))
      .finally(() => setLoading(false));
  }, []);

  const cards = (snap?.applications || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const enabled = new Set<ApplicationKey>(snap?.enabled || []);

  async function toggle(card: ApplicationCard) {
    if (card.base || !snap) return; // Core is the entry point — always on
    if (!canSwitchOn(card)) {
      toast("info", "Not in your plan", card.reason || "Upgrade to add this application.");
      return;
    }
    const next = new Set(enabled);
    if (next.has(card.key)) next.delete(card.key);
    else next.add(card.key);
    next.add("core");

    setSaving(card.key);
    try {
      const updated = await api.put<Snapshot>("/organizations/me/applications", {
        enabled: Array.from(next),
      });
      setSnap(updated);
      toast(
        "success",
        next.has(card.key) ? `${card.label} enabled` : `${card.label} disabled`,
        next.has(card.key)
          ? "Operators with the right role can open it now."
          : "It no longer appears in the launcher for anyone.",
      );
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (typeof err.detail === "string" ? publicDetailCopy(err.detail) : null) ?? err.message
          : "Could not update applications.";
      toast("error", "Change not saved", message);
    } finally {
      setSaving("");
    }
  }

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Choose which applications this company uses. Core is always on, and each operator still only sees the applications their role allows."
        actions={<DocLink docId="howto-platform-index" label="Platform how-to index" />}
      />

      {loading ? (
        <CardListSkeleton rows={4} />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={20} />}
          title="Applications unavailable"
          body="The application list could not be loaded. Refresh the page, or make sure that the subscription of this company is active."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card, i) => {
            const on = card.base || enabled.has(card.key);
            const busy = saving === card.key;
            return (
              <motion.div
                key={card.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className={cx(!canSwitchOn(card) && "opacity-70")}>
                  <CardHeader
                    title={
                      <span className="flex items-center gap-2">
                        {card.label}
                        {card.base && (
                          <span className="rounded bg-phantix-800 px-1.5 py-0.5 text-[12px] uppercase tracking-wide text-slate-400">
                            always on
                          </span>
                        )}
                      </span>
                    }
                    subtitle={card.tagline}
                    action={
                      card.base ? (
                        <Lock size={15} className="text-slate-500" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => void toggle(card)}
                          disabled={busy || !canSwitchOn(card)}
                          aria-pressed={on}
                          title={
                            canSwitchOn(card)
                              ? on
                                ? `Disable ${card.label}`
                                : `Enable ${card.label}`
                              : card.reason || "Not included in your plan"
                          }
                          className={cx(
                            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                            on ? "bg-gold-500" : "bg-phantix-700",
                            (busy || !canSwitchOn(card)) && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <span
                            className={cx(
                              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                              on ? "left-[22px]" : "left-0.5",
                            )}
                          />
                        </button>
                      )
                    }
                  />

                  <p className="mt-1 text-sm text-slate-400">{card.description}</p>

                  {card.capabilities?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {card.capabilities.map((c) => (
                        <span
                          key={c}
                          className="rounded border border-phantix-700/60 bg-phantix-900 px-2 py-0.5 text-[13px] text-slate-300"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {card.surfaces && card.surfaces.length > 0 && (
                    <p className="mt-3 text-xs text-slate-500">
                      {card.surfaces.length} pages.{" "}
                      {card.surfaces.map((s) => s.label).slice(0, 6).join(", ")}
                      {card.surfaces.length > 6 ? "…" : ""}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-3 border-t border-phantix-700/40 pt-3">
                    {busy ? (
                      <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Loader2 size={13} className="animate-spin" /> Saving…
                      </span>
                    ) : !canSwitchOn(card) ? (
                      <span className="text-xs text-slate-500">
                        {card.reason || "Not included in your plan."}
                      </span>
                    ) : on ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <ShieldCheck size={13} /> Enabled
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Disabled for this company</span>
                    )}

                    {on && card.open_url && (
                      <a
                        href={card.open_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-white"
                      >
                        Open <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs text-slate-500">
        Disabling an application hides it for everyone in this company and blocks access to it.
        work already done there is kept and reappears if you switch it back on. Who may enter an
        enabled application is decided by each person's role on People &amp; Control.
      </p>
    </div>
  );
}
