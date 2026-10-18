import { claimItem, unclaimItem, updateItem, deleteItem, itemListId } from "@/lib/store";
import { reconcileList } from "@/lib/settle";

export async function PATCH(req: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;
  const { action, user, ...fields } = await req.json().catch(() => ({}));

  if (action === "claim" || action === "unclaim") {
    if (!user) return Response.json({ error: "user is required" }, { status: 400 });
    if (action === "claim") {
      const r = claimItem(id, user);
      if (r === null) return Response.json({ error: "Item not found" }, { status: 404 });
      if (r === "taken") return Response.json({ error: "Already claimed" }, { status: 409 });
      await reconcileList(r.listId);
      return Response.json(r);
    }
    const r = unclaimItem(id, user);
    if (r === null) return Response.json({ error: "Item not found" }, { status: 404 });
    if (r === "not-yours") return Response.json({ error: "Not your claim" }, { status: 403 });
    await reconcileList(r.listId);
    return Response.json(r);
  }

  const patch: Record<string, unknown> = {};
  for (const k of ["name", "quantity", "priceCents", "purchased"]) if (k in fields) patch[k] = fields[k];
  const item = updateItem(id, patch);
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
  // A changed price or quantity changes what someone owes, so their pay link is re-checked.
  await reconcileList(item.listId);
  return Response.json(item);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;
  const listId = itemListId(id);
  if (!deleteItem(id)) return Response.json({ error: "Item not found" }, { status: 404 });
  if (listId) await reconcileList(listId);
  return Response.json({ ok: true });
}