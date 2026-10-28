// This page is unavailable in production. Samples never enter feed(), APIs or journals.
import { notFound } from "next/navigation";
import Terminal from "@/components/terminal";
import { createHash } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";
export const dynamic = "force-dynamic";
export default function VisualQA() {
  if (process.env.NODE_ENV !== "development") notFound();
  const now = Math.floor(Date.now() / 1000);
  const key = (s: string) =>
    getBase58Decoder().decode(
      createHash("sha256")
        .update("enigma-local-visual-only:" + s)
        .digest(),
    );
  const names = [
    ["CIPHER", "Cipher Test"],
    ["ROTOR", "Rotor Local Sample"],
    ["SHIFT", "Shift Visual Test"],
    ["NOVA", "Nova Local Sample"],
    ["KEY", "Key Test"],
    ["SIGNAL", "Signal Visual Test"],
    ["VECTOR", "Vector Local Sample"],
    ["ECHO", "Echo Test"],
    ["LONGTICKER", "A long coin name for visual layout testing"],
  ];
  const offers = names.map(([symbol, name], i) => ({
    address: key("offer" + i),
    mint: key("mint" + i),
    creator: key("wallet" + i),
    symbol,
    name,
    uri: "https://example.com/local-fixture-only",
    image: i % 3 === 0 ? "/brand/enigma.svg" : null,
    status: i < 3 ? "open" : "launched",
    poolVerified: i >= 6,
    quoteMint: "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
    isNative: false,
    createdAt: now - 1200 - i * 190,
    launchedAt: i < 3 ? 0 : now - 600 - i * 90,
    closesAt: now + 180 + i * 90,
    capBps: 50,
    raised: String((i + 1) * 50000000),
    totalWeight: String((i + 1) * 2500000000000),
    curveSupply: "793100000000000",
    backers: 3 + i,
    curve:
      i < 3
        ? null
        : {
            vSol: String(35000000000 + i * 1000000000),
            vToken: "1015000000000000",
            realToken: String(793100000000000 - i * 40000000000000),
            supply: "1000000000000000",
          },
  }));
  return (
    <Terminal
      visualFeed={{
        offers,
        stats: {
          pooledRaw: "2250000000",
          launches: 9,
          participations: 63,
          graduated: 3,
        },
        checkedAt: new Date().toISOString(),
        fixture: true,
      }}
    />
  );
}
