import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/wallet";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL
        ? "https://" + process.env.VERCEL_URL
        : "http://localhost:3143"),
  ),
  title: "Block — Launch together on Stonk.fun",
  description:
    "Pool STONK with your community. Block brings people together for one shared first buy on Stonk.fun.",
  icons: { icon: "/brand/block.svg", apple: "/brand/icon.png" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Block — Launch together on Stonk.fun",
    description: "Big ideas. One opening. Community STONK pools for Stonk.fun.",
    images: [
      {
        url: "/brand/social.png",
        width: 1200,
        height: 630,
        alt: "Block — Launch together on Stonk.fun",
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
