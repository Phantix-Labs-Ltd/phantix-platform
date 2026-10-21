import React, { useCallback, useEffect, useState } from "react";
import { FileSignature, ShieldCheck } from "lucide-react";
import { PageHeader, Card, StatusBadge, SkeletonCard, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import {
  isFeatureError,
  loadCompliancePack,
  saveCompliancePack,
  signDpa,
  type CompliancePack,
} from "@/lib/mssp";

/**
 * MSSP → NDPA pack. The provider is a **processor** for its clients, so this is the
 * paperwork procurement asks for in the same breath as the access log: the DPA and
 * its signature, the sub-processor register, the RoPA reference, retention and the
 * breach contact. The provider may prepare it; the client signs and confirms.
 */
export default function MsspCompliance() {
  const { toast } = useStore();
  const [pack, setPack] = useState<CompliancePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signer, setSigner] = useState("");
  const [signing, setSigning] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPack(await loadCompliancePack());
      setNotAvailable(false);
    } catch (e) {
      if (isFeatureError(e)) setNotAvailable(true);
      else toast("error", "Could not load the NDPA pack", e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<CompliancePack>) => {
    if (!pack) return;
    setSaving(true);
    try {
      setPack(await saveCompliancePack({ ...pack, ...patch }));
      toast("success", "Saved", "The pack is shared with your provider.");
    } catch (e) {
      toast("error", "Could not save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const sign = async () => {
    if (!pack || signer.trim().length < 2) {
      toast("warning", "Signer required", "Name the person signing the DPA.");
      return;
    }
    try {
      setPack(await signDpa({ dpa_version: pack.dpa_version || "2026-11", signed_by: signer.trim() }));
      toast("success", "DPA signed", "The pack is confirmed.");
    } catch (e) {
      toast("error", "Could not record the signature", e instanceof Error ? e.message : undefined);
    }
  };

  if (loading) return <div><PageHeader title="NDPA pack" /><SkeletonCard /></div>;
  if (notAvailable || !pack) {
    return (
      <div>
        <PageHeader title="NDPA pack" description="Data processing agreement and sub-processors." />
        <Card><p className="text-sm text-slate-400">This surface is available to MSSP organizations and their clients.</p></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="NDPA pack"
        description="The provider is a processor for your account. This is the agreement, the sub-processor register and the breach contact."
        actions={<StatusBadge status={pack.status} />}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="!p-4">
          <p className="font-semibold text-slate-100">Data processing agreement</p>
          <p className="mt-1 text-[12px] text-slate-500">
            {pack.dpa_signed_by
              ? `Signed by ${pack.dpa_signed_by} ${pack.dpa_signed_at ? timeAgo(pack.dpa_signed_at) : ""}`
              : "Not signed yet. The client signs; the provider can only prepare it."}
          </p>
          {!pack.dpa_signed_by && (
            <button className="btn-primary mt-2 !py-1.5 !text-xs" onClick={() => setSignOpen(true)}>
              Record signature
            </button>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-[12px] text-slate-500">
              DPA version
              <input className="input mt-1 !py-1.5 text-sm" value={pack.dpa_version ?? ""} onChange={(e) => setPack({ ...pack, dpa_version: e.target.value })} onBlur={() => void save({ dpa_version: pack.dpa_version })} />
            </label>
            <label className="text-[12px] text-slate-500">
              RoPA reference
              <input className="input mt-1 !py-1.5 text-sm" value={pack.ropa_reference ?? ""} onChange={(e) => setPack({ ...pack, ropa_reference: e.target.value })} onBlur={() => void save({ ropa_reference: pack.ropa_reference })} />
            </label>
            <label className="text-[12px] text-slate-500">
              Breach contact
              <input className="input mt-1 !py-1.5 text-sm" value={pack.breach_contact_email ?? ""} onChange={(e) => setPack({ ...pack, breach_contact_email: e.target.value })} onBlur={() => void save({ breach_contact_email: pack.breach_contact_email })} />
            </label>
            <label className="text-[12px] text-slate-500">
              Breach notice (hours)
              <input type="number" min={1} className="input mt-1 !py-1.5 text-sm" value={pack.breach_notice_hours} onChange={(e) => setPack({ ...pack, breach_notice_hours: Number(e.target.value) })} onBlur={() => void save({ breach_notice_hours: pack.breach_notice_hours })} />
            </label>
          </div>
          {pack.prepared_by && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500"><FileSignature size={12} /> Prepared by {pack.prepared_by}</p>
          )}
        </Card>

        <Card className="!p-4">
          <p className="flex items-center gap-1.5 font-semibold text-slate-100"><ShieldCheck size={14} /> Sub-processors</p>
          <p className="mt-1 text-[12px] text-slate-500">SecureGraph is always listed. Your provider's own sub-processors appear here too.</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {(pack.sub_processors || []).map((s) => (
              <li key={s.name} className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{s.name}</span>
                {s.purpose && <span className="text-[12px] text-slate-500">{s.purpose}</span>}
                {s.location && <span className="text-[12px] text-slate-600">{s.location}</span>}
              </li>
            ))}
          </ul>
          {saving && <p className="mt-2 text-[12px] text-slate-500">Saving…</p>}
        </Card>
      </div>

      <Modal open={signOpen} onClose={() => setSignOpen(false)} title="Sign the data processing agreement">
        <div className="space-y-3">
          <label className="block text-[12px] uppercase tracking-wide text-slate-500">
            Full name of the signer
            <input
              className="input mt-1 w-full py-2 text-sm"
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              placeholder="Jane Okafor, CISO"
            />
            <span className="mt-1 block text-[11px] normal-case tracking-normal text-slate-600">
              The signature is yours: your provider can prepare the pack, never sign it.
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSignOpen(false)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={signing}
              onClick={async () => {
                setSigning(true);
                await sign();
                setSigning(false);
                setSignOpen(false);
              }}
            >
              {signing ? "Recording…" : "Sign"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
