import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogoMark } from "../_components/logo";
import { getShare, markSharePaid } from "@/lib/shares";
import { money, paymentIntentId, paymentMethodLabel, stripe } from "@/lib/stripe";
import { Lines, PaymentDetails, placeholders } from "./payment-details";
import "../_styles/payment-complete.css";

export const metadata: Metadata = {
  title: "Payment complete | Splits",
  description: "Your payment is complete.",
  robots: { index: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/*
  Stripe Checkout returns here with ?share=sh_... (see lib/stripe.ts), and the details come from that share.
  The older form still works and is filled from the URL, for example:
  /payment-complete?friend=Maya&event=Dinner%20at%20Noodle%20House&amount=24.50&method=Apple%20Pay
*/
export default function PaymentComplete({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="pt">
      <header className="nav">
        <Link className="brand" href="/" aria-label="Splits home">
          <LogoMark size={30} />
          <span>Splits</span>
        </Link>
      </header>
      <main>
        <div className="mark" aria-hidden="true">
          <svg viewBox="3 3 60 60">
            <g strokeWidth={6} strokeLinejoin="round">
              <g className="ga"><polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" /></g>
              <g className="gb"><polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" /></g>
            </g>
          </svg>
        </div>
        {/* The heading waits for the share check, so an unpaid share never shows "all paid up", even briefly. */}
        <Suspense fallback={<h1><span className="ln"><span className="ri">Confirming your payment</span></span></h1>}>
          <Details searchParams={searchParams} />
        </Suspense>
        <p className="own">Splitting a bill of your own? <Link href="/">Try Splits</Link></p>
      </main>
      <div className="fine">Live demo: payments are real, kept to a few dollars, and refunded. Apple Pay is a trademark of Apple Inc.</div>
    </div>
  );
}

async function Details({ searchParams }: { searchParams: SearchParams }) {
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
