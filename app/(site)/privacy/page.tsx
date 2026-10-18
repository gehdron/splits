import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "../_components/logo";
import "../_styles/home.css";
import "../_styles/privacy.css";

export const metadata: Metadata = {
  title: "Privacy policy | Splits",
  description: "How Splits collects, uses, and protects information.",
};

export default function PrivacyPage() {
  return (
    <div className="p2 privacy-page">
      <div className="navbar">
        <div className="wrap">
          <header className="nav">
            <Link className="brand" href="/" aria-label="Splits home">
              <LogoMark size={30} />
              <span>Splits</span>
            </Link>
            <nav className="links" aria-label="Main">
              <Link href="/">Home</Link>
              <Link className="btn btn-a" href="/signup">Create account</Link>
            </nav>
          </header>
        </div>
      </div>

      <main className="wrap privacy-main">
        <p className="privacy-kicker">Privacy</p>
        <h1>Privacy policy</h1>
        <p className="privacy-lead">
          Splits helps groups split a bill by what each person ordered. This policy explains what we collect,
          why we use it, and the choices you have.
        </p>
        <p className="privacy-updated">Last updated: October 18, 2026</p>

        <div className="privacy-content">
          <section>
            <h2>Information we collect</h2>
            <p>
              When you create an account, we collect the information you provide, such as your email address,
              name, and phone number. When you use Splits, we collect the lists, receipt details, assignments,
              and payment-link information you choose to enter.
            </p>
            <p>
              We may also receive basic technical information needed to operate the service, such as your
              browser, device, and approximate activity on our pages.
            </p>
          </section>

          <section>
            <h2>How we use information</h2>
            <p>We use information to:</p>
            <ul>
              <li>provide and improve Splits;</li>
              <li>save your groups, lists, and assignments;</li>
              <li>send payment and claim links when you request them;</li>
              <li>protect the service and respond to support requests; and</li>
              <li>meet legal and security obligations.</li>
            </ul>
          </section>

          <section>
            <h2>Service providers</h2>
            <p>
              We use service providers to host data, authenticate accounts, process payments, send messages,
              and provide receipt or AI features. They may process information only as needed to provide those
              services under their own terms and privacy policies. We do not store raw card numbers.
            </p>
          </section>

          <section>
            <h2>Payment and bank information</h2>
            <p>
              Splits uses Stripe to securely process payments and manage organizer payout accounts. We use
              Plaid to securely connect and verify bank accounts when you choose to link one. Stripe and Plaid
              receive and protect financial information through their own systems, and their handling of that
              information is governed by their respective privacy policies. Splits does not receive or store
              your raw bank login credentials or raw card numbers.
            </p>
          </section>

          <section>
            <h2>Analytics, sharing, and retention</h2>
            <p>
              Data may be used for analytical purposes and may be sold or shared with analytics, advertising,
              and business partners. We may also share information when you ask us to, when a provider needs
              it to operate a feature, when required by law, or when needed to protect Splits and its users.
              We keep information while your account is active and for as long as reasonably necessary for the
              purposes described here.
            </p>
          </section>

          <section>
            <h2>Chatbot and group chats</h2>
            <p>
              If you connect a group chat or use our chatbot, the chatbot may review messages and look for
              keywords related to bills, payments, items, and splitting expenses. Those messages and detected
              keywords may be stored, analyzed, shared, or sold for the purposes described in this policy.
            </p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>
              You can review or update account information through your account, or ask us to help with access,
              correction, or deletion. Contact us at{" "}
              <a href="mailto:help@splitsselect.com">help@splitsselect.com</a>. We reply within 2 business days.
            </p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>
              We may update this policy as Splits changes. We will post the current version on this page and
              update the date above.
            </p>
          </section>
        </div>
      </main>

      <div className="wrap privacy-footer">
        <Link href="/">Back to home</Link>
      </div>
    </div>
  );
}
