import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "F&L Cockpit — Pilotage fruits et légumes",
  description:
    "Le cockpit multi-magasin qui relie ventes, marge, assortiment et décisions opérationnelles.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
