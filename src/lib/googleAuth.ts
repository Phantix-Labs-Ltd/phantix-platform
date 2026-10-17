// ── Sign in with Google (Firebase) ───────────────────────────────────────────
// The Firebase JS SDK runs the Google popup in the browser and returns an ID
// token; the API verifies it (no secret lives here). The web config comes from
// Vite env so a Google API key is never committed — the same variables the
// product apps use:
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, GoogleAuthProvider, getAuth, signInWithPopup } from "firebase/auth";
import { api } from "@/lib/api";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
};

/** True when this build carries the Firebase web config. */
export const googleConfiguredClient = Boolean(config.apiKey && config.projectId);

let _auth: Auth | null = null;

function auth(): Auth {
  if (!googleConfiguredClient) throw new Error("Google sign-in is not configured on this deployment.");
  if (!_auth) {
    const app: FirebaseApp = getApps().length
      ? (getApps()[0] as FirebaseApp)
      : initializeApp(config as { apiKey: string; authDomain?: string; projectId: string });
    _auth = getAuth(app);
  }
  return _auth;
}

/** Open the Google popup and return the Firebase ID token to POST to the API. */
export async function googleIdToken(): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth(), provider);
  return credential.user.getIdToken();
}

let _serverStatus: Promise<boolean> | null = null;

/**
 * Whether Google sign-in can be offered: the build has the web config AND the
 * API is configured to verify it (GET /organizations/auth/google/status).
 * Asked once per page load.
 */
export function googleSignInAvailable(): Promise<boolean> {
  if (!googleConfiguredClient) return Promise.resolve(false);
  if (!_serverStatus) {
    _serverStatus = api
      .get<{ configured?: boolean }>("/organizations/auth/google/status")
      .then((r) => Boolean(r?.configured))
      .catch(() => false);
  }
  return _serverStatus;
}

/**
 * What to tell the user when the popup fails, or null when they simply closed
 * it (cancelling is not an error worth a red message).
 */
export function googlePopupErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
  if (code === "auth/popup-blocked") return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
  if (code === "auth/account-exists-with-different-credential")
    return "This email already signs in another way. Use that, or sign in with email.";
  if (code === "auth/network-request-failed") return "Could not reach Google. Check your connection and try again.";
  if (code === "auth/unauthorized-domain") return "Google sign-in is not enabled for this site yet.";
  return "Google sign-in was not completed. Try again.";
}
