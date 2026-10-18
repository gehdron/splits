import "server-only";
import { getList } from "./store";
import { listShares, maxShareCents, MIN_SHARE_CENTS, type Share } from "./shares";
import { retireShare, syncShare } from "./stripe";

export type Settlement = {
  paidCents: number;
  dueCents: number;
  payable: boolean; // a link for dueCents is allowed (within Stripe's minimum and the demo cap)
  lastPaid: Share | null;
  open: Share | null; // the one open link, for exactly dueCents
  processing: boolean; // a payment is still settling; nothing was changed
};

// What this person still owes on a list, with their links brought in line: every open link that isn't
// for exactly that amount is retired (all of them when nothing payable is due), so an old amount can
// never be paid. Stripe is checked first, so a payment that beat the webhook still counts.
export async function settlePerson(listId: string, personName: string, owedCents: number, depth = 0): Promise<Settlement> {
  const mine: Share[] = [];
  let processing = false;
  for (const share of await listShares("list", listId)) {
    if (share.personName !== personName || share.status === "void") continue;
    const synced = await syncShare(share);
    processing ||= synced.processing;
    mine.push(synced.share);
  }

  const paid = mine.filter((share) => share.status === "paid");
  const paidCents = paid.reduce((sum, share) => sum + share.amountCents, 0);
  const dueCents = owedCents - paidCents;
  const payable = dueCents >= MIN_SHARE_CENTS && dueCents <= maxShareCents();
  const open = mine.filter((share) => share.status === "unpaid" || share.status === "sent");
  const lastPaid = paid.at(-1) ?? null;

  // A settling payment may still succeed, so leave everything as it is until it does.
  if (processing) return { paidCents, dueCents, payable, lastPaid, open: null, processing };

  // Keep at most one open link, and only if it's for exactly what's due.
  let kept: Share | null = null;
  let paidMeanwhile = false;
  for (const share of open) {
    if (payable && share.amountCents === dueCents && !kept) {
      kept = share;
      continue;
    }
    paidMeanwhile = (await retireShare(share)) || paidMeanwhile;
  }
  // A link we tried to retire had just been paid. Start over with that payment counted.
  if (paidMeanwhile && depth < 3) return settlePerson(listId, personName, owedCents, depth + 1);

  return { paidCents, dueCents, payable, lastPaid, open: kept, processing };
}

// After any change to a list's items: everyone with an open link is re-settled against their new total.
// Failures are logged, not thrown, so editing a list never breaks because Stripe or the database blinked.
export async function reconcileList(listId: string) {
  try {
    const data = getList(listId);
    if (!data) return;
    const people = new Set(
      (await listShares("list", listId))
        .filter((share) => share.status === "unpaid" || share.status === "sent")
        .map((share) => share.personName),
    );
    for (const person of people) {
      const owed = data.items
        .filter((item) => item.claimedBy === person)
        .reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
      await settlePerson(listId, person, owed);
    }
  } catch (error) {
    console.error(`Could not reconcile pay links for list ${listId}.`, error);
  }
}
