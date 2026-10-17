import type { Metadata, Viewport } from "next";
import { fontClassNames } from "./_components/fonts";
import "../(app)/globals.css";

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
    <html lang="en" className={`${fontClassNames} site-theme`}>
      <body>{children}</body>
    </html>
  );
}
