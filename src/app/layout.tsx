import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parakkan Petroleum — Daily Collection",
  description: "HPCL outlet daily collection, reconciliation & salary",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
