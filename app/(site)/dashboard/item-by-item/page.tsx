import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { loadDashboard } from "../load";
import { ReceiptScanner, type ScannerCharge } from "./scanner";

export const metadata: Metadata = {
  title: "Split item by item",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default function ItemByItemPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p>Opening the receipt scanner…</p>}>
      <ScannerGate searchParams={searchParams} />
    </Suspense>
  );
}

// Opened from "Split this charge": ?group= is the group picked in the popup, and
// ?merchant=&amount=&date= describe the charge. Signed out, the scanner still works without a group.
async function ScannerGate({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await loadPrivateDashboard();

  const groups = data?.groups.map(({ id, name, role }) => ({ id, name, role })) ?? [];
  const group = groups.find((entry) => entry.id === one(params.group)) ?? null;
  // Names are the only identity the split math has, so two members called "Alex" must not collapse into one.
  const seen = new Map<string, number>();
  const people = (group && data ? data.members.filter((member) => member.groupId === group.id) : []).map((member) => {
    const base = member.name.trim() || "Member";
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const merchant = one(params.merchant).trim();
  const charge: ScannerCharge | null = merchant
    ? { merchant, amount: one(params.amount).trim(), date: one(params.date).trim() }
    : null;

  return (
    <ReceiptScanner
      me={data ? { name: data.me.name, email: data.me.email } : null}
      groups={groups}
      group={group}
      people={people}
      charge={charge}
      loadError={data?.loadError ?? null}
    />
  );
}

async function loadPrivateDashboard() {
  "use cache: private";
  cacheLife("seconds");

  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  cacheTag(`dashboard-${data.user.id}`);
  return loadDashboard(data.user.id, data.user.email ?? "");
}
