import type { Metadata } from "next";
import { Suspense } from "react";
import { loadPrivateDashboard } from "../load";
import { ReceiptScanner, type ScannerCharge, type ScannerGroup } from "./scanner";

export const metadata: Metadata = {
  title: "Split item by item",
};

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
// ?merchant=&amount=&date= describe the charge. ?newList=1 opens the camera for a blank list.
// Signed out, the scanner still works without a group.
async function ItemByItemContent({
  searchParams,
}: Pick<PageProps<"/dashboard/item-by-item">, "searchParams">) {
  const [data, params] = await Promise.all([loadPrivateDashboard(), searchParams]);

  const groups: ScannerGroup[] = data?.groups.map(({ id, name, role }) => ({ id, name, role })) ?? [];
  const requestedGroup = firstValue(params.group);
  const group = groups.find((entry) => entry.id === requestedGroup) ?? null;
  // Names are the only identity the split math has, so two members called "Alex" must not collapse into one.
  const seen = new Map<string, number>();
  const people = (group && data ? data.members.filter((member) => member.groupId === group.id) : []).map((member) => {
    const base = member.name.trim() || "Member";
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const merchant = firstValue(params.merchant)?.trim() ?? "";
  const charge: ScannerCharge | null = merchant
    ? {
        merchant,
        amount: firstValue(params.amount)?.trim() ?? "",
        date: firstValue(params.date)?.trim() ?? "",
      }
    : null;

  return (
    <ReceiptScanner
      me={data ? { name: data.me.name, email: data.me.email } : null}
      groups={groups}
      group={group}
      people={people}
      charge={charge}
      loadError={data?.loadError ?? null}
      startCameraOnLoad={firstValue(params.newList) === "1"}
    />
  );
}
