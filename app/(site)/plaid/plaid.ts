import "server-only";

// Plaid is the organizer's own bank: payout account, and the recent charges on the dashboard.
// Friends never see Plaid; they pay with Stripe Checkout. Plain fetch keeps this to the calls we need.
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
  const data = (await response.json().catch(() => null)) as (T & { error_message?: string; error_code?: string }) | null;
  if (!response.ok || !data) {
    const error = new Error(data?.error_message ?? `Plaid ${path} failed (${response.status}).`) as Error & { code?: string };
    error.code = data?.error_code;
    throw error;
  }
  return data;
}

export function createLinkToken(userId: string, redirectUri: string) {
  return plaid<{ link_token: string; expiration: string }>("/link/token/create", {
    user: { client_user_id: userId },
    client_name: "Splits",
    products: ["auth", "transactions"],
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

export type PlaidTransaction = {
  transaction_id: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  pending: boolean;
};

// Posted charges for the dashboard. Amounts are positive when money left the account.
export function transactionsGet(accessToken: string, startDate: string, endDate: string) {
  return plaid<{ transactions: PlaidTransaction[] }>("/transactions/get", {
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
    options: { count: 25, offset: 0 },
  });
}

// Drop a link we could not store. A stored link stays, so recent charges can be read later.
export function removeItem(accessToken: string) {
  return plaid<{ request_id: string }>("/item/remove", { access_token: accessToken });
}
