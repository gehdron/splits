import "server-only";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  addItems as fileAddItems,
  addListMember as fileAddListMember,
  claimItem as fileClaimItem,
  createList as fileCreateList,
  deleteItem as fileDeleteItem,
  getList as fileGetList,
  itemListId as fileItemListId,
  listExists as fileListExists,
  listSummaries as fileListSummaries,
  renameList as fileRenameList,
  sameListMember,
  unclaimItem as fileUnclaimItem,
  updateItem as fileUpdateItem,
  type Item,
  type List,
  type ListMember,
  type NewItem,
} from "@/lib/store";

const SETUP =
  "Lists need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel. Run supabase/shared-lists.sql once in the Supabase SQL editor.";

type DbError = { message: string } | null;

type ListRow = { id: string; name: string; owner_id: string | null; created_at: string };
type MemberRow = { list_id: string; name: string; user_id: string | null; phone: string | null; email: string | null };
type ItemRow = {
  id: string;
  list_id: string;
  name: string;
  quantity: number;
  price_cents: number;
  claimed_by: string | null;
  purchased: boolean;
};

function useRemote(): boolean {
  if (!process.env.VERCEL) return false;
  if (!supabaseAdminConfigured()) throw new Error(SETUP);
  return true;
}

function db() {
  return createAdminClient();
}

function raise(error: DbError): void {
  if (!error) return;
  if (/does not exist|schema cache|bill_lists|bill_items|bill_list_members/i.test(error.message)) throw new Error(SETUP);
  throw new Error(error.message);
}

function toMember(row: MemberRow): ListMember {
  const member: ListMember = { name: row.name };
  if (row.user_id) member.userId = row.user_id;
  if (row.phone) member.phone = row.phone;
  if (row.email) member.email = row.email;
  return member;
}

function toList(row: ListRow, members: MemberRow[]): List {
  return {
    id: row.id,
    name: row.name,
    createdAt: Date.parse(row.created_at),
    ownerId: row.owner_id,
    members: members.map(toMember),
  };
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    quantity: row.quantity,
    priceCents: row.price_cents,
    claimedBy: row.claimed_by,
    purchased: row.purchased,
  };
}

async function membersFor(listIds: string[]): Promise<MemberRow[]> {
  if (listIds.length === 0) return [];
  const { data, error } = await db().from("bill_list_members").select("list_id, name, user_id, phone, email").in("list_id", listIds);
  raise(error);
  return (data ?? []) as MemberRow[];
}

async function listRow(id: string): Promise<ListRow | null> {
  const { data, error } = await db().from("bill_lists").select("id, name, owner_id, created_at").eq("id", id).maybeSingle();
  raise(error);
  return (data as ListRow | null) ?? null;
}

export async function createList(name: string, ownerId: string | null = null, member?: ListMember): Promise<List> {
  if (!useRemote()) return fileCreateList(name, ownerId, member);
  const id = crypto.randomUUID();
  const { data, error } = await db()
    .from("bill_lists")
    .insert({ id, name, owner_id: ownerId })
    .select("id, name, owner_id, created_at")
    .single();
  raise(error);
  const row = data as ListRow;
  if (!member?.name.trim()) return toList(row, []);
  const saved: MemberRow = {
    list_id: id,
    name: member.name.trim(),
    user_id: member.userId ?? null,
    phone: member.phone ?? null,
    email: member.email ? member.email.toLowerCase() : null,
  };
  const { error: memberError } = await db().from("bill_list_members").insert(saved);
  if (memberError) {
    await db().from("bill_lists").delete().eq("id", id);
    raise(memberError);
  }
  return toList(row, [saved]);
}

export async function listSummaries(): Promise<(List & { itemCount: number })[]> {
  if (!useRemote()) return fileListSummaries();
  const { data: lists, error } = await db().from("bill_lists").select("id, name, owner_id, created_at");
  raise(error);
  const rows = (lists ?? []) as ListRow[];
  const ids = rows.map((list) => list.id);
  const [members, items] = await Promise.all([membersFor(ids), itemCounts(ids)]);
  return rows
    .map((list) => ({
      ...toList(list, members.filter((member) => member.list_id === list.id)),
      itemCount: items.get(list.id) ?? 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function itemCounts(listIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (listIds.length === 0) return counts;
  const { data, error } = await db().from("bill_items").select("list_id").in("list_id", listIds);
  raise(error);
  for (const row of (data ?? []) as { list_id: string }[]) counts.set(row.list_id, (counts.get(row.list_id) ?? 0) + 1);
  return counts;
}

function profileOf(value: unknown): { name: string; phone?: string } {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return { name: "Member" };
  const record = row as { display_name?: string | null; phone?: string | null };
  return { name: record.display_name?.trim() || "Member", phone: record.phone?.trim() || undefined };
}

function withTotals(list: List, items: Item[]) {
  const totals: Record<string, number> = {};
  for (const item of items) {
    if (item.claimedBy) totals[item.claimedBy] = (totals[item.claimedBy] ?? 0) + item.priceCents * item.quantity;
  }
  return { list, items, totals };
}

// Group bills live in public.lists. The dashboard shows them beside the file-backed lists, and this
// lets the same /list page open either one.
async function groupList(id: string): Promise<{ list: List; items: Item[]; totals: Record<string, number> } | null> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data: list, error } = await supabase
      .from("lists")
      .select("id, name, group_id, created_by, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !list) return null;
    const { data: itemRows, error: itemError } = await supabase
      .from("items")
      .select("id, name, quantity, price_cents, purchased")
      .eq("list_id", id);
    if (itemError) return null;
    const rows = itemRows ?? [];
    const itemIds = rows.map((item) => item.id);
    const claimResult = itemIds.length
      ? await supabase.from("item_claims").select("item_id, member_id").in("item_id", itemIds)
      : { data: [], error: null };
    if (claimResult.error) return null;
    const { data: memberRows, error: memberError } = await supabase
      .from("group_members")
      .select("id, user_id, profiles(display_name, phone)")
      .eq("group_id", list.group_id);
    if (memberError) return null;
    const people = new Map<string, { name: string; userId: string; phone?: string }>();
    for (const member of memberRows ?? []) {
      const profile = profileOf(member.profiles);
      people.set(member.id, { name: profile.name, userId: member.user_id, phone: profile.phone });
    }
    const claims = new Map<string, string[]>();
    for (const claim of claimResult.data ?? []) {
      const person = people.get(claim.member_id);
      if (!person) continue;
      claims.set(claim.item_id, [...(claims.get(claim.item_id) ?? []), person.name]);
    }
    const items: Item[] = rows.map((item) => ({
      id: item.id,
      listId: id,
      name: item.name,
      quantity: item.quantity,
      priceCents: item.price_cents,
      claimedBy: (claims.get(item.id) ?? []).join(", ") || null,
      purchased: item.purchased ?? false,
    }));
    const members: ListMember[] = [...people.values()].map((person) => {
      const member: ListMember = { name: person.name, userId: person.userId };
      if (person.phone) member.phone = person.phone;
      return member;
    });
    return withTotals(
      {
        id: list.id,
        name: list.name,
        createdAt: Date.parse(list.created_at),
        ownerId: list.created_by,
        members,
      },
      items,
    );
  } catch {
    return null;
  }
}

export async function getList(id: string): Promise<{ list: List; items: Item[]; totals: Record<string, number> } | null> {
  if (!useRemote()) return fileGetList(id) ?? (await groupList(id));
  const row = await listRow(id);
  if (!row) return groupList(id);
  const [members, itemResult] = await Promise.all([
    membersFor([id]),
    db().from("bill_items").select("id, list_id, name, quantity, price_cents, claimed_by, purchased").eq("list_id", id),
  ]);
  raise(itemResult.error);
  const items = ((itemResult.data ?? []) as ItemRow[]).map(toItem);
  return withTotals(toList(row, members), items);
}

export async function renameList(id: string, name: string): Promise<List | null> {
  if (!useRemote()) return fileRenameList(id, name);
  const { data, error } = await db().from("bill_lists").update({ name: name.trim() }).eq("id", id).select("id").maybeSingle();
  raise(error);
  if (!data) return null;
  const loaded = await getList(id);
  return loaded?.list ?? null;
}

export async function addListMember(listId: string, member: ListMember): Promise<List | null> {
  if (!useRemote()) return fileAddListMember(listId, member);
  const loaded = await getList(listId);
  if (!loaded) return null;
  const name = member.name.trim();
  if (!name) return null;
  const next: ListMember = { name };
  if (member.userId) next.userId = member.userId;
  if (member.phone) next.phone = member.phone;
  if (member.email) next.email = member.email.toLowerCase();
  if ((loaded.list.members ?? []).some((entry) => sameListMember(entry, next))) return loaded.list;
  const { error } = await db().from("bill_list_members").insert({
    list_id: listId,
    name: next.name,
    user_id: next.userId ?? null,
    phone: next.phone ?? null,
    email: next.email ?? null,
  });
  raise(error);
  const again = await getList(listId);
  return again?.list ?? null;
}

export async function listExists(id: string): Promise<boolean> {
  if (!useRemote()) return fileListExists(id);
  return (await listRow(id)) !== null;
}

export async function addItems(listId: string, incoming: NewItem[]): Promise<{ items: Item[]; duplicates: string[] }> {
  if (!useRemote()) return fileAddItems(listId, incoming);
  const { data: existingRows, error: existingError } = await db().from("bill_items").select("name").eq("list_id", listId);
  raise(existingError);
  const existing = new Set(((existingRows ?? []) as { name: string }[]).map((item) => item.name.trim().toLowerCase()));
  const duplicates = incoming.filter((item) => existing.has(item.name.trim().toLowerCase())).map((item) => item.name);
  const rows = incoming.map((item) => ({
    id: crypto.randomUUID(),
    list_id: listId,
    name: item.name.trim(),
    quantity: item.quantity ?? 1,
    price_cents: item.priceCents ?? 0,
    claimed_by: item.claimedBy ?? null,
    purchased: false,
  }));
  const { data, error } = await db()
    .from("bill_items")
    .insert(rows)
    .select("id, list_id, name, quantity, price_cents, claimed_by, purchased");
  raise(error);
  return { items: ((data ?? []) as ItemRow[]).map(toItem), duplicates };
}

async function itemRow(id: string): Promise<ItemRow | null> {
  const { data, error } = await db()
    .from("bill_items")
    .select("id, list_id, name, quantity, price_cents, claimed_by, purchased")
    .eq("id", id)
    .maybeSingle();
  raise(error);
  return (data as ItemRow | null) ?? null;
}

export async function claimItem(id: string, user: string): Promise<Item | "taken" | null> {
  if (!useRemote()) return fileClaimItem(id, user);
  const item = await itemRow(id);
  if (!item) return null;
  if (item.claimed_by) return "taken";
  const { data, error } = await db()
    .from("bill_items")
    .update({ claimed_by: user })
    .eq("id", id)
    .select("id, list_id, name, quantity, price_cents, claimed_by, purchased")
    .single();
  raise(error);
  return toItem(data as ItemRow);
}

export async function unclaimItem(id: string, user: string): Promise<Item | "not-yours" | null> {
  if (!useRemote()) return fileUnclaimItem(id, user);
  const item = await itemRow(id);
  if (!item) return null;
  if (item.claimed_by !== user) return "not-yours";
  const { data, error } = await db()
    .from("bill_items")
    .update({ claimed_by: null })
    .eq("id", id)
    .select("id, list_id, name, quantity, price_cents, claimed_by, purchased")
    .single();
  raise(error);
  return toItem(data as ItemRow);
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<Item, "name" | "quantity" | "priceCents" | "purchased">>,
): Promise<Item | null> {
  if (!useRemote()) return fileUpdateItem(id, patch);
  const next: Record<string, string | number | boolean> = {};
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.quantity !== undefined) next.quantity = patch.quantity;
  if (patch.priceCents !== undefined) next.price_cents = patch.priceCents;
  if (patch.purchased !== undefined) next.purchased = patch.purchased;
  const { data, error } = await db()
    .from("bill_items")
    .update(next)
    .eq("id", id)
    .select("id, list_id, name, quantity, price_cents, claimed_by, purchased")
    .maybeSingle();
  raise(error);
  return data ? toItem(data as ItemRow) : null;
}

export async function deleteItem(id: string): Promise<boolean> {
  if (!useRemote()) return fileDeleteItem(id);
  const { data, error } = await db().from("bill_items").delete().eq("id", id).select("id");
  raise(error);
  return ((data ?? []) as { id: string }[]).length > 0;
}

export async function itemListId(id: string): Promise<string | null> {
  if (!useRemote()) return fileItemListId(id);
  const item = await itemRow(id);
  return item?.list_id ?? null;
}
