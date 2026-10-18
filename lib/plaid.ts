import "server-only";

// Plaid is only for the organizer's own bank (where their payouts land). Friends never see Plaid;
// they pay with Stripe Checkout. Plain fetch keeps this to the four calls we need.
export function plaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

function plaidBase() {
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (env === "production") return "https://production.plaid.com";
  if (env === "sandbox") return "https://sandbox.plaid.com";
  throw new Error("PLAID_ENV must be sandbox or production.");
}

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) throw new Error("Set PLAID_CLIENT_ID and PLAID_SECRET to link a bank.");
  const response = await fetch(`${plaidBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as (T & { error_message?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error_message ?? `Plaid ${path} failed (${response.status}).`);
  return data;
}

export function createLinkToken(userId: string, redirectUri: string) {
  return plaid<{ link_token: string; expiration: string }>("/link/token/create", {
    user: { client_user_id: userId },
    client_name: "Splits",
    products: ["auth"],
    country_codes: ["US"],
    language: "en",
    redirect_uri: redirectUri,
  });
}

export function exchangePublicToken(publicToken: string) {
  return plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
}

// Plaid hands Stripe a bank account token for the chosen account, so no account numbers touch Splits.
export function stripeBankAccountToken(accessToken: string, accountId: string) {
  return plaid<{ stripe_bank_account_token: string }>("/processor/stripe/bank_account_token/create", {
    access_token: accessToken,
    account_id: accountId,
  });
}

// We only need the access token once. Removing the item afterwards means Splits keeps no bank access.
export function removeItem(accessToken: string) {
  return plaid<{ request_id: string }>("/item/remove", { access_token: accessToken });
}
