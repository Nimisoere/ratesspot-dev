import type { Metadata } from "next";
import { Inter, Nunito, Playfair_Display, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Playfair_Display({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const source = Source_Sans_3({ subsets: ["latin"], variable: "--font-source", display: "swap" });
const round = Nunito({ subsets: ["latin"], variable: "--font-round", display: "swap" });

export const metadata: Metadata = { title: { default: "Book online", template: "%s" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${source.variable} ${round.variable}`}>
      <body>{children}</body>
    </html>
  );
}
