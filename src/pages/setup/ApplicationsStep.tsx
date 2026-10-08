import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, LayoutGrid, Loader2, Lock } from "lucide-react";
import { useStore } from "@/lib/store";
import { api, ApiError, publicDetailCopy } from "@/lib/api";
import { APP_ACCESS_STEP } from "@/lib/firstRun";
import { cx } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

type ApplicationKey = "core" | "attack" | "defend" | "code";

interface ApplicationCard {
  key: ApplicationKey;
  label: string;
  tagline: string;
  description: string;
  order: number;
  base: boolean;
  entitled: boolean;
  reason: string | null;
}

interface Snapshot {
  applications: ApplicationCard[];
  enabled: ApplicationKey[];
}

/** What a new organization starts with: the hub and the first-VAPT application. */
const STARTER: ApplicationKey[] = ["core", "attack"];

/**
 * First-run step: choose which applications the company keeps. Core and
 * Attack are on to start with (the first VAPT runs in Attack); Defend and Code
 * can be switched on now or later from Applications.
 */
export default function ApplicationsStep() {
  const { state, toast } = useStore();
  const navigate = useNavigate();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<ApplicationKey>>(new Set(STARTER));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .get<Snapshot>("/organizations/me/applications")
      .then((v) => {
        setSnap(v);
        const entitled = v.applications.filter((a) => a.entitled).map((a) => a.key);
        const enabled = new Set(v.enabled || []);
        // An untouched organization has everything its plan allows switched on;
        // start it from Core and Attack. A choice already made is kept.
        const untouched = entitled.every((k) => enabled.has(k));
        setPicked(new Set(untouched ? STARTER.filter((k) => k === "core" || entitled.includes(k)) : [...enabled, "core"]));
      })
      .catch(() => setSnap(null))
      .finally(() => setLoading(false));
  }, []);

  const cards = (snap?.applications || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const toggle = (card: ApplicationCard) => {
    if (card.base) return;
    if (!card.entitled) {
      toast("info", "Not in your plan", card.reason || "Upgrade to add this application.");
      return;
    }
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(card.key)) next.delete(card.key);
      else next.add(card.key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/organizations/me/applications", { enabled: Array.from(new Set([...picked, "core"])) });
      navigate(APP_ACCESS_STEP);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (typeof err.detail === "string" ? publicDetailCopy(err.detail) : null) ?? err.message
          : "Could not save your applications.";
      toast("error", "Not saved", message);
    } finally {
      setSaving(false);
    }
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
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-400">Next step</p>
        <h1 className="mt-1 flex items-center gap-2.5 font-display text-xl font-bold text-white">
          <LayoutGrid size={20} className="text-gold-400" /> Choose your applications
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Tap an application to switch it on or off. Core and Attack are on to start with: Core is home base, and
          your first VAPT runs in Attack. You can change this any time from Applications.
        </p>

        {loading ? (
          <div className="card mt-6 flex items-center gap-2.5 p-6 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin text-gold-400" /> Loading applications...
          </div>
        ) : !snap ? (
          <div className="card mt-6 p-6 text-sm text-slate-400">
            The application list could not be loaded. You can continue and choose later from Applications.
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {cards.map((card) => {
              const on = card.base || picked.has(card.key);
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => toggle(card)}
                  aria-pressed={on}
                  disabled={card.base}
                  className={cx(
                    "card relative flex flex-col items-start p-5 text-left transition-colors",
                    on ? "border-gold-400/60 bg-gold-400/[0.06]" : "hover:border-phantix-600",
                    !card.entitled && "opacity-60",
                  )}
                >
                  <span
                    className={cx(
                      "absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border",
                      on ? "border-gold-400 bg-gold-400 text-phantix-950" : "border-phantix-600 text-transparent",
                    )}
                  >
                    {card.base ? <Lock size={12} className="text-phantix-950" /> : <Check size={14} />}
                  </span>
                  <span className="pr-8 font-display text-base font-bold text-white">{card.label}</span>
                  <span className="mt-1 text-sm text-slate-400">{card.tagline}</span>
                  <span className="mt-3 text-[12px] font-medium text-slate-500">
                    {card.base ? "Always on" : !card.entitled ? card.reason || "Not in your plan" : on ? "On" : "Off"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {snap && !picked.has("attack") && cards.some((c) => c.key === "attack" && c.entitled) && (
          <p className="mt-4 text-sm text-severity-medium">Attack is off. You need it to run your first VAPT.</p>
        )}

        <button type="button" onClick={() => (snap ? void save() : navigate(APP_ACCESS_STEP))} disabled={saving} className="btn-primary mt-6 w-full !py-3">
          {saving ? <Loader2 size={15} className="animate-spin" /> : null} Continue: give your team access <ArrowRight size={15} />
        </button>

        <p className="mt-4 text-center text-sm">
          <Link to="/dashboard" className="text-slate-500 hover:text-slate-300">Skip to dashboard</Link>
        </p>
      </main>
    </div>
  );
}
