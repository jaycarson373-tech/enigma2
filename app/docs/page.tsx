import Link from "next/link";
import Icon from "@/components/icon";
import XLink from "@/components/x-link";
import { xProfileUrl } from "@/lib/site-links.mjs";
const items = [
  ["overview", "Overview"],
  ["lifecycle", "Lifecycle"],
  ["block-zero", "The first transaction"],
  ["allocation", "Allocation"],
  ["caps", "Wallet caps"],
  ["fees", "Fees"],
  ["custody", "Custody & finality"],
];
export default function Docs() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          <img src="/brand/enigma.svg" width="29" height="29" alt="" />
          enigma
        </a>
        <nav>
          <Link href="/">Explore</Link>
          <Link href="/?view=portfolio">Portfolio</Link>
          <Link href="/docs" aria-current="page">
            Docs
          </Link>
        </nav>
        <div className="header-actions">
          <span className="network">
            <i />
            Solana mainnet
          </span>
          <Link href="/?create=1" className="button primary">
            Launch a coin
            <Icon name="plus" size={14} />
          </Link>
          <XLink url={xProfileUrl(process.env.ENIGMA_X_URL)} />
        </div>
      </header>
      <div className="docs-layout">
        <aside className="docs-nav" aria-label="Documentation sections">
          {items.map(([id, label]) => (
            <a key={id} href={"#" + id}>
              {label}
            </a>
          ))}
          <a href="/operations">
            Technical reference
            <Icon name="arrow-up" size={11} />
          </a>
        </aside>
        <article className="docs-body">
          <p className="eyebrow">THE MECHANICS, WITHOUT THE MYSTERY.</p>
          <h1>
            Enigma docs<span>.</span>
          </h1>
          <p className="lead">
            From a public deposit window to a pooled first buy. Here’s what
            happens to the SOL, the tokens and the terms.
          </p>
          <section id="overview">
            <h2>Overview</h2>
            <p>
              Enigma is a launchpad on Solana. A launch starts as a public SOL
              pool, before its coin exists. Wallets join during a fixed window.
              At the close, a single transaction creates the Pump.fun coin and
              executes the pool’s first buy.
            </p>
            <p>
              The mint creation and first buy are atomic: either both execute,
              or neither does. That removes the gap between a separate token
              creation and the pool’s buy. It does not stop trading after the
              transaction lands.
            </p>
          </section>
          <section id="lifecycle">
            <h2>Lifecycle</h2>
            <ol>
              <li>
                <strong>Create the window.</strong> Publish the name, ticker,
                image, duration and wallet cap. Enigma supports windows from{" "}
                <strong>1 minute to 1 hour</strong>, including custom minute
                values. An optional creator deposit follows the same cap.
              </li>
              <li>
                <strong>Join the pool.</strong> Deposits enter that offering’s
                program-controlled vault. The cap is measured in tokens, not a
                fixed SOL amount.
              </li>
              <li>
                <strong>Make the first buy.</strong> Once the window closes, any
                wallet can finalize. The program creates the coin and spends the
                available buying budget in the same transaction. A private
                keeper is not required; Enigma does not promise an automatic
                keeper response time.
              </li>
              <li>
                <strong>Claim the allocation.</strong> Each depositor claims
                tokens bought for their position and their share of any unused
                change. A claim cannot be collected twice.
              </li>
              <li>
                <strong>Trade on the curve.</strong> The live market uses
                Pump.fun’s bonding curve. Enigma prepares supported SOL curve
                trades in-wallet. Migrated or otherwise unsupported markets link
                to their external Pump.fun market.
              </li>
            </ol>
            <p>
              A period close marks when finalization becomes possible. It is not
              a promise that a transaction will confirm at that exact second.
            </p>
          </section>
          <section id="block-zero">
            <h2>One transaction for the opening</h2>
            <p>
              A separate mint creation followed by a purchase leaves a gap in
              which another transaction can trade first. Enigma combines mint
              creation and the pool’s first buy in one atomic transaction.
              Another transaction cannot execute between those two operations.
            </p>
            <p>
              The purchased supply is allocated to participating wallets under
              the locked wallet caps. Each participant claims their recorded
              allocation; these are purchased tokens, not a free supply airdrop.
              Finalization and claims can be paid by another wallet, but Enigma
              does not currently include an automatic funded keeper. Bots can
              still participate, use several wallets or trade after the opening.
            </p>
          </section>
          <section id="allocation">
            <h2>How allocation works</h2>
            <p>
              Each deposit takes the next stretch of the curve. Earlier SOL can
              buy more tokens than later SOL. Enigma’s Launch Lens estimates
              that stretch before review. The contract records a no-fee curve
              weight, then distributes the actual purchased tokens
              proportionally. Pump.fun fees reduce the final fill.
            </p>
            <pre>{`position weight = curve tokens attributed to that wallet

claimed tokens = floor(tokens received × position weight / total weight)
returned change = floor(unspent change × position weight / total weight)`}</pre>
            <p>
              For illustration, a position representing 10% of the finalized
              weight receives 10% of the pool’s purchased tokens, rounded down
              in token base units. That is not necessarily 10% of the original
              SOL deposits. Estimates are not guaranteed fills.
            </p>
            <p>
              Small integer rounding remainders can remain in the vault. They
              are not fabricated as delivered tokens or returned change.
            </p>
          </section>
          <section id="caps">
            <h2>Wallet caps</h2>
            <p>
              The creator chooses a maximum token allocation per wallet. The cap
              is locked at creation. A 0.5% cap means a single wallet’s credited
              allocation cannot exceed 0.5% of the token supply under the
              protocol’s curve accounting.
            </p>
            <p>
              Because price changes along the curve, the SOL needed to reach
              that cap changes as the pool fills. A second deposit is checked
              against the wallet’s existing allocation, not a fresh cap.
            </p>
            <p>
              <strong>A wallet is not a verified person.</strong> Someone can
              use several wallets. The mechanism limits per-address
              concentration and makes the pooled opening observable; it does not
              guarantee human-only participation or eliminate bots.
            </p>
          </section>
          <section id="fees">
            <h2>Fees & creation budget</h2>
            <p>
              <strong>Enigma v1 adds no protocol or trading fee.</strong>{" "}
              Pump.fun’s applicable curve fees remain part of the pooled
              purchase.
            </p>
            <p>
              The creator supplies a separate{" "}
              <strong>0.02 SOL creation budget</strong>, plus pool-account rent.
              At finalization, the program reimburses the finalizer’s observed
              account costs up to that budget and returns the unused budget to
              the original creator. This is separate from deposited buying SOL
              and excludes the finalizer’s network fee.
            </p>
            <p>
              Depositors also pay their position-account rent; it returns to the
              recorded depositor when their allocation is claimed. A claim may
              require recipient token-account rent. Exact transaction effects
              and network costs are simulated in wallet review.
            </p>
            <p>
              The pooled buy must deliver at least 95% of its locked no-fee
              curve weight and no more than that weight. Initial curve reserves
              must still match the recorded terms. If either check fails, the
              entire mint-and-buy transaction rolls back.
            </p>
          </section>
          <section id="custody">
            <h2>Custody & finality</h2>
            <p>
              Coin images and metadata uploaded through Enigma use public Vercel
              Blob URLs with content-addressed names. The URI is reviewed before
              signing. Hosted files remain dependent on the hosting account;
              content-addressed naming is not immutable decentralized storage.
            </p>
            <p>
              <strong>
                Deposits are final and non-refundable under this protocol.
              </strong>{" "}
              There is no user withdrawal or cancellation path after committing.
              Do not deposit money you may need back before launch. An unspent
              sliver is change, not a general refund.
            </p>
            <p>
              SOL and purchased tokens sit in program-controlled,
              offering-specific vaults. Enigma’s web server does not hold a
              user’s wallet key. Transactions are prepared for the connected
              wallet, simulated, reviewed and signed by that wallet.
            </p>
            <p>
              The independent program has not been publicly deployed yet. Any
              upgrade authority selected at deployment must be published and
              controlled securely; upgradeable programs can be changed or
              closed. Pump.fun and its dependencies also retain their own
              upgrade risks. Enigma pins the reviewed deployment slot and code
              hash, and stops preparing transactions if that program version
              changes. This is an identity safeguard, not an independent
              security audit or a guarantee of the program’s safety.
            </p>
            <p>
              If confirmation is interrupted, Enigma saves the exact signed
              transaction under the wallet that signed it. It checks the
              original signature before offering a resend. It does not silently
              request a second payment for an unknown outcome.
            </p>
            <p>
              The launchboard lists verified Enigma accounts only. Historical
              Sequence launches are separate research fixtures and are not
              Enigma activity. Local VM transactions are never shown as live
              transactions.
            </p>
            <div className="docs-banner">
              <Icon name="book" size={18} />
              <span>
                Program addresses, deployment checks and test evidence are in
                the <a href="/operations">technical reference</a>.
              </span>
            </div>
          </section>
        </article>
      </div>
      <footer>
        <a className="brand" href="/">
          <img src="/brand/enigma.svg" width="21" height="21" alt="" />
          enigma
        </a>
        <span>A public window. A shared opening.</span>
        <div>
          <a href="/">Explore</a>
          <a href="/operations">Technical reference</a>
        </div>
      </footer>
    </>
  );
}
