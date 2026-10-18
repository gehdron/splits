import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Board } from "./board";
import { loadPrivateDashboard } from "./load";
import { LoadingScreen } from "../_components/loading-screen";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Your Splits dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading your dashboard…" />}>
      <DashboardGate />
    </Suspense>
  );
}

async function DashboardGate() {
  const dashboard = await loadPrivateDashboard();
  if (!dashboard) redirect("/login");
  return <Board data={dashboard} />;
}
