import { connection } from "next/server";
import { createList, listAll } from "@/lib/store";
import { signedInUser } from "@/lib/organizer";
import { supabaseConfigured } from "@/lib/supabase/env";

// With Supabase on, lists belong to the signed-in organizer who made them, and only they can list them.
// Pay links are requested per list, so list ids aren't handed out to anyone who asks.
export async function GET() {
  await connection();
  if (!supabaseConfigured()) return Response.json(listAll());
  const user = await signedInUser();
  if (!user) return Response.json([]);
  return Response.json(listAll().filter((list) => list.ownerId === user.id));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const user = await signedInUser();
  const list = createList(body.name || "Shared list", user?.id ?? null);
  return Response.json(list, { status: 201 });
}
