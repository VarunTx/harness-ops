import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "HarnessOps Studio",
  description:
    "Self-improving production support agent — chat, escalation inbox, versioned context hub, and harness evolution.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#08090b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
