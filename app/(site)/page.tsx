import type { Metadata } from "next";
import { ApplePaySection } from "./_components/apple-pay-section";
import { Faq } from "./_components/faq";
import { Hero } from "./_components/hero";
import { LogoMark } from "./_components/logo";
import "./_styles/home.css";

const title = "Splits: split the bill by what each person ate";
const description =
  "Splits turns a photo of the receipt into a payment link for each person. Friends pay their own share with Apple Pay or a card. Nothing to install.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "website", title, description },
};

const APP_URL = "/signup";
const EMAIL = "hello@example.com";

const steps = [
  { title: "Scan the receipt", body: "Take a photo. Splits lists every item with the tax and tip." },
  { title: "Assign it", body: "Assign each item to the friend who ordered it. Shared plates split evenly between the people who share them." },
  { title: "Pay by link", body: "Each person gets a checkout link by text, with Apple Pay or card." },
];

const useCases = [
  { title: "Dinners out", body: "Everyone claims what they ate. Shared appetizers split evenly between the people who took some." },
  { title: "Roommate bills", body: "Groceries and household orders, split by who actually used what." },
  { title: "Group trips", body: "One shared list, so nobody buys the same thing twice and everyone sees what they owe." },
  { title: "Shared orders", body: "Split a delivery or online order item by item instead of dividing the total." },
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
              <a href="#pay">Apple Pay</a>
              <a href="#faq">FAQ</a>
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
                <span className="ln"><span className="ri" style={{ animationDelay: "80ms" }}>Splitting costs,</span></span>
                <span className="ln"><span className="ri" style={{ animationDelay: "180ms" }}>made simple.</span></span>
              </h1>
              <p className="sub fade" style={{ animationDelay: "420ms" }}>
                Scan the receipt, assign each item to a friend, and they tap to pay their share with Apple Pay or a card.
              </p>
              <div
                className="cta fade"
                style={{ animationDelay: "520ms", flexDirection: "column", alignItems: "flex-start", gap: 18 }}
              >
                <a className="btn btn-a" href={APP_URL}>Create account</a>
                <a className="textlink" href="#how">See how it works</a>
              </div>
              <ul className="perks fade" style={{ animationDelay: "640ms" }}>
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" /></svg>
                  Photo to itemized list
                </li>
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>
                  Apple Pay or card
                </li>
                <li>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></svg>
                  Works in any phone browser
                </li>
              </ul>
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
          <div className="chips">
            <span className="l">Made for</span>
            <span className="chip c1">Dinners out</span>
            <span className="chip c2">Roommate bills</span>
            <span className="chip c1">Group trips</span>
            <span className="chip c2">Shared orders</span>
          </div>
        </div>
      </Hero>

      <section className="statement">
        <div className="wrap">
          <p>
            Scan the receipt and <span className="mk m1">assign each item to a friend</span>. Everyone gets a link and <span className="mk m2">pays with Apple Pay or a card</span>. Roommates get <span className="mk m3">one group chat and one shared list</span>, so future bills are already set up.
          </p>
        </div>
      </section>

      <section className="sec" id="how">
        <div className="wrap">
          <div className="how">
            <aside className="side">
              <h2>Three steps, and the bill is settled</h2>
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

      <section className="sec" id="pay">
        <div className="wrap">
          <ApplePaySection />
        </div>
      </section>

      <section className="sec" id="uses">
        <div className="wrap">
          <h2>Made for the splits you already do</h2>
          <ul className="ucs">
            {useCases.map((uc) => (
              <li key={uc.title} className="uc"><h3>{uc.title}</h3><p>{uc.body}</p></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap">
          <h2>Questions, answered plainly</h2>
          <Faq />
        </div>
      </section>

      <section className="closing" id="join">
        <div className="wrap">
          <div className="cta2">
            <div>
              <h2>Ready when the check arrives.</h2>
              <p className="lead2">Scan a receipt and send your first payment links.</p>
            </div>
            <div className="thread">
              <div className="who">
                <LogoMark size={28} />
                <span>Splits</span>
              </div>
              <div className="msgs">
                <div className="bub mi">Dinner’s over. Your share is $--.--</div>
                <div className="bub mi">Pay with Apple Pay or a card. No app needed.</div>
                <div className="bub mo">Done. I’ll try it.</div>
              </div>
              <div className="tform">
                <a className="btn btn-a" href={APP_URL}>Create account</a>
                <p className="micro">
                  Questions first? <a href={`mailto:${EMAIL}`}>Email us</a>. We reply within 2 business days.
                </p>
              </div>
            </div>
          </div>
          <div className="cols">
            <div className="fcol">
              <div className="brand" style={{ fontSize: 24, color: "#0B1020" }}>
                <LogoMark size={28} />
                <span>Splits</span>
              </div>
              <p>Splits turns a photo of the receipt into a payment link for each person.</p>
            </div>
            <div className="fcol"><b>Product</b><a href="#how">How it works</a><a href="#pay">Apple Pay</a><a href="#faq">FAQ</a></div>
            <div className="fcol"><b>Company</b><a href={`mailto:${EMAIL}`}>Contact</a><a href="#top">Privacy</a><a href="#top">Terms</a></div>
            <div className="fcol"><b>Payments</b><span>Apple Pay</span><span>Card</span></div>
          </div>
          <div className="fine">Payments are simulated in this demo. Apple Pay is a trademark of Apple Inc.</div>
        </div>
        <div className="sign" aria-hidden="true"><span className="sa">Spl</span><span className="sb">its</span></div>
      </section>
      <div className="sc"><a className="btn btn-a" href={APP_URL}>Create account</a></div>
    </div>
  );
}
