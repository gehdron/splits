import { connection } from "next/server";
import { signedInUser } from "@/app/(site)/stripe/organizer";
import { plaidConfigured, transactionsGet } from "@/app/(site)/plaid/plaid";
import { plaidAccessToken } from "@/app/(site)/plaid/store";
import { splitChargeIds } from "@/app/(site)/plaid/charge-lists";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function chargeDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Recent posted charges from the organizer's linked bank. Pending holds are left out.
export async function GET() {
  await connection();
  if (!plaidConfigured()) {
    return Response.json({ linked: false, charges: [], error: "Plaid isn’t set up here yet." });
  }
  const user = await signedInUser();
  if (!user) return Response.json({ error: "Sign in to see recent charges." }, { status: 401 });

  try {
    const token = await plaidAccessToken(user.id);
    if (!token) return Response.json({ linked: false, charges: [] });

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
    const { transactions } = await transactionsGet(token, isoDate(start), isoDate(end));
    const split = await splitChargeIds(user.id);
    const alreadySplit = new Set(split.ids);
    const charges = transactions
      .filter((tx) => !tx.pending && Number.isFinite(tx.amount) && tx.amount > 0)
      .map((tx) => {
        const cents = Math.round(tx.amount * 100);
        const merchant = (tx.merchant_name || tx.name || "Charge").trim() || "Charge";
        const splitAlready = alreadySplit.has(tx.transaction_id);
        return {
          id: tx.transaction_id,
          merchant,
          date: chargeDate(tx.date),
          sort: tx.date,
          amount: money(cents),
          status: splitAlready ? ("split" as const) : ("none" as const),
        };
      })
      .sort((a, b) => (a.sort < b.sort ? 1 : -1))
      .map(({ sort: _sort, ...charge }) => charge);

    return Response.json({ linked: true, charges, chargeSplitsReady: split.ready });
  } catch (error) {
    console.error(error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message =
      code === "PRODUCT_NOT_READY"
        ? "Plaid is still preparing transactions. Try again in a minute."
        : error instanceof Error
          ? error.message
          : "Recent charges could not be loaded.";
    return Response.json({ linked: true, charges: [], error: message }, { status: code === "PRODUCT_NOT_READY" ? 200 : 502 });
  }
}
