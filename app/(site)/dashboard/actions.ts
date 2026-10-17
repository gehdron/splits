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
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!groupId) return { error: "Choose a group first." };
  if (!phone) return { error: "Enter the phone number they used to sign up." };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc("add_group_member", { target_group: groupId, member_phone: phone });
  if (error) return { error: error.message };
  updateTag(`dashboard-${user.id}`);
  redirect(`/dashboard?group=${groupId}`);
}
