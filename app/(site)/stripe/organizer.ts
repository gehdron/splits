import "server-only";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { stripe } from "./checkout";

export type PayoutAccount = {
  stripeAccountId: string | null;
  plaidItemId: string | null;
  bankName: string | null;
  bankLast4: string | null;
  onboardingStartedAt: string | null;
};

/** The signed-in user, or null. Payout setup always needs one. */
export async function signedInUser() {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function getPayoutAccount(userId: string): Promise<PayoutAccount | null> {
  if (!supabaseAdminConfigured()) return null;
  const { data, error } = await createAdminClient()
    .from("payout_accounts")
    .select("stripe_account_id, plaid_item_id, bank_name, bank_last4, onboarding_started_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    stripeAccountId: data.stripe_account_id,
    plaidItemId: data.plaid_item_id,
    bankName: data.bank_name,
    bankLast4: data.bank_last4,
    onboardingStartedAt: data.onboarding_started_at,
  };
}

export async function savePayoutAccount(userId: string, patch: Partial<PayoutAccount>) {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.stripeAccountId !== undefined) row.stripe_account_id = patch.stripeAccountId;
  if (patch.plaidItemId !== undefined) row.plaid_item_id = patch.plaidItemId;
  if (patch.bankName !== undefined) row.bank_name = patch.bankName;
  if (patch.bankLast4 !== undefined) row.bank_last4 = patch.bankLast4;
  if (patch.onboardingStartedAt !== undefined) row.onboarding_started_at = patch.onboardingStartedAt;
  const { error } = await createAdminClient().from("payout_accounts").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/** The organizer's Stripe Connect Express account, created once (the idempotency key makes retries safe). */
export async function ensureConnectAccount(user: { id: string; email: string | null }) {
  const existing = (await getPayoutAccount(user.id))?.stripeAccountId;
  if (existing) return existing;
  const account = await stripe().accounts.create(
    {
      type: "express",
      country: "US",
      email: user.email ?? undefined,
      // Destination charges only need transfers: friends pay Splits, Stripe moves it to the organizer.
      capabilities: { transfers: { requested: true } },
      metadata: { splitsUserId: user.id },
    },
    { idempotencyKey: `connect-account:${user.id}` },
  );
  await savePayoutAccount(user.id, { stripeAccountId: account.id });
  return account.id;
}
