import { connection } from "next/server";
import { getList } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/lists/[id]">) {
  await connection(); // always run at request time, never prerendered
  const { id } = await ctx.params;
  const data = getList(id);
  if (!data) return Response.json({ error: "List not found" }, { status: 404 });
  return Response.json(data);
}