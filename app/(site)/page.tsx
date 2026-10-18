import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import { Hero } from "./_components/hero";
import { LogoMark } from "./_components/logo";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import "./_styles/home.css";

const title = "Splits: split bills without the stress";
const description =
  "Snap the receipt, pick who had what, and everyone pays their share from a link.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "website", title, description },
};

const steps = [
  { title: "Snap the receipt", body: "Splits reads every item and price for you.", image: "/assets/screens/step-scan.png", alt: "A receipt inside the camera frame while Splits reads it" },
  { title: "Pick who had what", body: "Assign each item to someone in your group.", image: "/assets/screens/step-assign.png", alt: "Receipt items with a name button for each person, and each person's total" },
  { title: "Send the links", body: "Everyone pays their own share. No app needed.", image: "/assets/screens/step-pay.png", alt: "A text message with a payment link and a checkout page with Apple Pay" },
];

// The session cookie is request data. With Cache Components it has to render
// behind Suspense, or prerendering the home page fails the production build.
const viewerIsSignedIn = cache(async () => {
  if (!supabaseConfigured()) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return false;
  return Boolean(data.user);
});

function GuestAccountLinks() {
  return (
    <>
      <a className="signin" href="/login">Sign in</a>
      <a className="btn btn-a" href="/signup">Create account</a>
    </>
  );
}

async function AccountLinks() {
  if (!(await viewerIsSignedIn())) return <GuestAccountLinks />;
  return (
    <>
      <a className="signin" href="/account">Account</a>
      <a className="btn btn-a" href="/dashboard">Dashboard</a>
    </>
  );
}

function StartSplitting() {
  return (
    <a className="btn btn-a" href="/signup">Start splitting</a>
  );
}

async function StartLink() {
  if (await viewerIsSignedIn()) {
    return <a className="btn btn-a" href="/dashboard">Go to dashboard</a>;
  }
  return <StartSplitting />;
}

function GuestFooterLink() {
  return <Link href="/signup">Create account</Link>;
}

async function FooterProductLink() {
  if (await viewerIsSignedIn()) return <Link href="/dashboard">Dashboard</Link>;
  return <GuestFooterLink />;
}

export default function Home() {
  return (
    <div className="p2">
      <div className="navbar">
        <div className="wrap">
          <header className="nav">
            <a className="brand" href="#top" aria-label="Splits home">
              <LogoMark size={30} />
              <span>Splits</span>
            </a>
            <nav className="links" aria-label="Main">
              <a href="#how">How it works</a>
              <Suspense fallback={<GuestAccountLinks />}>
                <AccountLinks />
              </Suspense>
            </nav>
          </header>
        </div>
      </div>

      <Hero>
        <div className="gridl" aria-hidden="true" />
        <div className="gridl hot" aria-hidden="true" />
        <div className="wrap">
          <div className="hero-in">
            <div>
              <h1>
                <span className="ln"><span className="ri" style={{ animationDelay: "80ms" }}>Splitting made</span></span>
                <span className="ln"><span className="ri" style={{ animationDelay: "180ms" }}>simple.</span></span>
              </h1>
              <p className="sub fade" style={{ animationDelay: "420ms" }}>
                Snap the receipt, pick who had what, and everyone pays their share from a link.
              </p>
              <div
                className="cta fade"
                style={{ animationDelay: "520ms", flexDirection: "column", alignItems: "flex-start", gap: 18 }}
              >
                <Suspense fallback={<StartSplitting />}>
                  <StartLink />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </Hero>

      <section className="sec" id="how">
        <div className="wrap">
          <div className="how">
            <aside className="side">
              <h2>How it works</h2>
              <ol className="sl">
                {steps.map((step, i) => (
                  <li key={step.title} className={`si si${i + 1}`}>
                    <span className="dot">{i + 1}</span>
                    {step.title}
                  </li>
                ))}
              </ol>
            </aside>
            <div className="panels">
              {steps.map((step) => (
                <div key={step.title} className="panel">
                  <img
                    src={step.image}
                    alt={step.alt}
                    style={{ width: "100%", height: "auto", display: "block", borderRadius: 20, border: "1px solid #e3e7f1" }}
                  />
                  <div><h3>{step.title}</h3><p>{step.body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="closing" id="join">
        <div className="wrap">
          <div className="cta2">
            <div>
              <h2>Dinner’s over. Time to settle up.</h2>
            </div>
            <div className="thread">
              <div className="who">
                <LogoMark size={28} />
                <span>Splits</span>
              </div>
              <div className="msgs">
                <div className="bub mi">Your share is $--.--</div>
                <div className="bub mi">Tap to pay with Apple Pay or a card.</div>
                <div className="bub mo">Done.</div>
              </div>
              <div className="tform">
                <Suspense fallback={<StartSplitting />}>
                  <StartLink />
                </Suspense>
              </div>
            </div>
          </div>
          <footer className="foot">
            <div className="fcol">
              <div className="brand">
                <LogoMark size={30} />
                <span>Splits</span>
              </div>
              <p>Split the check by what everyone actually ordered.</p>
            </div>
            <nav className="fcol" aria-label="Product">
              <b>Product</b>
              <Link href="/#how">How it works</Link>
              <Suspense fallback={<GuestFooterLink />}>
                <FooterProductLink />
              </Suspense>
            </nav>
            <nav className="fcol" aria-label="Company">
              <b>Company</b>
              <Link href="/privacy">Privacy</Link>
              <a href="mailto:help@splitsselect.com">Contact</a>
            </nav>
          </footer>
        </div>
        <div className="sign" aria-hidden="true"><span className="sa">Spl</span><span className="sb">its</span></div>
      </section>
    </div>
  );
}