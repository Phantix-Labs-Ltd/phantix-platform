/**
 * Subscribe-and-pay through Paystack, shared by Billing and the setup wizard's
 * plan step.
 *
 * POST /billing/subscribe files a payment for the plan, /initialize turns it
 * into a Paystack checkout, and the browser goes there. Paystack sends the user
 * back to `returnPath` (with `?payment_id=` and its own `reference`), where
 * /verify activates the plan. The payment id is also kept in sessionStorage in
 * case the return URL loses it.
 */
import { api } from "@/lib/api";

export const PENDING_PAYMENT_KEY = "phantix_pending_payment_id";

export type BillingCycle = "monthly" | "yearly";

export interface CheckoutResult {
  paymentId: number | null;
  /** The browser is on its way to Paystack. */
  redirected: boolean;
  /** Paystack's access code, when no redirect URL came back. */
  accessCode: string | null;
}

export async function startPlanCheckout(opts: {
  plan: "starter" | "growth";
  cycle: BillingCycle;
  email: string;
  returnPath: string;
}): Promise<CheckoutResult> {
  const res = await api.post<{ payment?: { id?: number } }>(
    "/billing/subscribe",
    { billing_cycle: opts.cycle, plan: opts.plan },
    { dualControl: true },
  );
  const paymentId = res?.payment?.id ?? null;
  if (!paymentId) return { paymentId: null, redirected: false, accessCode: null };
  try { sessionStorage.setItem(PENDING_PAYMENT_KEY, String(paymentId)); } catch { /* storage unavailable */ }
  const back = new URL(opts.returnPath, window.location.origin);
  back.searchParams.set("payment_id", String(paymentId));
  const init = await api.post<{ authorization_url?: string; access_code?: string }>(
    `/billing/payments/${paymentId}/initialize`,
    { email: opts.email, callback_url: back.toString() },
    { dualControl: true },
  );
  if (init?.authorization_url) {
    window.location.href = init.authorization_url;
    return { paymentId, redirected: true, accessCode: null };
  }
  return { paymentId, redirected: false, accessCode: init?.access_code ?? null };
}

/**
 * Confirm a payment with the gateway. A declined or expired verification comes
 * back as 401, which is a payment outcome, not a dropped session, so it must
 * not sign the user out (authClearOn401: false).
 */
export async function verifyPayment(paymentId: number): Promise<void> {
  await api.post(`/billing/payments/${paymentId}/verify`, {}, { dualControl: true, authClearOn401: false });
  try { sessionStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* storage unavailable */ }
}

/** The payment a Paystack return is about: `?payment_id=`, else the stashed id. */
export function returningPaymentId(search: string = window.location.search): number | null {
  const params = new URLSearchParams(search);
  const fromUrl = params.get("payment_id") || params.get("payment") || "";
  if (/^\d+$/.test(fromUrl)) return Number(fromUrl);
  if (!params.get("reference") && !params.get("trxref")) return null;
  try {
    const stashed = sessionStorage.getItem(PENDING_PAYMENT_KEY);
    return stashed && /^\d+$/.test(stashed) ? Number(stashed) : null;
  } catch {
    return null;
  }
}

/** Drop the Paystack return parameters from the address bar. */
export function clearPaymentReturnParams(): void {
  const url = new URL(window.location.href);
  ["reference", "trxref", "payment_id", "payment"].forEach((k) => url.searchParams.delete(k));
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}
