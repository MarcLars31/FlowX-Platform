import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scipx för Ahlsell – Produktvalsflöde",
  description:
    "Konceptflöde där tekniska beskrivningar kopplas till distributörsvalda produkter och tillbehör."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
