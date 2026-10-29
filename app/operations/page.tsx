import Brand from "@/components/brand";
import { enigma2Release as release } from "@/lib/enigma2-release.mjs";
import XLink from "@/components/x-link";
import { xProfileUrl } from "@/lib/site-links.mjs";

export const metadata = { title: "Release ledger — Openbell" };

export default function Operations() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav>
          <a href="/">Discover</a>
          <a href="/docs">Field guide</a>
        </nav>
        <div className="header-actions">
          <XLink url={xProfileUrl(process.env.OPENBELL_X_URL || process.env.ENIGMA_X_URL)} />
        </div>
      </header>
      <main className="docs-layout" id="main">
        <aside className="docs-nav">
          <a href="#availability">Release state</a>
          <a href="#venue">Stonk.fun</a>
          <a href="#verification">Verification</a>
          <a href="#funding">Funding review</a>
        </aside>
        <article className="docs-body">
          <p className="eyebrow">OPENBELL / RELEASE LEDGER</p>
          <h1>Behind the bell.</h1>
          <p className="lead">
            STONK pools for Stonk.fun launches. The independent contract is
            built and locally tested.
          </p>
          <section id="availability">
            <h2>Release state</h2>
            <p>
              Artifact SHA-256: <code>{release.codeHash}</code> ·{" "}
              {release.codeBytes} bytes.
            </p>
            <p>
              The Openbell v2 artifact and STONK client are implemented. Isolated
              tests run the actual pinned Stonk LaunchLab binary through
              deposit, atomic mint-and-buy, both beneficiary claims and replay
              rejection. Mainnet deployment and funded public acceptance remain
              pending; public wallet actions are disabled.
            </p>
            <p>
              Openbell is the new product identity for this repository. The
              underlying v2 program retains its reviewed Enigma 2 identifiers
              and exact bytecode. The original Enigma 1 checkpoint remains
              preserved separately; its tests and estimates do not establish
              current readiness.
            </p>
          </section>
          <section id="venue">
            <h2>Stonk.fun only</h2>
            <p>
              Pool asset: STONK, with {release.quoteDecimals} decimals. SOL pays
              network fees and account rent. Launches will use Stonk.fun’s
              standard Raydium LaunchLab platform and its verified onchain
              rules.
            </p>
            <p>
              Quote mint: <code>{release.quoteMint}</code>
            </p>
            <p>
              LaunchLab program: <code>{release.launchlabProgram}</code>
            </p>
            <p>
              Standard platform: <code>{release.platform}</code>
            </p>
            <p>
              Venue accounts and rules must be checked again before a launch; a
              pricing response alone does not establish execution compatibility.
            </p>
          </section>
          <section id="verification">
            <h2>Required execution evidence</h2>
            <p>
              The new tests cover STONK escrow, wallet caps and allocation math,
              atomic Stonk mint-and-buy, actual token receipt, both claims,
              invalid account substitutions, rule changes, replay rejection and
              atomic rollback. These use synthetic balances in an isolated VM;
              they are not public transactions.
            </p>
            <p>
              The distinct v2 artifact is pinned by its code hash.
              Finalized deployed code, authority and configuration must next be
              verified, followed by a separately reviewed funded acceptance
              test. Launch transactions fit without a lookup table.
            </p>
          </section>
          <section id="funding">
            <h2>Funding review</h2>
            <p>
              The read-only v2 release planner quotes the compiled
              artifact against current mainnet rent. The wallet review shows the
              actual program recipient, retained deposits, temporary buffer and
              bounded network allowance before any signature.
            </p>
            <p>
              The funding wallet’s public address can be provided later. Its
              wallet will review the exact deployment and acceptance budgets
              before signing. No private key or seed phrase is needed by this
              application or chat.
            </p>
            <p>
              Production RPC and metadata-storage access must be verified for
              the v2 deployment. Server credentials stay in the hosting
              environment. Funding does not activate public deposits.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
