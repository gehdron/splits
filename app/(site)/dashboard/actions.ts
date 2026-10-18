"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type DashState = { error?: string } | undefined;

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
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
  redirect(`/dashboard?group=${id}`);
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
  redirect(`/dashboard?group=${groupId}`);
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
  redirect(groupId ? `/dashboard?group=${groupId}` : "/dashboard");
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
  redirect(groupId ? `/dashboard?group=${groupId}` : "/dashboard");
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
  redirect(`/dashboard?group=${groupId}`);
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

    const { data: lists, error: listError } = await supabase.from("lists").select("id").eq("group_id", groupId).limit(1);
    if (listError) return { error: listError.message };
    let listId = lists?.[0]?.id;
    if (!listId) {
      listId = crypto.randomUUID();
      const { error } = await supabase.from("lists").insert({
        id: listId,
        group_id: groupId,
        created_by: user.id,
        name: "Shared list",
      });
      if (error) return { error: error.message };
    }

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
    redirect(`/dashboard?group=${groupId}${duplicate ? "&note=already" : ""}`);
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

  updateTag(`dashboard-${user.id}`);
  redirect(`/dashboard?group=${groupId}`);
}
