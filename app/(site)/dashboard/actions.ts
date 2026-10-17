"use server";

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
  const { data, error } = await supabase.from("groups").insert({ name, created_by: user.id }).select("id").single();
  if (error) return { error: error.message };
  redirect(`/dashboard?group=${data.id}`);
}

export async function addGroupMember(_state: DashState, formData: FormData): Promise<DashState> {
  const groupId = String(formData.get("groupId") ?? "");
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!groupId) return { error: "Choose a group first." };
  if (!phone) return { error: "Enter the phone number they used to sign up." };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("add_group_member", { target_group: groupId, member_phone: phone });
  if (error) return { error: error.message };
  redirect(`/dashboard?group=${groupId}`);
}
