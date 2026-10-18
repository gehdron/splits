import "server-only";
import Stripe from "stripe";
import { appUrl, getShare, markSharePaid, setShareSession, voidShare, type Share } from "./shares";

let client: Stripe | null = null;
let clientKey: string | null = null;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Set STRIPE_SECRET_KEY to take payments.");
  // Rebuilt when the key changes, so a new key in .env.local works without restarting the server.
  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }
  return client;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "paid"; share: Share }
  | { kind: "processing" }
  | { kind: "void" };

// One Checkout Session per attempt. An open session is reused so a friend who taps the link twice
// gets the same checkout, and a session that was already paid marks the share paid instead.
export async function checkoutForShare(share: Share): Promise<CheckoutResult> {
  if (share.status === "paid") return { kind: "paid", share };
  if (share.status === "void") return { kind: "void" };

  if (share.stripeSessionId) {
    const existing = await stripe().checkout.sessions.retrieve(share.stripeSessionId);
    if (existing.status === "complete" && existing.payment_status === "paid") {
      const paid = await markSharePaid(share.id, existing.id, paymentIntentId(existing));
      return { kind: "paid", share: paid ?? share };
    }
    // Paid but not settled yet: a new checkout here could charge the friend twice.
    if (existing.status === "complete") return { kind: "processing" };
    if (existing.status === "open" && existing.url) return { kind: "redirect", url: existing.url };
  }

  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    // Card only (Apple Pay and Google Pay ride on card). Delayed methods like bank debits would leave
    // a share "processing" for days, which invites a second payment.
    allowed_payment_method_types: ["card"],
    client_reference_id: share.id,
    metadata: { shareId: share.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: share.currency,
          unit_amount: share.amountCents,
          product_data: { name: `${share.personName}’s share of ${share.title}` },
        },
      },
    ],
    success_url: `${appUrl()}/payment-complete?share=${share.id}`,
    cancel_url: `${appUrl()}/pay/${share.id}?canceled=1`,
    payment_intent_data: { metadata: { shareId: share.id } },
  };

  // The idempotency key follows the share's last session, so two taps at once get one checkout.
  const key = `checkout:${share.id}:${share.stripeSessionId ?? "first"}`;
  let session: Stripe.Checkout.Session;
  if (share.stripeConnectAccountId) {
    try {
      session = await stripe().checkout.sessions.create(
        {
          ...base,
          payment_intent_data: {
            ...base.payment_intent_data,
            // Destination charge: the friend pays the platform, the full amount goes to the organizer.
            transfer_data: { destination: share.stripeConnectAccountId },
          },
        },
        { idempotencyKey: `${key}:connect` },
      );
    } catch (error) {
      // An organizer account that can't take transfers yet shouldn't stop a friend from paying.
      console.error(`Checkout to ${share.stripeConnectAccountId} failed; charging the platform instead.`, error);
      session = await stripe().checkout.sessions.create(base, { idempotencyKey: `${key}:platform` });
    }
  } else {
    session = await stripe().checkout.sessions.create(base, { idempotencyKey: `${key}:platform` });
  }

  if (!session.url) throw new Error("Stripe did not return a checkout link.");
  // The link may have been replaced while Stripe was answering. Then this checkout must not stay open.
  if (!(await setShareSession(share.id, session.id))) {
    await stripe()
      .checkout.sessions.expire(session.id)
      .catch(() => undefined);
    return { kind: "void" };
  }
  return { kind: "redirect", url: session.url };
}

export type ShareSync = { share: Share; processing: boolean };

// Stripe is the truth for an open link: a checkout can be paid before the webhook lands, or still
// be settling. Call this before working out what someone has paid.
export async function syncShare(share: Share): Promise<ShareSync> {
  const open = share.status === "unpaid" || share.status === "sent";
  if (!open || !share.stripeSessionId) return { share, processing: false };
  const session = await stripe().checkout.sessions.retrieve(share.stripeSessionId);
  if (session.status === "complete" && session.payment_status === "paid") {
    const paid = await markSharePaid(share.id, session.id, paymentIntentId(session));
    return { share: paid ?? share, processing: false };
  }
  return { share, processing: session.status === "complete" };
}

// When someone's amount changes, their older link stops working: it's voided, and its checkout (if
// one is open) is expired so it can't be paid. A checkout that completes anyway is still recorded.
// Returns true if the link turned out to be paid already (then it is recorded as paid, not voided).
export async function retireShare(share: Share): Promise<boolean> {
  await voidShare(share.id);
  // Re-read: a checkout may have been attached after the caller loaded this share.
  const latest = (await getShare(share.id)) ?? share;
  if (!latest.stripeSessionId) return false;
  try {
    await stripe().checkout.sessions.expire(latest.stripeSessionId);
    return false;
  } catch {
    // Expire fails once a checkout is complete. If it was paid, the money arrived: record it.
    const session = await stripe().checkout.sessions.retrieve(latest.stripeSessionId);
    if (session.status === "complete" && session.payment_status === "paid") {
      await markSharePaid(share.id, session.id, paymentIntentId(session));
      return true;
    }
    return false;
  }
}

export function paymentIntentId(session: Stripe.Checkout.Session) {
  const intent = session.payment_intent;
  if (!intent) return null;
  return typeof intent === "string" ? intent : intent.id;
}

// "Apple Pay" or "card", for the payment-complete page.
export async function paymentMethodLabel(paymentIntent: string | null) {
  if (!paymentIntent) return null;
  const intent = await stripe().paymentIntents.retrieve(paymentIntent, { expand: ["payment_method"] });
  const method = intent.payment_method;
  if (!method || typeof method === "string") return null;
  if (method.card?.wallet?.type === "apple_pay") return "Apple Pay";
  if (method.card?.wallet?.type === "google_pay") return "Google Pay";
  return method.type === "card" ? "card" : method.type.replace(/_/g, " ");
}

export { money };
