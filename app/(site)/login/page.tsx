import type { Metadata } from "next";
import { Suspense } from "react";
import { supabaseConfigured } from "@/lib/supabase/env";
import { AuthShell } from "../_components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in to Splits",
  description: "Sign in to your Splits account.",
};

export default function LoginPage() {
  return (
    <AuthShell title="Sign in" lead="Use the email and password for your Splits account.">
      {supabaseConfigured() ? (
        <Suspense fallback={<p className="note">Loading…</p>}>
          <LoginForm />
        </Suspense>
      ) : (
        <p className="note">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server.
        </p>
      )}
    </AuthShell>
  );
}
