export { LANDING_URL, PLATFORM_URL, APP_URL } from "./config";
import { APP_URL } from "./config";

/** Deep link straight into the product demo tenant on the application surface. */
export const APP_DEMO_URL = `${APP_URL}/demo`;

/**
 * A page in one of the applications. The Platform session does not carry over
 * to them, so Attack, Defend and Code links go through Core's sign-in: it skips
 * the form for an operator already signed in there and hands the session on to
 * that page; anyone else signs in first and lands on it after.
 */
export function appLink(app: "core" | "attack" | "defend" | "code", path = "/"): string {
  if (app === "core") return `${APP_URL}${path}`;
  const q = new URLSearchParams({ next: app });
  if (path && path !== "/") q.set("path", path);
  return `${APP_URL}/login?${q.toString()}`;
}
