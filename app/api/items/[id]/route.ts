import { claimItem, unclaimItem, updateItem, deleteItem, itemListId } from "@/lib/live-lists";
import { reconcileList } from "@/app/(site)/stripe/settle";

export async function PATCH(req: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;
  const { action, user, ...fields } = await req.json().catch(() => ({}));

  if (action === "claim" || action === "unclaim") {
    if (!user) return Response.json({ error: "user is required" }, { status: 400 });
    if (action === "claim") {
      const r = await claimItem(id, user);
      if (r === null) return Response.json({ error: "Item not found" }, { status: 404 });
      if (r === "taken") return Response.json({ error: "Already claimed" }, { status: 409 });
      if (r === "not-member") {
        return Response.json(
          { error: "Choose someone who belongs to this list." },
          { status: 400 },
        );
      }
      if (r === "not-allowed") {
        return Response.json(
          { error: "Only the group owner can assign items to another member." },
          { status: 403 },
        );
      }
      await reconcileList(r.listId);
      return Response.json(r);
    }
    const r = await unclaimItem(id, user);
    if (r === null) return Response.json({ error: "Item not found" }, { status: 404 });
    if (r === "not-yours") return Response.json({ error: "Not your claim" }, { status: 403 });
    await reconcileList(r.listId);
    return Response.json(r);
  }

  const patch: Record<string, unknown> = {};
  for (const k of ["name", "quantity", "priceCents", "purchased"]) if (k in fields) patch[k] = fields[k];
  const item = await updateItem(id, patch as Parameters<typeof updateItem>[1]);
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
  // A changed price or quantity changes what someone owes, so their pay link is re-checked.
  await reconcileList(item.listId);
  return Response.json(item);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/items/[id]">) {
  const { id } = await ctx.params;
  const listId = await itemListId(id);
  if (!(await deleteItem(id))) return Response.json({ error: "Item not found" }, { status: 404 });
  if (listId) await reconcileList(listId);
  return Response.json({ ok: true });
}