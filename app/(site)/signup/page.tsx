import type { Metadata } from "next";
import { supabaseConfigured } from "@/lib/supabase/env";
import { AuthShell } from "../_components/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your Splits account",
  description: "Create an account to split receipts with the people you share them with.",
};

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" lead="Use your name, email, phone number, and a password.">
      {supabaseConfigured() ? (
        <SignupForm />
      ) : (
        <p className="note">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server.
        </p>
      )}
    </AuthShell>
  );
}
