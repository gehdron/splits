"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "../auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  const next = useSearchParams().get("next") ?? "";

  return (
    <form action={action}>
      {next.startsWith("/") && !next.startsWith("//") ? <input type="hidden" name="next" value={next} /> : null}
      <label>
        Email
        <input id="email" name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="err">{state.error}</p>}
      <button className="btn btn-a" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="switch">
        New here? <a href="/signup">Create an account</a>
      </p>
    </form>
  );
}
