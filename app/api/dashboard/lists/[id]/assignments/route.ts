import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type AssignmentInput = { itemId: string; assignee: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateAssignments(value: unknown): AssignmentInput[] | null {
  if (!Array.isArray(value) || value.length > 150) return null;
  const seenItems = new Set<string>();
  const assignments: AssignmentInput[] = [];

  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.itemId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(entry.itemId) ||
      typeof entry.assignee !== "string" ||
      !entry.assignee.trim() ||
      entry.assignee.trim().length > 40 ||
      seenItems.has(entry.itemId)
    ) {
      return null;
    }
    seenItems.add(entry.itemId);
    assignments.push({
      itemId: entry.itemId,
      assignee: entry.assignee.trim(),
    });
  }
  return assignments;
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/dashboard/lists/[id]/assignments">,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const assignments = isRecord(body) ? validateAssignments(body.assignments) : null;
  if (!assignments || assignments.length === 0) {
    return Response.json({ error: "Provide valid item assignments." }, { status: 400 });
  }

  const { id: listId } = await context.params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return Response.json({ error: "Sign in to assign list items." }, { status: 401 });
  }

  const { data: list, error: listError } = await supabase
    .from("lists")
    .select("id, group_id")
    .eq("id", listId)
    .maybeSingle();
  if (listError) {
    console.error("Dashboard AI assignment could not load its list.", listError);
    return Response.json({ error: "The list could not be loaded." }, { status: 500 });
  }
  if (!list) return Response.json({ error: "List not found." }, { status: 404 });

  const { data: membership, error: membershipError } = await supabase
    .from("group_members")
    .select("id, role")
    .eq("group_id", list.group_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (membershipError) {
    console.error("Dashboard AI assignment could not verify group membership.", membershipError);
    return Response.json({ error: "Your group membership could not be checked." }, { status: 500 });
  }
  if (!membership) {
    return Response.json({ error: "You are not a member of this list's group." }, { status: 403 });
  }
  if (membership.role !== "owner") {
    return Response.json({ error: "Only the group owner can assign items with the AI bot." }, { status: 403 });
  }

  const itemIds = assignments.map((assignment) => assignment.itemId);
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id")
    .eq("list_id", listId)
    .in("id", itemIds);
  if (itemsError) {
    console.error("Dashboard AI assignment could not verify list items.", itemsError);
    return Response.json({ error: "List items could not be checked." }, { status: 500 });
  }
  if ((items ?? []).length !== itemIds.length) {
    return Response.json({ error: "One or more items no longer belong to this list." }, { status: 409 });
  }

  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("id, user_id, profiles(display_name)")
    .eq("group_id", list.group_id);
  if (membersError) {
    console.error("Dashboard AI assignment could not load group members.", membersError);
    return Response.json({ error: "Group members could not be loaded." }, { status: 500 });
  }

  const memberByName = new Map<string, string | null>();
  for (const member of members ?? []) {
    const profile = Array.isArray(member.profiles)
      ? member.profiles[0]
      : member.profiles;
    const name = profile?.display_name;
    if (typeof name === "string") {
      const key = name.trim().toLocaleLowerCase();
      if (memberByName.has(key)) {
        memberByName.set(key, null);
      } else {
        memberByName.set(key, member.id);
      }
    }
  }

  const mapped = assignments.map((assignment) => ({
    ...assignment,
    memberId: memberByName.get(assignment.assignee.toLocaleLowerCase()),
  }));
  if (mapped.some((assignment) => !assignment.memberId)) {
    return Response.json(
      { error: "The AI bot named someone who is not a member of this group. Check the list and try again." },
      { status: 400 },
    );
  }

  const { data: claims, error: claimsError } = await supabase
    .from("item_claims")
    .select("item_id, member_id")
    .in("item_id", itemIds);
  if (claimsError) {
    console.error("Dashboard AI assignment could not load current claims.", claimsError);
    return Response.json({ error: "Current item assignments could not be loaded." }, { status: 500 });
  }

  let updatedCount = 0;
  for (const assignment of mapped) {
    const currentClaims = (claims ?? []).filter((claim) => claim.item_id === assignment.itemId);
    if (
      currentClaims.length === 1 &&
      currentClaims[0].member_id === assignment.memberId
    ) {
      continue;
    }

    const { error: deleteError } = await supabase
      .from("item_claims")
      .delete()
      .eq("item_id", assignment.itemId);
    if (deleteError) {
      console.error("Dashboard AI assignment could not remove existing claims.", deleteError);
      return Response.json(
        { error: "An existing item assignment could not be changed.", updatedCount },
        { status: 500 },
      );
    }

    const { error: insertError } = await supabase.from("item_claims").insert({
      item_id: assignment.itemId,
      member_id: assignment.memberId,
    });
    if (insertError) {
      console.error("Dashboard AI assignment could not save a claim.", insertError);
      return Response.json(
        {
          error: "An item was unassigned, but its new assignment could not be saved.",
          updatedCount,
          refreshRequired: true,
        },
        { status: 500 },
      );
    }
    updatedCount += 1;
  }

  revalidateTag(`dashboard-${auth.user.id}`, { expire: 0 });
  return Response.json({ updatedCount });
}
