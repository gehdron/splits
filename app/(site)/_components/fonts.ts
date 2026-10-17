import { Manrope, Outfit } from "next/font/google";

export const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const fontClassNames = `${outfit.variable} ${manrope.variable}`;
