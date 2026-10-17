import type { Metadata } from "next";
import { NotFoundPage } from "./(site)/_components/not-found-page";
import { fontClassNames } from "./(site)/_components/fonts";

export const metadata: Metadata = {
  title: "Page not found | Splits",
  description: "We can't find that page. The link may be old or mistyped.",
  robots: { index: false },
  icons: {
    icon: { url: "/assets/favicon.svg", type: "image/svg+xml" },
    apple: "/assets/apple-touch-icon.png",
  },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={fontClassNames}>
      <body>
        <NotFoundPage />
      </body>
    </html>
  );
}
