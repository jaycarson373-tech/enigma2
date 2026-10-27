import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/wallet";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3143",
  ),
  title: "Enigma — Launchpad on Solana",
  description:
    "Enigma 2: STONK pooling for Stonk.fun launches. In development; public launch actions are unavailable.",
  icons: { icon: "/brand/enigma.svg", apple: "/brand/icon.png" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Enigma",
    description: "A public window. One pooled first buy. Launch on Enigma.",
    images: [
      {
        url: "/brand/social.png",
        width: 1200,
        height: 630,
        alt: "Launch on Enigma — a launchpad on Solana",
      },
    ],
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
