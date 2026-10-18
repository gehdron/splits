"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { reconcileList } from "@/app/(site)/stripe/settle";
import { attachCharge, chargeIdOf } from "@/app/(site)/plaid/charge-lists";

export type DashState = { error?: string } | undefined;

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
}

function backTo(formData: FormData, fallback: string, groupId = "") {
  const raw = String(formData.get("returnTo") ?? "");
  const path = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : fallback;
  const url = new URL(path, "http://local");
  if (groupId) url.searchParams.set("group", groupId);
  return `${url.pathname}${url.search}`;
}

export async function createGroup(_state: DashState, formData: FormData): Promise<DashState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Name the group." };

  const { supabase, user } = await requireUser();
  // Returning the new row also has to pass the read policy. That policy only
  // sees members, and the owner row is added by a trigger after the insert,
  // so Postgres rejects the whole statement. The id is chosen here instead.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("groups").insert({ id, name, created_by: user.id });
  if (error) return { error: error.message };
  updateTag(`dashboard-${user.id}`);
  redirect(backTo(formData, "/dashboard", id));
}

export async function addGroupMember(_state: DashState, formData: FormData): Promise<DashState> {
  const groupId = String(formData.get("groupId") ?? "");
  const by = String(formData.get("by") ?? "phone");
  const contact = String(formData.get("contact") ?? "").trim();
  if (!groupId) return { error: "Choose a group first." };

  const phone = by === "email" ? null : normalizePhone(contact);
  const email = by === "email" ? contact.toLowerCase() : null;
  if (by === "email" && !email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return { error: "Enter the email they used to sign up." };
  }
  if (by !== "email" && !phone) return { error: "Enter the phone number they used to sign up." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc(
    "add_group_member",
    by === "email" ? { target_group: groupId, member_email: email } : { target_group: groupId, member_phone: phone },
  );
  if (error?.message.includes("Could not find the function")) {
    return { error: "Email add needs the latest database function. Run supabase/add-member-by-email.sql in the Supabase SQL editor." };
  }
  if (error) return { error: error.message };
  await supabase.rpc(
    "save_friend",
    by === "email" ? { member_email: email } : { member_phone: phone },
  );
  updateTag(`dashboard-${user.id}`);
  redirect(backTo(formData, "/dashboard", groupId));
}

function friendsSetupMessage(message: string) {
  return message.includes("Could not find the function") || (message.includes("relation") && message.includes("friends"))
    ? "Friends need the latest database function. Run supabase/friends.sql in the Supabase SQL editor."
    : null;
}

export async function saveFriend(_state: DashState, formData: FormData): Promise<DashState> {
  const by = String(formData.get("by") ?? "phone");
  const contact = String(formData.get("contact") ?? "").trim();
  const groupId = String(formData.get("groupId") ?? "");
  const phone = by === "email" ? null : normalizePhone(contact);
  const email = by === "email" ? contact.toLowerCase() : null;
  if (by === "email" && !email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return { error: "Enter the email they used to sign up." };
  }
  if (by !== "email" && !phone) return { error: "Enter the phone number they used to sign up." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc(
    "save_friend",
    by === "email" ? { member_email: email } : { member_phone: phone },
  );
  if (error) return { error: friendsSetupMessage(error.message) ?? error.message };
  updateTag(`dashboard-${user.id}`);
  redirect(backTo(formData, groupId ? `/dashboard?group=${groupId}` : "/dashboard", groupId));
}

export async function removeFriend(_state: DashState, formData: FormData): Promise<DashState> {
  const friendId = String(formData.get("friendId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  if (!friendId) return { error: "Choose a friend first." };

  const { supabase, user } = await requireUser();
  const { error, count } = await supabase.from("friends").delete({ count: "exact" }).eq("friend_id", friendId);
  if (error) return { error: friendsSetupMessage(error.message) ?? error.message };
  if (!count) return { error: "That person is not in your contacts." };
  updateTag(`dashboard-${user.id}`);
  redirect(backTo(formData, groupId ? `/dashboard?group=${groupId}` : "/dashboard", groupId));
}

export async function addSavedFriend(_state: DashState, formData: FormData): Promise<DashState> {
  const groupId = String(formData.get("groupId") ?? "");
  const friendId = String(formData.get("friendId") ?? "");
  if (!groupId) return { error: "Choose a group first." };
  if (!friendId) return { error: "Choose a friend first." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc("add_friend_to_group", { target_group: groupId, friend_user: friendId });
  if (error) return { error: friendsSetupMessage(error.message) ?? error.message };
  updateTag(`dashboard-${user.id}`);
  redirect(backTo(formData, "/dashboard", groupId));
}

export async function exitGroup(_state: DashState, formData: FormData): Promise<DashState> {
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return { error: "Choose a group first." };

  const { supabase, user } = await requireUser();
  const { data: membership, error: readError } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!membership) return { error: "You are not in that group." };

  if (membership.role === "owner") {
    const { error, count } = await supabase.from("groups").delete({ count: "exact" }).eq("id", groupId);
    if (error) return { error: error.message };
    if (!count) return { error: "Only the owner can delete this group." };
  } else {
    const { error, count } = await supabase
      .from("group_members")
      .delete({ count: "exact" })
      .eq("group_id", groupId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    if (!count) return { error: "Leaving a group needs the latest database policy. Run supabase/leave-group.sql in the Supabase SQL editor." };
  }

  updateTag(`dashboard-${user.id}`);
  redirect("/dashboard");
}

export async function changeItem(_state: DashState, formData: FormData): Promise<DashState> {
  const intent = String(formData.get("intent") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!groupId) return { error: "Choose a group first." };

  const { supabase, user } = await requireUser();
  const { data: membership, error: memberError } = await supabase
    .from("group_members")
    .select("id, role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) return { error: memberError.message };
  if (!membership) return { error: "You are not in that group." };

  if (intent === "add") {
    const name = String(formData.get("name") ?? "").trim();
    const price = String(formData.get("price") ?? "").trim();
    const priceCents = price === "" ? 0 : Math.round(Number(price) * 100);
    if (name.length < 1) return { error: "Name the item." };
    if (!Number.isInteger(priceCents) || priceCents < 0) return { error: "Enter a price like 12.50." };
    if (membership.role !== "owner") return { error: "Only the owner can add items." };

    const requested = String(formData.get("listId") ?? "");
    let listId = requested;
    if (!listId) {
      const { data: lists, error: listError } = await supabase.from("lists").select("id").eq("group_id", groupId).limit(1);
      if (listError) return { error: listError.message };
      listId = lists?.[0]?.id ?? "";
    }
    if (!listId) return { error: "Create a list first." };

    const { data: existing, error: existingError } = await supabase.from("items").select("name").eq("list_id", listId);
    if (existingError) return { error: existingError.message };
    const duplicate = (existing ?? []).some((item) => item.name.trim().toLowerCase() === name.toLowerCase());

    const { error } = await supabase.from("items").insert({
      id: crypto.randomUUID(),
      list_id: listId,
      name,
      quantity: 1,
      price_cents: priceCents,
    });
    if (error) return { error: error.message };
    updateTag(`dashboard-${user.id}`);
    redirect(listHref(groupId, listId, formData.get("setup") === "1", duplicate));
  }

  if (!itemId) return { error: "Choose an item first." };

  if (intent === "claim") {
    const { error } = await supabase.from("item_claims").insert({ item_id: itemId, member_id: membership.id });
    if (error) return { error: error.message };
  } else if (intent === "unclaim") {
    const { error, count } = await supabase
      .from("item_claims")
      .delete({ count: "exact" })
      .eq("item_id", itemId)
      .eq("member_id", membership.id);
    if (error) return { error: error.message };
    if (!count) return { error: "That claim is not yours." };
  } else if (intent === "delete") {
    const { error, count } = await supabase.from("items").delete({ count: "exact" }).eq("id", itemId);
    if (error) return { error: error.message };
    if (!count) return { error: "Only the owner can delete an item." };
  } else {
    return { error: "Choose an item action." };
  }

  const listId = String(formData.get("listId") ?? "");
  updateTag(`dashboard-${user.id}`);
  redirect(listHref(groupId, listId, formData.get("setup") === "1", false));
}

function listHref(groupId: string, listId: string, setup: boolean, duplicate: boolean, chargeId = "") {
  const query = new URLSearchParams({ group: groupId });
  if (listId) query.set("list", listId);
  if (setup) query.set("setup", "1");
  if (duplicate) query.set("note", "already");
  if (chargeId) query.set("charge", chargeId);
  return `/dashboard?${query}`;
}

export async function createList(_state: DashState, formData: FormData): Promise<DashState> {
  const groupId = String(formData.get("groupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!groupId) return { error: "Choose a group first." };
  if (name.length < 2) return { error: "Name the list." };
  if (name.length > 80) return { error: "List names must be 80 characters or fewer." };

  const { supabase, user } = await requireUser();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("lists").insert({ id, group_id: groupId, created_by: user.id, name });
  if (error) return { error: error.message };
  updateTag(`dashboard-${user.id}`);
  redirect(listHref(groupId, id, true, false));
}

type ReceiptRow = { description?: string; quantity?: string; amount?: string };

function readReceiptRows(formData: FormData): ReceiptRow[] | null {
  try {
    const parsed = JSON.parse(String(formData.get("items") ?? "[]"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// A discount or coupon line reads as negative ("-2.00", "2.00-", "(2.00)"). Saving it would
// turn it into a positive charge, so these saves are refused until the user removes or fixes the line.
function hasNegativeAmount(rows: ReceiptRow[]) {
  return rows.some((row) => /^\s*[-\u2212(]|[-\u2212)]\s*$/.test(String(row.amount ?? "")));
}

const NEGATIVE_AMOUNT_ERROR = "A line on the receipt is a discount or has a negative price. Delete it or fix the price, then save again.";

type ReceiptMetadata = {
  merchant?: string;
  subtotalCents?: number;
  taxCents?: number;
  tipCents?: number;
  totalCents?: number;
};

function readReceiptMetadata(formData: FormData): { metadata: ReceiptMetadata; error?: string } {
  const merchant = String(formData.get("merchant") ?? "").trim();
  if (merchant.length > 120) {
    return { metadata: {}, error: "Place names must be 120 characters or fewer." };
  }
  const rawTotals = String(formData.get("receiptTotals") ?? "");
  if (!rawTotals) return { metadata: merchant ? { merchant } : {} };

  let totals: unknown;
  try {
    totals = JSON.parse(rawTotals);
  } catch {
    return { metadata: {}, error: "Receipt totals could not be read." };
  }
  if (!totals || typeof totals !== "object" || Array.isArray(totals)) {
    return { metadata: {}, error: "Receipt totals could not be read." };
  }

  const metadata: ReceiptMetadata = {};
  if (merchant) metadata.merchant = merchant;
  for (const [field, key] of [
    ["subtotal", "subtotalCents"],
    ["tax", "taxCents"],
    ["tip", "tipCents"],
    ["total", "totalCents"],
  ] as const) {
    const value = (totals as Record<string, unknown>)[field];
    if (typeof value !== "string" || !value.trim()) continue;
    const normalized = value.trim().replace(/[$,\s]/g, "");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      return { metadata: {}, error: `Enter a valid non-negative ${field} amount.` };
    }
    const cents = Math.round(Number(normalized) * 100);
    if (!Number.isSafeInteger(cents)) {
      return { metadata: {}, error: `Enter a valid non-negative ${field} amount.` };
    }
    metadata[key] = cents;
  }
  return { metadata };
}

async function insertReceipt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listId: string,
  metadata: ReceiptMetadata,
): Promise<string | null> {
  if (Object.keys(metadata).length === 0) return null;
  const { data, error } = await supabase
    .from("receipts")
    .insert({
      list_id: listId,
      merchant: metadata.merchant ?? null,
      subtotal_cents: metadata.subtotalCents ?? null,
      tax_cents: metadata.taxCents ?? null,
      tip_cents: metadata.tipCents ?? null,
      total_cents: metadata.totalCents ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// Receipt amounts are line totals; store a per-unit price only when it divides evenly.
function receiptItemInserts(listId: string, rows: ReceiptRow[]) {
  return rows
    .map((row) => {
      const name = String(row.description ?? "").trim();
      const line = Math.round(Number(String(row.amount ?? "").replace(/[^0-9.]/g, "")) * 100);
      const quantity = Math.round(Number(row.quantity));
      const qty = Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
      if (!name || !Number.isInteger(line) || line < 0) return null;
      const exact = line % qty === 0;
      return {
        id: crypto.randomUUID(),
        list_id: listId,
        receipt_id: null,
        name: exact || qty === 1 ? name : `${name} x${qty}`,
        quantity: exact ? qty : 1,
        price_cents: exact ? line / qty : line,
      };
    })
    .filter((row) => row !== null);
}

export async function importReceipt(_state: DashState, formData: FormData): Promise<DashState> {
  const groupId = String(formData.get("groupId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  if (!groupId || !listId) return { error: "Choose a list first." };

  const rows = readReceiptRows(formData);
  if (!rows) return { error: "The receipt items could not be read." };
  if (hasNegativeAmount(rows)) return { error: NEGATIVE_AMOUNT_ERROR };
  const { metadata, error: metadataError } = readReceiptMetadata(formData);
  if (metadataError) return { error: metadataError };

  const insertsWithoutReceipt = receiptItemInserts(listId, rows);
  if (insertsWithoutReceipt.length === 0) return { error: "The receipt has no items to add." };
  const { supabase, user } = await requireUser();
  let receiptId: string | null;
  try {
    receiptId = await insertReceipt(supabase, listId, metadata);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Receipt totals could not be saved." };
  }
  const inserts = insertsWithoutReceipt.map((row) => ({ ...row, receipt_id: receiptId }));

  const { error } = await supabase.from("items").insert(inserts);
  if (error) {
    if (receiptId) await supabase.from("receipts").delete().eq("id", receiptId);
    return { error: error.message };
  }
  const chargeId = chargeIdOf(formData.get("chargeId"));
  await attachCharge("lists", listId, chargeId);
  await reconcileList(listId);
  updateTag(`dashboard-${user.id}`);
  redirect(listHref(groupId, listId, false, false, chargeId));
}

// Item-by-item split: the scanned receipt becomes a new list in the chosen group.
export async function createListFromReceipt(_state: DashState, formData: FormData): Promise<DashState> {
  const groupId = String(formData.get("groupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!groupId) return { error: "Choose a group first." };
  if (!name) return { error: "Every list needs a name." };
  if (name.length > 80) return { error: "List names must be 80 characters or fewer." };

  const rows = readReceiptRows(formData);
  if (!rows) return { error: "The receipt items could not be read." };
  if (hasNegativeAmount(rows)) return { error: NEGATIVE_AMOUNT_ERROR };
  const { metadata, error: metadataError } = readReceiptMetadata(formData);
  if (metadataError) return { error: metadataError };

  const listId = crypto.randomUUID();
  const insertsWithoutReceipt = receiptItemInserts(listId, rows);
  if (insertsWithoutReceipt.length === 0) return { error: "The receipt has no items to add." };
  const { supabase, user } = await requireUser();
  const { error: listError } = await supabase.from("lists").insert({ id: listId, group_id: groupId, created_by: user.id, name });
  if (listError) return { error: listError.message };
  const chargeId = chargeIdOf(formData.get("chargeId"));
  await attachCharge("lists", listId, chargeId);

  let receiptId: string | null;
  try {
    receiptId = await insertReceipt(supabase, listId, metadata);
  } catch (error) {
    await supabase.from("lists").delete().eq("id", listId);
    return { error: error instanceof Error ? error.message : "Receipt totals could not be saved." };
  }
  const inserts = insertsWithoutReceipt.map((row) => ({ ...row, receipt_id: receiptId }));
  const { error } = await supabase.from("items").insert(inserts);
  if (error) {
    // Don't leave an empty list behind if the items were rejected.
    await supabase.from("lists").delete().eq("id", listId);
    return { error: error.message };
  }
  updateTag(`dashboard-${user.id}`);
  redirect(listHref(groupId, listId, false, false, chargeId));
}
