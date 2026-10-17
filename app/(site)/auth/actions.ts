"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && /^\+[1-9]\d{9,14}$/.test(`+${digits}`)) return `+${digits}`;
  return null;
}

async function siteOrigin() {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/account";
  return next;
}

export async function signUp(_state: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Supabase is not configured yet." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (name.length < 2) return { error: "Name must be at least 2 characters." };
  if (!emailPattern.test(email)) return { error: "Enter a valid email." };
  if (!phone) return { error: "Enter a phone number, including the area code." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, phone },
      emailRedirectTo: `${origin}/auth/callback?next=/account`,
    },
  });

  if (error) {
    if (/already registered/i.test(error.message)) {
      return { error: "An account with that email already exists. Sign in instead." };
    }
    return { error: error.message };
  }

  if (data.session) redirect("/account");
  return { message: "Check your email for a link to finish creating your account." };
}

export async function signIn(_state: AuthState, formData: FormData): Promise<AuthState> {
  if (!supabaseConfigured()) return { error: "Supabase is not configured yet." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!emailPattern.test(email) || password.length === 0) {
    return { error: "Email or password is incorrect." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      return { error: "Confirm your email before signing in." };
    }
    return { error: "Email or password is incorrect." };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
