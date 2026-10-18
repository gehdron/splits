"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureConnectAccount, savePayoutAccount, signedInUser } from "@/lib/organizer";
import { appUrl } from "@/lib/shares";
import { supabaseAdminConfigured } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

export type PayoutState = { error?: string } | undefined;

// Sends the organizer to Stripe's own onboarding (identity and bank) for their Connect Express account,
// creating the account first if needed. Running it again opens onboarding where they left off.
export async function startPayouts(_state: PayoutState): Promise<PayoutState> {
  const user = await signedInUser();
  if (!user) redirect("/login");
  if (!supabaseAdminConfigured()) return { error: "Payouts need SUPABASE_SERVICE_ROLE_KEY on the server." };

  const origin = (await headers()).get("origin") ?? appUrl();
  let link: string;
  try {
    const accountId = await ensureConnectAccount(user);
    // Saved before the link exists: from that moment Stripe manages the payout bank, and Plaid must not
    // try to set it (see /api/plaid/exchange). Marking it early only makes Plaid more cautious.
    await savePayoutAccount(user.id, { onboardingStartedAt: new Date().toISOString() });
    const onboarding = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/account?payouts=retry`,
      return_url: `${origin}/account?payouts=done`,
    });
    link = onboarding.url;
  } catch (error) {
    console.error(error);
    return { error: error instanceof Error ? error.message : "Stripe couldn’t start payouts. Try again." };
  }
  redirect(link);
}
