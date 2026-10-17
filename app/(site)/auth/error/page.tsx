import type { Metadata } from "next";
import { AuthShell } from "../../_components/auth-shell";

export const metadata: Metadata = {
  title: "Could not confirm your email",
};

export default function AuthErrorPage() {
  return (
    <AuthShell title="That link did not work" lead="The confirmation link is missing or already used.">
      <p className="switch">
        <a href="/signup">Create an account</a> or <a href="/login">sign in</a>.
      </p>
    </AuthShell>
  );
}
