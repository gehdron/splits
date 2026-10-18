import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPayoutAccount } from "@/lib/organizer";
import { plaidConfigured } from "@/lib/plaid";
import { stripe } from "@/lib/stripe";
import { AuthShell } from "../_components/auth-shell";
import { signOut } from "../auth/actions";
import { PayoutsPanel, type PayoutStatus } from "./payouts-panel";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Messages for the places Stripe onboarding and Plaid send people back to.
const NOTICES: Record<string, { ok: boolean; text: string }> = {
  "payouts:done": { ok: true, text: "Thanks. Stripe is checking your details; payouts turn on once it’s done." },
  "payouts:retry": { ok: false, text: "That Stripe link expired. Open payout setup again." },
  "bank:linked": { ok: true, text: "Bank linked. Payouts go there." },
  "bank:recorded": { ok: false, text: "Plaid linked your bank, but Stripe couldn’t use it (expected with Plaid sandbox and live Stripe). Add your bank in Stripe’s payout setup instead." },
  "bank:failed": { ok: false, text: "Couldn’t link that bank. Try again." },
  "bank:managed": { ok: false, text: "Stripe manages your payout bank now. Change it in your Stripe Express account." },
  "bank:canceled": { ok: false, text: "Bank linking was canceled." },
  "bank:expired": { ok: false, text: "That bank link expired. Try again." },
};

export const metadata: Metadata = {
  title: "Your Splits account",
};

export default function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthShell title="Your account" lead="This is the account you use to split bills.">
      <Suspense fallback={<p className="note">Loading your account…</p>}>
        <AccountPanel searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function AccountPanel({ searchParams }: { searchParams: SearchParams }) {
  if (!supabaseConfigured()) {
    return (
      <p className="note">
        Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server.
      </p>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const metadataName = data.user.user_metadata?.name;
  const metadataPhone = data.user.user_metadata?.phone;
  const name = typeof metadataName === "string" && metadataName.trim() ? metadataName : "Splits member";
  const phone = typeof metadataPhone === "string" ? metadataPhone : "";
  const query = await searchParams;
  const noticeKey = ["payouts", "bank"].map((key) => (typeof query[key] === "string" ? `${key}:${query[key]}` : "")).find((key) => key in NOTICES);
  const payouts = await payoutStatus(data.user.id);

  return (
    <>
      <div className="who">
        <strong>{name}</strong>
        <span>{data.user.email}</span>
        {phone ? <span>{phone}</span> : null}
      </div>
      <PayoutsPanel status={payouts} notice={noticeKey ? NOTICES[noticeKey] : null} />
      <form action={signOut}>
        <button className="btn btn-b" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}

async function payoutStatus(userId: string): Promise<PayoutStatus> {
  const empty = { hasAccount: false, onboardingStarted: false, payoutsEnabled: false, detailsSubmitted: false, bank: null, plaid: plaidConfigured() };
  if (!supabaseAdminConfigured()) return { ready: false, ...empty };
  const payout = await getPayoutAccount(userId).catch(() => null);
  if (!payout?.stripeAccountId) return { ready: true, ...empty };
  // Stripe is the source of truth for whether this account can be paid out yet.
  const account = await stripe().accounts.retrieve(payout.stripeAccountId).catch(() => null);
  return {
    ready: true,
    hasAccount: true,
    onboardingStarted: Boolean(payout.onboardingStartedAt),
    payoutsEnabled: Boolean(account?.payouts_enabled),
    detailsSubmitted: Boolean(account?.details_submitted),
    bank: payoutBank(account, payout),
    plaid: plaidConfigured(),
  };
}

// Once onboarding starts, the organizer can change their bank inside Stripe, so Stripe's default payout
// bank is the one to show. Before that, it's the one they linked with Plaid.
function payoutBank(
  account: Awaited<ReturnType<ReturnType<typeof stripe>["accounts"]["retrieve"]>> | null,
  payout: { onboardingStartedAt: string | null; bankName: string | null; bankLast4: string | null },
) {
  if (payout.onboardingStartedAt) {
    const bank = account?.external_accounts?.data.find((entry) => entry.object === "bank_account" && entry.default_for_currency);
    return bank && bank.object === "bank_account" ? `${bank.bank_name ?? "Bank"} ••${bank.last4}` : null;
  }
  return payout.bankLast4 ? `${payout.bankName ?? "Bank"} ••${payout.bankLast4}` : null;
}
