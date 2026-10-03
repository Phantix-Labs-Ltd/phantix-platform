import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, Building2, Users, Database, Wrench, CreditCard, LifeBuoy,
  ScrollText, LogOut, Lock, Unlock, ChevronDown, ChevronLeft, ChevronRight, Timer, KeyRound, Rocket,
  RotateCcw, Sparkles, BellRing, Github, Radar, FlaskConical, Cable,
  AlertTriangle, Activity, MoreHorizontal, LayoutGrid, ArrowLeft, Menu, X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";
import { DEMO_MODE, AGI_ENABLED, publicDetailCopy } from "@/lib/api";
import { APP_URL } from "@/lib/links";
import { cx } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/Notifications";
import SandboxBanner from "@/components/SandboxBanner";
import { loadSandboxMe } from "@/lib/sandbox";
import { RouteSkeleton } from "@/components/RouteSkeleton";
import { BrandMark, BrandWordmark } from "@/components/BrandLogo";

type NavLeafItem = { to: string; label: string; icon: React.ReactNode };
type NavDropdownItem = {
  type: "dropdown";
  label: string;
  icon: React.ReactNode;
  /** Route prefix that marks this group active. Omit for a group of otherwise
   *  unrelated leaf routes — active state then falls back to an exact match
   *  against one of the group's own items. */
  basePath?: string;
  items: NavLeafItem[];
};

const moreOrganizationSubItems: NavLeafItem[] = [
  { to: "/companies", label: "Companies", icon: <Building2 size={17} /> },
  { to: "/github", label: "GitHub", icon: <Github size={17} /> },
];

const moreGovernanceSubItems: NavLeafItem[] = [
  ...(AGI_ENABLED ? [{ to: "/agi", label: "Autonomous Agent", icon: <Radar size={17} /> }] : []),
  { to: "/audit", label: "Audit Trail", icon: <ScrollText size={17} /> },
  { to: "/agent-activity", label: "Agent activity", icon: <Activity size={17} /> },
];

const baseNavSections: { label: string; items: (NavLeafItem | NavDropdownItem)[] }[] = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> }],
  },
  {
    label: "Organization",
    items: [
      { to: "/identity", label: "Identity and Keys", icon: <KeyRound size={17} /> },
      { to: "/users", label: "People and Control", icon: <Users size={17} /> },
      { to: "/connections", label: "Security Database", icon: <Database size={17} /> },
      { to: "/applications", label: "Applications", icon: <LayoutGrid size={17} /> },
      { type: "dropdown", label: "More Organization", icon: <MoreHorizontal size={17} />, items: moreOrganizationSubItems },
    ],
  },
  {
    label: "Commerce",
    items: [
      { to: "/tools", label: "Tool Catalog", icon: <Wrench size={17} /> },
      { to: "/billing", label: "Billing", icon: <CreditCard size={17} /> },
      { to: "/support", label: "Support", icon: <LifeBuoy size={17} /> },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/ai", label: "AI settings", icon: <Sparkles size={17} /> },
      { to: "/alerts", label: "Alerts", icon: <BellRing size={17} /> },
      { type: "dropdown", label: "More Governance", icon: <MoreHorizontal size={17} />, items: moreGovernanceSubItems },
    ],
  },
  {
    label: "Integrations",
    items: [
      { to: "/integrations", label: "Integrations Hub", icon: <Cable size={17} /> },
    ],
  },
];

/**
 * Collapsible nav group. Opens itself whenever the current route is inside the
 * group, so deep-linking to a sub-page still shows where you are.
 */
function NavDropdown({ label, icon, basePath, items, collapsed }: NavDropdownItem & { collapsed?: boolean }) {
  const location = useLocation();
  const groupActive = basePath
    ? location.pathname.startsWith(basePath)
    : items.some((i) => location.pathname === i.to);
  const [open, setOpen] = useState(groupActive);

  useEffect(() => {
    if (groupActive) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, basePath]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        title={label}
        className={cx("nav-item w-full justify-between", groupActive && "active")}
      >
        <span className="flex items-center gap-3">
          {icon}
          <span className="sg-hide-collapsed">{label}</span>
        </span>
        <ChevronDown
          size={14}
          className={cx("sg-hide-collapsed text-slate-500 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-7 mt-0.5 space-y-0.5 border-l border-phantix-700/50 pl-2.5">
              {items.map((sub) => (
                <NavLink
                  key={sub.to}
                  to={sub.to}
                  end={basePath ? sub.to === basePath : true}
                  className={({ isActive }) => cx("nav-item !py-2", isActive && "active")}
                >
                  {sub.icon}
                  <span className="sg-hide-collapsed">{sub.label}</span>
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OperateCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((expiresAt - now) / 1000));
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[13px] text-gold-300">
      <Timer size={12} />
      {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}

export default function Layout() {
  const { session, state, operate, lockOperate, logout, expireSession, securityDbReady, resetDemo, toast, requireDualControl, sessionLoading } = useStore();
  const [userMenu, setUserMenu] = useState(false);
  const [sandboxEnrolled, setSandboxEnrolled] = useState(false);
  const { collapsed: collapsedPref, toggle: toggleSidebar } = useSidebarCollapsed();
  // Below lg the sidebar is an off-canvas drawer; the collapsed icon rail is a desktop preference only.
  const [mobileNav, setMobileNav] = useState(false);
  const collapsed = collapsedPref && !mobileNav;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileNav(false);
    setUserMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNav) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileNav(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNav]);

  useEffect(() => {
    if (!session?.authenticated) {
      setSandboxEnrolled(false);
      return;
    }
    void loadSandboxMe().then((m) => setSandboxEnrolled(!!m?.enrolled));
  }, [session?.authenticated]);

  // BETA sandbox lives in the topbar now (icon beside the theme toggle), so
  // the sidebar itself no longer needs a sandbox-enrolled variant.
  const navSections = baseNavSections;

  // Auto-logout after inactivity --- uses backend's inactivity_expires_at if set, else 20 min
  useEffect(() => {
    if (!session?.authenticated || DEMO_MODE) return;
    const getTimeoutMs = () => operate.expiresAt ? Math.max(20 * 60 * 1000, operate.expiresAt - Date.now()) : 20 * 60 * 1000;
    const WARNING_BEFORE_MS = 5 * 60 * 1000;
    let lastActivity = Date.now();
    let warned = false;
    // The app session is kept mounted while the expired card is shown, so this
    // effect stays alive --- fire the inactivity expiry exactly once.
    let expired = false;

    const markActivity = () => { lastActivity = Date.now(); warned = false; };
    const events = ["mousedown", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, markActivity));

    const check = () => {
      if (!session?.authenticated || expired) return;
      const idle = Date.now() - lastActivity;
      const timeoutMs = getTimeoutMs();
      if (idle >= timeoutMs) {
        expired = true;
        toast("warning", "Session expired", "The session ended because of a long period of inactivity. Sign in again.");
        expireSession();
      } else if (idle >= (timeoutMs - WARNING_BEFORE_MS) && !warned) {
        warned = true;
        toast("info", "Session expiring soon", `The session will end in ${Math.round(WARNING_BEFORE_MS / 60000)} minutes because of inactivity.`);
      }
    };

    const interval = window.setInterval(check, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActivity));
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.authenticated, operate.expiresAt, expireSession, toast]);

  // Catch billing-required 402 responses and show upgrade prompt
  useEffect(() => {
    const handler = (e: Event) => {
      // The event carries the backend's upgrade text; normalize it before display.
      const msg = publicDetailCopy((e as CustomEvent).detail) || "This feature needs an upgrade.";
      toast("warning", "Upgrade required", `${msg} Visit Billing to subscribe or redeem a code.`);
    };
    window.addEventListener("phantix:billing-required", handler);
    return () => window.removeEventListener("phantix:billing-required", handler);
  }, [toast]);

  if (location.pathname.startsWith("/setup")) return <Outlet />;
  if (!session?.authenticated) return <Outlet />;

  return (
    <div className="flex min-h-screen">
      {mobileNav && (
        <div
          className="fixed inset-0 z-40 bg-phantix-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
        />
      )}
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        id="platform-sidebar"
        data-collapsed={collapsed ? "" : undefined}
        className={cx(
          "sg-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-phantix-700/40 bg-[rgb(var(--surface-sidebar))] transition-transform duration-200 lg:z-40 lg:translate-x-0",
          mobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          collapsed ? "w-[72px]" : "w-[248px]",
        )}
      >
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <BrandMark className="sg-show-collapsed h-8 w-8 shrink-0" />
          <div className="sg-hide-collapsed flex flex-col">
            <BrandWordmark className="h-8 self-start" />
            <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.18em] text-gold-400">Platform</p>
          </div>
          <button
            onClick={toggleSidebar}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ml-auto hidden rounded-md border border-phantix-700 bg-phantix-900 p-1.5 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white lg:inline-flex"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            onClick={() => setMobileNav(false)}
            title="Close navigation"
            aria-label="Close navigation"
            className="ml-auto rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-3">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="nav-section-label sg-hide-collapsed">{section.label}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  if ("type" in item && item.type === "dropdown") {
                    return <NavDropdown key={item.label} {...item} collapsed={collapsed} />;
                  }
                  const navItem = item as NavLeafItem;
                  return (
                    <NavLink key={navItem.to} to={navItem.to} title={navItem.label} className={({ isActive }) => cx("nav-item", isActive && "active")}>
                      {navItem.icon}
                      <span className="sg-hide-collapsed">{navItem.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Danger zone — kept visually distinct and at the bottom of the rail */}
          <div className="pt-1">
            <p className="nav-section-label sg-hide-collapsed">Account</p>
            <NavLink
              to="/danger-zone"
              title="Danger zone"
              className={({ isActive }) =>
                cx(
                  "nav-item",
                  isActive
                    ? "!bg-severity-critical/10 !text-severity-critical"
                    : "!text-severity-critical/70 hover:!bg-severity-critical/10 hover:!text-severity-critical",
                )
              }
            >
              <AlertTriangle size={17} /> <span className="sg-hide-collapsed">Danger zone</span>
            </NavLink>
          </div>
        </nav>

        {/* Command Centre link */}
        <div className="sg-hide-collapsed px-2.5 pb-2.5">
          <a
            href={`${APP_URL}/dashboard`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-md border border-gold-400/30 bg-phantix-900 p-2.5 transition-all hover:border-gold-400/50 hover:border-gold-400/60"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-400/15 text-gold-400">
              <Rocket size={16} />
            </span>
            <span>
              <span className="block text-xs font-semibold text-gold-300">Command Centre</span>
              <span className="block text-[12px] text-slate-500">Launch the product app</span>
            </span>
          </a>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className={cx("flex min-h-screen min-w-0 flex-1 flex-col", collapsedPref ? "lg:ml-[72px]" : "lg:ml-[248px]")}>
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-phantix-700/40 bg-phantix-950/80 px-4 py-3 backdrop-blur-xl sm:gap-3 sm:px-6">
          <button
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
            aria-controls="platform-sidebar"
            aria-expanded={mobileNav}
            className="shrink-0 rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white lg:hidden"
          >
            <Menu size={18} />
          </button>
          {location.pathname.startsWith("/docs") && (
            <>
              <button
                onClick={() => navigate(-1)}
                title="Back"
                aria-label="Back"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-phantix-700 bg-phantix-900 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-phantix-600 hover:text-white"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back</span>
              </button>
              <span className="h-6 w-px bg-phantix-700/40" aria-hidden="true" />
            </>
          )}
          <div className="flex min-w-0 items-center gap-2.5">
            {sessionLoading && !state.org.name ? (
              <span className="skeleton h-4 w-40 rounded" aria-hidden="true" />
            ) : (
              <>
                <span className="truncate font-display text-sm font-semibold text-slate-200">{state.org.name}</span>
                {state.org.slug ? (
                  <span className="chip hidden shrink-0 border-phantix-600/50 bg-phantix-800/60 font-mono text-slate-400 xl:inline-flex">{state.org.slug}</span>
                ) : null}
              </>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {sandboxEnrolled && (
              <NavLink
                to="/sandbox"
                title="BETA sandbox"
                className={({ isActive }) =>
                  cx(
                    "relative rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white",
                    isActive && "border-gold-400/50 text-gold-300",
                  )
                }
              >
                <FlaskConical size={16} />
                <span className="absolute -right-1 -top-1 rounded-full bg-gold-400 px-1 font-mono text-[11px] font-bold leading-[1.2] text-phantix-950">
                  β
                </span>
              </NavLink>
            )}
            <NotificationBell />
            <ThemeToggle />
            {sessionLoading ? (
              <span className="skeleton hidden h-7 w-40 rounded-md md:block" aria-hidden="true" />
            ) : securityDbReady ? (
              <span className="chip hidden whitespace-nowrap border-emerald-400/30 bg-emerald-400/10 text-emerald-300 md:inline-flex">
                <Database size={12} /> Security DB · ready
              </span>
            ) : (
              <button
                onClick={() => navigate("/connections")}
                title="Security DB not connected"
                aria-label="Security database not connected. Connect it"
                className="chip whitespace-nowrap border-severity-medium/40 bg-severity-medium/10 text-severity-medium transition-colors hover:bg-severity-medium/20"
              >
                <Database size={12} /> <span className="hidden md:inline">Security DB · not connected</span>
              </button>
            )}
            {state.org.plan ? (
              <span className="chip hidden whitespace-nowrap border-phantix-600/50 bg-phantix-800/60 text-slate-300 lg:inline-flex">{state.org.plan} plan</span>
            ) : null}

            <div className="relative">
              <button
                onClick={() => setUserMenu((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenu}
                aria-label="Account menu"
                className="flex items-center gap-2.5 rounded-md border border-phantix-700/50 bg-phantix-900/60 py-1.5 pl-1.5 pr-2.5 hover:border-phantix-500/50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold-400/40 bg-phantix-850 font-display text-xs font-bold text-gold-300">
                  {(session?.email ?? "A").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-semibold leading-tight text-slate-200">Company account</span>
                  <span className="block max-w-[150px] truncate text-[12px] leading-tight text-slate-500">{session?.email}</span>
                </span>
                <ChevronDown size={14} className="text-slate-500" />
              </button>
              <AnimatePresence>
                {userMenu && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-md glass-bright shadow-card">
                    <div className="border-b border-phantix-700/40 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-100">{state.org.name}</p>
                      <p className="text-xs text-slate-500">Signed in as organization admin</p>
                    </div>
                    <div className="p-1.5">
                      {DEMO_MODE ? (
                      <button
                        onClick={() => {
                          resetDemo();
                          toast("info", "Demo reset", "Tenant state cleared --- start the journey again.");
                          setUserMenu(false);
                          navigate("/dashboard");
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-phantix-700/50"
                      >
                        <RotateCcw size={15} /> Reset demo data
                      </button>
                      ) : null}
                      <button
                        onClick={() => {
                          logout();
                          navigate("/login");
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-severity-critical hover:bg-severity-critical/10"
                      >
                        <LogOut size={15} /> Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* The one content measure for this app: pages fill it, and 1600px
              stops an ultrawide display stretching a table across the glass. */}
          <div className="mx-auto w-full min-w-0 max-w-[1600px]">
            {session?.authenticated && <SandboxBanner />}
            {/* Switching pages keeps the chrome and animates only the content. */}
            <React.Suspense fallback={<RouteSkeleton />}>
              <Outlet />
            </React.Suspense>
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-phantix-700/30 px-4 py-4 text-[13px] text-slate-600 sm:px-8">
          <span>SecureGraph Platform · organization management --- keys and people live here; product operations live in the Command Centre</span>
          <span className="font-mono">Tenant #{state.org.id}</span>
        </footer>
      </div>
    </div>
  );
}
