"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@solana/kit";
import { walletSigner } from "@solana/kit-plugin-wallet";
import {
  useConnectedWallet,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import Icon from "./icon";
function makeClient() {
  return createClient().use(
    walletSigner({
      chain:
        "solana:mainnet",
    }),
  );
}
const Context = createContext<ReturnType<typeof makeClient> | null>(null);
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(makeClient, []);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useEnigmaWallet() {
  const client = useContext(Context);
  if (!client) throw Error("Wallet context missing");
  const live = useConnectedWallet(client),
    wallets = useWallets(client),
    [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return {
    client,
    connected: hydrated ? live : null,
    wallets: hydrated ? wallets : [],
  };
}
export default function WalletButton() {
  const { client, connected, wallets } = useEnigmaWallet();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function connect(w: (typeof wallets)[number]) {
    setBusy(true);
    setError("");
    try {
      await client.wallet.connect(w);
    } catch {
      setError("Connection cancelled. You can try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="wallet-control">
      <summary>
        <Icon name="wallet" size={16} />
        {connected
          ? `${connected.account.address.slice(0, 4)}…${connected.account.address.slice(-4)}`
          : "Connect wallet"}
        <Icon name="chevron" size={12} />
      </summary>
      <div className="wallet-menu">
        {connected ? (
          <>
            <code>{connected.account.address}</code>
            <button onClick={() => void client.wallet.disconnect()}>
              Disconnect wallet
            </button>
          </>
        ) : wallets.length ? (
          wallets.map((w) => (
            <button
              key={w.name}
              disabled={busy}
              onClick={() => void connect(w)}
            >
              Connect {w.name}
            </button>
          ))
        ) : (
          <p>
            Open in Phantom, Solflare or another Solana wallet browser to
            connect.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <small>
          {"Solana mainnet"}{" "}
          · keys stay in your wallet
        </small>
      </div>
    </details>
  );
}
