import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "../lib/phone.ts";

export type RemoteList = { id: string; name: string };

type Profile = { id: string; display_name: string | null };

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY so texts update the live lists.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function explain(error: { message: string }): never {
  if (/schema cache|does not exist|bill_lists|bill_items|bill_list_members/i.test(error.message)) {
    throw new Error("Live lists need supabase/shared-lists.sql run once in the Supabase SQL editor.");
  }
  throw new Error(error.message);
}

async function profileFor(supabase: SupabaseClient, sender: string): Promise<{ profile: Profile; phone: string }> {
  const phone = normalizePhone(sender);
  if (!phone) throw new Error("PHOTON_TEST_SENDER must be a phone number so purchases land on that Splits account.");
  const { data, error } = await supabase.from("profiles").select("id, display_name").eq("phone", phone).maybeSingle();
  if (error) explain(error);
  const profile = data as Profile | null;
  if (!profile?.id) throw new Error("No Splits account uses PHOTON_TEST_SENDER. Sign in on the site with that number first.");
  return { profile, phone };
}

async function ownedLists(supabase: SupabaseClient, ownerId: string): Promise<RemoteList[]> {
  const { data, error } = await supabase
    .from("bill_lists")
    .select("id, name")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) explain(error);
  return ((data ?? []) as { id: string; name: string }[]).map((list) => ({ id: list.id, name: list.name }));
}

// Confirms the account and the list tables before the agent says it is ready.
export async function assertLiveLists(sender: string): Promise<void> {
  const supabase = client();
  const { profile } = await profileFor(supabase, sender);
  await ownedLists(supabase, profile.id);
}

// Lists this sender owns on the live site. The first purchase creates one if they have none,
// owned by that account so it shows up after they sign in.
export async function listsForSender(sender: string): Promise<RemoteList[]> {
  const supabase = client();
  const { profile, phone } = await profileFor(supabase, sender);
  const lists = await ownedLists(supabase, profile.id);
  if (lists.length > 0) return lists;

  const id = crypto.randomUUID();
  const { error: listError } = await supabase.from("bill_lists").insert({ id, name: "Shared list", owner_id: profile.id });
  if (listError) explain(listError);
  const { error: memberError } = await supabase.from("bill_list_members").insert({
    list_id: id,
    name: profile.display_name?.trim() || "You",
    user_id: profile.id,
    phone,
  });
  if (memberError) {
    await supabase.from("bill_lists").delete().eq("id", id);
    explain(memberError);
  }
  return [{ id, name: "Shared list" }];
}

export async function recordPurchase(listId: string, input: { name: string; priceCents: number; person: string }): Promise<void> {
  const supabase = client();
  const name = input.name.trim();
  const { data, error } = await supabase.from("bill_items").select("id, name, claimed_by, price_cents").eq("list_id", listId);
  if (error) explain(error);
  const rows = (data ?? []) as { id: string; name: string; claimed_by: string | null; price_cents: number }[];
  const existing = rows.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const claimedBy = !existing.claimed_by || existing.claimed_by === input.person ? input.person : existing.claimed_by;
    const priceCents = input.priceCents > 0 ? input.priceCents : existing.price_cents;
    const { error: updateError } = await supabase.from("bill_items").update({ claimed_by: claimedBy, price_cents: priceCents }).eq("id", existing.id);
    if (updateError) explain(updateError);
    return;
  }
  const { error: insertError } = await supabase.from("bill_items").insert({
    id: crypto.randomUUID(),
    list_id: listId,
    name,
    quantity: 1,
    price_cents: input.priceCents,
    claimed_by: input.person,
    purchased: false,
  });
  if (insertError) explain(insertError);
}
