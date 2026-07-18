import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ??
  "https://youarehere-buildweek.matt-wheeler70.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "On Your Behalf — Learn AI by doing it",
  description:
    "Twenty short, everyday missions that teach people how to stay in charge while AI helps.",
  openGraph: {
    title: "On Your Behalf",
    description: "Learn AI by doing it—one everyday mission at a time.",
    images: [{
      url: "/og-v2.png",
      width: 1731,
      height: 909,
      alt: "On Your Behalf — Learn AI by doing it",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "On Your Behalf",
    description: "Twenty safe missions for learning how to use AI.",
    images: ["/og-v2.png"],
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
