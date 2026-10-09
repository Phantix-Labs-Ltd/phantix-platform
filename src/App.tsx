import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Seo } from "@/lib/useSeo";
import { StoreProvider, ToastViewport, useStore } from "@/lib/store";
import Layout from "@/components/Layout";
import CookieConsent from "@/components/CookieConsent";
import SessionExpiredOverlay from "@/components/SessionExpiredOverlay";
import { RouteSkeleton, ShellSkeleton } from "@/components/RouteSkeleton";
import Login from "@/pages/auth/Login";
import ChangePassword from "@/pages/auth/ChangePassword";
import DeviceConfirm from "@/pages/DeviceConfirm";
import Register from "@/pages/auth/Register";
import GithubAuthCallback from "@/pages/auth/GithubAuthCallback";
import StepUpPrompt from "@/components/StepUpPrompt";
import AlertNotifications, { ConnectionWatch, NotificationProvider } from "@/components/Notifications";
import Privacy from "@/pages/auth/Privacy";
import Terms from "@/pages/auth/Terms";
import AUP from "@/pages/auth/AUP";
import Cookies from "@/pages/auth/Cookies";
import PasswordResetRequest from "@/pages/auth/PasswordResetRequest";
import PasswordResetComplete from "@/pages/auth/PasswordResetComplete";
import SetupWizard from "@/pages/setup/SetupWizard";
import { isDone } from "@/lib/onboarding";
import { AGI_ENABLED } from "@/lib/api";

const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const Identity = React.lazy(() => import("@/pages/Identity"));
const Companies = React.lazy(() => import("@/pages/Companies"));
const Users = React.lazy(() => import("@/pages/Users"));
const Connections = React.lazy(() => import("@/pages/Connections"));
const GithubIntegration = React.lazy(() => import("@/pages/Github"));
const Applications = React.lazy(() => import("@/pages/Applications"));
const Tools = React.lazy(() => import("@/pages/Tools"));
const Billing = React.lazy(() => import("@/pages/Billing"));
const AiSettings = React.lazy(() => import("@/pages/AiSettings"));
const AgiSettings = React.lazy(() => import("@/pages/AgiSettings"));
const Support = React.lazy(() => import("@/pages/Support"));
const Audit = React.lazy(() => import("@/pages/Audit"));
const AgentActivity = React.lazy(() => import("@/pages/AgentActivity"));
const Alerts = React.lazy(() => import("@/pages/Alerts"));
const Integrations = React.lazy(() => import("@/pages/Integrations"));
const Sandbox = React.lazy(() => import("@/pages/Sandbox"));
const GetStarted = React.lazy(() => import("@/pages/setup/GetStarted"));
const ServiceKeyStep = React.lazy(() => import("@/pages/setup/ServiceKeyStep"));
const AppAccessStep = React.lazy(() => import("@/pages/setup/AppAccessStep"));
const DomainStep = React.lazy(() => import("@/pages/setup/DomainStep"));
const ApplicationsStep = React.lazy(() => import("@/pages/setup/ApplicationsStep"));
const PlanStep = React.lazy(() => import("@/pages/setup/PlanStep"));
const DangerZone = React.lazy(() => import("@/pages/DangerZone"));
const Docs = React.lazy(() => import("@/pages/Docs"));
const DocPage = React.lazy(() => import("@/pages/DocPage"));
const NotFound = React.lazy(() => import("@/pages/NotFound"));

// Authenticated + setup-complete gate for management routes
function RequireManagement({ children }: { children: React.ReactNode }) {
  const { session, state, sessionLoading, sessionHydrated, sessionExpired } = useStore();
  const location = useLocation();
  // Verify the session before rendering OR redirecting — no flash of the app
  // or of the login page while the stored session is still being restored.
  // The page is drawn as its skeleton meanwhile, never a full-screen loader.
  // A restored session already renders the real chrome, so only the page is drawn.
  // Only the first restore shows it: a later refresh keeps the page mounted, or
  // a page that refreshes on mount (Identity) would loop through the skeleton.
  if (sessionLoading && !sessionHydrated) return session?.authenticated ? <RouteSkeleton /> : <ShellSkeleton />;
  if (!session?.authenticated) {
    // A dropped app session shows the SessionExpiredOverlay in place instead of
    // an abrupt redirect — keep the current page mounted underneath it.
    if (sessionExpired.active) return <>{children}</>;
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  // Admin-assigned password: change it before touching any management screen.
  if (session?.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!state.setup.setup_complete) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

// Setup wizard requires auth; once complete there is nothing to resume
/** The bare domain: signed-out visitors go to sign-in, signed-in ones to their app. */
function RootRedirect() {
  const { session, state, sessionLoading, sessionHydrated } = useStore();
  if (sessionLoading && !sessionHydrated) return <ShellSkeleton />;
  if (!session?.authenticated) return <Navigate to="/login" replace />;
  return <Navigate to={state.setup.setup_complete ? "/dashboard" : "/setup"} replace />;
}

function SetupRoute() {
  const { session, state, sessionLoading, sessionHydrated, onboarding } = useStore();
  // First restore only: unmounting the wizard on a later refresh reset the OTP
  // step and re-ran the wizard's own refresh, so it reloaded in a loop.
  if (sessionLoading && !sessionHydrated) {
    return (
      <div className="px-4 py-10 sm:px-8">
        <RouteSkeleton />
      </div>
    );
  }
  if (!session?.authenticated) return <Navigate to="/login" replace />;
  if (session?.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (state.setup.setup_complete) {
    // First run continues to the Quick Scan; a backend without onboarding
    // milestones (onboarding === null) keeps the old landing.
    const firstRun = onboarding && !onboarding.dismissed && !isDone(onboarding, "quick_scan_done");
    return <Navigate to={firstRun ? "/get-started" : "/dashboard"} replace />;
  }
  return <SetupWizard />;
}

/**
 * App roots. `<Seo />` must render inside the router because it reads the
 * current path; `<BrowserRouter>` is mounted here rather than in main.tsx.
 */
/** Live alerts and the connection notice, for a signed-in, set-up organization. */
function PlatformNotifications() {
  const { session, state } = useStore();
  if (!session?.authenticated || !state.setup.setup_complete) return null;
  return (
    <>
      <AlertNotifications />
      <ConnectionWatch />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <NotificationProvider>
      <BrowserRouter>
        <Seo />
        <React.Suspense fallback={<ShellSkeleton />}>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/device-confirm" element={<DeviceConfirm />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth/github/callback" element={<GithubAuthCallback />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/aup" element={<AUP />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/password-reset" element={<PasswordResetRequest />} />
            <Route path="/reset-password" element={<PasswordResetComplete />} />
            <Route path="/setup" element={<SetupRoute />} />
            <Route path="/get-started" element={<RequireManagement><GetStarted /></RequireManagement>} />
            <Route path="/get-started/service-key" element={<RequireManagement><ServiceKeyStep /></RequireManagement>} />
            <Route path="/get-started/verify-domain" element={<RequireManagement><DomainStep /></RequireManagement>} />
            <Route path="/get-started/plan" element={<RequireManagement><PlanStep /></RequireManagement>} />
            <Route path="/get-started/applications" element={<RequireManagement><ApplicationsStep /></RequireManagement>} />
            <Route path="/get-started/app-access" element={<RequireManagement><AppAccessStep /></RequireManagement>} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<RequireManagement><Dashboard /></RequireManagement>} />
              <Route path="/sandbox" element={<RequireManagement><Sandbox /></RequireManagement>} />
              <Route path="/identity" element={<RequireManagement><Identity /></RequireManagement>} />
              <Route path="/companies" element={<RequireManagement><Companies /></RequireManagement>} />
              <Route path="/users" element={<RequireManagement><Users /></RequireManagement>} />
              <Route path="/connections" element={<RequireManagement><Connections /></RequireManagement>} />
              <Route path="/github" element={<RequireManagement><GithubIntegration /></RequireManagement>} />
              <Route path="/integrations/github/callback" element={<RequireManagement><GithubIntegration /></RequireManagement>} />
              <Route path="/applications" element={<RequireManagement><Applications /></RequireManagement>} />
              <Route path="/tools" element={<RequireManagement><Tools /></RequireManagement>} />
              <Route path="/billing" element={<RequireManagement><Billing /></RequireManagement>} />
              <Route path="/ai" element={<RequireManagement><AiSettings /></RequireManagement>} />
              {AGI_ENABLED && <Route path="/agi" element={<RequireManagement><AgiSettings /></RequireManagement>} />}
              <Route path="/support" element={<RequireManagement><Support /></RequireManagement>} />
              <Route path="/audit" element={<RequireManagement><Audit /></RequireManagement>} />
              <Route path="/agent-activity" element={<RequireManagement><AgentActivity /></RequireManagement>} />
              <Route path="/alerts" element={<RequireManagement><Alerts /></RequireManagement>} />
              <Route path="/integrations" element={<RequireManagement><Integrations /></RequireManagement>} />
              <Route path="/danger-zone" element={<RequireManagement><DangerZone /></RequireManagement>} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:docId" element={<DocPage />} />
              <Route path="/settings" element={<Navigate to="/identity" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </React.Suspense>
        <StepUpPrompt />
        <PlatformNotifications />
        <SessionExpiredOverlay />
        <ToastViewport />
        <CookieConsent />
      </BrowserRouter>
      </NotificationProvider>
    </StoreProvider>
  );
}
