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
