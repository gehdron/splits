import type { Metadata } from "next";
import { Hero } from "./_components/hero";
import { LogoMark } from "./_components/logo";
import "./_styles/home.css";

const title = "Splits: settle up without the stress";
const description =
  "Snap the receipt, pick who had what, and everyone pays their share from a link.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "website", title, description },
};

const APP_URL = "/signup";

const steps = [
  { title: "Snap the receipt", body: "Splits reads every item and price for you." },
  { title: "Pick who had what", body: "Assign each item to someone in your group." },
  { title: "Send the links", body: "Everyone pays their own share. No app needed." },
];

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
              <a className="signin" href="/login">Sign in</a>
              <a className="btn btn-a" href={APP_URL}>Create account</a>
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
                <span className="ln"><span className="ri" style={{ animationDelay: "80ms" }}>Settle up</span></span>
                <span className="ln"><span className="ri" style={{ animationDelay: "180ms" }}>without the stress.</span></span>
              </h1>
              <p className="sub fade" style={{ animationDelay: "420ms" }}>
                Snap the receipt, pick who had what, and everyone pays their share from a link.
              </p>
              <div
                className="cta fade"
                style={{ animationDelay: "520ms", flexDirection: "column", alignItems: "flex-start", gap: 18 }}
              >
                <a className="btn btn-a" href={APP_URL}>Start splitting</a>
              </div>
            </div>
            <div className="device">
              <div className="tri a" aria-hidden="true"><i /></div>
              <div className="tri b" aria-hidden="true"><i /></div>
              <div className="phone-in">
                <div className="phone">
                  <div className="screen">
                    <span className="sk" style={{ top: 84, width: "46%" }} />
                    <span className="sk" style={{ top: 116 }} />
                    <span className="sk" style={{ top: 144, right: 90 }} />
                    <span className="sk" style={{ bottom: 96 }} />
                    <span className="sk" style={{ bottom: 68, right: 120 }} />
                    App screen placeholder
                  </div>
                </div>
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
                  <div className="ph">Step image placeholder</div>
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
                <a className="btn btn-a" href={APP_URL}>Start splitting</a>
              </div>
            </div>
          </div>
          <div className="fine">Live demo: payments are real, kept to a few dollars, and refunded.</div>
        </div>
        <div className="sign" aria-hidden="true"><span className="sa">Spl</span><span className="sb">its</span></div>
      </section>
    </div>
  );
}