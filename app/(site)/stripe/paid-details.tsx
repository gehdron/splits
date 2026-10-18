import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Lines, PaymentDetails, placeholders } from "../payment-complete/payment-details";
import { getShare, markSharePaid } from "./shares";
import { money, paymentIntentId, paymentMethodLabel, stripe } from "./checkout";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The part of /payment-complete that depends on Stripe: it reads ?share=sh_..., asks Stripe whether it was paid,
// and shows the real amount. Without ?share it falls back to the older ?friend=&event=&amount= form.
export async function PaidDetails({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const shareId = typeof query.share === "string" ? query.share : "";
  if (!shareId) {
    return (
      <>
        <PaidHeading />
        <Suspense fallback={<Lines details={placeholders} />}>
          <PaymentDetails />
        </Suspense>
      </>
    );
  }

  await connection();
  let share = await getShare(shareId).catch(() => null);
  if (!share) redirect(`/pay/${encodeURIComponent(shareId)}`);

  // Checkout sends people here as soon as they pay, sometimes before the webhook lands. Ask Stripe directly.
  if (share.status !== "paid" && share.stripeSessionId) {
    const session = await stripe().checkout.sessions.retrieve(share.stripeSessionId).catch(() => null);
    if (session?.payment_status === "paid") share = (await markSharePaid(share.id, session.id, paymentIntentId(session))) ?? share;
  }
  // Only a paid share gets "You're all paid up". Anything else goes back to its pay page.
  if (share.status !== "paid") redirect(`/pay/${share.id}`);

  const method = await paymentMethodLabel(share.stripePaymentIntentId).catch(() => null);
  return (
    <>
      <PaidHeading />
      <Lines
        seenBy
        details={{
          friend: share.organizerName ?? "The organizer",
          event: share.title,
          amount: money(share.amountCents),
          method: method ?? "Apple Pay or a card",
        }}
      />
    </>
  );
}

function PaidHeading() {
  return <h1><span className="ln"><span className="ri">You’re all paid up.</span></span></h1>;
}
