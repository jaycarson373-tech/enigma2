"use client";
import { useEffect, useRef, useState } from "react";
import {
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isFullySignedTransaction,
} from "@solana/kit";
import WalletButton, { useEnigmaWallet } from "./wallet";
import { requireSimulation, requireNetworkFee } from "@/lib/simulation.mjs";
import { enigma2Release as deployment } from "@/lib/enigma2-release.mjs";
import {
  bytes64,
  createStonkProtocol as createProtocol,
} from "@/lib/stonk-protocol.mjs";
import {
  runInitialRelease,
  releaseStage,
  inspectBuffer,
  inspectProgram,
  inspectLookup,
} from "@/lib/release-v2-flow.mjs";

import { compileReleaseTransaction } from "@/lib/release-wire.mjs";
const display = (v: string) => Number(BigInt(v)) / 1e9;
const GAS_CAP = 20000000n;
export default function ReleaseConsole() {
  const { connected } = useEnigmaWallet(),
    wallet = connected?.account.address;
  const current = useRef(wallet);
  useEffect(() => {
    current.current = wallet;
  }, [wallet]);
  const [plan, setPlan] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [approved, setApproved] = useState(false);
  useEffect(() => {
    setPlan(null);
    setApproved(false);
    setMessage("");
  }, [wallet]);
  async function check() {
    if (!wallet) return;
    setBusy(true);
    setMessage("Checking the mainnet deployment inputs…");
    try {
      const r = await fetch("/api/local-release?wallet=" + wallet, {
          cache: "no-store",
        }),
        b = await r.json();
      if (!r.ok) throw Error(b.error);

      setPlan(b);
      setMessage("Inputs verified. No transaction has been requested.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!plan || !wallet || !connected?.signer || !approved || busy) return;
    const who = wallet,
      signer: any = connected.signer,
      key = "enigma2:deployment:" + deployment.codeHash + ":" + who;
    let journal: any;
    try {
      journal = JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      setMessage(
        "Saved deployment journal could not be read. Keep it for recovery.",
      );
      return;
    }
    if (
      !journal.scope &&
      BigInt(plan.balance) < BigInt(plan.cost.conservativeBalance)
    ) {
      setMessage("Fund this connected wallet before beginning deployment.");
      return;
    }
    setBusy(true);
    const save = async (j: any) => localStorage.setItem(key, JSON.stringify(j));
    const call = async (method: string, params: any[], stage?: any) => {
      const r = await fetch("/api/local-release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: who, method, params, stage }),
      });
      const b = await r.json();
      if (!r.ok || b.error)
        throw Error(b.error || "Deployment RPC is refreshing.");
      return b.result;
    };
    const readAccount = async (a: string) =>
      (
        await call("getAccountInfo", [
          a,
          { encoding: "base64", commitment: "finalized" },
        ])
      ).value;
    const code = bytes64(plan.code),
      id = plan.identity;
    async function effect(p: any) {
      const s = p.stage,
        c = createProtocol(id.program);
      try {
        if (s.kind === "buffer")
          return inspectBuffer(await readAccount(id.buffer), id, code).exists;
        if (s.kind === "write")
          return !inspectBuffer(
            await readAccount(id.buffer),
            id,
            code,
          ).missing.includes(s.offset);
        if (s.kind === "deploy")
          return !!(await inspectProgram(
            await readAccount(id.program),
            await readAccount(id.programData),
            id,
            code,
          ));
        if (s.kind === "initialize")
          return (
            (await c.decodeConfig(await readAccount(id.config))).operator ===
            who
          );
      } catch {}
      return false;
    }
    async function reconcile() {
      const p = journal.pending;
      if (!p) return;
      const status = (
        await call("getSignatureStatuses", [
          [p.signature],
          { searchTransactionHistory: true },
        ])
      ).value[0];
      if (status?.err) {
        journal.receipts = [
          ...(journal.receipts || []),
          { signature: p.signature, label: p.label, state: "failed" },
        ];
        delete journal.pending;
        await save(journal);
        throw Error(
          "The signed deployment stage failed. Its receipt is saved. Recheck before resuming.",
        );
      }
      if (status?.confirmationStatus === "finalized" || (await effect(p))) {
        journal.receipts = [
          ...(journal.receipts || []),
          {
            signature: p.signature,
            label: p.label,
            state:
              status?.confirmationStatus === "finalized"
                ? "finalized"
                : "effect-verified",
          },
        ];
        delete journal.pending;
        await save(journal);
        return;
      }
      const height = await call("getBlockHeight", [
        { commitment: "finalized" },
      ]);
      if (BigInt(height) > BigInt(p.lastValid))
        throw Error(
          "The original outcome is still unknown. Its exact signed transaction is saved; another payment is blocked until reconciliation.",
        );
      // Only replay the identical already-signed wire, never request a replacement.
      await call("sendTransaction", [p.wire], p.stage);
      throw Error(
        "The saved transaction was resubmitted unchanged. Resume after it confirms.",
      );
    }
    const execute = async (label: string, ixs: any[]) => {
      if (current.current !== who)
        throw Error(
          "Deployment wallet changed. Resume with the original funding wallet.",
        );
      await reconcile();
      setMessage(label + " — simulating");
      const stage = releaseStage(label, journal),
        block = (
          await call("getLatestBlockhash", [{ commitment: "confirmed" }])
        ).value;
      const unsigned = compileReleaseTransaction(who, ixs, block);
      const fee = (
        await call("getFeeForMessage", [
          getBase64Decoder().decode(unsigned.messageBytes),
          { commitment: "confirmed" },
        ])
      ).value;
      requireNetworkFee(fee);
      if (
        fee === null ||
        BigInt(journal.networkReserved || "0") + BigInt(fee) > GAS_CAP
      )
        throw Error(
          "Deployment network-fee allowance reached. No new signature was requested.",
        );
      const wire = getBase64EncodedWireTransaction(unsigned),
        sim = await call("simulateTransaction", [wire], stage);
      requireSimulation(sim);
      setMessage(label + " — approve in your wallet");
      let signed: any;
      if ("modifyAndSignTransactions" in signer)
        [signed] = await signer.modifyAndSignTransactions([unsigned]);
      else if ("signTransactions" in signer) {
        const [s] = await signer.signTransactions([unsigned]);
        signed = { ...unsigned, signatures: { ...unsigned.signatures, ...s } };
      } else
        throw Error(
          "This wallet must support returning a signed transaction for recovery.",
        );
      if (
        current.current !== who ||
        signed.messageBytes.length !== unsigned.messageBytes.length ||
        !signed.messageBytes.every(
          (b: number, i: number) => b === unsigned.messageBytes[i],
        ) ||
        !isFullySignedTransaction(signed)
      )
        throw Error(
          "The wallet changed the reviewed deployment transaction. Nothing was sent.",
        );
      journal.networkReserved = String(
        BigInt(journal.networkReserved || "0") + BigInt(fee),
      );
      journal.pending = {
        signature: getSignatureFromTransaction(signed),
        wire: getBase64EncodedWireTransaction(signed),
        lastValid: String(block.lastValidBlockHeight),
        label,
        stage,
      };
      await save(journal);
      setMessage(label + " — awaiting finalized confirmation");
      try {
        await call("sendTransaction", [journal.pending.wire], stage);
      } catch {
        throw Error(
          "Submission was interrupted. Its exact signed transaction is saved; resume to reconcile it.",
        );
      }
      for (let i = 0; i < 60; i++) {
        const s = (
          await call("getSignatureStatuses", [
            [journal.pending.signature],
            { searchTransactionHistory: true },
          ])
        ).value[0];
        if (s?.err || s?.confirmationStatus === "finalized") {
          await reconcile();
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error(
        "Confirmation is still pending. The signed transaction is saved for recovery.",
      );
    };
    try {
      await reconcile();
      for (let n = 0; n < 4; n++) {
        try {
          const result = await runInitialRelease({
            wallet: who,
            code,
            rent: plan.rent,
            readAccount,
            getSlot: () => call("getSlot", [{ commitment: "finalized" }]),
            execute,
            journal,
            save,
          });
          setMessage(
            "Enigma 2 deployment, code hash, authority and initialization verified. Public launches remain paused for the separately capped acceptance test.",
          );
          setPlan({ ...plan, result });
          break;
        } catch (e: any) {
          if (n < 3 && /next finalized slot|warming up/.test(e.message)) {
            setMessage("Waiting for the finalized deployment checkpoint…");
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          throw e;
        }
      }
    } catch (e: any) {
      setMessage(
        e.message ||
          "Deployment stopped safely. The saved journal is retained.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          enigma
        </a>
        <span>Local release console</span>
        <div className="header-actions">
          <WalletButton />
        </div>
      </header>
      <main
        className="docs-body"
        style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px" }}
      >
        <p className="eyebrow">LOCAL OPERATOR TOOL · SOLANA MAINNET</p>
        <h1>Deploy the reviewed release.</h1>
        <p>
          Keys stay in the connected wallet. That same wallet funds the
          deployment and retains upgrade authority. No second operator key,
          Sequence backend or private key upload is required.
        </p>
        <p>
          The program upload uses multiple small transactions. Each stage is
          simulated before wallet approval. Interrupted stages retain their
          exact signed transaction.
        </p>
        <button
          className="button quiet"
          disabled={!wallet || busy}
          onClick={() => void check()}
        >
          Check deployment inputs
        </button>
        {plan && (
          <section>
            <h2>Wallet review</h2>
            <dl>
              <dt>Funding wallet and authority</dt>
              <dd>
                <code>{wallet}</code>
              </dd>
              <dt>Deterministic program address</dt>
              <dd>
                <code>{plan.identity.program}</code>
              </dd>
              <dt>Reviewed code SHA-256</dt>
              <dd style={{ overflowWrap: "anywhere" }}>
                <code>{deployment.codeHash}</code>
              </dd>
              <dt>Conservative balance required</dt>
              <dd>{display(plan.cost.conservativeBalance)} SOL</dd>
              <dt>Retained account deposits</dt>
              <dd>{display(plan.cost.retained)} SOL</dd>
              <dt>Maximum network-fee allowance</dt>
              <dd>0.02 SOL</dd>
              <dt>Current balance</dt>
              <dd>{display(plan.balance)} SOL</dd>
            </dl>
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "start",
                margin: "25px 0",
              }}
            >
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
                disabled={busy}
              />
              I approve preparing this initial deployment with the displayed
              maximum funding envelope of{" "}
              {display(plan.cost.conservativeBalance)} SOL and no more than 0.02
              SOL in network fees. My wallet remains the upgrade authority. This
              does not authorize token launches or trades.
            </label>
            <button
              className="button primary"
              disabled={!approved || busy || !wallet}
              onClick={() => void run()}
            >
              {busy
                ? "Processing reviewed stage…"
                : "Deploy or resume reviewed release"}
            </button>
          </section>
        )}
        {message && (
          <p className="protocol-notice" role="status">
            {message}
          </p>
        )}
        <p>
          Publication stays paused. A funded public launch/buy/claim test and
          finalized receipt review must pass before customer actions are
          enabled.
        </p>
      </main>
    </>
  );
}
