import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scipx Platform",
  description:
    "Scipx samlar projekt, produktdata och tekniska arbetsflöden för installationsbranschen."
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
