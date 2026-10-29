import { createHash } from "node:crypto";
import {
  v2Client,
  V2_PROGRAM,
  STONK,
  LAUNCHLAB,
  GLOBAL,
  PLATFORM,
  bytes64,
  discriminator,
  TOKEN_2022,
} from "./stonk-protocol.mjs";
import { deployedReadiness } from "./stonk-deployment.mjs";
import { verifyStonkVenue } from "./stonk-readiness.mjs";
import launchlab from "./launchlab-sdk.cjs";
const sdk = launchlab.sdk;
const rpcUrl =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const cache = new Map();
export async function cached(key, ttl, fn) {
  const old = cache.get(key);
  if (old?.promise) return old.promise;
  if (old && Date.now() - old.at < ttl) return old.value;
  const promise = fn()
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((e) => {
      if (old?.value) {
        cache.set(key, old);
        return {
          ...old.value,
          stale: true,
          refreshReason:
            "Network refresh delayed. Last verified snapshot retained.",
        };
      }
      cache.delete(key);
      throw e;
    });
  cache.set(key, { promise });
  return promise;
}
export async function rpc(method, params = []) {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
  });
  if (!r.ok) throw Error("The network is refreshing. Please retry.");
  const b = await r.json();
  if (b.error)
    throw Error("The network could not complete this request. Please retry.");
  return b.result;
}

export async function readiness() {
  const state = await cached("readiness-v2", 15000, () =>
    deployedReadiness(rpc),
  );
  return state.stale
    ? {
        ...state,
        verified: false,
        writesEnabled: false,
        filingEnabled: false,
        reason: "Protocol verification is stale. Wallet actions are paused.",
      }
    : state;
}
export async function stonkTerms() {
  const result = await cached("stonk-terms", 10000, async () => {
    const r = await fetch(
      "https://www.stonkfun.xyz/api/public/v1/launchlab/pricing?quoteMint=" +
        STONK,
      { signal: AbortSignal.timeout(15000), cache: "no-store" },
    );
    const b = await r.json();
    if (!r.ok || b.error)
      throw Error("The Stonk configuration is unavailable.");
    return verifyStonkVenue(b.data, rpc);
  });
  if (result.stale) throw Error("The Stonk configuration is stale.");
  return result;
}
export function safeUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
function metadataUrl(uri) {
  if (uri.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + uri.slice(7);
  const u = safeUrl(uri);
  if (!u) return null;
  const host = new URL(u).hostname;
  if (
    ![
      "ipfs.io",
      "gateway.pinata.cloud",
      "cloudflare-ipfs.com",
      "arweave.net",
    ].includes(host) &&
    !host.endsWith(".mypinata.cloud") &&
    !host.endsWith(".public.blob.vercel-storage.com")
  )
    return null;
  return u;
}
async function profile(uri) {
  return cached("metadata:" + uri, 300000, async () => {
    const u = metadataUrl(uri);
    if (!u) return {};
    try {
      const r = await fetch(u, {
        signal: AbortSignal.timeout(2500),
        redirect: "error",
      });
      if (!r.ok) return {};
      const text = await r.text();
      if (text.length > 30000) return {};
      const b = JSON.parse(text);
      return {
        image: safeUrl(b.image?.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")),
        description:
          typeof b.description === "string"
            ? b.description.slice(0, 600)
            : null,
        twitter: safeUrl(b.twitter),
        website: safeUrl(b.website),
      };
    } catch {
      return {};
    }
  });
}

export function decodeStonkPool(account, mint) {
  if (account?.owner !== LAUNCHLAB || account.executable)
    throw Error("Unverified Stonk pool.");
  const data = Buffer.from(account.data[0], "base64");
  if (
    data.length !== sdk.LaunchpadPool.span ||
    !data
      .subarray(0, 8)
      .equals(
        createHash("sha256")
          .update("account:PoolState")
          .digest()
          .subarray(0, 8),
      )
  )
    throw Error("Unsupported Stonk pool layout.");
  const p = sdk.LaunchpadPool.decode(data);
  if (
    p.mintA.toBase58() !== mint ||
    p.mintB.toBase58() !== STONK ||
    p.configId.toBase58() !== GLOBAL ||
    p.platformId.toBase58() !== PLATFORM ||
    p.mintProgramFlag !== 1
  )
    throw Error("Stonk pool identity mismatch.");
  return p;
}
export async function feed() {
  return cached("feed-v2", 12000, async () => {
    const state = await readiness();
    if (!state.verified)
      return {
        offers: [],
        stats: { launches: 0, pooledRaw: "0", participations: 0, graduated: 0 },
        protocolStatus: state,
        source: "Openbell · no public launches yet",
        checkedAt: state.checkedAt,
      };
    const { getBase58Decoder } = await import("@solana/kit");
    const disc = await discriminator("account:Enigma2Offering");
    const rows = await rpc("getProgramAccounts", [
      V2_PROGRAM,
      {
        encoding: "base64",
        commitment: "finalized",
        filters: [
          { memcmp: { offset: 0, bytes: getBase58Decoder().decode(disc) } },
        ],
      },
    ]);
    let offers = [];
    for (const row of rows) {
      try {
        const o = await v2Client.decodeOffering(row.account, row.pubkey);
        offers.push(o);
      } catch {}
    }
    offers = await Promise.all(
      offers.map(async (o) => {
        let curve = null,
          pool = null,
          poolVerified = false;
        if (o.status === "launched")
          try {
            pool = await v2Client.curveAddress(o.mint);
            const a = (
              await rpc("getAccountInfo", [
                pool,
                { encoding: "base64", commitment: "finalized" },
              ])
            ).value;
            const p = decodeStonkPool(a, o.mint);
            curve = {
              vToken: p.virtualA.sub(p.realA).toString(),
              vSol: p.virtualB.add(p.realB).toString(),
              realToken: p.realA.toString(),
              supply: p.supply.toString(),
              complete: p.status !== 0,
            };
            poolVerified = p.status !== 0;
          } catch {}
        return { ...o, ...(await profile(o.uri)), curve, pool, poolVerified };
      }),
    );
    offers.sort((a, b) => b.createdAt - a.createdAt);
    return {
      offers,
      stats: {
        launches: offers.length,
        pooledRaw: String(offers.reduce((n, o) => n + BigInt(o.raised), 0n)),
        participations: offers.reduce((n, o) => n + o.backers, 0),
        graduated: offers.filter((o) => o.poolVerified).length,
      },
      protocolStatus: state,
      source: "Finalized Openbell STONK launch accounts.",
      checkedAt: new Date().toISOString(),
    };
  });
}
export async function offering(key) {
  return v2Client.decodeOffering(
    (
      await rpc("getAccountInfo", [
        key,
        { encoding: "base64", commitment: "finalized" },
      ])
    ).value,
    key,
  );
}
export async function portfolio(wallet) {
  const book = await feed(),
    keys = await Promise.all(
      book.offers.map((o) => v2Client.positionAddress(o.address, wallet)),
    );
  const rows = keys.length
    ? (
        await rpc("getMultipleAccounts", [
          keys,
          { encoding: "base64", commitment: "finalized" },
        ])
      ).value
    : [];
  const positions = [];
  for (let i = 0; i < rows.length; i++)
    if (rows[i])
      try {
        positions.push({
          offering: book.offers[i],
          position: await v2Client.decodePosition(
            rows[i],
            book.offers[i].address,
            wallet,
          ),
        });
      } catch {}
  return {
    wallet,
    positions,
    created: book.offers.filter((o) => o.creator === wallet),
    checkedAt: new Date().toISOString(),
  };
}
