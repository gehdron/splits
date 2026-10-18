import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { LogoMark } from "../_components/logo";
import { getShare } from "./shares";
import { checkoutForShare, money, type CheckoutResult } from "./checkout";
import "./pay.css";

export type PayPageProps = {
  params: Promise<{ shareId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// https://splits.select/pay/sh_... is the link a friend gets by text. It opens Stripe Checkout straight away,
// unless they just backed out of it, already paid, or the link is wrong.
export function PayPage({ params, searchParams }: PayPageProps) {
  return (
    <div className="py">
      <header className="nav">
        <Link className="brand" href="/" aria-label="Splits home">
          <LogoMark size={30} />
          <span>Splits</span>
        </Link>
      </header>
      <main>
        <Suspense fallback={<Opening />}>
          <PayGate params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

function Opening() {
  return (
    <>
      <h1>Opening checkout</h1>
      <p className="lead">This takes a second.</p>
      <span className="wait" role="img" aria-label="Loading" />
    </>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1>{title}</h1>
      {children}
    </>
  );
}

async function PayGate({ params, searchParams }: PayPageProps) {
  // Every visit talks to Stripe, so this always renders at request time.
  await connection();
  const { shareId } = await params;
  const query = await searchParams;
  const share = await getShare(shareId).catch((error: unknown) => {
    console.error(error);
    return undefined;
  });
  if (share === undefined) return <CheckoutFailed shareId={shareId} />;

  if (!share) {
    return (
      <Message title="We can’t find that pay link.">
        <p className="lead">The link may be old or mistyped. Ask the person who sent it for a new one.</p>
      </Message>
    );
  }

  const amount = money(share.amountCents);
  const from = share.organizerName ? `${share.organizerName} split ${share.title}` : `Your share of ${share.title}`;

  if (share.status === "paid") return <Paid amount={amount} title={share.title} />;
  if (share.status === "void") return <Replaced from={share.organizerName} />;

  // Back from Checkout without paying: show the amount and let them choose to try again.
  if (query.canceled) {
    return (
      <Message title={`Your share is ${amount}.`}>
        <p className="lead">{from}.</p>
        <Link className="pay" href={`/pay/${share.id}`}>Pay {amount}</Link>
        <p className="sub">Apple Pay on supported devices. Card everywhere else.</p>
      </Message>
    );
  }

  const result: CheckoutResult | null = await checkoutForShare(share).catch((error: unknown) => {
    console.error(error);
    return null;
  });
  if (!result) return <CheckoutFailed shareId={share.id} />;
  if (result.kind === "paid") return <Paid amount={amount} title={share.title} />;
  if (result.kind === "void") return <Replaced from={share.organizerName} />;
  if (result.kind === "processing") {
    return (
      <Message title="Your payment is processing.">
        <p className="lead">Stripe is confirming it with your bank. This link shows it as paid once that’s done.</p>
      </Message>
    );
  }
  redirect(result.url);
}

function Replaced({ from }: { from: string | null }) {
  return (
    <Message title="This link was replaced.">
      <p className="lead">Your share changed, so this link no longer works. Ask {from ?? "the person who sent it"} for the new one.</p>
    </Message>
  );
}

function Paid({ amount, title }: { amount: string; title: string }) {
  return (
    <Message title="This share is paid.">
      <p className="lead">{amount} for {title} is already paid. Nothing else to do.</p>
      <span className="ok">Paid</span>
    </Message>
  );
}

function CheckoutFailed({ shareId }: { shareId: string }) {
  return (
    <Message title="Checkout didn’t open.">
      <p className="lead">Something went wrong on our side. Try again in a moment.</p>
      <Link className="pay" href={`/pay/${encodeURIComponent(shareId)}`}>Try again</Link>
    </Message>
  );
}
