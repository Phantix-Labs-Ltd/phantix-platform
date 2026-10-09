import React, { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Network, Plus, RefreshCw, Trash2 } from "lucide-react";
import ConnectorInstallGuide from "@/components/ConnectorInstallGuide";
import { Card, CardHeader, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { timeAgo, cx } from "@/lib/utils";
import {
  createConnector, listConnectors, newConnectorToken, revokeConnector,
  type Connector, type ConnectorEnrollment, type ConnectorStatus,
} from "@/lib/connectors";

const STATUS: Record<ConnectorStatus, { label: string; cls: string }> = {
  online: { label: "Online", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  offline: { label: "Offline", cls: "border-severity-medium/30 bg-severity-medium/10 text-severity-medium" },
  pending: { label: "Waiting to start", cls: "border-phantix-600/50 bg-phantix-800/40 text-slate-300" },
  revoked: { label: "Revoked", cls: "border-slate-500/40 bg-slate-500/10 text-slate-500" },
};

/**
 * Connectors for databases on a private network. The connector runs next to
 * the database and dials out to SecureGraph, so nothing is opened inbound.
 */
export default function ConnectorsCard({
  guard, onChange, onAddDatabase,
}: {
  guard: () => Promise<boolean>;
  onChange?: (list: Connector[]) => void;
  /** Open the connection form set to this connector. */
  onAddDatabase?: (connectorId: string) => void;
}) {
  const { toast } = useStore();
  const [list, setList] = useState<Connector[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [enrollment, setEnrollment] = useState<ConnectorEnrollment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await listConnectors();
      setList(next);
      onChange?.(next);
    } catch {
      setList((cur) => cur ?? []);
    }
  }, [onChange]);

  useEffect(() => { void load(); }, [load]);

  // While a setup command is on screen, watch for the connector to come online.
  useEffect(() => {
    if (!enrollment) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [enrollment, load]);

  const revoke = async (c: Connector) => {
    if (!window.confirm(`Revoke ${c.name}? SecureGraph stops reaching the databases behind it within a minute.`)) return;
    if (!(await guard())) return;
    setBusy(c.id);
    try {
      await revokeConnector(c.id);
      toast("success", "Connector revoked", "Its session ends within a minute.");
      await load();
    } catch (err) {
      toast("error", "Could not revoke", err instanceof Error ? err.message : "");
    } finally {
      setBusy(null);
    }
  };

  const reissue = async (c: Connector) => {
    if (!(await guard())) return;
    setBusy(c.id);
    try {
      setEnrollment(await newConnectorToken(c.id));
    } catch (err) {
      toast("error", "Could not create a token", err instanceof Error ? err.message : "");
    } finally {
      setBusy(null);
    }
  };

  if (list === null) return null;
  const live = enrollment ? list.find((c) => c.id === enrollment.connector.id) : null;

  return (
    <Card className="mb-5">
      <CardHeader
        title="Connectors"
        subtitle="For databases on a private network. A connector runs next to the database and connects out to SecureGraph, so you open no inbound port."
        action={
          <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={async () => { if (await guard()) setAdding(true); }}>
            <Plus size={13} /> Add connector
          </button>
        }
      />
      {list.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-phantix-700/50 px-4 py-3 text-sm text-slate-400">
          No connectors yet. Databases with a public endpoint, such as Neon or Supabase, do not need one.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-phantix-700/40 rounded-md border border-phantix-700/40">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Network size={15} className="shrink-0 text-gold-400" />
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm font-medium text-white">{c.name}</p>
                <p className="text-[12px] text-slate-500">
                  {c.targets.length ? `Reaches ${c.targets.join(", ")}` : "No targets reported yet"}
                  {c.last_seen_at ? ` · seen ${timeAgo(c.last_seen_at)}` : ""}
                  {c.agent_version ? ` · v${c.agent_version}` : ""}
                </p>
              </div>
              <span className={cx("chip text-[12px]", STATUS[c.status]?.cls)}>{STATUS[c.status]?.label ?? c.status}</span>
              {c.status !== "revoked" && (
                <div className="flex items-center gap-1">
                  {c.status !== "online" && (
                    <button type="button" className="btn-ghost !px-2 !py-1 text-xs" disabled={busy === c.id} onClick={() => void reissue(c)} title="New setup token">
                      <RefreshCw size={13} /> Setup token
                    </button>
                  )}
                  <button type="button" className="rounded p-1.5 text-slate-500 hover:text-severity-critical" disabled={busy === c.id} onClick={() => void revoke(c)} aria-label={`Revoke ${c.name}`}>
                    {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddConnectorModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(e) => { setAdding(false); setEnrollment(e); void load(); }}
      />
      <Modal open={!!enrollment} onClose={() => setEnrollment(null)} title={`Start ${enrollment?.connector.name ?? "the connector"}`} wide>
        {enrollment && (
          <SetupSteps
            enrollment={enrollment}
            live={live ?? null}
            onDone={() => setEnrollment(null)}
            onAddDatabase={onAddDatabase ? () => { const id = enrollment.connector.id; setEnrollment(null); onAddDatabase(id); } : undefined}
          />
        )}
      </Modal>
    </Card>
  );
}

function AddConnectorModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (e: ConnectorEnrollment) => void }) {
  const { toast } = useStore();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add a connector">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          try {
            onCreated(await createConnector(name.trim()));
          } catch (err) {
            toast("error", "Could not create the connector", err instanceof Error ? err.message : "");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label" htmlFor="cn-name">Name</label>
          <input id="cn-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lagos data centre" autoFocus />
          <p className="mt-1 text-[12px] text-slate-500">Where it runs, so you can tell connectors apart.</p>
        </div>
        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create connector
        </button>
      </form>
    </Modal>
  );
}

function SetupSteps({
  enrollment, live, onDone, onAddDatabase,
}: {
  enrollment: ConnectorEnrollment;
  live: Connector | null;
  onDone: () => void;
  onAddDatabase?: () => void;
}) {
  const online = live?.status === "online";
  return (
    <div className="space-y-5">
      <div
        className={cx(
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]",
          online ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300" : "border-phantix-700/50 text-slate-300",
        )}
        role="status"
      >
        {online ? <CheckCircle2 size={15} /> : <Loader2 size={15} className="animate-spin text-gold-400" />}
        {online
          ? `Connected${live?.hostname ? ` from ${live.hostname}` : ""}. You can add the database now.`
          : "Waiting for the connector to start. Follow the steps below; this updates by itself."}
      </div>
      <ConnectorInstallGuide
        token={enrollment.enrollment_token}
        image={enrollment.image}
        apiUrl={enrollment.api_url}
        expiresLabel={timeAgo(enrollment.expires_at)}
      />
      <div className="flex flex-wrap gap-2">
        {online && onAddDatabase ? (
          <button type="button" className="btn-primary flex-1" onClick={onAddDatabase}>
            Add the database <ArrowRight size={15} />
          </button>
        ) : null}
        <button type="button" className={online && onAddDatabase ? "btn-secondary" : "btn-secondary w-full"} onClick={onDone}>
          {online ? "Close" : "Close and finish later"}
        </button>
      </div>
    </div>
  );
}
