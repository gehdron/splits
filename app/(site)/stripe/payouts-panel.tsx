"use client";

import { useActionState } from "react";
import { BankLink } from "@/app/(site)/plaid/bank-link";
import { startPayouts } from "./payouts";

export type PayoutStatus = {
  ready: boolean; // the server can store payout accounts
  hasAccount: boolean;
  onboardingStarted: boolean; // after this, Stripe manages the bank and Plaid can't set it
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  bank: string | null; // "Chase ••6789"
  plaid: boolean;
  linked: boolean; // a Plaid item is already stored for recent charges
};

export function PayoutsPanel({ status, notice }: { status: PayoutStatus; notice: { ok: boolean; text: string } | null }) {
  const [state, action, pending] = useActionState(startPayouts, undefined);
  if (!status.ready) {
    return <p className="note">Payouts need SUPABASE_SERVICE_ROLE_KEY on the server and supabase/payments.sql run once.</p>;
  }

  return (
    <section className="payouts" aria-labelledby="payouts-h">
      <h2 id="payouts-h">Get paid</h2>
      <p className="note">
        When friends pay their share, Stripe sends the money to your bank.{" "}
        {status.payoutsEnabled
          ? "Payouts are on."
          : status.hasAccount
            ? "Finish setup with Stripe to turn payouts on."
            : "Set up payouts once with Stripe."}
      </p>
      {notice ? <p className={notice.ok ? "ok" : "err"}>{notice.text}</p> : null}
      {status.bank ? <p className="ok">Bank: {status.bank}</p> : null}
      {status.plaid ? <BankLink bank={status.bank} linked={status.linked} /> : null}
      {!status.payoutsEnabled ? (
        <form action={action}>
          <button className="btn btn-a" type="submit" disabled={pending}>
            {pending ? "Opening Stripe…" : status.onboardingStarted ? "Finish payout setup" : "Set up payouts"}
          </button>
          {state?.error ? <p className="err">{state.error}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
