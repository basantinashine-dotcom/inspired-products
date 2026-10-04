import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdCanvas — Creative Studio",
  description: "Create, review and approve product-focused advertising images.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}

