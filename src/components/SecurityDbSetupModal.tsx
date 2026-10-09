import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, Clock, Loader2, XCircle } from "lucide-react";
import { Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

type Stage = "test" | "testing" | "bootstrap" | "bootstrapping" | "pending" | "done";

/**
 * Shown right after a security database is added: test the connection, prepare
 * (bootstrap) the security schema, then carry on with setup. Scans, VAPT and
 * saved findings stay blocked until the database is ready, so this walks the
 * user through it instead of leaving them on a table with two buttons.
 */
export default function SecurityDbSetupModal({ connectionId, onClose }: { connectionId: number | null; onClose: () => void }) {
  const { state, testConnection, bootstrapConnection, markMilestone, toast } = useStore();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("test");
  const [error, setError] = useState<string | null>(null);
  const row = state.connections.find((c) => c.id === connectionId) || null;
  const ready = row?.bootstrap_status === "ready";
  // During first-run setup, finishing here goes back to the guided steps.
  const inSetup = !state.setup.setup_complete;

  useEffect(() => {
    if (connectionId !== null) { setStage("test"); setError(null); }
  }, [connectionId]);

  // The test also applies the schema when it can (auto_bootstrap), so a
  // passing test may leave nothing to prepare.
  useEffect(() => {
    if (ready && (stage === "bootstrap" || stage === "bootstrapping")) {
      setStage("done");
      void markMilestone("security_db_connected");
    }
  }, [ready, stage, markMilestone]);

  if (connectionId === null) return null;

  const runTest = async () => {
    setError(null);
    setStage("testing");
    try {
      await testConnection(connectionId);
      setStage("bootstrap");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect to the database.");
      setStage("test");
    }
  };

  const runBootstrap = async () => {
    setError(null);
    setStage("bootstrapping");
    try {
      const { pending } = await bootstrapConnection(connectionId);
      if (pending) {
        setStage("pending");
        toast("info", "Sent for approval", "Your authorizer must approve preparing the security database.");
        return;
      }
      setStage("done");
      void markMilestone("security_db_connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't prepare the security database.");
      setStage("bootstrap");
    }
  };

  const testState: StepState = stage === "test" ? (error ? "failed" : "current") : stage === "testing" ? "running" : "done";
  const bootState: StepState =
    stage === "test" || stage === "testing" ? "waiting"
      : stage === "bootstrap" ? (error ? "failed" : "current")
        : stage === "bootstrapping" ? "running"
          : stage === "pending" ? "pending"
            : "done";
  const doneState: StepState = stage === "done" ? "current" : "waiting";

  const finish = () => {
    onClose();
    if (inSetup) navigate("/get-started");
  };

  return (
    <Modal open onClose={onClose} title="Finish setting up your security database">
      <p className="text-sm text-slate-400">
        {row ? <><span className="font-medium text-slate-200">{row.name}</span> is saved. </> : "Your database is saved. "}
        Two quick steps make it ready for scans, VAPT and findings.
      </p>

      <ol className="mt-5 space-y-4">
        <Step n={1} state={testState} title="Test the connection" body="SecureGraph connects with the details you entered." />
        <Step n={2} state={bootState} title="Prepare the security database" body="SecureGraph creates its own schema. It never touches your other tables." />
        <Step
          n={3}
          state={doneState}
          title={inSetup ? "Continue setup" : "Done"}
          body={inSetup ? "Save your Quick Scan results and move on to the next step." : "Scans, VAPT and findings can use it now."}
        />
      </ol>

      {error && <p className="mt-4 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-3 py-2 text-sm text-severity-critical">{error}</p>}
      {stage === "pending" && (
        <p className="mt-4 rounded-md border border-severity-medium/30 bg-severity-medium/10 px-3 py-2 text-sm text-slate-300">
          Preparing the database needs your authorizer's approval. It runs as soon as they approve.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {(stage === "test" || stage === "testing") && (
          <button type="button" className="btn-primary" disabled={stage === "testing"} onClick={() => void runTest()}>
            {stage === "testing" ? <Loader2 size={15} className="animate-spin" /> : null}
            {stage === "testing" ? "Testing..." : error ? "Test again" : "Test connection"}
          </button>
        )}
        {(stage === "bootstrap" || stage === "bootstrapping") && (
          <button type="button" className="btn-primary" disabled={stage === "bootstrapping"} onClick={() => void runBootstrap()}>
            {stage === "bootstrapping" ? <Loader2 size={15} className="animate-spin" /> : null}
            {stage === "bootstrapping" ? "Preparing..." : error ? "Try again" : "Prepare security database"}
          </button>
        )}
        {stage === "done" && (
          <button type="button" className="btn-primary" onClick={finish}>
            {inSetup ? <>Continue setup <ArrowRight size={15} /></> : "Done"}
          </button>
        )}
        {stage === "pending" && inSetup && (
          <button type="button" className="btn-secondary" onClick={finish}>
            Continue setup <ArrowRight size={15} />
          </button>
        )}
        {stage !== "done" && (
          <button type="button" className="text-sm text-slate-400 hover:text-slate-200" onClick={onClose}>
            Finish later
          </button>
        )}
      </div>
    </Modal>
  );
}

type StepState = "waiting" | "current" | "running" | "done" | "failed" | "pending";

function Step({ n, state, title, body }: { n: number; state: StepState; title: string; body: string }) {
  const icon =
    state === "done" ? <CheckCircle2 size={18} className="text-emerald-400" />
      : state === "running" ? <Loader2 size={18} className="animate-spin text-gold-400" />
        : state === "failed" ? <XCircle size={18} className="text-severity-critical" />
          : state === "pending" ? <Clock size={18} className="text-severity-medium" />
            : state === "current" ? <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-gold-400 text-[11px] font-semibold text-gold-300">{n}</span>
              : <Circle size={18} className="text-phantix-600" />;
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className={cx("text-sm font-medium", state === "waiting" ? "text-slate-500" : "text-slate-100")}>{title}</p>
        <p className="mt-0.5 text-[13px] text-slate-400">{body}</p>
      </div>
    </li>
  );
}
