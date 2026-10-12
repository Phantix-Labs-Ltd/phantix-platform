import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, Building2, Users, Database, Wrench, CreditCard, LifeBuoy,
  ScrollText, LogOut, ChevronRight, Timer, KeyRound, Rocket,
  RotateCcw, Sparkles, BellRing, Github, Radar, FlaskConical, Cable,
  AlertTriangle, Activity, MoreHorizontal, LayoutGrid, ArrowLeft, Menu, X,
  Compass, Check, Grip, PanelLeftClose, PanelLeftOpen, UserRound,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";
import { DEMO_MODE, AGI_ENABLED, publicDetailCopy } from "@/lib/api";
import { APP_URL } from "@/lib/links";
import { cx } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/Notifications";
import SandboxBanner from "@/components/SandboxBanner";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import { loadSandboxMe } from "@/lib/sandbox";
import { RouteSkeleton } from "@/components/RouteSkeleton";
import { BrandMark, BrandWordmark } from "@/components/BrandLogo";
import { MobileTabBar, MoreSheet, usePageTitle } from "@/components/MobileAppShell";
import GuidedTour, { startTour } from "@/components/GuidedTour";
import { navAnchor, PLATFORM_TOUR, TOUR_STORAGE_KEY } from "@/lib/tour";
import { useTableCards } from "@/lib/useTableCards";
import { useDismiss } from "@/lib/useDismiss";
import { onSignedIn } from "@/lib/analytics";

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
  ...(AGI_ENABLED ? [{ to: "/agi", label: "Agent", icon: <Radar size={17} /> }] : []),
  { to: "/audit", label: "Audit", icon: <ScrollText size={17} /> },
  { to: "/agent-activity", label: "Activity", icon: <Activity size={17} /> },
];

const baseNavSections: { label: string; items: (NavLeafItem | NavDropdownItem)[] }[] = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> }],
  },
  {
    label: "Organization",
    items: [
      { to: "/identity", label: "Identity", icon: <KeyRound size={17} /> },
      { to: "/users", label: "Access", icon: <Users size={17} /> },
      { to: "/connections", label: "Database", icon: <Database size={17} /> },
      { to: "/applications", label: "Applications", icon: <LayoutGrid size={17} /> },
      { type: "dropdown", label: "Accounts", icon: <MoreHorizontal size={17} />, items: moreOrganizationSubItems },
    ],
  },
  {
    label: "Commerce",
    items: [
      { to: "/tools", label: "Catalog", icon: <Wrench size={17} /> },
      { to: "/billing", label: "Billing", icon: <CreditCard size={17} /> },
      { to: "/support", label: "Support", icon: <LifeBuoy size={17} /> },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/ai", label: "AI", icon: <Sparkles size={17} /> },
      { to: "/alerts", label: "Alerts", icon: <BellRing size={17} /> },
      { type: "dropdown", label: "Oversight", icon: <MoreHorizontal size={17} />, items: moreGovernanceSubItems },
    ],
  },
  {
    label: "Integrations",
    items: [
      { to: "/integrations", label: "Integrations", icon: <Cable size={17} /> },
    ],
  },
];

/**
 * Collapsible nav group. Starts open; if the operator closes it, it reopens
 * whenever the current route is inside the group, so deep-linking to a
 * sub-page still shows where you are.
 */
function NavDropdown({ label, icon, basePath, items, collapsed }: NavDropdownItem & { collapsed?: boolean }) {
  const location = useLocation();
  const groupActive = basePath
    ? location.pathname.startsWith(basePath)
    : items.some((i) => location.pathname === i.to);
  const [open, setOpen] = useState(true);

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
        <ChevronRight
          size={14}
          className={cx("sg-hide-collapsed text-slate-500 transition-transform duration-200", open && "rotate-90")}
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
                  className={({ isActive }) => cx("nav-item", isActive && "active")}
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

/** Whether a scroll box has content below its visible bottom edge. Rechecks on
 *  scroll and whenever the box or one of its sections resizes (a group opening). */
function useMoreBelow(el: HTMLElement | null): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!el) return;
    const update = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [el]);
  return more;
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
  // The account and launcher menus close on a press outside them or on Escape.
  const userMenuRef = useDismiss(userMenu, () => setUserMenu(false));
  const [launcher, setLauncher] = useState(false);
  const launcherRef = useDismiss(launcher, () => setLauncher(false));
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);
  const navMoreBelow = useMoreBelow(navEl);
  const [sandboxEnrolled, setSandboxEnrolled] = useState(false);
  const { collapsed: collapsedPref, toggle: toggleSidebar } = useSidebarCollapsed();
  // Below lg the sidebar is an off-canvas drawer; the collapsed icon rail is a desktop preference only.
  const [mobileNav, setMobileNav] = useState(false);
  const collapsed = collapsedPref && !mobileNav;
  const location = useLocation();
  const navigate = useNavigate();
  // Phones: bottom tab bar + "More" sheet instead of the sidebar drawer.
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = React.useCallback(() => setMoreOpen(false), []);
  const pageTitle = usePageTitle();
  // Phones: data tables render as lists (labels copied from the column headers).
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  useTableCards(mainEl);

  useEffect(() => {
    setMobileNav(false);
    setUserMenu(false);
    setLauncher(false);
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

  // Signed-in users accepted the Terms, so the Platform asks no cookie question.
  useEffect(() => {
    if (session?.authenticated && !DEMO_MODE) onSignedIn();
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

  // Setup and signed-out pages render without the chrome; a crash there still
  // gets a recovery card instead of a blank screen.
  if (location.pathname.startsWith("/setup") || !session?.authenticated) {
    return (
      <PageErrorBoundary fullScreen resetKey={location.pathname}>
        <Outlet />
      </PageErrorBoundary>
    );
  }

  return (
    <div className="flex min-h-screen">
      {mobileNav && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
        />
      )}
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        id="platform-sidebar"
        data-collapsed={collapsed ? "" : undefined}
        className={cx(
          // Below lg the sidebar is a drawer over the page: an opaque, raised
          // surface (the black desktop rail colour blended into the page).
          "sg-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-phantix-700/40 bg-[rgb(var(--surface-sidebar))] transition-transform duration-200 max-lg:border-phantix-600/60 max-lg:bg-[rgb(var(--surface-card))] lg:z-40 lg:translate-x-0",
          mobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          collapsed ? "w-[72px]" : "w-[248px]",
        )}
      >
        {/* Brand row: the lockup, the app label, and the collapse control on one line. */}
        <div className="flex items-center gap-1.5 px-3 pb-3 pt-4">
          <BrandMark className="sg-show-collapsed mx-1 h-8 w-8 shrink-0" />
          <BrandWordmark className="sg-hide-collapsed h-[22px] shrink-0" />
          <span className="sg-hide-collapsed shrink-0 rounded-md border border-gold-400/30 bg-gold-400/10 px-1.5 py-1 text-[11px] font-semibold uppercase leading-none text-gold-300">
            Platform
          </span>
          <button
            onClick={(e) => {
              toggleSidebar();
              // The rail widens while anything in it has focus, so a mouse click
              // would hold the collapsed rail open. Keyboard users keep focus.
              if (e.detail > 0) e.currentTarget.blur();
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="sg-hide-collapsed ml-auto hidden shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-phantix-800/60 hover:text-slate-100 lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
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

        {/* The list fades out at the bottom edge while more of it is below. */}
        <div className="relative min-h-0 flex-1">
        <nav ref={setNavEl} className="h-full space-y-0.5 overflow-y-auto px-2.5 pb-3">
          {navSections.map((section) => (
            <div key={section.label} data-tour={navAnchor(section.label)}>
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
              title="Deletion"
              className={({ isActive }) =>
                cx(
                  "nav-item",
                  isActive
                    ? "!bg-severity-critical/10 !text-severity-critical"
                    : "!text-severity-critical/70 hover:!bg-severity-critical/10 hover:!text-severity-critical",
                )
              }
            >
              <AlertTriangle size={17} /> <span className="sg-hide-collapsed">Deletion</span>
            </NavLink>
          </div>
        </nav>
          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[rgb(var(--surface-sidebar))] to-transparent transition-opacity duration-200 max-lg:from-[rgb(var(--surface-card))]",
              navMoreBelow ? "opacity-100" : "opacity-0",
            )}
          />
        </div>

      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className={cx("flex min-h-screen min-w-0 flex-1 flex-col", collapsedPref ? "lg:ml-[72px]" : "lg:ml-[248px]")}>
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-phantix-700/40 bg-phantix-950/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:gap-3 sm:px-6">
          {/* Phones navigate with the bottom tab bar; the drawer stays for mid-size screens. */}
          <button
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
            aria-controls="platform-sidebar"
            aria-expanded={mobileNav}
            className="hidden shrink-0 rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white md:inline-flex lg:hidden"
          >
            <Menu size={18} />
          </button>
          {/* Launcher: open the product apps. Phones open them from the More sheet. */}
          <div ref={launcherRef} className="relative hidden shrink-0 md:block">
            <button
              onClick={() => setLauncher((v) => !v)}
              title="Open an application"
              aria-label="Open an application"
              aria-haspopup="menu"
              aria-expanded={launcher}
              data-tour="launch-app"
              className="inline-flex rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white"
            >
              <Grip size={16} />
            </button>
            {launcher && (
              <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-md border border-phantix-700 bg-phantix-900 p-1 shadow-card">
                <a
                  href={`${APP_URL}/dashboard`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setLauncher(false)}
                  className="flex items-center gap-2.5 rounded px-2.5 py-2 hover:bg-phantix-800"
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
            )}
          </div>
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
                {/* Phones: app bar with the brand mark and the page title. */}
                <BrandMark className="h-7 w-7 shrink-0 md:hidden" />
                <span className="truncate font-display text-[17px] font-bold text-white md:hidden">{pageTitle}</span>
                <span className="hidden truncate font-display text-sm font-semibold text-slate-200 md:inline">{state.org.name}</span>
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
                    "relative hidden rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white md:block",
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
            {/* Phones choose the theme in the More sheet. */}
            <span className="hidden md:contents">
              <ThemeToggle />
            </span>
            {sessionLoading ? (
              <span className="skeleton hidden h-9 w-9 rounded-md md:block" aria-hidden="true" />
            ) : securityDbReady ? (
              <span
                role="img"
                title="Security database connected"
                aria-label="Security database connected"
                className="relative hidden rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 md:inline-flex"
              >
                <Database size={16} />
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-severity-low ring-2 ring-phantix-950">
                  <Check size={9} strokeWidth={3.5} className="text-white" />
                </span>
              </span>
            ) : (
              <button
                onClick={() => navigate("/connections")}
                title="Security database not connected. Connect it"
                aria-label="Security database not connected. Connect it"
                className="relative inline-flex rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white"
              >
                <Database size={16} />
                <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-severity-critical ring-2 ring-phantix-950">
                  <X size={9} strokeWidth={3.5} className="text-white" />
                </span>
              </button>
            )}
            {state.org.plan ? (
              <span className="chip hidden whitespace-nowrap border-phantix-600/50 bg-phantix-800/60 text-slate-300 lg:inline-flex">{state.org.plan} plan</span>
            ) : null}

            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => {
                  // Phones: the account lives in the More sheet.
                  if (window.matchMedia("(max-width: 767px)").matches) setMoreOpen(true);
                  else setUserMenu((v) => !v);
                }}
                aria-haspopup="menu"
                aria-expanded={userMenu}
                aria-label="Account menu"
                title={session?.email ?? "Account"}
                data-tour="account"
                className="inline-flex rounded-md border border-phantix-700 bg-phantix-900 p-2 text-slate-400 transition-colors hover:border-phantix-600 hover:text-white"
              >
                <UserRound size={16} />
              </button>
              <AnimatePresence>
                {userMenu && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-md glass-bright shadow-card">
                    <div className="border-b border-phantix-700/40 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-slate-100">{state.org.name}</p>
                      <p className="truncate text-xs text-slate-400">{session?.email}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Signed in as organization admin</p>
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
                          setUserMenu(false);
                          startTour();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-phantix-700/50"
                      >
                        <Compass size={15} /> Take the tour
                      </button>
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

        {/* Bottom padding keeps content clear of the phone tab bar. */}
        <main ref={setMainEl} className="min-w-0 flex-1 px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:py-6 lg:px-8">
          {/* The one content measure for this app: pages fill it, and 1600px
              stops an ultrawide display stretching a table across the glass. */}
          <div className="mx-auto w-full min-w-0 max-w-[1600px]">
            {session?.authenticated && <SandboxBanner />}
            {/* Switching pages keeps the chrome and animates only the content. */}
            {/* A page that crashes shows a recovery card; the chrome stays. */}
            <PageErrorBoundary resetKey={location.pathname}>
              <React.Suspense fallback={<RouteSkeleton />}>
                <Outlet />
              </React.Suspense>
            </PageErrorBoundary>
          </div>
        </main>

        <footer className="hidden flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-phantix-700/30 px-4 py-4 text-[13px] text-slate-600 sm:px-8 md:flex">
          <span>SecureGraph Platform · organization management --- keys and people live here; product operations live in the Command Centre</span>
          <span className="font-mono">Tenant #{state.org.id}</span>
        </footer>
      </div>

      {/* First-visit guided tour; "Take the tour" in the account menu replays it. */}
      {session?.authenticated && <GuidedTour steps={PLATFORM_TOUR} storageKey={TOUR_STORAGE_KEY} />}

      {/* Phone shell */}
      <MobileTabBar moreOpen={moreOpen} onMore={() => setMoreOpen((v) => !v)} />
      <MoreSheet open={moreOpen} onClose={closeMore} sandbox={sandboxEnrolled} />
    </div>
  );
}
