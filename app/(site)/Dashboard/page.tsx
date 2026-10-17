import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { DashboardHome } from "./home";
import { loadDashboard } from "./load";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Your Splits dashboard",
};

export default function DashboardPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  return (
    <Suspense fallback={<p className="dash-loading">Loading your dashboard…</p>}>
      <DashboardGate searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardGate({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  if (!supabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const { group } = await searchParams;
  const dashboard = await loadDashboard(data.user.id, data.user.email ?? "");
  return <DashboardHome data={dashboard} />;
}
