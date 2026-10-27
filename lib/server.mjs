import { enigma2Readiness } from "./enigma2-release.mjs";
import {
  PROGRAM,
  SOL,
  PUMP,
} from "./constants.mjs";
import {
  bytes64,
  decodeOffering,
  decodePosition,
  positionAddress,
  curveAddress,
  discriminator,
} from "./protocol.mjs";
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
  return enigma2Readiness();
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
      "pump.fun",
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
export async function feed() {
  return cached("feed", 12000, async () => {
    const state = await readiness();
    if(!state.verified)return {
      offers:[],stats:{launches:0,pooledRaw:"0",participations:0,graduated:0},
      protocolStatus:state,source:"Enigma 2 · no public launches yet",checkedAt:state.checkedAt
    };
    // Only independently owned and identity-verified Enigma accounts are listed.
    const disc = await discriminator("account:Offering");
    const { getBase58Decoder } = await import("@solana/kit");
    const rows = await rpc("getProgramAccounts", [
      PROGRAM,
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
        const b = bytes64(row.account.data[0]);
        if (!disc.every((v, i) => b[i] === v)) continue;
        const o = await decodeOffering(row.account, row.pubkey);
        if (o.isNative && o.quoteMint === SOL) offers.push(o);
      } catch {}
    }
    // Only verified protocol accounts are listed. Metadata and markets cannot invent a launch.
    const mintKeys = offers
      .filter((o) => o.status === "launched")
      .map((o) => o.mint);
    const curves = mintKeys.length
      ? await rpc("getMultipleAccounts", [
          await Promise.all(mintKeys.map(curveAddress)),
          { encoding: "base64", commitment: "finalized" },
        ]).catch(() => null)
      : null;
    const curveMap = new Map();
    const curveDisc=await discriminator("account:BondingCurve");
    if (curves)
      mintKeys.forEach((m, i) => {
        const a = curves.value[i];
        if (a?.owner === PUMP) {
          const d = bytes64(a.data[0]);
          if (d.length >= 49 && curveDisc.every((v,i)=>d[i]===v)) {
            const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
            curveMap.set(m, {
              vToken: String(v.getBigUint64(8, true)),
              vSol: String(v.getBigUint64(16, true)),
              realToken: String(v.getBigUint64(24, true)),
              supply: String(v.getBigUint64(40, true)),
              complete: d[48] === 1,
            });
          }
        }
      });
    const pools=await verifiedPools(mintKeys);
    offers = await Promise.all(
      offers.map(async (o) => ({
        ...o,
        ...(await profile(o.uri)),
        curve: curveMap.get(o.mint) || null,
        poolVerified:pools.has(o.mint),
        pool:pools.get(o.mint)||null,
      })),
    );
    offers.sort((a, b) => b.createdAt - a.createdAt);
    const raised = offers.reduce((n, o) => n + BigInt(o.raised), 0n),
      depositors = offers.reduce((n, o) => n + o.backers, 0);
    return {
      offers,
      stats: {
        launches: offers.length,
        pooledRaw: String(raised),
        participations: depositors,
        graduated: offers.filter((o) => o.poolVerified).length,
      },
      protocolStatus:state,
      source:
        "Finalized Enigma v1 launch accounts on Solana mainnet.",
      checkedAt: new Date().toISOString(),
    };
  });
}
export async function offering(addressValue) {
  const a = (
    await rpc("getAccountInfo", [
      addressValue,
      { encoding: "base64", commitment: "finalized" },
    ])
  ).value;
  return decodeOffering(a, addressValue);
}
export async function portfolio(wallet) {
  const book = await feed();
  const keys = await Promise.all(
    book.offers.map((o) => positionAddress(o.address, wallet)),
  );
  const r = keys.length
    ? await rpc("getMultipleAccounts", [
        keys,
        { encoding: "base64", commitment: "finalized" },
      ])
    : { value: [] };
  const positions = [];
  for (let i = 0; i < r.value.length; i++) {
    if (r.value[i])
      try {
        positions.push({
          offering: book.offers[i],
          position: await decodePosition(
            r.value[i],
            book.offers[i].address,
            wallet,
          ),
        });
      } catch {}
  }
  return {
    wallet,
    positions,
    created: book.offers.filter((o) => o.creator === wallet),
    checkedAt: new Date().toISOString(),
  };
}

async function verifiedPools(mints) {
  const found=new Map(); if(!mints.length)return found;
  try {
    const {default:legacy}=await import("./pump-legacy.cjs");
    const {pump,web3}=legacy;
    const keys=mints.map(m=>pump.canonicalPumpPoolPdaWithQuote(new web3.PublicKey(m),new web3.PublicKey(SOL)).toBase58());
    const rows=await rpc("getMultipleAccounts",[keys,{encoding:"base64",commitment:"finalized"}]);
    const disc=await discriminator("account:Pool");
    for(let i=0;i<rows.value.length;i++){
      const a=rows.value[i]; if(a?.owner!=="pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA")continue;
      const b=bytes64(a.data[0]); if(!disc.every((v,j)=>b[j]===v))continue;
      // Anchor Pool: discriminator, bump, index, creator, base mint, quote mint.
      const base=new web3.PublicKey(b.slice(43,75)).toBase58(),quote=new web3.PublicKey(b.slice(75,107)).toBase58();
      if(base===mints[i]&&quote===SOL)found.set(base,keys[i]);
    }
  }catch{} return found;
}
