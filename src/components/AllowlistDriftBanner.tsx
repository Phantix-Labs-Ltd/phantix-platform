import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import EgressAllowlist, { loadNetworkAccess, type AllowlistProvider, type NetworkAccess } from "@/components/EgressAllowlist";
import { Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useConnectionGuard } from "@/lib/useConnectionGuard";

const asProvider = (v: string | undefined): AllowlistProvider => (v === "neon" || v === "supabase" ? v : "other");

/**
 * Flags a publicly hosted security database whose allowlist is out of date:
 * SecureGraph added outbound addresses after the admin last confirmed the
 * allowlist, and the database refuses connections from those until they are
 * added. On the Security database page (`manage`) it opens the checklist with
 * the confirmed addresses already ticked; elsewhere it links there.
 */
export default function AllowlistDriftBanner({ manage = false }: { manage?: boolean }) {
  const { state, securityDbReady } = useStore();
  const guard = useConnectionGuard();
  const [access, setAccess] = useState<NetworkAccess | null>(null);
  const [open, setOpen] = useState(false);
  const refresh = useCallback((fresh = false) => {
    loadNetworkAccess(fresh).then(setAccess).catch(() => setAccess(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Only a ready primary database reached directly has an allowlist to keep up.
  const hosted = state.connections.some(
    (c) => c.connection_purpose === "security_data_storage" && c.is_primary && c.bootstrap_status === "ready" && c.network_mode !== "connector",
  );
  const missing = access?.unconfirmed_ips ?? [];
  if (!securityDbReady || !hosted || !access?.attestation || missing.length === 0) return null;
  const them = missing.length === 1 ? "it" : "them";

  return (
    <div role="status" className="mb-5 flex flex-wrap items-start gap-3 rounded-2xl border border-severity-medium/30 bg-severity-medium/8 px-4 py-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-severity-medium" />
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm font-semibold text-slate-100">Your database allowlist is out of date</p>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-400">
          SecureGraph now also connects from <span className="font-mono text-slate-300">{missing.join(", ")}</span>. Add {them} to
          your database's allowlist and tick {them} off, or connections from {them} are refused.
        </p>
      </div>
      {manage ? (
        <button type="button" className="btn-primary shrink-0 !py-1.5 text-xs" onClick={async () => { if (await guard()) setOpen(true); }}>
          Update the allowlist <ArrowRight size={13} />
        </button>
      ) : (
        <Link to="/connections" className="btn-primary shrink-0 !py-1.5 text-xs">
          Review <ArrowRight size={13} />
        </Link>
      )}
      {manage && (
        <Modal open={open} onClose={() => setOpen(false)} title="Add the new addresses" wide>
          {open && (
            <EgressAllowlist
              provider={asProvider(access.attestation.provider)}
              confirmed={access.attestation.ips}
              continueLabel="Confirm the allowlist"
              onContinue={() => { setOpen(false); refresh(true); }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
