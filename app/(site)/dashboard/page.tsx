import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { Board } from "./board";
import { loadDashboard } from "./load";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Your Splits dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="dash-loading">Loading your dashboard…</p>}>
      <DashboardGate />
    </Suspense>
  );
}

async function DashboardGate() {
  const dashboard = await loadPrivateDashboard();
  if (!dashboard) redirect("/login");
  return <Board data={dashboard} />;
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
