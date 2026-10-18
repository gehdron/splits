import "server-only";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";

const SETUP = "Recent charges need SUPABASE_SERVICE_ROLE_KEY on the server, and the plaid_links table from supabase/payments.sql.";

// The access token stays on the server. The browser only ever sees merchant, date, and amount.
export async function savePlaidLink(userId: string, itemId: string, accessToken: string) {
  if (!supabaseAdminConfigured()) throw new Error(SETUP);
  const { error } = await createAdminClient()
    .from("plaid_links")
    .upsert(
      { user_id: userId, item_id: itemId, access_token: accessToken, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(error.message.includes("plaid_links") ? SETUP : error.message);
}

export async function plaidAccessToken(userId: string): Promise<string | null> {
  if (!supabaseAdminConfigured()) return null;
  const { data, error } = await createAdminClient()
    .from("plaid_links")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message.includes("plaid_links") ? SETUP : error.message);
  return typeof data?.access_token === "string" ? data.access_token : null;
}
