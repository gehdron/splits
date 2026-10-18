import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadPrivateDashboard } from "../load";
import { ItemByItemView } from "./view";

export const metadata: Metadata = {
  title: "Split item by item",
};

export default function ItemByItemPage() {
  return (
    <Suspense fallback={<p>Loading your split…</p>}>
      <ItemByItemGate />
    </Suspense>
  );
}

async function ItemByItemGate() {
  const data = await loadPrivateDashboard();
  if (!data) redirect("/login");
  return <ItemByItemView data={data} />;
}
