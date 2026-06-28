import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowX Platform",
  description: "Prototype web experience for mechanical contractors"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
