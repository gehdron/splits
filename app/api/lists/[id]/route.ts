import { connection } from "next/server";
import { getList, renameList } from "@/lib/live-lists";

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
  const { name } = await req.json().catch(() => ({}));
  const next = String(name ?? "").trim();
  if (!next) return Response.json({ error: "Enter a list name." }, { status: 400 });
  const list = await renameList(id, next);
  if (!list) return Response.json({ error: "List not found" }, { status: 404 });
  return Response.json(list);
}