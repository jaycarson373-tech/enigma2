import Brand from "@/components/brand";
import XLink from "@/components/x-link";
import { xProfileUrl } from "@/lib/site-links.mjs";
export const metadata = { title: "Field guide — IPO" };

export default function Docs() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav>
          <a href="/">Discover</a>
          <a href="/operations">Release status</a>
        </nav>
        <div className="header-actions">
          <XLink url={xProfileUrl(process.env.IPO_X_URL || process.env.OPENBELL_X_URL || process.env.ENIGMA_X_URL)} />
        </div>
      </header>
      <main className="docs-layout" id="main">
        <aside className="docs-nav">
          <a href="#opening">Timed openings</a>
          <a href="#allocation">Allocation</a>
          <a href="#claim">Claims</a>
          <a href="#custody">Custody</a>
        </aside>
        <article className="docs-body">
          <p className="eyebrow">THE IPO FIELD GUIDE</p>
          <h1>A little time. A shared beginning.</h1>
          <p className="lead">
            Pool STONK during a public window, then create the coin and make the
            pooled first buy in one transaction.
          </p>
          <section id="opening">
            <h2>01 / Set the opening</h2>
            <p>
              The creator supplies the name, ticker, hosted image and metadata,
              a whole-minute window from 1 to 60 minutes, and a per-wallet token
              cap from 0.1% to 10% of supply. Those terms lock when the window
              opens. An optional initial STONK deposit can be included in the
              same transaction.
            </p>
            <p>
              The pool accepts the STONK mint{" "}
              <code>6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx</code>, with
              nine decimals. SOL pays account rent and network fees. There is no
              automatic swap from SOL into STONK.
            </p>
            <p>
              The creator separately supplies a 0.02 SOL creation budget.
              Finalization reimburses observed setup costs within that budget
              and returns its unused portion to the original creator. Deposits
              themselves buy the new token.
            </p>
          </section>
          <span id="costs" />
          <section id="allocation">
            <h2>02 / Know your allocation</h2>
            <p>
              Deposits receive the next stretch of the locked initial Stonk
              curve. Later deposits can receive less token weight per STONK as
              the curve moves. A wallet’s cumulative weight must fit its chosen
              token-supply cap. Caps apply to wallet addresses; they do not
              establish that each wallet is a different person.
            </p>
            <p>
              The finalizer creates a fresh Token-2022 mint on Stonk.fun’s
              standard LaunchLab platform without a transfer-fee extension, then
              buys with pooled STONK atomically. The transaction verifies the
              actual token receipt, a minimum fill and the locked upper
              allocation bound. IPO adds no protocol fee. Stonk’s venue fees
              reduce the purchased tokens.
            </p>
          </section>
          <section id="claim">
            <h2>03 / Claim your share</h2>
            <p>
              After finalization, each position receives its share of the actual
              tokens purchased and any unused STONK, using its locked weight.
              Anyone can pay for finalization or a claim, but tokens and change
              go only to the recorded beneficiary. A completed position cannot
              claim twice. Integer rounding dust remains in the pool.
            </p>
            <p>
              The app preserves the exact signed transaction when a network
              response is uncertain. Recover that original signature before
              requesting another payment. Refreshing or reconnecting a wallet
              does not authorize a replacement transfer.
            </p>
          </section>
          <section id="custody">
            <h2>Custody and availability</h2>
            <p>
              Deposits are final. This release has no withdrawal or
              failed-launch refund instruction. A Stonk rule/config change or
              dependency failure can prevent finalization and strand funds,
              including the creation budget. There is no automatic funded
              finalizer; a wallet must finalize after the window closes.
            </p>
            <p>
              The deployment wallet retains upgrade authority. It is an explicit
              trust boundary because it can replace the program. Stonk’s program
              and configuration also have their own authorities. The app pauses
              when reviewed executable evidence changes. Hosted image and
              metadata availability depends on their storage provider.
            </p>
            <p>
              Public deposits open only after reviewed program deployment and
              funded acceptance. The <a href="/operations">operations page</a>{" "}
              records the current release state. No independent security audit
              or guaranteed launch result is claimed.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
