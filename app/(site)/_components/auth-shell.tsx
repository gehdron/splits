import type { ReactNode } from "react";
import { LogoMark } from "./logo";
import "../_styles/home.css";
import "../_styles/auth.css";

export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="p2">
      <div className="navbar">
        <div className="wrap">
          <header className="nav">
            <a className="brand" href="/" aria-label="Splits home">
              <LogoMark size={30} />
              <span>Splits</span>
            </a>
            <nav className="links" aria-label="Account">
              <a className="signin" href="/login">Sign in</a>
              <a className="btn btn-a" href="/signup">
                Create account
              </a>
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
