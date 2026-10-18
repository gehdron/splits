import { connection } from "next/server";
import { getList, renameList } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/lists/[id]">) {
  await connection(); // always run at request time, never prerendered
  const { id } = await ctx.params;
  const data = getList(id);
  if (!data) return Response.json({ error: "List not found" }, { status: 404 });
  return Response.json(data);
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/lists/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const { name } = await req.json().catch(() => ({}));
  const next = String(name ?? "").trim();
  if (!next) return Response.json({ error: "Enter a list name." }, { status: 400 });
  const list = renameList(id, next);
  if (!list) return Response.json({ error: "List not found" }, { status: 404 });
  return Response.json(list);
}