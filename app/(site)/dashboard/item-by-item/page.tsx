import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { loadDashboard } from "../load";
import { ReceiptScanner, type ScannerCharge } from "./scanner";
import { redirect } from "next/navigation";
import { loadPrivateDashboard } from "../load";
import {
  ReceiptScanner,
  type ScannerCharge,
  type ScannerGroup,
} from "./scanner";

export const metadata: Metadata = {
  title: "Split item by item",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default function ItemByItemPage({ searchParams }: { searchParams: SearchParams }) {
function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ItemByItemPage({
  searchParams,
}: PageProps<"/dashboard/item-by-item">) {
  return (
    <Suspense fallback={<p className="dash-loading">Loading receipt scanner…</p>}>
      <ItemByItemContent searchParams={searchParams} />
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
async function ItemByItemContent({
  searchParams,
}: Pick<PageProps<"/dashboard/item-by-item">, "searchParams">) {
  const [data, params] = await Promise.all([
    loadPrivateDashboard(),
    searchParams,
  ]);
  if (!data) redirect("/login");

  const groupId = firstValue(params.group);
  const selectedGroup =
    data.groups.find((entry) => entry.id === groupId) ?? data.groups[0] ?? null;
  const group: ScannerGroup | null = selectedGroup
    ? {
        id: selectedGroup.id,
        name: selectedGroup.name,
        role: selectedGroup.role,
      }
    : null;
  const people = data.members
    .filter((member) => member.groupId === group?.id)
    .map((member) => member.name);

  const merchant = firstValue(params.merchant);
  const amount = firstValue(params.amount);
  const date = firstValue(params.date);
  const charge: ScannerCharge | null =
    merchant && amount && date ? { merchant, amount, date } : null;

  return (
    <ReceiptScanner
      me={{ name: data.me.name, email: data.me.email }}
      groups={data.groups}
      group={group}
      people={people}
      charge={charge}
      loadError={data.loadError}
      startCameraOnLoad={firstValue(params.newList) === "1"}
    />
  );
}
