/**
 * Platform (platform.phantixlabs.com) — hardcoded browser config.
 *
 * Hosts are the deployed origins in production. In `vite dev` they resolve to
 * the local ports (the same ports the Command Centre apps use), so links into
 * the applications stay on this machine instead of jumping to production.
 * `VITE_PLATFORM_URL` / `VITE_CORE_URL` / `VITE_ATTACK_URL` / `VITE_DEFEND_URL` /
 * `VITE_CODE_URL` override either mode.
 */
export const API_BASE = "/api/v1";
export const LANDING_URL = "https://phantixlabs.com";

// Written exactly this way on purpose: Vite only substitutes the literal form.
const DEV = import.meta.env.DEV === true;

function host(override: string | undefined, devPort: number, production: string): string {
  const explicit = (override || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return DEV ? `http://localhost:${devPort}` : production;
}

export const PLATFORM_URL = host(import.meta.env.VITE_PLATFORM_URL, 5174, "https://platform.phantixlabs.com");
export const APP_URL = host(import.meta.env.VITE_CORE_URL, 5173, "https://app.phantixlabs.com");
export const ATTACK_URL = host(import.meta.env.VITE_ATTACK_URL, 5175, "https://attack.phantixlabs.com");
export const DEFEND_URL = host(import.meta.env.VITE_DEFEND_URL, 5176, "https://defend.phantixlabs.com");
export const CODE_URL = host(import.meta.env.VITE_CODE_URL, 5177, "https://code.phantixlabs.com");
export const AGI_ENABLED = true;
