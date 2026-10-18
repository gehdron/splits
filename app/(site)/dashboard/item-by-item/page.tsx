import type { Metadata } from "next";
import { Suspense } from "react";
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
