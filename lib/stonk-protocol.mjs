// Enigma 2 only: versioned STONK escrow wire format and canonical LaunchLab accounts.
import {
  address,
  getAddressEncoder,
  getBase58Decoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import { enigma2Release } from "./enigma2-release.mjs";
export const SYSTEM = "11111111111111111111111111111111";
export const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
export const LAUNCHLAB = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
export const PLATFORM = "4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7";
export const GLOBAL = "4Rb2joMnuDt9zRPuTYxUjQRGQ8oNBbKdXnCJSCojvBsW";
export const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export const SUPPLY = "1000000000000000",
  SELL = "793100000000000",
  CREATION_BUDGET = "20000000";
const encoder = new TextEncoder(),
  ae = getAddressEncoder(),
  b58 = getBase58Decoder();
export const keyBytes = (s) => new Uint8Array(ae.encode(address(s)));
export const bytes64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const to64 = (b) =>
  btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
export const concat = (...parts) => {
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    b.set(p, i);
    i += p.length;
  }
  return b;
};
export const u64 = (x) => {
  x = BigInt(x);
  if (x < 0n || x > 18446744073709551615n) throw Error("Invalid u64");
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, x, true);
  return b;
};
const i64 = (x) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(x), true);
  return b;
};
const u16 = (x) => {
  if (!Number.isInteger(x) || x < 0 || x > 65535) throw Error("Invalid u16");
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, x, true);
  return b;
};
const str = (x) => {
  const b = encoder.encode(x),
    n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, b.length, true);
  return concat(n, b);
};
export const discriminator = async (s) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(s)),
  ).slice(0, 8);
export const pda = async (program, ...seeds) =>
  (
    await getProgramDerivedAddress({ programAddress: address(program), seeds })
  )[0];
const seed = (s) => encoder.encode(s);
export async function venueAddresses() {
  return {
    global: GLOBAL,
    platform: PLATFORM,
    rule: await pda(
      LAUNCHLAB,
      seed("platform_curve_rule"),
      keyBytes(PLATFORM),
      keyBytes(GLOBAL),
    ),
    allow: await pda(
      LAUNCHLAB,
      seed("platform_allow_config"),
      keyBytes(PLATFORM),
      keyBytes(GLOBAL),
    ),
    auth: await pda(LAUNCHLAB, seed("vault_auth_seed")),
    event: await pda(LAUNCHLAB, seed("__event_authority")),
    platformFee: await pda(LAUNCHLAB, keyBytes(PLATFORM), keyBytes(STONK)),
  };
}
export function createStonkProtocol(PROGRAM) {
  const configAddress = () => pda(PROGRAM, seed("config-v2"));
  const offeringAddress = (id) => pda(PROGRAM, seed("offering-v2"), u64(id));
  const vaultAddress = (o) => pda(PROGRAM, seed("vault-v2"), keyBytes(o));
  const positionAddress = (o, w) =>
    pda(PROGRAM, seed("position-v2"), keyBytes(o), keyBytes(w));
  const tokenAddress = (m, w, t = TOKEN_2022) =>
    pda(ATA, keyBytes(w), keyBytes(t), keyBytes(m));
  const curveAddress = (m) =>
    pda(LAUNCHLAB, seed("pool"), keyBytes(m), keyBytes(STONK));
  const poolVault = (pool, mint) =>
    pda(LAUNCHLAB, seed("pool_vault"), keyBytes(pool), keyBytes(mint));
  const ro = (a) => ({ address: address(a), role: 0 }),
    rw = (a) => ({ address: address(a), role: 1 }),
    signer = (a) => ({ address: address(a), role: 3 });
  const ix = async (name, accounts, ...data) => ({
    programAddress: address(PROGRAM),
    accounts,
    data: concat(await discriminator("global:" + name), ...data),
  });
  async function initializeIx(wallet) {
    return ix("initialize", [
      signer(wallet),
      rw(await configAddress()),
      ro(SYSTEM),
      ro(PROGRAM),
      ro(await pda(LOADER, keyBytes(PROGRAM))),
    ]);
  }
  async function pauseIx(wallet, paused) {
    return ix(
      "pause",
      [signer(wallet), rw(await configAddress())],
      new Uint8Array([paused ? 1 : 0]),
    );
  }
  async function fileIx(wallet, config, terms) {
    const offering = await offeringAddress(config.nextId),
      v = await vaultAddress(offering),
      a = await venueAddresses();
    return {
      offering,
      ix: await ix(
        "file",
        [
          signer(wallet),
          rw(await configAddress()),
          rw(offering),
          rw(v),
          rw(await tokenAddress(STONK, v, TOKEN)),
          ro(STONK),
          ro(TOKEN),
          ro(ATA),
          ro(SYSTEM),
          ro(GLOBAL),
          ro(PLATFORM),
          ro(a.rule),
          ro(a.allow),
          ro(LAUNCHLAB),
        ],
        str(terms.name),
        str(terms.symbol),
        str(terms.uri),
        i64(terms.duration),
        u16(terms.capBps),
        u64(terms.raise),
      ),
    };
  }
  async function commitIx(wallet, book, amount) {
    const v = await vaultAddress(book.address);
    return ix(
      "commit",
      [
        signer(wallet),
        rw(book.address),
        rw(await positionAddress(book.address, wallet)),
        rw(v),
        rw(await tokenAddress(STONK, wallet, TOKEN)),
        rw(await tokenAddress(STONK, v, TOKEN)),
        ro(STONK),
        ro(TOKEN),
        ro(SYSTEM),
      ],
      u64(amount),
    );
  }
  async function launchIx(wallet, mint, book) {
    const v = await vaultAddress(book.address),
      pool = await curveAddress(mint),
      a = await venueAddresses();
    return ix("launch", [
      signer(wallet),
      signer(mint),
      rw(book.address),
      rw(v),
      rw(await tokenAddress(STONK, v, TOKEN)),
      rw(await tokenAddress(mint, v)),
      rw(book.creator),
      ro(GLOBAL),
      ro(PLATFORM),
      ro(a.rule),
      ro(a.allow),
      ro(a.auth),
      rw(pool),
      rw(await poolVault(pool, mint)),
      rw(await poolVault(pool, STONK)),
      ro(STONK),
      ro(TOKEN),
      ro(TOKEN_2022),
      ro(ATA),
      ro(SYSTEM),
      ro(LAUNCHLAB),
      ro(a.event),
      rw(a.platformFee),
      rw(await pda(LAUNCHLAB, keyBytes(book.creator), keyBytes(STONK))),
    ]);
  }
  async function claimIx(payer, beneficiary, book) {
    const v = await vaultAddress(book.address);
    return ix("claim", [
      signer(payer),
      rw(beneficiary),
      ro(book.address),
      rw(await positionAddress(book.address, beneficiary)),
      rw(v),
      ro(book.mint),
      rw(await tokenAddress(book.mint, v)),
      rw(await tokenAddress(book.mint, beneficiary)),
      rw(await tokenAddress(STONK, v, TOKEN)),
      rw(await tokenAddress(STONK, beneficiary, TOKEN)),
      ro(STONK),
      ro(TOKEN),
      ro(TOKEN_2022),
      ro(ATA),
      ro(SYSTEM),
    ]);
  }
  class Reader {
    constructor(b) {
      this.b = b;
      this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      this.n = 8;
    }
    take(n) {
      if (this.n + n > this.b.length) throw Error("Truncated Enigma 2 account");
      const b = this.b.slice(this.n, this.n + n);
      this.n += n;
      return b;
    }
    u8() {
      return this.take(1)[0];
    }
    bool() {
      const n = this.u8();
      if (n > 1) throw Error("Invalid boolean");
      return n === 1;
    }
    u16() {
      return new DataView(this.take(2).buffer).getUint16(0, true);
    }
    u32() {
      return new DataView(this.take(4).buffer).getUint32(0, true);
    }
    u64() {
      return String(new DataView(this.take(8).buffer).getBigUint64(0, true));
    }
    i64() {
      const n = new DataView(this.take(8).buffer).getBigInt64(0, true);
      if (
        n > BigInt(Number.MAX_SAFE_INTEGER) ||
        n < BigInt(Number.MIN_SAFE_INTEGER)
      )
        throw Error("Invalid time");
      return Number(n);
    }
    key() {
      return b58.decode(this.take(32));
    }
    str(max) {
      const n = this.u32();
      if (n > max) throw Error("Oversized metadata");
      return new TextDecoder("utf-8", { fatal: true }).decode(this.take(n));
    }
  }
  async function reader(account, type) {
    if (!account || account.owner !== PROGRAM)
      throw Error("Unexpected Enigma 2 account owner");
    const b = bytes64(account.data[0]),
      disc = await discriminator("account:Enigma2" + type);
    if (!disc.every((x, i) => x === b[i]))
      throw Error("Unexpected Enigma 2 account identity");
    const r = new Reader(b);
    if (r.u8() !== 2) throw Error("Unsupported Enigma version");
    return r;
  }
  async function decodeConfig(account) {
    const r = await reader(account, "Config");
    return {
      version: 2,
      operator: r.key(),
      filingPaused: r.bool(),
      nextId: r.u64(),
      bump: r.u8(),
      minDuration: 60,
      maxDuration: 3600,
      minCapBps: 10,
      maxCapBps: 1000,
    };
  }
  async function decodeOffering(account, addressValue) {
    const r = await reader(account, "Offering");
    const o = {
      version: 2,
      id: r.u64(),
      creator: r.key(),
      status: ["none", "open", "launched"][r.u8()],
      closesAt: r.i64(),
      capBps: r.u16(),
      target: r.u64(),
      vToken: r.u64(),
      vPair: r.u64(),
      raised: r.u64(),
      totalWeight: r.u64(),
      backers: r.u32(),
      venueHash: to64(r.take(32)),
      mint: r.key(),
      received: r.u64(),
      leftover: r.u64(),
      creationCost: r.u64(),
      createdAt: r.i64(),
      launchedAt: r.i64(),
      bump: r.u8(),
      vaultBump: r.u8(),
      name: r.str(32),
      symbol: r.str(10),
      uri: r.str(200),
      address: addressValue,
      quoteMint: STONK,
      quoteTokenProgram: TOKEN,
      quoteDecimals: 9,
      isNative: false,
      feeBps: 0,
      curveSupply: SELL,
      tokenSupply: SUPPLY,
      deposit: CREATION_BUDGET,
      creatorFeeBps: 0,
      holderReward: false,
      padFee: "0",
      graduated: false,
    };
    if (!o.status || (await offeringAddress(o.id)) !== addressValue)
      throw Error("Offering PDA identity mismatch");
    return {
      ...o,
      walletCap: String((BigInt(SUPPLY) * BigInt(o.capBps)) / 10000n),
    };
  }
  async function decodePosition(account, offering, wallet) {
    const r = await reader(account, "Position");
    const p = {
      version: 2,
      offering: r.key(),
      backer: r.key(),
      committed: r.u64(),
      weight: r.u64(),
      joinedAt: r.i64(),
    };
    if (p.offering !== offering || p.backer !== wallet)
      throw Error("Position identity mismatch");
    return p;
  }
  return {
    configAddress,
    offeringAddress,
    vaultAddress,
    positionAddress,
    tokenAddress,
    curveAddress,
    poolVault,
    fileIx,
    commitIx,
    launchIx,
    claimIx,
    initializeIx,
    pauseIx,
    decodeConfig,
    decodeOffering,
    decodePosition,
  };
}

// The candidate identity is for local verification only until the deployment is reviewed.
export const V2_PROGRAM =
  enigma2Release.program || "Bh2FCMY5u6irspMD9SBm4JLxvJ66KbuL7VPjBRxoijDy";
export const v2Client = createStonkProtocol(V2_PROGRAM);
