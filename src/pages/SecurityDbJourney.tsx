import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Cloud, Loader2, Network, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui";
import DocLink from "@/components/DocLink";
import ConnectByUrl, { PROVIDERS, isProvider, type Provider } from "@/components/ConnectByUrl";
import EgressAllowlist from "@/components/EgressAllowlist";
import ConnectionForm, { ENGINES } from "@/components/ConnectionForm";
import ConnectorInstallGuide from "@/components/ConnectorInstallGuide";
import { AddConnectorForm } from "@/components/ConnectorsCard";
import SecurityDbPrepare from "@/components/SecurityDbPrepare";
import { listConnectors, newConnectorToken, type Connector, type ConnectorEnrollment } from "@/lib/connectors";
import { useStore } from "@/lib/store";
import { useConnectionGuard } from "@/lib/useConnectionGuard";
import { cx, timeAgo } from "@/lib/utils";

/**
 * Connecting the security database, one decision per page:
 *
 *   /connections/new                      Where is it?
 *   /connections/new/hosted               Choose the provider
 *   /connections/new/hosted/:provider     Allowlist SecureGraph's IPs (every one ticked)
 *   …/hosted/:provider/connect | manual   Paste the URL, or enter the details
 *   /connections/new/private              Create a connector (or pick one)
 *   /connections/new/private/:id          Install it, wait for Online
 *   /connections/new/private/:id/database The database, as the connector sees it
 *   /connections/new/prepare/:id          Test and prepare
 *
 * Each step is its own URL, so Back and refresh work, and `?from=quick-scan`
 * rides along so the end of the journey returns to the Quick Scan.
 */

const BASE = "/connections/new";
const GENERIC = ["Where is it?", "Set up access", "Add the database", "Test and prepare"];
const HOSTED = ["Where is it?", "Choose the provider", "Allowlist our IPs", "Connect", "Test and prepare"];
const PRIVATE = ["Where is it?", "Create a connector", "Install it", "Wait for Online", "Add the database", "Test and prepare"];
type Track = "hosted" | "private";

// The allowlist step must be done before the database can be added. Kept for
// this tab (sessionStorage) with an in-memory copy for when storage is blocked.
const ALLOWLIST_KEY = "sg_allowlist_confirmed";
let confirmedProvider: Provider | null = null;
function allowlistConfirmed(p: Provider): boolean {
  if (confirmedProvider === p) return true;
  try { return sessionStorage.getItem(ALLOWLIST_KEY) === p; } catch { return false; }
}
function confirmAllowlist(p: Provider) {
  confirmedProvider = p;
  try { sessionStorage.setItem(ALLOWLIST_KEY, p); } catch { /* the in-memory copy covers it */ }
}

/** Journey links that keep `?from=` on every step. */
function useJourney() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const from = params.get("from");
  const suffix = from ? `?from=${encodeURIComponent(from)}` : "";
  const href = useCallback((path = "") => `${BASE}${path}${suffix}`, [suffix]);
  const go = useCallback((path: string, state?: unknown) => navigate(href(path), { state }), [navigate, href]);
  return { href, go, fromQuickScan: from === "quick-scan" };
}

export default function SecurityDbJourney() {
  const guard = useConnectionGuard();
  const navigate = useNavigate();
  const { refreshConnections } = useStore();
  const [allowed, setAllowed] = useState(false);
  const started = useRef(false);

  // Audit control is checked once, when the journey starts; each save still
  // re-checks only if the operate session lapsed meanwhile.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void refreshConnections().catch(() => undefined);
    void guard().then((ok) => {
      if (ok) setAllowed(true);
      else navigate("/connections", { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!allowed) {
    return <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin text-gold-400" /> Checking access...</p>;
  }

  return (
    <Routes>
      <Route index element={<WhereStep />} />
      <Route path="hosted" element={<ProviderStep />} />
      <Route path="hosted/:provider" element={<AllowlistStep />} />
      <Route path="hosted/:provider/connect" element={<ConnectStep />} />
      <Route path="hosted/:provider/manual" element={<ManualStep />} />
      <Route path="private" element={<ConnectorStep />} />
      <Route path="private/:connectorId" element={<InstallStep />} />
      <Route path="private/:connectorId/database" element={<PrivateDatabaseStep />} />
      <Route path="prepare/:connectionId" element={<PrepareStep />} />
      <Route path="*" element={<Navigate to={BASE} replace />} />
    </Routes>
  );
}

// ── Frame + stepper ──────────────────────────────────────────────────────────

function Frame({ track, step, title, lead, back, children }: {
  track?: Track;
  step: number;
  title: string;
  lead?: React.ReactNode;
  back?: string;
  children: React.ReactNode;
}) {
  const steps = track === "hosted" ? HOSTED : track === "private" ? PRIVATE : GENERIC;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <Link to="/connections" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft size={14} /> Security database
        </Link>
        <DocLink docId="howto-platform-06" label="Connections how-to" />
      </div>
      <h1 className="mt-3 font-display text-[26px] font-bold tracking-tight text-white">Connect your security database</h1>
      <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Progress">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span
              className={cx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                i < step ? "border-emerald-400 bg-emerald-400/15 text-emerald-400"
                  : i === step ? "border-gold-400 bg-gold-400/10 text-gold-300"
                    : "border-phantix-700 text-slate-500",
              )}
            >
              {i < step ? <CheckCircle2 size={13} /> : i + 1}
            </span>
            <span className={cx("text-[13px]", i === step ? "font-medium text-white" : "hidden text-slate-500 sm:inline")}>{label}</span>
            {i < steps.length - 1 && <span className="hidden h-px w-4 bg-phantix-700 sm:block" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <Card className="mt-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-400">Step {step + 1} of {steps.length}</p>
        <h2 className="mt-1.5 font-display text-xl font-bold text-white">{title}</h2>
        {lead && <p className="mt-1.5 text-sm leading-6 text-slate-400">{lead}</p>}
        <div className="mt-5">{children}</div>
      </Card>
      {back && (
        <Link to={back} className="mt-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft size={14} /> Back
        </Link>
      )}
    </div>
  );
}

function ChoiceButton({ icon, title, body, onClick }: { icon?: React.ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-lg border border-phantix-700/50 p-4 text-left transition-colors hover:border-gold-400/50 hover:bg-gold-400/5"
    >
      {icon && <span className="mt-0.5 shrink-0 text-gold-400">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-slate-400">{body}</span>
      </span>
      <ArrowRight size={15} className="mt-0.5 shrink-0 text-slate-600 transition-colors group-hover:text-gold-300" />
    </button>
  );
}

// ── Step 1: where ────────────────────────────────────────────────────────────

function WhereStep() {
  const { go } = useJourney();
  return (
    <Frame step={0} title="Where is your database?" lead="This decides how SecureGraph reaches it. Your findings, assets and evidence are stored there, in SecureGraph's own schema.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChoiceButton
          icon={<Cloud size={18} />}
          title="Publicly hosted"
          body="Neon, Supabase, or a cloud database reachable over the internet. You allowlist our IPs, then SecureGraph connects directly."
          onClick={() => go("/hosted")}
        />
        <ChoiceButton
          icon={<Network size={18} />}
          title="On a private network"
          body="In your data centre, office or private cloud subnet. A SecureGraph Connector runs next to it; nothing is opened inbound."
          onClick={() => go("/private")}
        />
      </div>
    </Frame>
  );
}

// ── Hosted path ──────────────────────────────────────────────────────────────

function ProviderStep() {
  const { go, href } = useJourney();
  return (
    <Frame track="hosted" step={1} title="Choose the provider" lead="The security database is PostgreSQL. Pick where yours runs." back={href()}>
      <div className="space-y-2">
        {PROVIDERS.map((p) => (
          <ChoiceButton key={p.id} title={p.name} body={p.blurb} onClick={() => go(`/hosted/${p.id}`)} />
        ))}
      </div>
    </Frame>
  );
}

function useProviderParam(): Provider | null {
  const { provider } = useParams();
  return isProvider(provider) ? provider : null;
}

function AllowlistStep() {
  const provider = useProviderParam();
  const { go, href } = useJourney();
  if (!provider) return <Navigate to={href("/hosted")} replace />;
  const name = PROVIDERS.find((p) => p.id === provider)!.name;
  return (
    <Frame
      track="hosted"
      step={2}
      title="Allowlist SecureGraph's IPs"
      lead={`Before you add the database, limit who can reach it: in ${name}, allow only the addresses below. You can't continue until each one is ticked.`}
      back={href("/hosted")}
    >
      <EgressAllowlist
        provider={provider}
        onContinue={() => {
          confirmAllowlist(provider);
          go(`/hosted/${provider}/connect`);
        }}
      />
    </Frame>
  );
}

function ConnectStep() {
  const provider = useProviderParam();
  const { go, href } = useJourney();
  const guard = useConnectionGuard();
  if (!provider) return <Navigate to={href("/hosted")} replace />;
  // The allowlist comes first; a direct link here goes back to it.
  if (!allowlistConfirmed(provider)) return <Navigate to={href(`/hosted/${provider}`)} replace />;
  const name = PROVIDERS.find((p) => p.id === provider)!.name;
  return (
    <Frame track="hosted" step={3} title={`Connect ${name}`} lead="Paste the connection URL. SecureGraph saves it encrypted, then tests it and prepares its schema." back={href(`/hosted/${provider}`)}>
      <ConnectByUrl
        provider={provider}
        guard={guard}
        onManual={() => go(`/hosted/${provider}/manual`)}
        onCreated={(id) => go(`/prepare/${id}`, { track: "hosted" })}
      />
    </Frame>
  );
}

function ManualStep() {
  const provider = useProviderParam();
  const { go, href } = useJourney();
  const navigate = useNavigate();
  if (!provider) return <Navigate to={href("/hosted")} replace />;
  if (!allowlistConfirmed(provider)) return <Navigate to={href(`/hosted/${provider}`)} replace />;
  return (
    <Frame track="hosted" step={3} title="Enter the database details" lead="The address and credentials of your PostgreSQL database." back={href(`/hosted/${provider}/connect`)}>
      <ConnectionForm
        purpose="security_data_storage"
        engine={ENGINES[0]}
        connectors={[]}
        via="direct"
        onSaved={(id) => (id ? go(`/prepare/${id}`, { track: "hosted" }) : navigate("/connections"))}
      />
    </Frame>
  );
}

// ── Private-network path ─────────────────────────────────────────────────────

/** Connectors, refreshed every few seconds while `poll` is on. */
function useConnectors(poll: boolean) {
  const [list, setList] = useState<Connector[] | null>(null);
  const load = useCallback(async () => {
    try { setList(await listConnectors()); } catch { setList((cur) => cur ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!poll) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [poll, load]);
  return list;
}

function ConnectorStep() {
  const { go, href } = useJourney();
  const list = useConnectors(false);
  const usable = (list ?? []).filter((c) => c.status !== "revoked");
  return (
    <Frame
      track="private"
      step={1}
      title="Create a connector"
      lead="The connector runs next to your database and connects out to SecureGraph over HTTPS, so you open no inbound port. Name it after where it will run."
      back={href()}
    >
      {usable.length > 0 && (
        <div className="mb-5">
          <p className="label">Or continue with one you already have</p>
          <div className="space-y-2">
            {usable.map((c) => (
              <ChoiceButton
                key={c.id}
                icon={<Network size={16} />}
                title={c.name}
                body={c.status === "online" ? "Online. Go straight to adding the database." : "Not online yet. Install it and wait for it to connect."}
                onClick={() => go(c.status === "online" ? `/private/${c.id}/database` : `/private/${c.id}`)}
              />
            ))}
          </div>
        </div>
      )}
      <AddConnectorForm onCreated={(e) => go(`/private/${e.connector.id}`, { enrollment: e })} />
    </Frame>
  );
}

function InstallStep() {
  const { connectorId = "" } = useParams();
  const { go, href } = useJourney();
  const { toast } = useStore();
  const location = useLocation();
  const handed = (location.state as { enrollment?: ConnectorEnrollment } | null)?.enrollment;
  // The setup token is shown once: it arrives with the step, or a new one is
  // issued (a refresh loses it).
  const [enrollment, setEnrollment] = useState<ConnectorEnrollment | null>(handed?.connector.id === connectorId ? handed : null);
  const [issuing, setIssuing] = useState(false);
  const list = useConnectors(true);
  const connector = list?.find((c) => c.id === connectorId) ?? null;
  const online = connector?.status === "online";

  const reissue = async () => {
    setIssuing(true);
    try { setEnrollment(await newConnectorToken(connectorId)); }
    catch (err) { toast("error", "Could not create a setup token", err instanceof Error ? err.message : ""); }
    finally { setIssuing(false); }
  };

  if (list && (!connector || connector.status === "revoked")) {
    return (
      <Frame track="private" step={1} title="Connector not found" back={href("/private")}>
        <p className="text-sm text-slate-400">This connector no longer exists or was revoked. Create a new one.</p>
      </Frame>
    );
  }

  return (
    <Frame
      track="private"
      step={online ? 4 : enrollment ? 3 : 2}
      title={`Install ${connector?.name ?? "the connector"}`}
      lead="Run it next to the database with Docker, Docker Compose or Kubernetes. This page updates by itself when it comes online."
      back={href("/private")}
    >
      <div
        role="status"
        className={cx(
          "mb-5 flex items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]",
          online ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300" : "border-phantix-700/50 text-slate-300",
        )}
      >
        {online ? <CheckCircle2 size={15} /> : <Loader2 size={15} className="animate-spin text-gold-400" />}
        {online
          ? `Online${connector?.hostname ? ` from ${connector.hostname}` : ""}. You can add the database now.`
          : "Waiting for the connector to come online."}
      </div>
      {!enrollment && !online && (
        <div className="mb-5 rounded-md border border-phantix-700/50 p-4">
          <p className="text-sm text-slate-300">The setup token is shown only once. Get a new one to fill it into the commands below.</p>
          <button type="button" className="btn-secondary mt-3 !py-1.5 text-xs" disabled={issuing} onClick={() => void reissue()}>
            {issuing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Get a setup token
          </button>
        </div>
      )}
      {!online && (
        <ConnectorInstallGuide
          token={enrollment?.enrollment_token}
          image={enrollment?.image}
          apiUrl={enrollment?.api_url}
          expiresLabel={enrollment ? timeAgo(enrollment.expires_at) : undefined}
        />
      )}
      <div className="mt-5">
        <button type="button" className="btn-primary" disabled={!online} onClick={() => go(`/private/${connectorId}/database`)}>
          Add the database <ArrowRight size={15} />
        </button>
      </div>
    </Frame>
  );
}

function PrivateDatabaseStep() {
  const { connectorId = "" } = useParams();
  const { go, href } = useJourney();
  const navigate = useNavigate();
  const list = useConnectors(false);
  const connector = list?.find((c) => c.id === connectorId) ?? null;
  if (list && connector?.status !== "online") return <Navigate to={href(`/private/${connectorId}`)} replace />;
  return (
    <Frame
      track="private"
      step={4}
      title="Add the database"
      lead={connector ? `The PostgreSQL database ${connector.name} connects to, by the address it sees on your network.` : undefined}
      back={href(`/private/${connectorId}`)}
    >
      {!list ? (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin text-gold-400" /> Loading...</p>
      ) : (
        <ConnectionForm
          purpose="security_data_storage"
          engine={ENGINES[0]}
          connectors={list}
          via="connector"
          connectorId={connectorId}
          onSaved={(id) => (id ? go(`/prepare/${id}`, { track: "private" }) : navigate("/connections"))}
        />
      )}
    </Frame>
  );
}

// ── Last step: test and prepare ──────────────────────────────────────────────

function PrepareStep() {
  const { connectionId } = useParams();
  const id = Number(connectionId);
  const { fromQuickScan } = useJourney();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, refreshConnections } = useStore();
  const track = (location.state as { track?: Track } | null)?.track;
  const row = state.connections.find((c) => c.id === id) || null;
  const [looked, setLooked] = useState(Boolean(row));

  // A refresh lands here before the connections list is back: load it once.
  useEffect(() => {
    if (row || looked) return;
    void refreshConnections().catch(() => undefined).finally(() => setLooked(true));
  }, [row, looked, refreshConnections]);

  const steps = track === "hosted" ? HOSTED : track === "private" ? PRIVATE : GENERIC;
  if (!Number.isFinite(id) || (looked && !row)) {
    return (
      <Frame track={track} step={steps.length - 1} title="Database not found">
        <p className="text-sm text-slate-400">This connection no longer exists. <Link to="/connections" className="text-gold-400 hover:text-gold-300">Back to Security database</Link></p>
      </Frame>
    );
  }
  return (
    <Frame track={track} step={steps.length - 1} title="Test and prepare">
      {!row ? (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin text-gold-400" /> Loading...</p>
      ) : (
        <SecurityDbPrepare
          connectionId={id}
          finishLabel={fromQuickScan ? "Back to your Quick Scan" : "Done"}
          onFinish={() => navigate(fromQuickScan ? "/get-started" : "/connections")}
          onLater={() => navigate("/connections")}
        />
      )}
    </Frame>
  );
}
