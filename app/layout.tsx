import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "On Your Behalf — Driver's ed for AI agents",
  description:
    "A safe, playable simulation where people learn to scope, inspect, approve, and verify an AI agent's actions.",
  openGraph: {
    title: "On Your Behalf",
    description: "Before an AI acts for you, learn how to stay in charge.",
  },
  twitter: {
    card: "summary",
    title: "On Your Behalf",
    description: "Driver's ed for AI agents.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
