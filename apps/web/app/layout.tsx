import type { Metadata } from "next";
import { Cinzel, Cormorant_Garamond } from "next/font/google";
import { AnalyticsBootstrap } from "@/components/AnalyticsBootstrap";
import "./globals.css";

const siteUrl = new URL(
  (process.env.AUTH_PUBLIC_APP_ORIGIN ?? "https://aitaverns.com").replace(/\/$/, "")
);
const siteDescription =
  "AI Taverns is an AI dungeon master for solo and multiplayer D&D-style tabletop adventures with memory, dice rolls, and consequences.";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-heading"
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "AI Taverns | AI Dungeon Master for D&D-Style Adventures",
    template: "%s | AI Taverns"
  },
  description: siteDescription,
  applicationName: "AI Taverns",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "AI Taverns",
    title: "AI Taverns | AI Dungeon Master for D&D-Style Adventures",
    description: siteDescription,
    images: [
      {
        url: "/landing/burial-rite-hero.jpg",
        width: 1600,
        height: 900,
        alt: "AI Taverns fantasy tabletop adventure scene"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Taverns | AI Dungeon Master for D&D-Style Adventures",
    description: siteDescription,
    images: ["/landing/burial-rite-hero.jpg"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  category: "game"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${cormorantGaramond.variable}`}>
        <AnalyticsBootstrap />
        {children}
      </body>
    </html>
  );
}
