import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "../_components/logo";
import { Lines, PaymentDetails, placeholders } from "./payment-details";
import "../_styles/payment-complete.css";

export const metadata: Metadata = {
  title: "Payment complete | Splits",
  description: "Your payment is complete.",
  robots: { index: false },
};

/*
  Filled from the URL so checkout can redirect here, for example:
  /payment-complete?friend=Maya&event=Dinner%20at%20Noodle%20House&amount=24.50&method=Apple%20Pay
*/
export default function PaymentComplete() {
  return (
    <div className="pt">
      <header className="nav">
        <Link className="brand" href="/" aria-label="Splits home">
          <LogoMark size={30} />
          <span>Splits</span>
        </Link>
      </header>
      <main>
        <div className="mark" aria-hidden="true">
          <svg viewBox="3 3 60 60">
            <g strokeWidth={6} strokeLinejoin="round">
              <g className="ga"><polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" /></g>
              <g className="gb"><polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" /></g>
            </g>
          </svg>
        </div>
        <h1><span className="ln"><span className="ri">You’re all paid up.</span></span></h1>
        <Suspense fallback={<Lines details={placeholders} />}>
          <PaymentDetails />
        </Suspense>
        <p className="own">Splitting a bill of your own? <a href="https://app.example.com">Try Splits</a></p>
      </main>
      <div className="fine">Payments are simulated in this demo. Apple Pay is a trademark of Apple Inc.</div>
    </div>
  );
}
