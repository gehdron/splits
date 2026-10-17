import { createClient } from "@/lib/supabase/server";
import type { DashboardData, DashGroup, DashItem, DashMember, DashTotal } from "./types";

type ProfileEmbed = { display_name: string; phone: string } | { display_name: string; phone: string }[] | null;

type MemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  profiles: ProfileEmbed;
};

function oneProfile(value: ProfileEmbed): { display_name: string; phone: string } | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadDashboard(userId: string, email: string): Promise<DashboardData> {
  const supabase = await createClient();
  const empty: DashboardData = {
    me: { id: userId, name: "Splits member", email, phone: "" },
    groups: [],
    members: [],
    items: [],
    totals: [],
    selectedGroupId: null,
    loadError: null,
  };

  const profileResult = await supabase.from("profiles").select("display_name, phone").eq("id", userId).maybeSingle();
  if (profileResult.error) return { ...empty, loadError: profileResult.error.message };
  if (profileResult.data) {
    empty.me.name = profileResult.data.display_name;
    empty.me.phone = profileResult.data.phone;
  }

  const memberResult = await supabase
    .from("group_members")
    .select("id, group_id, user_id, role, profiles(display_name, phone)")
    .order("created_at", { ascending: true });
  if (memberResult.error) return { ...empty, loadError: memberResult.error.message };

  const memberRows = (memberResult.data ?? []) as MemberRow[];
  const mine = memberRows.filter((row) => row.user_id === userId);
  const groupIds = mine.map((row) => row.group_id);
  if (groupIds.length === 0) return empty;

  const groupResult = await supabase.from("groups").select("id, name").in("id", groupIds);
  if (groupResult.error) return { ...empty, loadError: groupResult.error.message };

  const groups: DashGroup[] = (groupResult.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    role: mine.find((row) => row.group_id === group.id)?.role ?? "member",
  }));

  const members: DashMember[] = memberRows
    .filter((row) => groupIds.includes(row.group_id))
    .map((row) => {
      const profile = oneProfile(row.profiles);
      return {
        id: row.id,
        groupId: row.group_id,
        userId: row.user_id,
        name: profile?.display_name ?? "Member",
        phone: profile?.phone ?? "",
        role: row.role,
      };
    });

  const listResult = await supabase.from("lists").select("id, name, group_id").in("group_id", groupIds);
  if (listResult.error) return { ...empty, groups, members, loadError: listResult.error.message };
  const lists = listResult.data ?? [];
  const listIds = lists.map((list) => list.id);
  const listById = new Map(lists.map((list) => [list.id, list]));

  let items: DashItem[] = [];
  if (listIds.length > 0) {
    const itemResult = await supabase.from("items").select("id, list_id, name, quantity, price_cents").in("list_id", listIds);
    if (itemResult.error) return { ...empty, groups, members, loadError: itemResult.error.message };
    const itemRows = itemResult.data ?? [];
    const itemIds = itemRows.map((item) => item.id);
    const claimResult = itemIds.length
      ? await supabase.from("item_claims").select("item_id, member_id").in("item_id", itemIds)
      : { data: [], error: null };
    if (claimResult.error) return { ...empty, groups, members, loadError: claimResult.error.message };

    const memberName = new Map(members.map((member) => [member.id, member.name]));
    const claimsByItem = new Map<string, string[]>();
    for (const claim of claimResult.data ?? []) {
      const names = claimsByItem.get(claim.item_id) ?? [];
      names.push(memberName.get(claim.member_id) ?? "Someone");
      claimsByItem.set(claim.item_id, names);
    }

    items = itemRows.map((item) => {
      const list = listById.get(item.list_id);
      return {
        id: item.id,
        groupId: list?.group_id ?? "",
        listName: list?.name ?? "Shared list",
        name: item.name,
        quantity: item.quantity,
        priceCents: item.price_cents,
        claimedBy: claimsByItem.get(item.id) ?? [],
      };
    });
  }

  const totalResult = await supabase.from("who_owes_what").select("group_id, user_id, name, total_cents").in("group_id", groupIds);
  if (totalResult.error) return { ...empty, groups, members, items, loadError: totalResult.error.message };

  const totals: DashTotal[] = [];
  for (const row of totalResult.data ?? []) {
    const existing = totals.find((total) => total.groupId === row.group_id && total.userId === row.user_id);
    if (existing) existing.totalCents += row.total_cents;
    else totals.push({ groupId: row.group_id, userId: row.user_id, name: row.name, totalCents: row.total_cents });
  }

  return { ...empty, groups, members, items, totals, selectedGroupId: groups[0]?.id ?? null, loadError: null };
}
