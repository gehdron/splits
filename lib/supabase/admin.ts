import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for server code that runs without a signed-in user (the Stripe webhook and the
// public /pay page). It bypasses row level security, so it must never reach the browser.
export function supabaseAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to store pay links.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
