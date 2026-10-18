"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { startPayouts } from "./payouts";

type PlaidHandler = { open: () => void };
type PlaidLink = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string, metadata: { accounts?: { id: string }[] }) => void;
    onExit: () => void;
  }) => PlaidHandler;
};

declare global {
  interface Window {
    Plaid?: PlaidLink;
  }
}

export type PayoutStatus = {
  ready: boolean; // the server can store payout accounts
  hasAccount: boolean;
  onboardingStarted: boolean; // after this, Stripe manages the bank and Plaid can't set it
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  bank: string | null; // "Chase ••6789"
  plaid: boolean;
};

const PLAID_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadPlaid(): Promise<PlaidLink> {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PLAID_SCRIPT;
    script.onload = () => (window.Plaid ? resolve(window.Plaid) : reject(new Error("Plaid didn’t load.")));
    script.onerror = () => reject(new Error("Plaid didn’t load. Check your connection."));
    document.head.appendChild(script);
  });
}

export function PayoutsPanel({ status, notice }: { status: PayoutStatus; notice: { ok: boolean; text: string } | null }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startPayouts, undefined);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function linkBank() {
    setBankBusy(true);
    setBankMsg(null);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = (await res.json()) as { linkToken?: string; error?: string };
      if (!data.linkToken) throw new Error(data.error ?? "Couldn’t start Plaid.");
      // The OAuth return page (/api/plaid/oauth) resumes Link with this same token.
      try {
        localStorage.setItem("splits-plaid-link-token", data.linkToken);
      } catch {
        // Without storage, banks that use OAuth can't resume; the others still work.
      }
      const Plaid = await loadPlaid();
      Plaid.create({
        token: data.linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const accountId = metadata.accounts?.[0]?.id ?? "";
            const saved = await fetch("/api/plaid/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, accountId }),
            });
            const result = (await saved.json()) as { ok?: boolean; attached?: boolean; note?: string | null; error?: string };
            setBankMsg(
              result.ok
                ? { ok: Boolean(result.attached), text: result.attached ? "Bank linked. Payouts go there." : (result.note ?? "Bank linked.") }
                : { ok: false, text: result.error ?? "Couldn’t link that bank." },
            );
            router.refresh();
          } catch {
            setBankMsg({ ok: false, text: "Couldn’t save that bank. Check your connection and try again." });
          } finally {
            setBankBusy(false);
          }
        },
        onExit: () => setBankBusy(false),
      }).open();
    } catch (error) {
      setBankMsg({ ok: false, text: error instanceof Error ? error.message : "Couldn’t start Plaid." });
      setBankBusy(false);
    }
  }

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
      {status.plaid && !status.onboardingStarted ? (
        <div className="payouts-bank">
          <p className="note">Optional first step: link your bank with Plaid so Stripe already has it.</p>
          <button className="btn btn-b" type="button" onClick={() => void linkBank()} disabled={bankBusy}>
            {bankBusy ? "Opening Plaid…" : status.bank ? "Use a different bank" : "Link your bank with Plaid"}
          </button>
          {bankMsg ? <p className={bankMsg.ok ? "ok" : "err"}>{bankMsg.text}</p> : null}
        </div>
      ) : null}
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
