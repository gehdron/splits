import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const MAX_PHOTO_SIZE = 2 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function PATCH(request: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Profile storage is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "The profile form could not be read. Try submitting it again." }, { status: 400 });
  }

  const bio = String(form.get("bio") ?? "").trim();
  if (bio.length > 280) {
    return NextResponse.json({ error: "Description must be 280 characters or fewer." }, { status: 400 });
  }

  const photo = form.get("photo");
  const updates: { bio: string; avatar_url?: string } = {
    bio,
  };
  let uploadedPath: string | null = null;

  if (photo instanceof File && photo.size > 0) {
    const extension = PHOTO_TYPES[photo.type];
    if (!extension) {
      return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP profile photo." }, { status: 400 });
    }
    if (photo.size > MAX_PHOTO_SIZE) {
      return NextResponse.json({ error: "Profile photos must be 2 MB or smaller." }, { status: 400 });
    }

    const path = `${auth.user.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, await photo.arrayBuffer(), {
        contentType: photo.type,
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) {
      return NextResponse.json({ error: `Photo upload failed: ${uploadError.message}` }, { status: 500 });
    }

    uploadedPath = path;
    const { data: publicUrl } = supabase.storage.from("profile-photos").getPublicUrl(path);
    updates.avatar_url = `${publicUrl.publicUrl}?v=${Date.now()}`;
  }

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", auth.user.id)
    .select("display_name, phone, bio, avatar_url")
    .single();

  if (updateError) {
    const missingProfileFields =
      updateError.code === "PGRST204" ||
      updateError.code === "42703" ||
      /column .*?(bio|avatar_url).*?(does not exist|schema cache)/i.test(updateError.message);
    if (missingProfileFields) {
      let cleanupWarning = "";
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("profile-photos").remove([uploadedPath]);
        if (cleanupError) cleanupWarning = ` The uploaded photo could not be cleaned up: ${cleanupError.message}`;
      }
      return NextResponse.json(
        { error: `Description and photo need the profile database update. Apply supabase/profile-fields.sql in Supabase.${cleanupWarning}` },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: `Profile could not be saved: ${updateError.message}. Apply supabase/profile-fields.sql if the profile fields are missing.` },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile });
}
