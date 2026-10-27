"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateKeyPairSigner } from "@solana/kit";
import WalletButton, { useEnigmaWallet } from "./wallet";
import Icon from "./icon";
import XLink from "./x-link";
import LaunchBlueprint from "./launch-blueprint";
import { units, raw, allocationEstimate, entitlement } from "@/lib/amounts.mjs";
import { WINDOW_PRESETS } from "@/lib/constants.mjs";
import {
  prepareWalletTransaction,
  signAndSend,
  loadPending,
  reconcile,
  retryOriginal,
  type Pending,
} from "@/lib/transactions";
const short = (s: string) => (s ? s.slice(0, 4) + "…" + s.slice(-4) : "—");
const compact = (n: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
const phases = ["Open pools", "On Pump.fun", "Graduated"];
function countdown(end: number, now: number) {
  const s = Math.max(0, end - now);
  return s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
const stage = (o: any) => (o.status === "open" ? 0 : o.poolVerified ? 2 : 1);
export default function Terminal({ visualFeed, xUrl }: { visualFeed?: any; xUrl?: string | null } = {}) {
  const { client, connected } = useEnigmaWallet();
  const wallet = connected?.account.address;
  const [page, setPage] = useState("board"),
    [feed, setFeed] = useState<any>(null),
    [ready, setReady] = useState<any>(null),
    [feedError, setFeedError] = useState(""),
    [query, setQuery] = useState(""),
    [onlyWatch, setOnlyWatch] = useState(false),
    [watch, setWatch] = useState<string[]>([]),
    [sort, setSort] = useState("closing"),
    [now, setNow] = useState(0),
    [lens, setLens] = useState<any>(null),
    [receipt, setReceipt] = useState<any>(null),
    [amount, setAmount] = useState("0.05"),
    [side, setSide] = useState<"buy" | "sell">("buy"),
    [slippage, setSlippage] = useState("1"),
    [review, setReview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<Pending | null>(null),
    [portfolio, setPortfolio] = useState<any>(null),
    [form, setForm] = useState({
      name: "",
      symbol: "",
      description: "",
      twitter: "",
      website: "",
      minutes: "3",
      capBps: "50",
      initialDeposit: "0",
      uri: "",
    }),
    [file, setFile] = useState<File | null>(null),
    [image, setImage] = useState(""),
    [mobilePhase, setMobilePhase] = useState(0);
  const chooseQuickWindow = useCallback(
    (minutes: string) => setForm((v) => ({ ...v, minutes })),
    [],
  );
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      setPage(
        params.has("create")
          ? "create"
          : params.get("view") === "portfolio"
            ? "portfolio"
            : "board",
      );
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const submitLock = useRef(false),
    previousWallet = useRef<string | undefined>(undefined);
  async function refresh() {
    if (visualFeed) {
      setFeed(visualFeed);
      setReady({
        writesEnabled: false,
        filingEnabled: false,
        releaseStatus: "fixture",
        reason:
          "LOCAL VISUAL FIXTURE · Synthetic layout data. Transactions are disabled.",
      });
      return;
    }
    const jobs = [
      [
        "/api/feed",
        (b: any) => {
          setFeed(b);
          setFeedError("");
        },
      ],
      ["/api/readiness", setReady],
    ] as const;
    await Promise.allSettled(
      jobs.map(async ([url, set]) => {
        try {
          const r = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
          const b = await r.json();
          if (!r.ok) throw Error(b.error || b.reason);
          set(b);
        } catch (e: any) {
          if (url === "/api/feed")
            setFeedError(
              "The launch feed is refreshing. Your last verified view is retained.",
            );
          else
            setReady((old: any) => ({
              ...old,
              writesEnabled: false,
              filingEnabled: false,
              reason: "Protocol verification is refreshing.",
            }));
        }
      }),
    );
  }
  useEffect(() => {
    try {
      const w = JSON.parse(localStorage.getItem("enigma:watchlist") || "[]");
      setWatch(Array.isArray(w) ? w.filter((x) => typeof x === "string") : []);
    } catch {
      setWatch([]);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("create")) setPage("create");
    else if (params.get("view") === "portfolio") setPage("portfolio");
    setNow(Math.floor(Date.now() / 1000));
    void refresh();
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000),
      poll = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 20000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, []);
  useEffect(() => {
    setReview(null);
    setMessage("");
    setPortfolio(null);
    setPending(wallet ? loadPending(wallet) : null);
    if (previousWallet.current && previousWallet.current !== wallet) {
      setForm({
        name: "",
        symbol: "",
        description: "",
        twitter: "",
        website: "",
        minutes: "3",
        capBps: "50",
        initialDeposit: "0",
        uri: "",
      });
      setFile(null);
      setImage("");
    }
    previousWallet.current = wallet;
    if (wallet) void refreshPortfolio(wallet);
  }, [wallet]);
  async function refreshPortfolio(w: string) {
    try {
      const r = await fetch("/api/portfolio?wallet=" + w, {
        cache: "no-store",
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setPortfolio(b);
    } catch {
      setPortfolio({
        error: "Wallet positions are refreshing. Retry shortly.",
      });
    }
  }
  useEffect(() => {
    if (
      !pending ||
      !["signed", "unknown", "confirming"].includes(pending.state)
    )
      return;
    const t = setInterval(() => {
      void reconcile(pending)
        .then((p) => {
          setPending({ ...p });
          if (["finalized", "effect-verified"].includes(p.state)) {
            void refresh();
            if (wallet) void refreshPortfolio(wallet);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [pending?.signature, pending?.state, wallet]);
  useEffect(() => {
    if (!lens && !review) return;
    const old = document.activeElement as HTMLElement | null;
    const nodes = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not(:disabled),[role="dialog"] a[href],[role="dialog"] input,[role="dialog"] select',
        ),
      );
    nodes()[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setReview(null);
        setLens(null);
      }
      if (e.key === "Tab") {
        const items = nodes(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      old?.focus();
    };
  }, [Boolean(lens), Boolean(review), busy]);
  const offers = feed?.offers || [];
  const filtered = offers.filter(
    (o: any) =>
      (!onlyWatch || watch.includes(o.address)) &&
      `${o.name} ${o.symbol} ${o.mint} ${o.creator}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const sorted = [...filtered].sort((a: any, b: any) =>
    sort === "pool"
      ? Number(BigInt(b.raised) - BigInt(a.raised))
      : sort === "new"
        ? b.createdAt - a.createdAt
        : stage(a) === 0 && stage(b) === 0
          ? a.closesAt - b.closesAt
          : b.createdAt - a.createdAt,
  );
  function toggleWatch(o: any) {
    const next = watch.includes(o.address)
      ? watch.filter((x) => x !== o.address)
      : [...watch, o.address];
    setWatch(next);
    try {
      localStorage.setItem("enigma:watchlist", JSON.stringify(next));
    } catch {
      setMessage(
        "Watchlist is available for this session. Browser storage is disabled.",
      );
    }
  }
  function navigate(next: string) {
    setPage(next);
    const url =
      next === "create"
        ? "/?create=1"
        : next === "portfolio"
          ? "/?view=portfolio"
          : "/";
    window.history.pushState(null, "", url);
    setMessage("");
    setReview(null);
    setLens(null);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  useEffect(() => {
    setReceipt(null);
    if (!lens || lens.status !== "launched") return;
    const controller = new AbortController();
    fetch("/api/receipt?offering=" + lens.address, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(setReceipt)
      .catch(() => {
        if (!controller.signal.aborted)
          setReceipt({
            verified: false,
            reason: "Receipt history is refreshing.",
          });
      });
    return () => controller.abort();
  }, [lens?.address]);
  function openLens(o: any) {
    setLens(o);
    setAmount("0.05");
    setReview(null);
    setMessage("");
  }
  function change(key: string, value: string) {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(["name", "symbol", "description", "twitter", "website"].includes(key)
        ? { uri: "" }
        : {}),
    }));
  }
  async function pickImage(f: File | null) {
    if (!f) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
      f.size > 2000000
    ) {
      setMessage("Choose a PNG, JPG or WebP under 2 MB.");
      return;
    }
    setFile(f);
    if (image) URL.revokeObjectURL(image);
    setImage(URL.createObjectURL(f));
    change("uri", "");
  }
  async function prepare(action: string, o?: any) {
    if (!connected?.signer) {
      setMessage("Connect your wallet to review this action.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      let data: any = { wallet, action, offering: o?.address };
      let mintSigner;
      if (action === "create") {
        let uri = form.uri;
        if (!uri) {
          if (!file) throw Error("Choose a coin image.");
          const fd = new FormData();
          fd.append("file", file);
          for (const k of [
            "name",
            "symbol",
            "description",
            "twitter",
            "website",
          ])
            fd.append(k, (form as any)[k]);
          const uploaded = await fetch("/api/upload", {
            method: "POST",
            body: fd,
          }).then(async (r) => {
            const b = await r.json();
            if (!r.ok) throw Error(b.error);
            return b;
          });
          uri = uploaded.uri;
          setForm((f) => ({ ...f, uri }));
        }
        data = { ...data, ...form, uri };
      } else if (action === "deposit") data.amount = amount;
      else if (action === "launch") {
        mintSigner = await generateKeyPairSigner();
        data.mint = mintSigner.address;
      } else if (action === "buy" || action === "sell")
        data = {
          ...data,
          mint: o.mint,
          symbol: o.symbol,
          amount,
          slippageBps: Math.round(Number(slippage) * 100),
        };
      const response = await fetch(
        action === "buy" || action === "sell" ? "/api/quote" : "/api/prepare",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const plan = await response.json();
      if (!response.ok) throw Error(plan.error);
      const prepared = await prepareWalletTransaction(
        connected.signer,
        plan,
        mintSigner,
      );
      setReview({ plan, prepared });
      setLens(null);
    } catch (e: any) {
      setMessage(
        e.message ||
          "This action could not be prepared. Nothing was submitted.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!review || !connected?.signer || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const p = await signAndSend(
        connected.signer,
        review.prepared,
        review.plan,
        () => client.wallet.getState().connected?.account.address,
      );
      setPending({ ...p });
      setReview(null);
      if (["finalized", "effect-verified"].includes(p.state)) {
        void refresh();
        if (wallet) void refreshPortfolio(wallet);
        if (p.action === "create") navigate("portfolio");
      }
    } catch (e: any) {
      setMessage(
        e.message || "Wallet approval cancelled. Your inputs are saved.",
      );
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  let estimate: string | null = null;
  try {
    if (lens?.status === "open")
      estimate = units(allocationEstimate(lens, raw(amount)), 6);
  } catch {}
  const activeLens = lens
    ? offers.find((o: any) => o.address === lens.address) || lens
    : null;
  const avatar = (o: any, size = "") => (
    <span className={"coin-avatar " + size}>
      {o.image ? (
        <img
          src={o.image}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span>{o.symbol.slice(0, 2)}</span>
      )}
    </span>
  );
  return (
    <div className="terminal">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header
        className={"site-header " + (page === "board" ? "terminal-header" : "")}
      >
        <a className="brand" href="/">
          <img src="/brand/enigma.svg" width="29" height="29" alt="" />
          enigma
          <span className="brand-dot" />
          <small className="brand-category">LAUNCHPAD</small>
        </a>
        <nav aria-label="Primary navigation">
          <button
            aria-current={page === "board" ? "page" : undefined}
            onClick={() => navigate("board")}
          >
            Explore
          </button>
          <button
            aria-current={page === "portfolio" ? "page" : undefined}
            onClick={() => navigate("portfolio")}
          >
            Portfolio
          </button>
          <a href="/docs">Docs</a>
        </nav>
        <div className="header-actions">
          <span className="network">
            <i />
            Solana
          </span>
          <button
            className="button primary header-create"
            aria-label="Launch a coin"
            onClick={() => navigate("create")}
          >
            <Icon name="plus" size={15} />
            <span className="create-label">Launch a coin</span>
          </button>
          <WalletButton />
          <XLink url={xUrl} />
        </div>
      </header>
      <main
        id="main"
        className={page === "board" ? "terminal-main" : undefined}
      >
        {visualFeed && (
          <div className="protocol-notice" role="status">Local visual fixture · sample activity · transactions disabled.</div>
        )}
        {page === "board" && (
          <>
            <section className="stats" aria-label="Verified protocol activity">
              <div>
                <span>
                  SOL pooled <small>ENIGMA TOTAL</small>
                </span>
                <strong>
                  {feed ? units(feed.stats.pooledRaw) : "—"}
                  <em>SOL</em>
                </strong>
              </div>
              <div>
                <span>Launch windows</span>
                <strong>
                  {feed ? feed.stats.launches : "—"}
                  <em>published onchain</em>
                </strong>
              </div>
              <div>
                <span>Coins launched</span>
                <strong>
                  {feed
                    ? offers.filter((o: any) => o.status === "launched").length
                    : "—"}
                  <em>completed launches</em>
                </strong>
              </div>
              <div>
                <span>Wallet participations</span>
                <strong>
                  {feed ? feed.stats.participations : "—"}
                  <em>across launch pools</em>
                </strong>
              </div>
            </section>
            <section
              className="discovery"
              id="launches"
              aria-label="Explore Enigma launches"
            >
              <div className="board-toolbar">
                <div className="scope-title">
                  <div className="board-title">
                    <h1 id="launchpad-title">Enigma Scope</h1>
                    <span className="count">
                      {feed ? filtered.length : "…"}
                    </span>
                  </div>
                  <p>Pool SOL for a timed opening. Create the coin and make the first buy together.</p>
                </div>
                <div className="board-controls">
                  <details className="opening-explainer">
                    <summary>
                      <Icon name="book" size={14} /> How the opening works{" "}
                      <Icon name="chevron" size={12} />
                    </summary>
                    <div>
                      <b>Before the first trade.</b>
                      <p>
                        A public 1–60 minute window pools SOL before the coin
                        exists. At close, one transaction creates the coin and
                        makes the pool’s first buy. Participants claim the
                        tokens purchased for them, subject to locked wallet
                        caps.
                      </p>
                      <p>
                        This closes the gap between mint creation and the pooled
                        first buy. It does not eliminate bots, multi-wallet
                        participation or later trading.
                      </p>
                      <a href="/docs#allocation">
                        Allocation and custody rules{" "}
                        <Icon name="arrow-up" size={12} />
                      </a>
                    </div>
                  </details>
                  <label className="search">
                    <Icon name="search" size={15} />
                    <input
                      aria-label="Search launches"
                      placeholder="Search ticker, mint or creator"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </label>
                  <button
                    className={"icon-button " + (onlyWatch ? "active" : "")}
                    aria-label="Show watchlist"
                    aria-pressed={onlyWatch}
                    onClick={() => setOnlyWatch((v) => !v)}
                  >
                    <Icon name="star" size={17} />
                  </button>
                  <label className="sort-label">
                    Sort
                    <select
                      aria-label="Sort launches"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="closing">Closing first</option>
                      <option value="new">Newest</option>
                      <option value="pool">Pool size</option>
                    </select>
                  </label>
                  <button
                    className="icon-button"
                    aria-label="Refresh launches"
                    onClick={() => void refresh()}
                  >
                    <Icon name="refresh" size={16} />
                  </button>
                </div>
              </div>
              <div
                className="mobile-phases"
                role="tablist"
                aria-label="Launch stage"
              >
                {phases.map((p, i) => (
                  <button
                    key={p}
                    role="tab"
                    aria-selected={mobilePhase === i}
                    onClick={() => setMobilePhase(i)}
                  >
                    {p}{" "}
                    <small>
                      {feed
                        ? filtered.filter((o: any) => stage(o) === i).length
                        : "…"}
                    </small>
                  </button>
                ))}
              </div>
              <div className="launch-board">
                {phases.map((phase, i) => (
                  <section
                    key={phase}
                    className={
                      "lane " + (mobilePhase === i ? "mobile-selected" : "")
                    }
                  >
                    <header>
                      <div>
                        <span className={"phase-icon phase-" + i}>
                          <Icon
                            name={
                              i === 0
                                ? "clock"
                                : i === 1
                                  ? "activity"
                                  : "arrow-up"
                            }
                            size={14}
                          />
                        </span>
                        <h3>{phase}</h3>
                        <span>
                          {feed
                            ? filtered.filter((o: any) => stage(o) === i).length
                            : "…"}
                        </span>
                      </div>
                      <small>
                        {i === 0
                          ? "DEPOSIT WINDOW"
                          : i === 1
                            ? "PUMP.FUN"
                            : "PUMPSWAP"}
                      </small>
                    </header>
                    <div
                      className="lane-cards"
                      role="region"
                      aria-label={phase + " launch listings"}
                      tabIndex={0}
                    >
                      {!feed && !feedError ? (
                        [1, 2, 3].slice(0, i === 2 ? 1 : 3).map((n) => (
                          <div className="skeleton-card" key={n}>
                            <i />
                            <span />
                            <span />
                            <span />
                          </div>
                        ))
                      ) : sorted.filter((o: any) => stage(o) === i).length ? (
                        sorted
                          .filter((o: any) => stage(o) === i)
                          .map((o: any) => {
                            const closing = o.closesAt <= now;
                            const progress = o.curve
                              ? Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    (1 -
                                      Number(o.curve.realToken) /
                                        Number(o.curveSupply)) *
                                      100,
                                  ),
                                )
                              : (Number(o.totalWeight) /
                                  Number(o.curveSupply)) *
                                100;
                            return (
                              <article className="launch-card" key={o.address}>
                                <div className="card-top">
                                  <button
                                    className="coin-identity"
                                    onClick={() => openLens(o)}
                                  >
                                    {avatar(o)}
                                    <span>
                                      <b>{o.symbol}</b>
                                      <span>{o.name}</span>
                                    </span>
                                  </button>
                                  <button
                                    className={
                                      "watch " +
                                      (watch.includes(o.address) ? "saved" : "")
                                    }
                                    aria-label={
                                      (watch.includes(o.address)
                                        ? "Remove "
                                        : "Watch ") + o.symbol
                                    }
                                    aria-pressed={watch.includes(o.address)}
                                    onClick={() => toggleWatch(o)}
                                  >
                                    <Icon name="star" size={14} />
                                  </button>
                                </div>
                                <div className="creator-line">
                                  <span>
                                    {Math.max(
                                      0,
                                      Math.floor(
                                        (now - (o.launchedAt || o.createdAt)) /
                                          60,
                                      ),
                                    )}
                                    m ago
                                  </span>
                                  <span>by {short(o.creator)}</span>
                                  {o.twitter && (
                                    <a
                                      href={o.twitter}
                                      aria-label={o.symbol + " on X"}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      X
                                    </a>
                                  )}
                                </div>
                                <div className="card-main">
                                  <div>
                                    <span>
                                      {i === 0
                                        ? "Pool committed"
                                        : "Market cap"}
                                    </span>
                                    <b>
                                      {i === 0
                                        ? units(o.raised)
                                        : o.curve
                                          ? compact(
                                              ((Number(o.curve.vSol) /
                                                Number(o.curve.vToken)) *
                                                Number(o.curve.supply)) /
                                                1e9,
                                            )
                                          : "Indexing"}{" "}
                                      <small>
                                        {(i === 0 || o.curve) && "SOL"}
                                      </small>
                                    </b>
                                  </div>
                                  {i === 0 ? (
                                    <span
                                      className={
                                        "window-timer " +
                                        (closing ? "closed" : "")
                                      }
                                    >
                                      <Icon name="clock" size={13} />
                                      {closing
                                        ? "Ready to launch"
                                        : countdown(o.closesAt, now)}
                                    </span>
                                  ) : (
                                    <span className="curve-percent">
                                      {o.curve
                                        ? `${progress.toFixed(1)}%`
                                        : "—"}
                                      <small>bonded</small>
                                    </span>
                                  )}
                                </div>
                                <div className="progress-track">
                                  <span
                                    style={{
                                      width: Math.min(100, progress) + "%",
                                    }}
                                  />
                                </div>
                                <div className="card-bottom">
                                  <span>
                                    <Icon name="holders" size={12} />
                                    {o.backers}
                                  </span>
                                  <span>
                                    {i === 0
                                      ? `${o.capBps / 100}% cap`
                                      : `Pool ${units(o.raised)} SOL`}
                                  </span>
                                  <button
                                    className={i === 0 ? "join" : "trade"}
                                    onClick={() => openLens(o)}
                                  >
                                    {i === 0
                                      ? closing
                                        ? "Launch"
                                        : "Join"
                                      : "Trade"}
                                    <Icon name="arrow" size={13} />
                                  </button>
                                </div>
                                <button
                                  className="mint-link"
                                  onClick={() =>
                                    void navigator.clipboard
                                      .writeText(
                                        o.status === "launched"
                                          ? o.mint
                                          : o.address,
                                      )
                                      .then(() => setMessage("Address copied."))
                                  }
                                >
                                  {short(
                                    o.status === "launched"
                                      ? o.mint
                                      : o.address,
                                  )}
                                  <Icon name="copy" size={10} />
                                </button>
                              </article>
                            );
                          })
                      ) : (
                        <div className="lane-empty">
                          <span className="empty-icon">
                            <Icon
                              name={
                                i === 0
                                  ? "clock"
                                  : i === 1
                                    ? "activity"
                                    : "arrow-up"
                              }
                              size={23}
                            />
                          </span>
                          <h4>
                            {query || onlyWatch
                              ? "No matches here"
                              : i === 0
                                ? "No open pools yet."
                                : i === 1
                                  ? "No coins on the curve yet."
                                  : "No graduated coins yet."}
                          </h4>
                          <p>
                            {query || onlyWatch
                              ? "Try another filter or reset your search."
                              : i === 0
                                ? "Create a timed window for your community’s pooled first buy."
                                : i === 1
                                  ? "Completed first buys appear here."
                                  : "Verified PumpSwap migrations appear here."}
                          </p>
                          {i === 0 && (
                            <button
                              className="text-button"
                              onClick={() => navigate("create")}
                            >
                              Create a launch <Icon name="arrow" size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
              {feedError && (
                <div className="feed-message" role="status">
                  {feedError}
                  <button
                    className="text-button"
                    onClick={() => void refresh()}
                  >
                    Retry
                  </button>
                </div>
              )}
              <div className="feed-source">
                <span>
                  <i />
                  Enigma launch accounts · Solana mainnet
                </span>
                <span>
                  {feed?.checkedAt
                    ? "Updated " +
                      new Date(feed.checkedAt).toISOString().slice(11, 19) +
                      " UTC"
                    : "Checking network activity"}
                </span>
              </div>
            </section>
            <section
              className="how-strip"
              aria-label="How an Enigma launch works"
            >
              <div>
                <span>01</span>
                <h3>Set the terms.</h3>
                <p>Choose the window and cap. Lock them when you publish.</p>
              </div>
              <div>
                <span>02</span>
                <h3>Make one opening.</h3>
                <p>
                  After close, anyone can finalize the mint and pooled buy
                  together.
                </p>
              </div>
              <div>
                <span>03</span>
                <h3>Take your allocation.</h3>
                <p>Claim your tokens and any unspent change.</p>
              </div>
              <a href="/docs">
                Know the mechanics
                <Icon name="arrow-up" size={16} />
              </a>
            </section>
          </>
        )}
        {page === "create" && (
          <section className="create-page">
            <button className="back-link" onClick={() => navigate("board")}>
              <Icon name="arrow" size={13} />
              Explore launches
            </button>
            <div className="create-heading">
              <p className="eyebrow">ENIGMA / CREATE A LAUNCH</p>
              <h1>
                Launch on <span>Enigma.</span>
              </h1>
              <p>
                Set a 1–60 minute window and a wallet cap. Participants fund one
                pooled first buy, with the terms locked before they join.
              </p>
            </div>
            <nav className="create-stage-rail" aria-label="Creation steps">
              <a href="#coin-details">
                <b>01</b> Coin details
              </a>
              <i />
              <a href="#launch-terms">
                <b>02</b> Launch terms
              </a>
              <i />
              <span>
                <b>03</b> Wallet review
              </span>
            </nav>
            <div className="create-grid">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void prepare("create");
                }}
              >
                <section className="form-section" id="coin-details">
                  <div className="form-section-title">
                    <span>01</span>
                    <h2>The coin</h2>
                  </div>
                  <div className="identity-fields">
                    <label className="image-upload">
                      {image ? (
                        <img src={image} alt="Coin preview" />
                      ) : (
                        <>
                          <Icon name="plus" size={23} />
                          <span>Add image</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Upload coin image"
                        onChange={(e) =>
                          void pickImage(e.target.files?.[0] || null)
                        }
                      />
                    </label>
                    <div>
                      <label>
                        Coin name
                        <input
                          required
                          maxLength={32}
                          placeholder="Name your coin"
                          value={form.name}
                          onChange={(e) => change("name", e.target.value)}
                        />
                      </label>
                      <label>
                        Ticker
                        <input
                          required
                          maxLength={10}
                          placeholder="e.g. enigma"
                          value={form.symbol}
                          onChange={(e) => change("symbol", e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                  <label>
                    Description
                    <textarea
                      maxLength={1000}
                      placeholder="What is the coin about?"
                      value={form.description}
                      onChange={(e) => change("description", e.target.value)}
                    />
                  </label>
                  <div className="field-pair">
                    <label>
                      X link <small>optional</small>
                      <input
                        type="url"
                        placeholder="https://x.com/…"
                        value={form.twitter}
                        onChange={(e) => change("twitter", e.target.value)}
                      />
                    </label>
                    <label>
                      Website <small>optional</small>
                      <input
                        type="url"
                        placeholder="https://…"
                        value={form.website}
                        onChange={(e) => change("website", e.target.value)}
                      />
                    </label>
                  </div>
                </section>
                <section className="form-section" id="launch-terms">
                  <div className="form-section-title">
                    <span>02</span>
                    <h2>The opening</h2>
                  </div>
                  <details className="create-window-dial">
                    <summary>
                      Quick window settings <Icon name="chevron" size={13} />
                    </summary>
                    <LaunchBlueprint
                      minutes={form.minutes}
                      capBps={form.capBps}
                      onMinutes={chooseQuickWindow}
                    />
                  </details>
                  <label>
                    Deposit window
                    <span className="label-detail">1 minute to 1 hour</span>
                  </label>
                  <div className="duration-presets">
                    {WINDOW_PRESETS.map((m) => (
                      <button
                        type="button"
                        aria-pressed={Number(form.minutes) === m}
                        key={m}
                        onClick={() => change("minutes", String(m))}
                      >
                        {m === 60 ? "1 hr" : `${m}m`}
                      </button>
                    ))}
                  </div>
                  <div className="field-pair">
                    <label>
                      Custom window <small>minutes</small>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        step={1}
                        value={form.minutes}
                        onChange={(e) => change("minutes", e.target.value)}
                      />
                    </label>
                    <label>
                      Maximum per wallet
                      <select
                        value={form.capBps}
                        onChange={(e) => change("capBps", e.target.value)}
                      >
                        {[25, 50, 100, 200].map((b) => (
                          <option key={b} value={b}>
                            {b / 100}% of supply
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Your first deposit <small>optional · SOL</small>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.initialDeposit}
                      onChange={(e) => change("initialDeposit", e.target.value)}
                    />
                  </label>
                  <p className="field-help">
                    Your deposit follows the same wallet cap as everyone else.
                    This is part of the pool, separate from launch costs.
                  </p>
                </section>
                <p className="field-help">
                  The window and wallet cap lock at creation. <a href="/docs#custody">Deposit terms</a>
                </p>
                <button
                  type="submit"
                  className="button primary full"
                  disabled={busy || !ready?.filingEnabled}
                >
                  {busy ? "Preparing your review…" : ready?.filingEnabled ? "Review launch" : "Launches not active"}
                  <Icon name="arrow" size={16} />
                </button>
                {!ready?.filingEnabled && (
                  <p className="action-help">
                    {ready?.releaseStatus === "built-not-deployed" ? (
                      <a href="/operations#funding">Program deployment required</a>
                    ) : ready?.reason || "Checking launch availability…"}
                  </p>
                )}
              </form>
              <aside className="launch-preview">
                <div className="preview-heading">
                  <span>LAUNCH LENS</span>
                  <Icon name="search" size={16} />
                </div>
                <div className="preview-coin">
                  {image ? (
                    <img src={image} alt="" />
                  ) : (
                    <span>{form.symbol.slice(0, 2) || "E"}</span>
                  )}
                  <div>
                    <b>{form.symbol || "Your ticker"}</b>
                    <span>{form.name || "Your coin name"}</span>
                  </div>
                </div>
                <div className="window-visual">
                  <div className="window-dots">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>
                    {form.minutes || "—"} <small>MINUTE WINDOW</small>
                  </span>
                  <div className="window-path">
                    <span>Opens</span>
                    <span>First buy</span>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Wallet cap</dt>
                    <dd>{Number(form.capBps) / 100}% of supply</dd>
                  </div>
                  <div>
                    <dt>Trading pair</dt>
                    <dd>{form.symbol || "COIN"} / SOL</dd>
                  </div>
                  <div>
                    <dt>Creation budget</dt>
                    <dd>0.02 SOL</dd>
                  </div>
                  <div>
                    <dt>Protocol accounts</dt>
                    <dd>Rent shown in review</dd>
                  </div>
                  <div>
                    <dt>Creator fee</dt>
                    <dd>Pump.fun standard</dd>
                  </div>
                </dl>
                <p>
                  One public pool. One atomic opening.
                  <br />
                  No added Enigma trading fee. Unused creation budget returns to
                  the creator.
                </p>
                <a href="/docs#fees">
                  Understand the costs <Icon name="arrow-up" size={12} />
                </a>
              </aside>
            </div>
          </section>
        )}
        {page === "portfolio" && (
          <section className="portfolio-page">
            <p className="eyebrow">YOUR PLACE IN THE OPENING.</p>
            <h1>
              Portfolio<span>.</span>
            </h1>
            <p>
              Launches you created, pools you joined and allocations ready to
              claim.
            </p>
            {!wallet ? (
              <div className="large-empty">
                <Icon name="wallet" size={30} />
                <h2>Connect to see your positions.</h2>
                <WalletButton />
              </div>
            ) : portfolio?.error ? (
              <div className="large-empty">
                <p>{portfolio.error}</p>
                <button
                  className="button secondary"
                  onClick={() => void refreshPortfolio(wallet)}
                >
                  Retry
                </button>
              </div>
            ) : !portfolio ? (
              <div className="portfolio-loading">
                Checking your onchain positions…
              </div>
            ) : (
              <>
                <div className="portfolio-tabs">
                  <h2>
                    Your allocations <span>{portfolio.positions.length}</span>
                  </h2>
                  <button
                    className="icon-button"
                    aria-label="Refresh wallet positions"
                    onClick={() => void refreshPortfolio(wallet)}
                  >
                    <Icon name="refresh" size={16} />
                  </button>
                </div>
                {portfolio.positions.length ? (
                  portfolio.positions.map(
                    ({ offering: o, position: p }: any) => {
                      const e = entitlement(o, p);
                      return (
                        <article className="portfolio-position" key={o.address}>
                          <div className="coin-identity">
                            {avatar(o)}
                            <span>
                              <b>{o.symbol}</b>
                              <span>{o.name}</span>
                            </span>
                          </div>
                          <div>
                            <small>Committed</small>
                            <b>{units(p.committed)} SOL</b>
                          </div>
                          <div>
                            <small>
                              {o.status === "launched"
                                ? "Claimable tokens"
                                : "Allocation weight"}
                            </small>
                            <b>
                              {compact(
                                Number(
                                  o.status === "launched" ? e.tokens : p.weight,
                                ) / 1e6,
                              )}
                            </b>
                          </div>
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() =>
                              o.status === "launched"
                                ? void prepare("claim", o)
                                : openLens(o)
                            }
                          >
                            {o.status === "launched"
                              ? "Review claim"
                              : "View pool"}
                            <Icon name="arrow" size={14} />
                          </button>
                        </article>
                      );
                    },
                  )
                ) : (
                  <div className="large-empty compact">
                    <Icon name="vault" size={25} />
                    <h3>No unclaimed positions.</h3>
                    <p>Your next opening is on the launchboard.</p>
                    <button
                      className="text-button"
                      onClick={() => navigate("board")}
                    >
                      Explore launches
                      <Icon name="arrow" size={14} />
                    </button>
                  </div>
                )}
                <h2 className="created-title">Created by you</h2>
                {portfolio.created.length ? (
                  portfolio.created.map((o: any) => (
                    <button
                      key={o.address}
                      className="created-row"
                      onClick={() => openLens(o)}
                    >
                      {avatar(o)}
                      <span>
                        <b>{o.symbol}</b>
                        <small>{o.name}</small>
                      </span>
                      <span>
                        {o.status === "open" ? "Window open" : "Launched"}
                      </span>
                      <Icon name="arrow" size={15} />
                    </button>
                  ))
                ) : (
                  <p className="muted">
                    No verified launches from this wallet.
                  </p>
                )}
              </>
            )}
          </section>
        )}
        {pending && (
          <div className="transaction-status" role="status">
            <Icon
              name={
                ["finalized", "effect-verified"].includes(pending.state)
                  ? "check"
                  : "clock"
              }
              size={18}
            />
            <div>
              <b>
                {["finalized", "effect-verified"].includes(pending.state)
                  ? "Confirmed onchain"
                  : pending.state === "failed"
                    ? "Transaction failed"
                    : pending.state === "expired"
                      ? "Review expired"
                      : pending.state === "history-check"
                        ? "Original receipt needs reconciliation"
                        : "Checking your original transaction"}
              </b>
              <a
                href={"https://solscan.io/tx/" + pending.signature}
                target="_blank"
                rel="noreferrer"
              >
                {short(pending.signature)}
                <Icon name="arrow-up" size={11} />
              </a>
            </div>
            {!["finalized", "effect-verified", "failed", "expired"].includes(
              pending.state,
            ) && (
              <button
                className="text-button"
                onClick={() =>
                  void retryOriginal(pending)
                    .then((p) => setPending({ ...p }))
                    .catch(() =>
                      setMessage(
                        "Still checking the same signature. No new payment requested.",
                      ),
                    )
                }
              >
                Check original
              </button>
            )}
            {["finalized", "effect-verified"].includes(pending.state) &&
              pending.offering && (
                <button
                  className="text-button"
                  onClick={() => {
                    const o = offers.find(
                      (o: any) => o.address === pending.offering,
                    );
                    if (o) openLens(o);
                    else void refresh();
                  }}
                >
                  View launch
                  <Icon name="arrow" size={12} />
                </button>
              )}
          </div>
        )}
      </main>
      <footer>
        <a className="brand" href="/">
          <img src="/brand/enigma.svg" width="21" height="21" alt="" />
          enigma
        </a>
        <span>A public window. A shared opening.</span>
        <div>
          <a href="/docs">Docs</a>
          <a href="/docs#custody">Custody & rules</a>
          <span>Enigma launchpad · Solana</span>
        </div>
      </footer>
      {message && (
        <div className="toast" role="status">
          <Icon name="activity" size={17} />
          <p>{message}</p>
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {activeLens && !review && (
        <div className="modal-backdrop" onClick={() => !busy && setLens(null)}>
          <section
            className="lens-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lens-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <span className="eyebrow">LAUNCH LENS</span>
              <button
                className="icon-button"
                aria-label="Close launch details"
                onClick={() => setLens(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="lens-identity">
              {avatar(activeLens, "large")}
              <div>
                <h2 id="lens-title">{activeLens.name}</h2>
                <p>
                  ${activeLens.symbol}
                  <span>
                    {activeLens.status === "open"
                      ? "Deposit window"
                      : "Pump.fun market"}
                  </span>
                </p>
              </div>
            </div>
            <div className="mint-copy">
              <code>
                {activeLens.status === "launched"
                  ? activeLens.mint
                  : activeLens.address}
              </code>
              <button
                aria-label="Copy launch address"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(
                      activeLens.status === "launched"
                        ? activeLens.mint
                        : activeLens.address,
                    )
                    .then(() => setMessage("Address copied."))
                }
              >
                <Icon name="copy" size={13} />
              </button>
            </div>
            {activeLens.description && (
              <p className="coin-description">{activeLens.description}</p>
            )}
            <div className="lens-stats">
              <div>
                <small>Pool committed</small>
                <b>{units(activeLens.raised)} SOL</b>
              </div>
              <div>
                <small>Wallet cap</small>
                <b>{activeLens.capBps / 100}%</b>
              </div>
              <div>
                <small>Participations</small>
                <b>{activeLens.backers}</b>
              </div>
            </div>
            {activeLens.status === "open" ? (
              <>
                {activeLens.closesAt > now ? (
                  <>
                    <div className="window-close">
                      <span>Window closes in</span>
                      <b>{countdown(activeLens.closesAt, now)}</b>
                    </div>
                    <label className="amount-input">
                      Your deposit<span>SOL</span>
                      <input
                        inputMode="decimal"
                        aria-label="Deposit SOL"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </label>
                    <div className="quick-amounts">
                      {["0.025", "0.05", "0.1"].map((a) => (
                        <button key={a} onClick={() => setAmount(a)}>
                          {a} SOL
                        </button>
                      ))}
                    </div>
                    <dl className="lens-calculation">
                      <div>
                        <dt>Estimated allocation</dt>
                        <dd>
                          {estimate ? compact(Number(estimate)) : "—"}{" "}
                          {activeLens.symbol}
                        </dd>
                      </div>
                      <div>
                        <dt>Enigma protocol fee</dt>
                        <dd>0% · Pump.fun fees apply</dd>
                      </div>
                    </dl>
                    <button
                      className="button primary full"
                      disabled={busy || !ready?.writesEnabled}
                      onClick={() => void prepare("deposit", activeLens)}
                    >
                      {busy ? "Preparing review…" : "Review deposit"}
                      <Icon name="arrow" size={16} />
                    </button>
                    <p className="lens-note">
                      Deposits are final. Earlier deposits buy an earlier
                      stretch of the curve. The contract enforces the token cap.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="ready-panel">
                      <Icon name="check" size={23} />
                      <h3>The window is closed.</h3>
                      <p>
                        Any wallet can finalize the coin and pooled first buy in
                        one atomic transaction.
                      </p>
                    </div>
                    <button
                      className="button primary full"
                      disabled={busy || !ready?.writesEnabled}
                      onClick={() => void prepare("launch", activeLens)}
                    >
                      {busy ? "Preparing launch…" : "Review launch transaction"}
                      <Icon name="arrow" size={15} />
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="trade-tabs">
                  {(["buy", "sell"] as const).map((s) => (
                    <button
                      key={s}
                      aria-pressed={side === s}
                      onClick={() => {
                        setSide(s);
                        setAmount(s === "buy" ? "0.05" : "1000");
                      }}
                    >
                      {s === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
                <label className="amount-input">
                  {side === "buy" ? "You pay" : "You sell"}
                  <span>{side === "buy" ? "SOL" : activeLens.symbol}</span>
                  <input
                    aria-label="Trade amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="slippage">
                  Slippage
                  <select
                    aria-label="Slippage"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                  >
                    {["0.5", "1", "2", "3", "5"].map((s) => (
                      <option key={s} value={s}>
                        {s}%
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary full"
                  disabled={
                    busy || !ready?.writesEnabled || activeLens.curve?.complete
                  }
                  onClick={() => void prepare(side, activeLens)}
                >
                  {busy ? "Getting exact quote…" : `Review ${side}`}
                  <Icon name="arrow" size={15} />
                </button>
                <a
                  href={"https://pump.fun/coin/" + activeLens.mint}
                  className="external-market"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Pump.fun market <Icon name="arrow-up" size={13} />
                </a>
              </>
            )}
            {!ready?.writesEnabled && (
              <p className="lens-note">
                {ready?.reason || "Protocol verification is refreshing."}
              </p>
            )}
            {activeLens.status === "launched" && (
              <div className="receipt-proof">
                {receipt?.verified ? (
                  <>
                    <Icon name="check" size={14} />
                    <a
                      href={"https://solscan.io/tx/" + receipt.signature}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Atomic launch receipt <Icon name="arrow-up" size={12} />
                    </a>
                    <small>Finalized · slot {receipt.slot}</small>
                  </>
                ) : (
                  <small>
                    {receipt?.reason || "Looking up the launch receipt…"}
                  </small>
                )}
              </div>
            )}
            <details className="lens-evidence">
              <summary>
                Policy & onchain evidence
                <Icon name="chevron" size={13} />
              </summary>
              <p>
                Trading pair: {activeLens.symbol} / SOL. Custody: Enigma v1
                program escrow. Wallet caps apply per address; they do not
                verify unique people.
              </p>
              <a
                href={"https://solscan.io/account/" + activeLens.address}
                target="_blank"
                rel="noreferrer"
              >
                View pool account
                <Icon name="arrow-up" size={12} />
              </a>
              {activeLens.status === "launched" && (
                <a
                  href={"https://solscan.io/token/" + activeLens.mint}
                  target="_blank"
                  rel="noreferrer"
                >
                  View token mint
                  <Icon name="arrow-up" size={12} />
                </a>
              )}
            </details>
          </section>
        </div>
      )}
      {review && (
        <div className="modal-backdrop">
          <section
            className="review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
          >
            <header>
              <span className="eyebrow">EXACT WALLET REVIEW</span>
              <button
                className="icon-button"
                aria-label="Close wallet review"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                <Icon name="close" />
              </button>
            </header>
            <h2 id="review-title">
              {review.plan.action === "create"
                ? "Open this window."
                : review.plan.action === "deposit"
                  ? "Join this opening."
                  : review.plan.action === "claim"
                    ? "Claim your allocation."
                    : review.plan.action === "launch"
                      ? "Make the first buy."
                      : "Review your trade."}
            </h2>
            <span className="simulation-good">
              <Icon name="check" size={13} />
              Simulation passed · Solana mainnet
            </span>
            <dl>
              <div>
                <dt>Wallet</dt>
                <dd title={review.plan.wallet}>{short(review.plan.wallet)}</dd>
              </div>
              {Object.entries(review.plan.details).map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {(
                      {
                        name: "Coin name",
                        symbol: "Ticker",
                        duration: "Window · seconds",
                        capBps: "Wallet cap · basis points",
                        initialDeposit: "First deposit · SOL",
                        creationBudget: "Creation budget · SOL",
                        amount: "Amount",
                        estimatedOut: "Estimated output",
                        minimumOut: "Minimum output",
                        outSymbol: "Output asset",
                        slippageBps: "Slippage · basis points",
                        poolSol: "Pooled first buy · SOL",
                        mint: "New mint",
                        creatorFeeBps: "Creator fee · 0 means standard",
                        refunds: "Refunds",
                        capPercent: "Wallet cap · %",
                        recipient: "Recipient",
                        finalizer: "Finalizer",
                        venue: "Venue",
                        uri: "Metadata",
                      } as any
                    )[k] || k}
                  </dt>
                  <dd title={String(v)}>
                    {typeof v === "boolean"
                      ? v
                        ? "Yes"
                        : "No"
                      : String(v).length > 45
                        ? short(String(v))
                        : String(v)}
                  </dd>
                </div>
              ))}
              {review.prepared.simulatedBook && (
                <div>
                  <dt>Enigma protocol fee</dt>
                  <dd>0% · Pump.fun fees apply</dd>
                </div>
              )}
              <div>
                <dt>Network fee</dt>
                <dd>{units(review.prepared.networkFee)} SOL</dd>
              </div>
              {review.prepared.simulatedDebit != null && (
                <div>
                  <dt>
                    {BigInt(review.prepared.simulatedDebit) >= 0n
                      ? "Simulated total SOL debit"
                      : "Simulated net SOL credit"}
                  </dt>
                  <dd>
                    {units(
                      BigInt(review.prepared.simulatedDebit) >= 0n
                        ? review.prepared.simulatedDebit
                        : -BigInt(review.prepared.simulatedDebit),
                    )}{" "}
                    SOL
                  </dd>
                </div>
              )}
              <div>
                <dt>Transaction size</dt>
                <dd>{review.prepared.wireBytes} / 1,232 bytes</dd>
              </div>
            </dl>
            {["create", "deposit"].includes(review.plan.action) && (
              <p>Deposits are final. If the pooled launch cannot complete, this release has no refund instruction. Wallet caps apply per address.</p>
            )}
            <p>
              The wallet transaction also includes any account rent shown by
              simulation. The review expires after 30 seconds. Your keys remain
              in your wallet.
            </p>
            <details>
              <summary>Protocol & recipients</summary>
              <code>{review.plan.program}</code>
              <code>{review.plan.offering}</code>
              <p>
                Program-controlled escrow. Enigma adds no separate trading fee.
              </p>
            </details>
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Waiting for wallet approval…" : "Approve in wallet"}
              <Icon name="arrow" size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
