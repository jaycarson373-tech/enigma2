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
  title: "Openbell — Good things start together",
  description:
    "Bring your people. Pool your STONK. Openbell brings communities together for one shared first buy on Stonk.fun.",
  icons: { icon: "/brand/openbell.svg", apple: "/brand/icon.png" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Openbell",
    description: "Big ideas. One opening. Community STONK pools for Stonk.fun.",
    images: [
      {
        url: "/brand/social.png",
        width: 1200,
        height: 630,
        alt: "Openbell — Good things start together",
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
