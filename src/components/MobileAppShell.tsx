// Phone shell for the platform: a bottom tab bar with the four places an admin
// lives (Home, People, Database, Keys) plus "More", which opens a bottom sheet of
// every other page as app tiles. Shown below lg only; desktop keeps the sidebar.

import React, { useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  Activity, AlertTriangle, BellRing, BookOpen, Building2, Cable, CreditCard, Database, FlaskConical, Github,
  KeyRound, LayoutDashboard, LayoutGrid, LifeBuoy, LogOut, Monitor, Moon, MoreHorizontal, Radar, Rocket,
  RotateCcw, ScrollText, Sparkles, Sun, Users, Wrench,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { AGI_ENABLED, DEMO_MODE } from "@/lib/api";
import { APP_URL } from "@/lib/links";
import { cx } from "@/lib/utils";

type Dest = { to: string; label: string; icon: React.ReactNode };

/** The bottom tabs. Everything else lives under More. */
export const TABS: Dest[] = [
  { to: "/dashboard", label: "Home", icon: <LayoutDashboard size={21} /> },
  { to: "/users", label: "People", icon: <Users size={21} /> },
  { to: "/connections", label: "Database", icon: <Database size={21} /> },
  { to: "/identity", label: "Keys", icon: <KeyRound size={21} /> },
];

function moreTiles(sandbox: boolean): Dest[] {
  return [
    { to: "/applications", label: "Apps", icon: <LayoutGrid size={20} /> },
    { to: "/billing", label: "Billing", icon: <CreditCard size={20} /> },
    { to: "/alerts", label: "Alerts", icon: <BellRing size={20} /> },
    { to: "/audit", label: "Audit trail", icon: <ScrollText size={20} /> },
    { to: "/ai", label: "AI settings", icon: <Sparkles size={20} /> },
    { to: "/tools", label: "Tools", icon: <Wrench size={20} /> },
    { to: "/integrations", label: "Integrations", icon: <Cable size={20} /> },
    { to: "/companies", label: "Companies", icon: <Building2 size={20} /> },
    { to: "/github", label: "GitHub", icon: <Github size={20} /> },
    { to: "/agent-activity", label: "Agent activity", icon: <Activity size={20} /> },
    ...(AGI_ENABLED ? [{ to: "/agi", label: "Pentest agent", icon: <Radar size={20} /> }] : []),
    ...(sandbox ? [{ to: "/sandbox", label: "Sandbox", icon: <FlaskConical size={20} /> }] : []),
    { to: "/support", label: "Support", icon: <LifeBuoy size={20} /> },
    { to: "/docs", label: "Docs", icon: <BookOpen size={20} /> },
  ];
}

const TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/users": "People and control",
  "/connections": "Security database",
  "/identity": "Identity and keys",
  "/applications": "Applications",
  "/billing": "Billing",
  "/alerts": "Alerts",
  "/audit": "Audit trail",
  "/ai": "AI settings",
  "/tools": "Tool catalog",
  "/integrations": "Integrations",
  "/companies": "Companies",
  "/github": "GitHub",
  "/agent-activity": "Agent activity",
  "/agi": "Pentest agent",
  "/sandbox": "Sandbox",
  "/support": "Support",
  "/docs": "Docs",
  "/danger-zone": "Danger zone",
};

/** Title for the phone app bar, from the current route. */
export function usePageTitle(): string {
  const { pathname } = useLocation();
  const key = Object.keys(TITLES).find((p) => pathname === p || pathname.startsWith(p + "/"));
  return key ? TITLES[key] : "SecureGraph";
}

/** Bottom tab bar (phones and tablets). */
export function MobileTabBar({ moreOpen, onMore }: { moreOpen: boolean; onMore: () => void }) {
  const { pathname } = useLocation();
  const onTab = TABS.some((t) => pathname === t.to || pathname.startsWith(t.to + "/"));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-phantix-700/50 bg-[rgb(var(--surface-card)/0.97)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cx(
                "tap flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                isActive && !moreOpen ? "text-gold-300" : "text-slate-500",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", isActive && !moreOpen && "bg-gold-400/15")}>
                  {t.icon}
                </span>
                {t.label}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMore}
          aria-expanded={moreOpen}
          className={cx(
            "tap flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            moreOpen || !onTab ? "text-gold-300" : "text-slate-500",
          )}
        >
          <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", (moreOpen || !onTab) && "bg-gold-400/15")}>
            <MoreHorizontal size={21} />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun size={15} /> },
  { value: "dark", label: "Dark", icon: <Moon size={15} /> },
  { value: "system", label: "Auto", icon: <Monitor size={15} /> },
];

/** "More" bottom sheet: every other page as tiles, then settings and sign-out. */
export function MoreSheet({ open, onClose, sandbox }: { open: boolean; onClose: () => void; sandbox: boolean }) {
  const { state, session, logout, resetDemo, toast } = useStore();
  const { mode, setTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Only the grab handle drags the sheet. When the whole sheet was draggable,
  // framer-motion claimed every vertical swipe, so the list could not be
  // scrolled by touch (only by dragging the scrollbar).
  const dragControls = useDragControls();

  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) onClose(); }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-phantix-600/60 bg-[rgb(var(--surface-card))] pb-[calc(76px+env(safe-area-inset-bottom))] shadow-2xl md:hidden"
          >
            {/* Drag here to close; the rest of the sheet scrolls normally. */}
            <div
              className="sticky top-0 z-10 flex cursor-grab touch-none justify-center bg-[rgb(var(--surface-card))] pb-3 pt-3 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <span className="h-1.5 w-10 rounded-full bg-phantix-600/80" aria-hidden="true" />
            </div>

            <div className="px-4">
              {/* Org card */}
              <div className="flex items-center gap-3 rounded-2xl border border-phantix-700/50 bg-phantix-900/60 p-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-400/40 bg-phantix-850 font-display text-base font-bold text-gold-300">
                  {(state.org.name || session?.email || "S").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100">{state.org.name || "Your organization"}</p>
                  <p className="truncate text-xs text-slate-500">{session?.email}</p>
                </div>
                {state.org.plan ? (
                  <span className="chip shrink-0 border-phantix-600/50 bg-phantix-800/60 text-[12px] text-slate-300">{state.org.plan}</span>
                ) : null}
              </div>

              {/* Tiles */}
              <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4">
                {moreTiles(sandbox).map((t) => {
                  const active = pathname === t.to || pathname.startsWith(t.to + "/");
                  return (
                    <NavLink key={t.to} to={t.to} className="tap flex flex-col items-center gap-1.5 text-center">
                      <span
                        className={cx(
                          "flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors",
                          active ? "border-gold-400/50 bg-gold-400/15 text-gold-300" : "border-phantix-700/50 bg-phantix-900/70 text-slate-300",
                        )}
                      >
                        {t.icon}
                      </span>
                      <span className={cx("text-[11.5px] leading-tight", active ? "text-gold-300" : "text-slate-400")}>{t.label}</span>
                    </NavLink>
                  );
                })}
              </div>

              {/* Appearance */}
              <p className="mt-6 px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Appearance</p>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-phantix-700/50 bg-phantix-900/60 p-1">
                {THEME_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setTheme(o.value)}
                    className={cx(
                      "tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg text-sm transition-colors",
                      mode === o.value ? "bg-phantix-700/70 text-white" : "text-slate-400",
                    )}
                  >
                    {o.icon} {o.label}
                  </button>
                ))}
              </div>

              {/* Rows */}
              <div className="mt-4 divide-y divide-phantix-700/40 overflow-hidden rounded-2xl border border-phantix-700/50 bg-phantix-900/60">
                <a href={`${APP_URL}/dashboard`} target="_blank" rel="noreferrer" className="tap flex min-h-[52px] items-center gap-3 px-4 text-sm text-gold-300">
                  <Rocket size={17} /> Open the Command Centre
                </a>
                <NavLink to="/danger-zone" className="tap flex min-h-[52px] items-center gap-3 px-4 text-sm text-severity-critical/80">
                  <AlertTriangle size={17} /> Danger zone
                </NavLink>
                {DEMO_MODE && (
                  <button
                    type="button"
                    onClick={() => {
                      resetDemo();
                      toast("info", "Demo reset", "Tenant state cleared --- start the journey again.");
                      onClose();
                      navigate("/dashboard");
                    }}
                    className="tap flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm text-slate-300"
                  >
                    <RotateCcw size={17} /> Reset demo data
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    logout();
                    navigate("/login");
                  }}
                  className="tap flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm text-severity-critical"
                >
                  <LogOut size={17} /> Sign out
                </button>
              </div>
              <p className="mt-4 text-center font-mono text-[12px] text-slate-600">Tenant #{state.org.id}</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
