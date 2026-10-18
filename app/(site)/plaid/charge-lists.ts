import "server-only";
import { createAdminClient, supabaseAdminConfigured } from "@/lib/supabase/admin";

function missingChargeColumn(error: { message: string } | null): boolean {
  return Boolean(error && /plaid_transaction_id/i.test(error.message) && /does not exist|schema cache/i.test(error.message));
}

export function chargeIdOf(value: unknown): string {
  return typeof value === "string" && /^[\w-]{1,128}$/.test(value) ? value : "";
}

// Remember which bank charge a list came from. A missing column just skips the link.
export async function attachCharge(table: "bill_lists" | "lists", listId: string, chargeId: string): Promise<void> {
  const id = chargeIdOf(chargeId);
  if (!id || !supabaseAdminConfigured()) return;
  const { error } = await createAdminClient().from(table).update({ plaid_transaction_id: id }).eq("id", listId);
  if (missingChargeColumn(error)) return;
  if (error) console.error(error);
}

export async function splitChargeIds(userId: string): Promise<{ ready: boolean; ids: string[] }> {
  if (!supabaseAdminConfigured()) return { ready: false, ids: [] };
  const admin = createAdminClient();
  const [bills, lists] = await Promise.all([
    admin.from("bill_lists").select("plaid_transaction_id").eq("owner_id", userId),
    admin.from("lists").select("plaid_transaction_id").eq("created_by", userId),
  ]);
  if (missingChargeColumn(bills.error) || missingChargeColumn(lists.error)) return { ready: false, ids: [] };
  if (bills.error || lists.error) {
    console.error(bills.error ?? lists.error);
    return { ready: false, ids: [] };
  }
  const ids = [...(bills.data ?? []), ...(lists.data ?? [])]
    .map((row) => row.plaid_transaction_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return { ready: true, ids };
}

export async function chargeIdForList(listId: string): Promise<string | null> {
  if (!supabaseAdminConfigured()) return null;
  const admin = createAdminClient();
  for (const table of ["bill_lists", "lists"] as const) {
    const { data, error } = await admin.from(table).select("plaid_transaction_id").eq("id", listId).maybeSingle();
    if (missingChargeColumn(error)) return null;
    if (error) {
      console.error(error);
      continue;
    }
    const id = data?.plaid_transaction_id;
    if (typeof id === "string" && id) return id;
  }
  return null;
}
