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
          Account creation is temporarily unavailable. Please try again later or contact{" "}
          <a href="mailto:help@splitsselect.com">help@splitsselect.com</a>.
        </p>
      )}
    </AuthShell>
  );
}
