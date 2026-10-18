import { createClient } from "@/lib/supabase/server";
import type { ListMember, ListViewer } from "@/lib/store";

export async function currentListViewer(): Promise<(ListViewer & { name: string }) | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const profile = await supabase.from("profiles").select("display_name, phone").eq("id", data.user.id).maybeSingle();
    return {
      userId: data.user.id,
      name: profile.data?.display_name || data.user.email?.split("@")[0] || "You",
      phone: profile.data?.phone || undefined,
      email: data.user.email || undefined,
    };
  } catch {
    return null;
  }
}

export function creatorMember(viewer: ListViewer & { name: string }): ListMember {
  const member: ListMember = { name: viewer.name, userId: viewer.userId };
  if (viewer.phone) member.phone = viewer.phone;
  if (viewer.email) member.email = viewer.email;
  return member;
}
