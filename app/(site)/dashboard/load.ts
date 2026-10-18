import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { DashboardData, DashFriend, DashGroup, DashItem, DashList, DashMember, DashTotal } from "./types";

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
    lists: [],
    totals: [],
    friends: [],
    friendsReady: true,
    selectedGroupId: null,
    loadError: null,
  };

  const friendResult = await supabase.rpc("list_friends");
  const friendMessage = friendResult.error?.message ?? "";
  const friendsReady = !friendMessage.includes("Could not find the function");
  if (friendResult.error && friendsReady) return { ...empty, loadError: friendResult.error.message };
  const friends: DashFriend[] = ((friendResult.data ?? []) as { friend_id: string; display_name: string; phone: string }[]).map(
    (friend) => ({
      id: friend.friend_id,
      name: friend.display_name,
      phone: friend.phone,
    }),
  );
  empty.friends = friends;
  empty.friendsReady = friendsReady;

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
  if (groupIds.length === 0) return { ...empty, friends, friendsReady };

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

    const memberById = new Map(members.map((member) => [member.id, member]));
    const claimsByItem = new Map<string, { userId: string; name: string }[]>();
    for (const claim of claimResult.data ?? []) {
      const people = claimsByItem.get(claim.item_id) ?? [];
      const member = memberById.get(claim.member_id);
      people.push({ userId: member?.userId ?? "", name: member?.name ?? "Someone" });
      claimsByItem.set(claim.item_id, people);
    }

    items = itemRows.map((item) => {
      const list = listById.get(item.list_id);
      return {
        id: item.id,
        groupId: list?.group_id ?? "",
        listId: item.list_id,
        listName: list?.name ?? "Shared list",
        name: item.name,
        quantity: item.quantity,
        priceCents: item.price_cents,
        claimedBy: claimsByItem.get(item.id) ?? [],
      };
    });
  }

  const totalResult = await supabase
    .from("who_owes_what")
    .select("group_id, list_id, user_id, name, total_cents")
    .in("group_id", groupIds);
  if (totalResult.error) return { ...empty, groups, members, items, loadError: totalResult.error.message };

  const totals: DashTotal[] = [];
  const shareByList = new Map<string, number>();
  for (const row of totalResult.data ?? []) {
    const existing = totals.find((total) => total.groupId === row.group_id && total.userId === row.user_id);
    if (existing) existing.totalCents += row.total_cents;
    else totals.push({ groupId: row.group_id, userId: row.user_id, name: row.name, totalCents: row.total_cents });
    if (row.user_id === userId) shareByList.set(row.list_id, (shareByList.get(row.list_id) ?? 0) + row.total_cents);
  }

  const dashLists: DashList[] = lists.map((list) => {
    const rows = items.filter((item) => item.listId === list.id);
    return {
      id: list.id,
      groupId: list.group_id,
      name: list.name,
      itemCount: rows.length,
      unassigned: rows.filter((item) => item.claimedBy.length === 0).length,
      totalCents: rows.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
      myShareCents: shareByList.get(list.id) ?? 0,
    };
  });

  return { ...empty, groups, members, items, lists: dashLists, totals, selectedGroupId: groups[0]?.id ?? null, loadError: null };
}

export async function loadPrivateDashboard() {
  "use cache: private";
  cacheLife("seconds");

  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  cacheTag(`dashboard-${data.user.id}`);
  return loadDashboard(data.user.id, data.user.email ?? "");
}
