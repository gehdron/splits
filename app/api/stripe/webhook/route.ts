import { connection } from "next/server";
import type Stripe from "stripe";
import { getShare, isShareId, markSharePaid } from "@/lib/shares";
import { paymentIntentId, stripe } from "@/lib/stripe";

// Stripe signs the exact bytes it sent, so the body must be read as raw text before anything parses it.
export async function POST(request: Request) {
  await connection();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook secret is not configured." }, { status: 500 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  const shareId = session.metadata?.shareId ?? session.client_reference_id ?? "";
  // Stripe's "Send test event" has no share; answer 200 so the endpoint shows as healthy.
  if (!isShareId(shareId)) return Response.json({ received: true, ignored: "no share" });
  // Card and Apple Pay are paid on completion. Delayed methods finish with async_payment_succeeded.
  if (session.payment_status !== "paid") return Response.json({ received: true, pending: true });

  try {
    const share = await getShare(shareId);
    if (!share) return Response.json({ received: true, ignored: "unknown share" });
    if (share.status === "paid" && share.stripeSessionId !== session.id) {
      // Paid twice through two checkouts. Leave it for a manual refund, and say so in the logs.
      console.error(`Share ${shareId} was already paid by ${share.stripeSessionId}; ${session.id} also paid. Refund one.`);
      return Response.json({ received: true, duplicate: true });
    }
    await markSharePaid(shareId, session.id, paymentIntentId(session));
    return Response.json({ received: true, paid: shareId });
  } catch (error) {
    // A 500 makes Stripe retry later, which is what we want if the database blinked.
    console.error(error);
    return Response.json({ error: "Could not record the payment." }, { status: 500 });
  }
}
