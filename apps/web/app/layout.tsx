import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Table",
  description: "A fantasy AI dungeon master playing table."
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
