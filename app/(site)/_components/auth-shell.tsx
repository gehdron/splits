import type { ReactNode } from "react";
import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "./logo";
import "../_styles/home.css";
import "../_styles/auth.css";

export async function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  let signedIn = false;
  if (supabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) console.error("Could not check account navigation session:", error);
    signedIn = Boolean(data.user);
  }

  return (
    <div className="p2">
      <div className="navbar">
        <div className="wrap">
          <header className="nav">
            <Link className="brand" href="/" aria-label="Splits home">
              <LogoMark size={30} />
              <span>Splits</span>
            </Link>
            <nav className="links" aria-label="Account">
              {signedIn ? (
                <Link className="btn btn-a" href="/dashboard">Dashboard</Link>
              ) : (
                <>
                  <Link className="signin" href="/login">Sign in</Link>
                  <Link className="btn btn-a" href="/signup">
                    Create account
                  </Link>
                </>
              )}
            </nav>
          </header>
        </div>
      </div>
      <main className="wrap auth">
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
        {children}
      </main>
    </div>
  );
}
