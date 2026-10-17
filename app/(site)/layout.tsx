import type { Metadata, Viewport } from "next";
import { fontClassNames } from "./_components/fonts";

export const metadata: Metadata = {
  icons: {
    icon: { url: "/assets/favicon.svg", type: "image/svg+xml" },
    apple: "/assets/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F4F6FB",
  viewportFit: "cover",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontClassNames}>
      <body>{children}</body>
    </html>
  );
}
