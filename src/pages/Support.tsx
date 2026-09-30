import React, { useState } from "react";
import { motion } from "framer-motion";
import { LifeBuoy, Plus, MessageSquare } from "lucide-react";
import DocLink from "@/components/DocLink";
import { PageHeader, Card, StatusBadge, Modal, EmptyState } from "@/components/ui";
import { useStore } from "@/lib/store";
import { timeAgo } from "@/lib/utils";

export default function Support() {
  const { state, createTicket, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("normal");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <PageHeader
        title="Support"
        description="Tickets route to the SecureGraph support desk. Quote your tenant ID and slug for faster resolution."
        actions={
          <>
            <DocLink docId="howto-platform-index" label="Platform how-to index" />
            <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> New ticket</button>
          </>
        }
      />

      {state.tickets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LifeBuoy size={22} />}
            title="No tickets yet"
            body="Contact us for help with setup, connection issues or billing."
            action={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> Open your first ticket</button>}
          />
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Ticket</th>
                    <th className="th">Priority</th>
                    <th className="th">Status</th>
                    <th className="th">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {state.tickets.map((t) => (
                    <tr key={t.id} className="border-b border-phantix-800/40 hover:bg-phantix-800/35">
                      <td className="td max-w-[420px]">
                        <div className="flex items-center gap-2">
                          <MessageSquare size={14} className="shrink-0 text-gold-400" aria-hidden="true" />
                          <span className="block min-w-0 truncate" title={t.messages?.[0]?.body || t.subject}>
                            <span className="font-mono text-[12px] text-gold-300">#{t.id}</span>
                            <span className="ml-2 font-medium text-slate-100">{t.subject}</span>
                            {t.messages?.[0]?.body && <span className="ml-2 text-[13px] text-slate-500">{t.messages[0].body}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="td"><span className="chip border-phantix-600/50 bg-phantix-800/60 text-slate-400 capitalize">{t.priority}</span></td>
                      <td className="td"><StatusBadge status={t.status} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{timeAgo(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New support ticket">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await createTicket(subject, priority, body);
            setBusy(false);
            setOpen(false);
            setSubject(""); setBody("");
            toast("success", "Ticket submitted", "The support team will reply shortly.");
          }}
        >
          <div>
            <label className="label">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" required />
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option>normal</option><option>high</option><option>low</option>
            </select>
          </div>
          <div>
            <label className="label">Details</label>
            <textarea className="input min-h-[110px] resize-none" value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Tenant #${state.org.id} (${state.org.slug})\n\nWhat happened, what you expected...`} required />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Submitting..." : "Submit ticket"}</button>
        </form>
      </Modal>
    </div>
  );
}
