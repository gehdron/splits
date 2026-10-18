import { connection } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { getList } from "@/lib/store";
import { createShare, listShares, markShareSent, maxShareCents, MIN_SHARE_CENTS, payUrl, type Share } from "@/lib/shares";
import { settlePerson } from "@/lib/settle";
import { normalizeHandle, photonConfigured, sendText } from "@/lib/photon-send";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// What the list page may see: no phone numbers or emails, no Stripe ids.
const publicShare = (share: Share) => ({
  id: share.id,
  personName: share.personName,
  amountCents: share.amountCents,
  status: share.status,
  url: payUrl(share.id),
  sentAt: share.sentAt,
  paidAt: share.paidAt,
});

// Who is asking for the money. With Supabase on, sending a live pay link needs a signed-in organizer,
// whose Connect account (if any) receives the payment. Local runs without Supabase skip this.
async function organizer(): Promise<
  { ok: true; id: string | null; name: string | null; connectAccount: string | null } | { ok: false; error: string }
> {
  if (!supabaseConfigured()) return { ok: true, id: null, name: null, connectAccount: null };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: "Sign in to send pay links." };
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
  let connectAccount: string | null = null;
  if (supabaseAdminConfigured()) {
    const { data: payout } = await createAdminClient()
      .from("payout_accounts")
      .select("stripe_account_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    connectAccount = payout?.stripe_account_id ?? null;
  }
  return { ok: true, id: data.user.id, name: profile?.display_name ?? null, connectAccount };
}

export async function GET(request: Request) {
  await connection();
  const listId = new URL(request.url).searchParams.get("list");
  if (!listId) return Response.json({ error: "Add ?list=" }, { status: 400 });
  try {
    const shares = await listShares("list", listId);
    return Response.json({ shares: shares.filter((share) => share.status !== "void").map(publicShare) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load pay links." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await connection();
  const body = await request.json().catch(() => null);
  const listId = typeof body?.listId === "string" ? body.listId : "";
  const personName = typeof body?.personName === "string" ? body.personName.trim() : "";
  const send = body?.send === true;
  if (!listId || !personName) return Response.json({ error: "Choose a person on a list." }, { status: 400 });

  // The amount comes from the list on the server, never from the browser.
  const data = getList(listId);
  if (!data) return Response.json({ error: "List not found." }, { status: 404 });
  const owedCents = data.items
    .filter((item) => item.claimedBy === personName)
    .reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

  const who = await organizer();
  if (!who.ok) return Response.json({ error: who.error }, { status: 401 });

  // Only the organizer who made the list can ask for money on it, and the money goes to their payout
  // account. A list started while signed out has no organizer, so it can't take payments.
  if (who.id && data.list.ownerId !== who.id) {
    const error = data.list.ownerId
      ? "Only the person who made this list can request money on it."
      : "This list was started while signed out, so it can’t take payments. Sign in and start a new list.";
    return Response.json({ error }, { status: 403 });
  }

  let handle: string | null = null;
  if (send) {
    handle = normalizeHandle(typeof body?.handle === "string" ? body.handle : "");
    if (!handle) return Response.json({ error: "Enter a phone number with area code, or an email." }, { status: 400 });
  }

  try {
    // Brings this person's links in line with what they owe now (old amounts are retired) before anything else.
    const settled = await settlePerson(listId, personName, owedCents);
    if (settled.processing) {
      return Response.json({ error: `A payment from ${personName} is still processing. Try again once it clears.` }, { status: 409 });
    }
    if (owedCents <= 0 && !settled.lastPaid) {
      return Response.json({ error: `${personName} has nothing assigned on this list.` }, { status: 400 });
    }
    if (settled.dueCents <= 0 && settled.lastPaid) {
      const note =
        settled.dueCents < 0
          ? `${personName} paid ${money(settled.paidCents)}, which is ${money(-settled.dueCents)} more than they owe now. Refund the difference in Stripe.`
          : `${personName} already paid ${money(settled.paidCents)}.`;
      return Response.json({ share: publicShare(settled.lastPaid), sent: false, note });
    }
    const already = settled.paidCents > 0 ? ` (${money(settled.paidCents)} already paid)` : "";
    if (settled.dueCents < MIN_SHARE_CENTS) {
      return Response.json(
        { error: `${personName} owes ${money(settled.dueCents)}${already}. Stripe needs at least ${money(MIN_SHARE_CENTS)}.` },
        { status: 400 },
      );
    }
    if (!settled.payable) {
      return Response.json(
        { error: `${personName} owes ${money(settled.dueCents)}${already}. Live demo links are capped at ${money(maxShareCents())}.` },
        { status: 400 },
      );
    }

    const share =
      settled.open ??
      (await createShare({
        amountCents: settled.dueCents,
        personName,
        title: data.list.name,
        source: "list",
        sourceRef: listId,
        organizerId: who.id,
        organizerName: who.name,
        stripeConnectAccountId: who.connectAccount,
      }));

    if (!send || !handle) return Response.json({ share: publicShare(share), sent: false });

    if (!photonConfigured()) {
      return Response.json(
        { share: publicShare(share), sent: false, error: "Texting isn’t set up here yet. Copy the link and send it yourself." },
        { status: 503 },
      );
    }

    const from = who.name ?? "A friend";
    const greeting = /^[+\d]|@/.test(personName) ? "Hi" : `Hi ${personName}`;
    const text = `${greeting}, ${from} split ${share.title} with Splits. Your share is ${money(share.amountCents)}. Pay with Apple Pay or a card: ${payUrl(share.id)}`;
    await sendText(handle, text, `Your share of ${share.title}`);
    const sent = (await markShareSent(share.id, handle)) ?? share;
    return Response.json({ share: publicShare(sent), sent: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the pay link." }, { status: 500 });
  }
}
