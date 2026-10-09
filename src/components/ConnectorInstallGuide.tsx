import React, { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx } from "@/lib/utils";

type Method = "docker" | "compose" | "kubernetes";

const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "docker", label: "Docker", hint: "One command on any Linux, macOS or Windows host with Docker." },
  { id: "compose", label: "Docker Compose", hint: "Keep the connector in a compose file next to your other services." },
  { id: "kubernetes", label: "Kubernetes", hint: "Run it in the cluster that can reach the database." },
];

const DEFAULT_IMAGE = "ghcr.io/phantix-labs-ltd/sg-connector:1";
const DEFAULT_API = "https://api.phantixlabs.com";

/**
 * How to install the SecureGraph Connector, with the enrollment token filled
 * in when one was just issued. The commands match the agent's settings
 * (SG_ENROLLMENT_TOKEN, SG_ALLOWED_TARGETS, SG_API_URL, state in
 * /var/lib/sg-connector) — keep them in step with connector/README.md.
 */
export default function ConnectorInstallGuide({
  token, image = DEFAULT_IMAGE, apiUrl = DEFAULT_API, expiresLabel,
}: {
  token?: string;
  image?: string;
  apiUrl?: string;
  expiresLabel?: string;
}) {
  const [method, setMethod] = useState<Method>("docker");
  const [target, setTarget] = useState("");
  const targetValue = target.trim() || "<database-host>:5432";
  const tokenValue = token || "<enrollment-token>";

  const snippet = useMemo(() => {
    if (method === "docker") {
      return [
        "docker run -d --name securegraph-connector --restart unless-stopped \\",
        "  -v securegraph-connector:/var/lib/sg-connector \\",
        `  -e SG_API_URL=${apiUrl} \\`,
        `  -e SG_ENROLLMENT_TOKEN=${tokenValue} \\`,
        `  -e SG_ALLOWED_TARGETS=${targetValue} \\`,
        `  ${image}`,
      ].join("\n");
    }
    if (method === "compose") {
      return [
        "services:",
        "  securegraph-connector:",
        `    image: ${image}`,
        "    restart: unless-stopped",
        "    environment:",
        `      SG_API_URL: ${apiUrl}`,
        `      SG_ENROLLMENT_TOKEN: ${tokenValue}`,
        `      SG_ALLOWED_TARGETS: ${targetValue}`,
        "    volumes:",
        "      - securegraph-connector:/var/lib/sg-connector",
        "",
        "volumes:",
        "  securegraph-connector:",
      ].join("\n");
    }
    return [
      "apiVersion: v1",
      "kind: Secret",
      "metadata:",
      "  name: securegraph-connector",
      "stringData:",
      `  SG_ENROLLMENT_TOKEN: ${tokenValue}`,
      "---",
      "apiVersion: v1",
      "kind: PersistentVolumeClaim",
      "metadata:",
      "  name: securegraph-connector",
      "spec:",
      "  accessModes: [ReadWriteOnce]",
      "  resources:",
      "    requests:",
      "      storage: 64Mi",
      "---",
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      "  name: securegraph-connector",
      "spec:",
      "  replicas: 1",
      "  strategy:",
      "    type: Recreate",
      "  selector:",
      "    matchLabels:",
      "      app: securegraph-connector",
      "  template:",
      "    metadata:",
      "      labels:",
      "        app: securegraph-connector",
      "    spec:",
      "      securityContext:",
      "        runAsNonRoot: true",
      "        runAsUser: 65532",
      "        fsGroup: 65532",
      "      containers:",
      "        - name: connector",
      `          image: ${image}`,
      "          env:",
      "            - name: SG_API_URL",
      `              value: ${apiUrl}`,
      "            - name: SG_ALLOWED_TARGETS",
      `              value: "${targetValue}"`,
      "            - name: SG_ENROLLMENT_TOKEN",
      "              valueFrom:",
      "                secretKeyRef:",
      "                  name: securegraph-connector",
      "                  key: SG_ENROLLMENT_TOKEN",
      "          volumeMounts:",
      "            - name: state",
      "              mountPath: /var/lib/sg-connector",
      "      volumes:",
      "        - name: state",
      "          persistentVolumeClaim:",
      "            claimName: securegraph-connector",
    ].join("\n");
  }, [method, apiUrl, tokenValue, targetValue, image]);

  const runLine =
    method === "docker" ? "Run the command on the host."
      : method === "compose" ? "Add this to your docker-compose.yml, then run docker compose up -d securegraph-connector."
        : "Save it as securegraph-connector.yaml and run kubectl apply -n <namespace> -f securegraph-connector.yaml.";

  return (
    <div className="space-y-5 text-sm">
      <Section n={1} title="Check the prerequisites">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-400">
          <li>A machine or cluster that can reach the database over your private network.</li>
          <li>Outbound HTTPS (port 443) to SecureGraph. No inbound port, firewall rule or public IP is needed.</li>
          <li>Docker 20 or later, Docker Compose v2, or a Kubernetes cluster. The image is small (about 8 MB) and runs as a non-root user.</li>
          <li>A database user for SecureGraph that owns only its schema (see Least privilege below).</li>
        </ul>
      </Section>

      <Section n={2} title="Enter your database address">
        <label className="label" htmlFor="cig-target">Database host and port, as the connector will reach it</label>
        <input
          id="cig-target"
          className="input font-mono"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="10.0.3.12:5432 or db.internal:5432"
          spellCheck={false}
          autoComplete="off"
        />
        <p className="mt-1.5 text-[12px] text-slate-500">
          This fills <code className="font-mono text-slate-300">SG_ALLOWED_TARGETS</code>, the only places the connector will ever
          connect to. List several as <code className="font-mono text-slate-300">host1:5432,host2:5432</code>. If the database
          runs on the same machine as Docker, use <code className="font-mono text-slate-300">host.docker.internal:5432</code> (or run
          the container with <code className="font-mono text-slate-300">--network host</code>), because inside a container
          127.0.0.1 is the container itself.
        </p>
      </Section>

      <Section n={3} title="Install the connector">
        <div role="tablist" aria-label="Installation method" className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={method === m.id}
              onClick={() => setMethod(m.id)}
              className={cx(
                "rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors",
                method === m.id ? "border-gold-400/50 bg-gold-400/10 text-white" : "border-phantix-700/50 text-slate-400 hover:text-slate-200",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate-500">{METHODS.find((m) => m.id === method)?.hint}</p>
        <CodeBlock text={snippet} />
        <p className="mt-1.5 text-[13px] text-slate-400">{runLine}</p>
        <p className="mt-1 text-[12px] text-slate-500">
          {token
            ? <>The enrollment token works once{expiresLabel ? ` and expires ${expiresLabel}` : ""}. After the first start the connector keeps its certificate in the volume, so restarts do not need it.</>
            : <>Create a connector above to get an enrollment token. Each token works once and expires after 15 minutes.</>}
          {" "}Behind an outbound proxy, add <code className="font-mono text-slate-300">HTTPS_PROXY=http://proxy:3128</code>.
        </p>
      </Section>

      <Section n={4} title="Confirm it is connected">
        <p className="text-[13px] text-slate-400">
          Within a few seconds the connector shows as <span className="text-emerald-300">Online</span> in the list above. To check
          on the host, read its log: <code className="font-mono text-slate-300">docker logs securegraph-connector</code> should end
          with <code className="font-mono text-slate-300">connected to SecureGraph</code>.
        </p>
      </Section>

      <Section n={5} title="Add the database through the connector">
        <p className="text-[13px] text-slate-400">
          Choose Add connection, then <span className="font-medium text-slate-200">Through a connector</span>, pick this connector,
          and enter the same host and port. SecureGraph tests the connection and prepares its schema through the connector.
        </p>
      </Section>

      <details className="rounded-md border border-phantix-700/50 px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-medium text-slate-200">Least privilege: the database user</summary>
        <p className="mt-2 text-[13px] text-slate-400">Run this as an administrator on the database, then use these credentials in SecureGraph:</p>
        <CodeBlock
          text={[
            "CREATE ROLE phantix_writer LOGIN PASSWORD '<strong-password>';",
            "CREATE SCHEMA IF NOT EXISTS phantix AUTHORIZATION phantix_writer;",
            "-- SecureGraph only writes to its own schema; grant nothing else.",
          ].join("\n")}
        />
      </details>

      <details className="rounded-md border border-phantix-700/50 px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-medium text-slate-200">Troubleshooting</summary>
        <dl className="mt-2 space-y-2.5 text-[13px]">
          <Trouble q="The connector stays Waiting to start" a="Check the log for the enrollment result. A token that was already used or is older than 15 minutes is refused: issue a new setup token and restart with it." />
          <Trouble q="It shows Offline" a="The connector cannot reach SecureGraph on port 443. Allow outbound HTTPS from the host, or set HTTPS_PROXY." />
          <Trouble q="The connection test says the connector refused this database" a="The host and port you entered in SecureGraph are not in SG_ALLOWED_TARGETS. They must match exactly; update the variable and restart the connector." />
          <Trouble q="The test says it cannot reach the target from the connector" a="The connector is running but cannot open a TCP connection to the database. Check the address, the database's listen address and any firewall between them." />
        </dl>
      </details>

      <details className="rounded-md border border-phantix-700/50 px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-medium text-slate-200">Update, revoke or uninstall</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-slate-400">
          <li>Update: pull the new image and recreate the container. Keep the volume so it stays enrolled.</li>
          <li>Revoke: use the bin icon in the list. SecureGraph stops reaching the databases behind it within a minute.</li>
          <li>Uninstall: revoke it, then remove the container and its volume (<code className="font-mono text-slate-300">docker rm -f securegraph-connector && docker volume rm securegraph-connector</code>).</li>
        </ul>
      </details>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="font-medium text-slate-100"><span className="mr-2 text-gold-400">{n}.</span>{title}</p>
      <div className="mt-2 sm:pl-5">{children}</div>
    </section>
  );
}

function Trouble({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-medium text-slate-200">{q}</dt>
      <dd className="mt-0.5 text-slate-400">{a}</dd>
    </div>
  );
}

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-2 rounded-md border border-phantix-700/60 bg-phantix-950/70">
      <pre className="max-h-80 overflow-auto p-3 pr-20 font-mono text-[12px] leading-5 text-slate-100">{text}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-phantix-950/90 px-2 py-1 text-[12px] font-medium text-gold-300 hover:bg-gold-400/10"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
