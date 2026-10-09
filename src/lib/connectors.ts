/**
 * SecureGraph Connector API (backend: app/engines/control_plane/api/db_connectors.py).
 *
 * A connector runs next to a private database and dials out to SecureGraph,
 * so the database needs no inbound port. The admin creates one here and gets a
 * single-use enrollment token, shown once.
 */
import { api, DEMO_MODE, delay, tokens } from "@/lib/api";

export type ConnectorStatus = "pending" | "online" | "offline" | "revoked";

export interface Connector {
  id: string;
  name: string;
  status: ConnectorStatus;
  agent_version: string | null;
  hostname: string | null;
  remote_addr: string | null;
  targets: string[];
  last_seen_at: string | null;
  enrolled_at: string | null;
  revoked_at: string | null;
  cert_expires_at: string | null;
  created_at: string;
}

export interface ConnectorEnrollment {
  connector: Connector;
  enrollment_token: string;
  expires_at: string;
  api_url: string;
  image: string;
  docker_command: string;
}

// Mutations follow the same operate rule as database connections.
const writeOpts = () => (tokens.dualControl ? { dualControl: true } : undefined);

let demo: Connector[] = [];

export async function listConnectors(): Promise<Connector[]> {
  if (DEMO_MODE) return demo;
  const res = await api.get<Connector[]>("/connectors");
  return Array.isArray(res) ? res : [];
}

export async function createConnector(name: string): Promise<ConnectorEnrollment> {
  if (DEMO_MODE) {
    await delay(400);
    const c: Connector = {
      id: `cn_demo${demo.length}`, name, status: "pending", agent_version: null, hostname: null, remote_addr: null,
      targets: [], last_seen_at: null, enrolled_at: null, revoked_at: null, cert_expires_at: null, created_at: new Date().toISOString(),
    };
    demo = [c, ...demo];
    const token = "sgct_demo_token";
    return {
      connector: c, enrollment_token: token, expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      api_url: "https://api.phantixlabs.com", image: "ghcr.io/phantix-labs-ltd/sg-connector:1",
      docker_command: `docker run -d --name securegraph-connector --restart unless-stopped \\\n  -v securegraph-connector:/var/lib/sg-connector \\\n  -e SG_ENROLLMENT_TOKEN=${token} \\\n  -e SG_ALLOWED_TARGETS=<database-host>:5432 \\\n  ghcr.io/phantix-labs-ltd/sg-connector:1`,
    };
  }
  return api.post<ConnectorEnrollment>("/connectors", { name }, writeOpts());
}

export async function newConnectorToken(id: string): Promise<ConnectorEnrollment> {
  if (DEMO_MODE) return createConnector(demo.find((c) => c.id === id)?.name ?? "Connector");
  return api.post<ConnectorEnrollment>(`/connectors/${encodeURIComponent(id)}/token`, {}, writeOpts());
}

export async function revokeConnector(id: string): Promise<void> {
  if (DEMO_MODE) {
    demo = demo.map((c) => (c.id === id ? { ...c, status: "revoked", revoked_at: new Date().toISOString() } : c));
    return;
  }
  await api.delete(`/connectors/${encodeURIComponent(id)}`, writeOpts());
}
