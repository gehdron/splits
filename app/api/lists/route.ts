import { connection } from "next/server";
import { creatorMember, currentListViewer } from "@/lib/list-viewer";
import { createList, listSummaries } from "@/lib/live-lists";
import { memberOnList } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/env";

function publicSummary(list: { id: string; name: string; createdAt: number; itemCount: number }) {
  return { id: list.id, name: list.name, createdAt: list.createdAt, itemCount: list.itemCount };
}

// With Supabase on, a list is visible to the organizer who made it and to people added to it.
// Pay links are requested per list, so list ids aren't handed out to anyone who asks.
export async function GET() {
  await connection();
  const summaries = await listSummaries();
  if (!supabaseConfigured()) return Response.json(summaries.map(publicSummary));
  const viewer = await currentListViewer();
  if (!viewer) return Response.json([]);
  return Response.json(
    summaries
      .filter(
        (list) =>
          list.ownerId === viewer.userId ||
          (list.members ?? []).some((member) => memberOnList(member, viewer)),
      )
      .map(publicSummary),
  );
}

export async function POST(req: Request) {
  await connection();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const name = "name" in body && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "Every list needs a name." }, { status: 400 });
  if (name.length > 80) return Response.json({ error: "List names must be 80 characters or fewer." }, { status: 400 });
  try {
    const viewer = await currentListViewer();
    const list = await createList(name, viewer?.userId ?? null, viewer ? creatorMember(viewer) : undefined);
    return Response.json({ id: list.id, name: list.name, createdAt: list.createdAt, itemCount: 0 }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The list could not be created.";
    const safe = /SUPABASE_SERVICE_ROLE_KEY|shared-lists\.sql/.test(message) ? message : "The list could not be created.";
    return Response.json({ error: safe }, { status: 500 });
  }
}
