import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { fileGetShare, fileListShares, fileSaveShare, fileUpdateShare, type Share } from "@/lib/store";

export type { Share, ShareStatus } from "@/lib/store";

// Live payments: keep demo amounts tiny. Stripe's minimum for USD is $0.50.
export const MIN_SHARE_CENTS = 50;
export function maxShareCents() {
  const configured = Number(process.env.SPLITS_MAX_SHARE_CENTS);
  return Number.isInteger(configured) && configured >= MIN_SHARE_CENTS ? configured : 500;
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://splits.select").replace(/\/+$/, "");
}

export function payUrl(shareId: string) {
  return `${appUrl()}/pay/${shareId}`;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// 22 base62 characters is about 131 bits, so the link itself can't be guessed.
export function newShareId() {
  const bytes = randomBytes(22);
  let id = "sh_";
  for (const byte of bytes) id += ID_ALPHABET[byte % 62];
  return id;
}

export function isShareId(value: string) {
  return /^sh_[A-Za-z0-9]{22}$/.test(value);
}

// Supabase in production. A local JSON file only when running on your own machine:
// on Vercel the filesystem is read-only and the webhook runs in a different instance.
function backend(): "supabase" | "file" {
  if (supabaseAdminConfigured()) return "supabase";
  if (process.env.VERCEL) {
    throw new Error("Pay links need SUPABASE_SERVICE_ROLE_KEY in Vercel, and supabase/payments.sql run once.");
  }
  return "file";
}

type ShareRow = {
  id: string;
  amount_cents: number;
  currency: string;
  person_name: string;
  title: string;
  status: Share["status"];
  recipient_handle: string | null;
  organizer_id: string | null;
  organizer_name: string | null;
  stripe_connect_account_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  source: Share["source"];
  source_ref: string | null;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
};

const fromRow = (row: ShareRow): Share => ({
  id: row.id,
  amountCents: row.amount_cents,
  currency: row.currency,
  personName: row.person_name,
  title: row.title,
  status: row.status,
  recipientHandle: row.recipient_handle,
  organizerId: row.organizer_id,
  organizerName: row.organizer_name,
  stripeConnectAccountId: row.stripe_connect_account_id,
  stripeSessionId: row.stripe_session_id,
  stripePaymentIntentId: row.stripe_payment_intent_id,
  source: row.source,
  sourceRef: row.source_ref,
  createdAt: row.created_at,
  sentAt: row.sent_at,
  paidAt: row.paid_at,
});

const COLUMNS: Record<keyof Share, keyof ShareRow> = {
  id: "id",
  amountCents: "amount_cents",
  currency: "currency",
  personName: "person_name",
  title: "title",
  status: "status",
  recipientHandle: "recipient_handle",
  organizerId: "organizer_id",
  organizerName: "organizer_name",
  stripeConnectAccountId: "stripe_connect_account_id",
  stripeSessionId: "stripe_session_id",
  stripePaymentIntentId: "stripe_payment_intent_id",
  source: "source",
  sourceRef: "source_ref",
  createdAt: "created_at",
  sentAt: "sent_at",
  paidAt: "paid_at",
};

function toRow(patch: Partial<Share>) {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) row[COLUMNS[key as keyof Share]] = value;
  return row;
}

export type NewShare = Pick<Share, "amountCents" | "personName" | "title" | "source" | "sourceRef"> &
  Partial<Pick<Share, "organizerId" | "organizerName" | "stripeConnectAccountId" | "recipientHandle">>;

export async function createShare(input: NewShare): Promise<Share> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_SHARE_CENTS) {
    throw new Error(`A pay link needs at least $${(MIN_SHARE_CENTS / 100).toFixed(2)}.`);
  }
  if (input.amountCents > maxShareCents()) {
    throw new Error(`Live demo links are capped at $${(maxShareCents() / 100).toFixed(2)}.`);
  }
  const share: Share = {
    id: newShareId(),
    amountCents: input.amountCents,
    currency: "usd",
    personName: input.personName.trim(),
    title: input.title.trim() || "a shared bill",
    status: "unpaid",
    recipientHandle: input.recipientHandle ?? null,
    organizerId: input.organizerId ?? null,
    organizerName: input.organizerName ?? null,
    stripeConnectAccountId: input.stripeConnectAccountId ?? null,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    source: input.source,
    sourceRef: input.sourceRef,
    createdAt: new Date().toISOString(),
    sentAt: null,
    paidAt: null,
  };
  if (backend() === "file") return fileSaveShare(share);
  const { data, error } = await createAdminClient().from("shares").insert(toRow(share)).select().single();
  if (error?.code === "23505") {
    // Two requests at once: shares_one_open_link let the other one win, so use its link.
    const open = (await listShares(share.source, share.sourceRef ?? "")).find(
      (row) => row.personName === share.personName && (row.status === "unpaid" || row.status === "sent"),
    );
    if (open) return open;
  }
  if (error) throw new Error(error.message);
  return fromRow(data as ShareRow);
}

export async function getShare(id: string): Promise<Share | null> {
  if (!isShareId(id)) return null;
  if (backend() === "file") return fileGetShare(id);
  const { data, error } = await createAdminClient().from("shares").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as ShareRow) : null;
}

// "notPaid": anything but paid (a voided link that still got paid is recorded as paid).
// "open": only unpaid or sent, so a voided link can't pick up a new checkout.
type Guard = "none" | "notPaid" | "open";

async function updateShare(id: string, patch: Partial<Share>, guard: Guard = "none"): Promise<Share | null> {
  if (backend() === "file") {
    const current = fileGetShare(id);
    if (!current) return null;
    if (guard === "notPaid" && current.status === "paid") return null;
    if (guard === "open" && current.status !== "unpaid" && current.status !== "sent") return null;
    return fileUpdateShare(id, patch);
  }
  let query = createAdminClient().from("shares").update(toRow(patch)).eq("id", id);
  if (guard === "notPaid") query = query.neq("status", "paid");
  if (guard === "open") query = query.in("status", ["unpaid", "sent"]);
  const { data, error } = await query.select().maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as ShareRow) : null;
}

/** Attaches a checkout only to a link that is still open. Returns null if it was voided or paid meanwhile. */
export function setShareSession(id: string, sessionId: string) {
  return updateShare(id, { stripeSessionId: sessionId }, "open");
}

// "sent" never overwrites "paid": a friend can pay before the text even arrives.
export function markShareSent(id: string, recipientHandle: string) {
  return updateShare(id, { status: "sent", recipientHandle, sentAt: new Date().toISOString() }, "open");
}

// A link replaced by a newer amount. Only an unpaid link can be voided; a paid one stays paid.
export function voidShare(id: string) {
  return updateShare(id, { status: "void" }, "open");
}

// Safe to call twice (webhook retries, or the success page confirming first). Returns the paid share.
// A voided link that still gets paid (its checkout was already open) is recorded as paid: the money arrived.
export async function markSharePaid(id: string, sessionId: string, paymentIntentId: string | null) {
  const updated = await updateShare(
    id,
    { status: "paid", stripeSessionId: sessionId, stripePaymentIntentId: paymentIntentId, paidAt: new Date().toISOString() },
    "notPaid",
  );
  return updated ?? getShare(id);
}

export async function listShares(source: Share["source"], sourceRef: string): Promise<Share[]> {
  if (backend() === "file") return fileListShares(source, sourceRef);
  const { data, error } = await createAdminClient()
    .from("shares")
    .select()
    .eq("source", source)
    .eq("source_ref", sourceRef)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ShareRow[]).map(fromRow);
}
