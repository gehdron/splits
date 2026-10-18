import { addItems, listExists } from "@/lib/live-lists";
import type { NewItem } from "@/lib/store";
import { reconcileList } from "@/lib/settle";

export async function POST(req: Request, ctx: RouteContext<"/api/lists/[id]/items">) {
  const { id } = await ctx.params;
  try {
    if (!(await listExists(id))) return Response.json({ error: "List not found" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const incoming: NewItem[] = Array.isArray(body) ? body : body ? [body] : [];
    if (incoming.length === 0 || incoming.some((i) => !i?.name || typeof i.name !== "string")) {
      return Response.json({ error: "Each item needs a name" }, { status: 400 });
    }
    const added = await addItems(id, incoming);
    // New claimed items change what people owe, so their pay links are re-checked.
    await reconcileList(id);
    return Response.json(added, { status: 201 });
  } catch (error) {
    console.error("Could not add items to list.", error);
    const forbidden =
      error instanceof Error &&
      error.message === "Only the group owner can add items to this list.";
    return Response.json(
      {
        error: forbidden
          ? error.message
          : "Those items could not be added. Please try again.",
      },
      { status: forbidden ? 403 : 500 },
    );
  }
}