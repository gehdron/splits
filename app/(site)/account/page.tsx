import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "../_components/auth-shell";
import { signOut } from "../auth/actions";

export const metadata: Metadata = {
  title: "Your Splits account",
};

export default function AccountPage() {
  return (
    <AuthShell title="Your account" lead="This is the account you use to split bills.">
      <Suspense fallback={<p className="note">Loading your account…</p>}>
        <AccountPanel />
      </Suspense>
    </AuthShell>
  );
}

async function AccountPanel() {
  if (!supabaseConfigured()) {
    return (
      <p className="note">
        Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server.
      </p>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const metadataName = data.user.user_metadata?.name;
  const metadataPhone = data.user.user_metadata?.phone;
  const name = typeof metadataName === "string" && metadataName.trim() ? metadataName : "Splits member";
  const phone = typeof metadataPhone === "string" ? metadataPhone : "";

  return (
    <>
      <div className="who">
        <strong>{name}</strong>
        <span>{data.user.email}</span>
        {phone ? <span>{phone}</span> : null}
      </div>
      <form action={signOut}>
        <button className="btn btn-b" type="submit">
          Sign out
        </button>
      </form>
    </>
  );
}
