"use client";

import { useSearchParams } from "next/navigation";

type Details = {
  friend: string;
  event: string;
  method: string;
  amount: string;
};

const placeholders: Details = {
  friend: "[Friend name]",
  event: "[dinner name]",
  method: "[Apple Pay or card]",
  amount: "$--.--",
};

/** Anything missing from the URL keeps its placeholder. Values render as plain text. */
function readDetails(params: URLSearchParams): Details {
  const amount = params.get("amount");
  return {
    friend: params.get("friend") || placeholders.friend,
    event: params.get("event") || placeholders.event,
    method: params.get("method") || placeholders.method,
    amount:
      amount && /^\d+(\.\d{1,2})?$/.test(amount)
        ? `$${Number(amount).toFixed(2)}`
        : placeholders.amount,
  };
}

export function PaymentDetails() {
  const details = readDetails(useSearchParams());
  return <Lines details={details} />;
}

export function Lines({ details }: { details: Details }) {
  return (
    <>
      <p className="lead">
        Your share of <span id="pc-event">{details.event}</span> is paid.{" "}
        <span id="pc-friend">{details.friend}</span> has been notified.
      </p>
      <p className="paid">
        <span id="pc-amount">{details.amount}</span> paid with{" "}
        <span id="pc-method">{details.method}</span>
      </p>
    </>
  );
}

export { placeholders };
