import { connection } from "next/server";
import { getList, updateList } from "@/lib/live-lists";
import { reconcileList } from "@/app/(site)/stripe/settle";

export async function GET(_req: Request, ctx: RouteContext<"/api/lists/[id]">) {
  await connection(); // always run at request time, never prerendered
  const { id } = await ctx.params;
  const data = await getList(id);
  if (!data) return Response.json({ error: "List not found" }, { status: 404 });
  // The organizer's user id, and members' phone numbers and emails, aren't anyone else's business.
  const list = { ...data.list };
  delete list.ownerId;
  return Response.json({
    ...data,
    list: {
      ...list,
      members: (list.members ?? []).map((member) => ({ name: member.name, userId: member.userId })),
    },
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/lists/[id]">) {
  await connection();
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const patch: {
    name?: string;
    merchant?: string;
    receiptSubtotalCents?: number;
    taxCents?: number;
    tipCents?: number;
    receiptTotalCents?: number;
  } = {};

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const bodyRecord = body as Record<string, unknown>;
  if ("name" in bodyRecord) {
    if (typeof bodyRecord.name !== "string") {
      return Response.json({ error: "Enter a list name." }, { status: 400 });
    }
    const next = bodyRecord.name.trim();
    if (!next) return Response.json({ error: "Enter a list name." }, { status: 400 });
    if (next.length > 80) {
      return Response.json({ error: "List names must be 80 characters or fewer." }, { status: 400 });
    }
    patch.name = next;
  }
  if ("merchant" in bodyRecord) {
    if (typeof bodyRecord.merchant !== "string") {
      return Response.json({ error: "Merchant must be text." }, { status: 400 });
    }
    patch.merchant = bodyRecord.merchant.trim();
  }
  for (const key of ["receiptSubtotalCents", "taxCents", "tipCents", "receiptTotalCents"] as const) {
    if (!(key in bodyRecord)) continue;
    const cents = bodyRecord[key];
    if (typeof cents !== "number" || !Number.isSafeInteger(cents) || cents < 0) {
      return Response.json({ error: `${key} must be a non-negative whole number of cents.` }, { status: 400 });
    }
    patch[key] = cents;
  }

  const list = await updateList(id, patch);
  if (!list) return Response.json({ error: "List not found" }, { status: 404 });
  if (
    patch.receiptSubtotalCents !== undefined ||
    patch.taxCents !== undefined ||
    patch.tipCents !== undefined ||
    patch.receiptTotalCents !== undefined
  ) {
    await reconcileList(id);
  }
  return Response.json(list);
}