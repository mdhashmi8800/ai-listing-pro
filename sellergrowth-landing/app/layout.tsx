import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Listing Pro — AI-Powered Listing Optimization for Meesho Sellers",
  description:
    "AI Listing Pro by SellerGrowth. Smart listing optimization, workflow automation, and cloud sync for Meesho sellers. Boost productivity and grow your business.",
  keywords: [
    "Meesho",
    "AI",
    "optimizer",
    "seller tools",
    "listing optimization",
    "SellerGrowth",
    "Meesho seller",
    "ecommerce",
  ],
  authors: [{ name: "MD Hashmi" }],
  openGraph: {
    title: "AI Listing Pro — AI-Powered Listing Optimization for Meesho Sellers",
    description:
      "Smart listing optimization, workflow automation, and cloud sync for Meesho sellers.",
    type: "website",
    locale: "en_IN",
    siteName: "SellerGrowth",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
