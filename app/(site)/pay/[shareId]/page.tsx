import type { Metadata } from "next";
import { PayPage, type PayPageProps } from "@/app/(site)/stripe/pay-page";

export const metadata: Metadata = {
  title: "Pay your share | Splits",
  robots: { index: false },
};

// https://splits.select/pay/sh_... is the link a friend gets by text. The page itself is in app/(site)/stripe/pay-page.tsx.
export default function Page(props: PayPageProps) {
  return <PayPage {...props} />;
}
