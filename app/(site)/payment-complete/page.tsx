import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "../_components/logo";
import { PaidDetails } from "@/app/(site)/stripe/paid-details";
import "../_styles/payment-complete.css";

export const metadata: Metadata = {
  title: "Payment complete | Splits",
  description: "Your payment is complete.",
  robots: { index: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/*
  Stripe Checkout returns here with ?share=sh_... (see app/(site)/stripe/checkout.ts), and the details come from that share.
  The older form still works and is filled from the URL, for example:
  /payment-complete?friend=Maya&event=Dinner%20at%20Noodle%20House&amount=24.50&method=Apple%20Pay
*/
export default function PaymentComplete({ searchParams }: { searchParams: SearchParams }) {
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
        {/* The heading waits for the share check, so an unpaid share never shows "all paid up", even briefly. */}
        <Suspense fallback={<h1><span className="ln"><span className="ri">Confirming your payment</span></span></h1>}>
          <PaidDetails searchParams={searchParams} />
        </Suspense>
        <p className="own">Splitting a bill of your own? <Link href="/">Try Splits</Link></p>
      </main>
    </div>
  );
}
