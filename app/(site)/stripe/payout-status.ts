import "server-only";
import { supabaseAdminConfigured } from "@/lib/supabase/admin";
import { plaidConfigured } from "@/app/(site)/plaid/plaid";
import { stripe } from "./checkout";
import { getPayoutAccount } from "./organizer";
import type { PayoutStatus } from "./payouts-panel";

export async function payoutStatus(userId: string): Promise<PayoutStatus> {
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
