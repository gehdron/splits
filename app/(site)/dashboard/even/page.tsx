import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadPrivateDashboard } from "../load";
import { EvenSplitView } from "./view";

export const metadata: Metadata = {
  title: "Split evenly",
};

export default function EvenSplitPage() {
  return (
    <Suspense fallback={<p>Opening the even split…</p>}>
      <EvenGate />
    </Suspense>
  );
}

async function EvenGate() {
  const data = await loadPrivateDashboard();
  if (!data) redirect("/login");
  return <EvenSplitView data={data} />;
}
