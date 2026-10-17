"use client";

import { useActionState } from "react";
import { signUp } from "../auth/actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, undefined);

  return (
    <form action={action}>
      <label>
        Name
        <input id="name" name="name" autoComplete="name" required minLength={2} />
      </label>
      <label>
        Email
        <input id="email" name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Phone
        <input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" required />
      </label>
      <label>
        Password
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      {state?.error && <p className="err">{state.error}</p>}
      {state?.message && <p className="ok">{state.message}</p>}
      <button className="btn btn-a" type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="switch">
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </form>
  );
}
