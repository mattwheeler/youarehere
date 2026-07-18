import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "You Are Here — See the question work",
  description:
    "A map-first AI workspace that makes goals, context, actions, and learning visible while you complete real work.",
  openGraph: {
    title: "You Are Here",
    description: "See what AI can see. Learn what to do next.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "An illustrated journey map connecting a goal, context, action, and artifact.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "You Are Here",
    description: "See what AI can see. Learn what to do next.",
    images: ["/og.png"],
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
