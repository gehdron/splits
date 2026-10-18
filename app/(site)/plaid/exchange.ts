import { connection } from "next/server";
import { ensureConnectAccount, getPayoutAccount, savePayoutAccount, signedInUser } from "@/app/(site)/stripe/organizer";
import { exchangePublicToken, plaidConfigured, removeItem, stripeBankAccountToken } from "@/app/(site)/plaid/plaid";
import { stripe } from "@/app/(site)/stripe/checkout";

// Plaid public token -> Stripe bank account token -> external account on the organizer's Connect account.
// Stripe lets the platform set an Express account's bank only before onboarding starts, so this is the
// optional first step of payout setup. Plaid's sandbox only issues Stripe test-mode tokens, so with a
// live Stripe key the last step needs PLAID_ENV=production; the response says when it wasn't attached.
export async function POST(request: Request) {
  await connection();
  if (!plaidConfigured()) return Response.json({ error: "Plaid isn’t set up here yet." }, { status: 503 });
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to link a bank." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const publicToken = typeof body?.publicToken === "string" ? body.publicToken : "";
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  if (!publicToken || !accountId) return Response.json({ error: "Choose an account in Plaid." }, { status: 400 });

  try {
    const payout = await getPayoutAccount(user.id);
    if (payout?.onboardingStartedAt) {
      return Response.json(
        { error: "Stripe manages your payout bank now. Change it in your Stripe Express account." },
        { status: 409 },
      );
    }
    const stripeAccountId = await ensureConnectAccount(user);

    const { access_token: accessToken, item_id: itemId } = await exchangePublicToken(publicToken);
    let attached = false;
    let note: string | null = null;
    try {
      const { stripe_bank_account_token: bankToken } = await stripeBankAccountToken(accessToken, accountId);
      // Payout setup may have started in another tab while Plaid was working. Then Stripe owns the bank.
      if ((await getPayoutAccount(user.id))?.onboardingStartedAt) {
        await savePayoutAccount(user.id, { plaidItemId: itemId });
        return Response.json(
          { error: "Stripe manages your payout bank now. Change it in your Stripe Express account." },
          { status: 409 },
        );
      }
      const external = await stripe().accounts.createExternalAccount(stripeAccountId, {
        external_account: bankToken,
        default_for_currency: true,
      });
      attached = true;
      if (external.object === "bank_account") {
        await savePayoutAccount(user.id, { plaidItemId: itemId, bankName: external.bank_name ?? null, bankLast4: external.last4 });
      } else {
        await savePayoutAccount(user.id, { plaidItemId: itemId });
      }
    } catch (error) {
      console.error(error);
      note =
        process.env.PLAID_ENV === "production"
          ? "Stripe didn’t accept that bank. Try another account."
          : "Bank linked in Plaid sandbox. Attaching it to a live Stripe account needs PLAID_ENV=production.";
      await savePayoutAccount(user.id, { plaidItemId: itemId });
    } finally {
      // Splits keeps no ongoing bank access once Stripe has (or can't use) the account.
      await removeItem(accessToken).catch((error: unknown) => console.error(error));
    }
    return Response.json({ ok: true, attached, note });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not link that bank." }, { status: 502 });
  }
}
