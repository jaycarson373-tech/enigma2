// Enigma wire interface. The optional legacy client is for isolated reference tests only.
import {
  address,
  getAddressEncoder,
  getBase58Decoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import {
  PROGRAM,
  SYSTEM,
  TOKEN,
  TOKEN_2022,
  ATA,
  SOL,
  PUMP,
  PUMP_GLOBAL,
  PUMP_FEE,
} from "./constants.mjs";
const encoder = new TextEncoder(),
  ae = getAddressEncoder(),
  b58 = getBase58Decoder();
export const keyBytes = (s) => new Uint8Array(ae.encode(address(s)));
export const bytes64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const to64 = (b) =>
  btoa(Array.from(b, (x) => String.fromCharCode(x)).join(""));
export const concat = (...a) => {
  const b = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) {
    b.set(x, i);
    i += x.length;
  }
  return b;
};
export const u64 = (x) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(x), true);
  return b;
};
const i64 = (x) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(x), true);
  return b;
};
const u16 = (x) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, x, true);
  return b;
};
const string = (x) => {
  const b = encoder.encode(x),
    n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, b.length, true);
  return concat(n, b);
};
export const discriminator = async (x) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(x)),
  ).slice(0, 8);
export const pda = async (program, ...seeds) =>
  (
    await getProgramDerivedAddress({ programAddress: address(program), seeds })
  )[0];
const seed = (x) => encoder.encode(x);
export function createProtocol(PROGRAM, { independent = true } = {}) {
  const configAddress = () => pda(PROGRAM, seed("config"));
  const offeringAddress = (id) => pda(PROGRAM, seed("offering"), u64(id));
  const vaultAddress = (o) => pda(PROGRAM, seed("vault"), keyBytes(o));
  const positionAddress = (o, w) =>
    pda(PROGRAM, seed("position"), keyBytes(o), keyBytes(w));
  const tokenAddress = (mint, owner, program = TOKEN_2022) =>
    pda(ATA, keyBytes(owner), keyBytes(program), keyBytes(mint));
  const curveAddress = (m) => pda(PUMP, seed("bonding-curve"), keyBytes(m));
  const ro = (a) => ({ address: address(a), role: 0 }),
    rw = (a) => ({ address: address(a), role: 1 }),
    signer = (a) => ({ address: address(a), role: 3 });
  async function ix(name, accounts, data = []) {
    return {
      programAddress: address(PROGRAM),
      accounts,
      data: concat(await discriminator("global:" + name), ...data),
    };
  }
  async function fileIx(wallet, config, terms) {
    const offering = await offeringAddress(config.nextId),
      v = await vaultAddress(offering);
    return {
      offering,
      ix: await ix(
        "file",
        [
          signer(wallet),
          rw(await configAddress()),
          rw(offering),
          rw(v),
          ro(SOL),
          rw(await tokenAddress(SOL, v, TOKEN)),
          ro(PUMP_GLOBAL),
          ro("8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt"),
          ro("6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP"),
          ro(TOKEN),
          ro(ATA),
          ro(SYSTEM),
          ro(config.treasury),
          ro(PROGRAM),
        ],
        [
          string(terms.name),
          string(terms.symbol),
          string(terms.uri),
          i64(terms.duration),
          u16(terms.capBps),
          u16(terms.creatorFeeBps || 0),
          new Uint8Array([0]),
        ],
      ),
    };
  }
  async function commitIx(wallet, book, amount) {
    if (!book.isNative || book.quoteMint !== SOL)
      throw Error("This interface supports SOL launch pools.");
    const v = await vaultAddress(book.address);
    return ix(
      "commit",
      [
        signer(wallet),
        rw(book.address),
        rw(await positionAddress(book.address, wallet)),
        rw(v),
        ro(book.quoteMint),
        rw(await tokenAddress(book.quoteMint, v, book.quoteTokenProgram)),
        ro(PROGRAM),
        ro(book.quoteTokenProgram),
        ro(SYSTEM),
      ],
      [u64(amount)],
    );
  }
  async function claimIx(payer, owner, book) {
    if (book.status !== "launched")
      throw Error("The pooled buy has not finalized.");
    const v = await vaultAddress(book.address);
    return ix("claim", [
      signer(payer),
      rw(owner),
      ro(book.address),
      rw(await positionAddress(book.address, owner)),
      rw(v),
      ro(book.mint),
      rw(await tokenAddress(book.mint, v)),
      rw(await tokenAddress(book.mint, owner)),
      ro(book.quoteMint),
      rw(await tokenAddress(book.quoteMint, v, book.quoteTokenProgram)),
      ro(PROGRAM),
      ro(book.quoteTokenProgram),
      ro(TOKEN_2022),
      ro(ATA),
      ro(SYSTEM),
    ]);
  }
  async function launchIx(payer, mint, book, config, pumpGlobal) {
    const v = await vaultAddress(book.address),
      c = await curveAddress(mint),
      volume = await pda(PUMP, seed("user_volume_accumulator"), keyBytes(v));
    const creatorVault = await pda(
      PUMP,
      seed("creator-vault"),
      keyBytes(book.creator),
    );
    const fee = pumpGlobal.feeRecipient,
      buyback = pumpGlobal.buybackFeeRecipients[0];
    const extra = [
      ro("TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM"),
      rw(await tokenAddress(mint, c)),
      ro(PUMP_GLOBAL),
      rw("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e"),
      ro("13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ"),
      rw("BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s"),
      rw(
        await pda(
          "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
          seed("mayhem-state"),
          keyBytes(mint),
        ),
      ),
      rw(
        await tokenAddress(
          mint,
          "BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s",
        ),
      ),
      ro("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"),
      rw(await tokenAddress(SOL, c, TOKEN)),
      ro("6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP"),
      rw(fee),
      rw(await tokenAddress(SOL, fee, TOKEN)),
      rw(buyback),
      rw(await tokenAddress(SOL, buyback, TOKEN)),
      rw(creatorVault),
      rw(await tokenAddress(SOL, creatorVault, TOKEN)),
      ro(await pda(PUMP_FEE, seed("sharing-config"), keyBytes(mint))),
      ro("Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y"),
      rw(volume),
      rw(await tokenAddress(SOL, volume, TOKEN)),
      ro("8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt"),
      ro(PUMP_FEE),
    ];
    return ix("launch", [
      signer(payer),
      signer(mint),
      rw(book.address),
      rw(v),
      rw(await tokenAddress(SOL, v, TOKEN)),
      rw(await tokenAddress(mint, v)),
      rw(c),
      ro(book.quoteMint),
      ro(book.quoteTokenProgram),
      ro(TOKEN_2022),
      ro(ATA),
      ro(SYSTEM),
      ro(PUMP),
      ro(await configAddress()),
      rw(config.treasury),
      ro(PROGRAM),
      ...extra,
      ...(independent ? [rw(book.creator)] : []),
    ]);
  }
  class Reader {
    constructor(bytes) {
      this.b = bytes;
      this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.n = 8;
    }
    take(n) {
      if (this.n + n > this.b.length) throw Error("Truncated protocol account");
      const b = this.b.slice(this.n, this.n + n);
      this.n += n;
      return b;
    }
    key() {
      return b58.decode(this.take(32));
    }
    u8() {
      return this.take(1)[0];
    }
    bool() {
      const b = this.u8();
      if (b > 1) throw Error("Invalid boolean");
      return b === 1;
    }
    u16() {
      const x = this.v.getUint16(this.n, true);
      this.n += 2;
      return x;
    }
    u32() {
      const x = this.v.getUint32(this.n, true);
      this.n += 4;
      return x;
    }
    u64() {
      const x = this.v.getBigUint64(this.n, true);
      this.n += 8;
      return String(x);
    }
    i64() {
      const x = this.v.getBigInt64(this.n, true);
      this.n += 8;
      return Number(x);
    }
    u128() {
      const lo = BigInt(this.u64()),
        hi = BigInt(this.u64());
      return String((hi << 64n) | lo);
    }
    str(max) {
      const n = this.u32();
      if (n > max) throw Error("Oversized metadata");
      return new TextDecoder("utf-8", { fatal: true }).decode(this.take(n));
    }
  }
  async function reader(account, type) {
    if (!account || account.owner !== PROGRAM)
      throw Error("Unexpected protocol account owner");
    const b = bytes64(account.data[0]),
      d = await discriminator("account:" + type);
    if (!d.every((v, i) => b[i] === v))
      throw Error("Unexpected account identity");
    return new Reader(b);
  }
  async function decodeConfig(account) {
    const r = await reader(account, "Config");
    const operator = r.key(),
      filingPaused = r.bool(),
      nextId = r.u64(),
      bump = r.u8();
    const value = {
      operator,
      filingPaused,
      nextId,
      bump,
      minDuration: r.i64(),
      maxDuration: r.i64(),
      minCapBps: r.u16(),
      maxCapBps: r.u16(),
      treasury: r.key(),
    };
    if (independent && r.u8() !== 1)
      throw Error("Unsupported Enigma policy version");
    return value;
  }
  async function decodeOffering(account, addressValue) {
    const r = await reader(account, "Offering");
    const o = {
      id: r.u64(),
      creator: r.key(),
      quoteMint: r.key(),
      quoteTokenProgram: r.key(),
      quoteDecimals: r.u8(),
      isNative: r.bool(),
      status: ["none", "open", "launched"][r.u8()],
      creatorFeeBps: r.u16(),
      holderReward: r.bool(),
      feeBps: r.u16(),
      capBps: r.u16(),
      closesAt: r.i64(),
      target: r.u64(),
      raised: r.u64(),
      totalWeight: r.u128(),
      vToken: r.u64(),
      vPair: r.u64(),
      curveSupply: r.u64(),
      tokenSupply: r.u64(),
      walletCap: r.u64(),
      deposit: r.u64(),
      backers: r.u32(),
      mint: r.key(),
      received: r.u64(),
      leftover: r.u64(),
      padFee: r.u64(),
      graduated: r.bool(),
      createdAt: r.i64(),
      launchedAt: r.i64(),
      bump: r.u8(),
      vaultBump: r.u8(),
      name: r.str(32),
      symbol: r.str(10),
      uri: r.str(200),
      address: addressValue,
    };
    if (independent) {
      o.version = r.u8();
      o.creationCost = r.u64();
      if (o.version !== 1) throw Error("Unsupported Enigma policy version");
    }
    if (!o.status || (await offeringAddress(o.id)) !== addressValue)
      throw Error("Offering PDA identity mismatch");
    return o;
  }
  async function decodePosition(account, offering, wallet) {
    const r = await reader(account, "Position");
    const p = {
      offering: r.key(),
      backer: r.key(),
      committed: r.u64(),
      weight: r.u128(),
      joinedAt: r.i64(),
    };
    if (independent && r.u8() !== 1)
      throw Error("Unsupported Enigma position version");
    if (p.offering !== offering || p.backer !== wallet)
      throw Error("Position identity mismatch");
    return p;
  }

  async function initializeIx(wallet) {
    return ix("initialize", [
      signer(wallet),
      rw(await configAddress()),
      ro(SYSTEM),
      ro(PROGRAM),
      ro(
        await pda(
          "BPFLoaderUpgradeab1e11111111111111111111111",
          keyBytes(PROGRAM),
        ),
      ),
    ]);
  }

  return {
    configAddress,
    offeringAddress,
    vaultAddress,
    positionAddress,
    tokenAddress,
    curveAddress,
    fileIx,
    commitIx,
    claimIx,
    launchIx,
    decodeConfig,
    decodeOffering,
    decodePosition,
    initializeIx,
  };
}
export const {
  configAddress,
  offeringAddress,
  vaultAddress,
  positionAddress,
  tokenAddress,
  curveAddress,
  fileIx,
  commitIx,
  claimIx,
  launchIx,
  decodeConfig,
  decodeOffering,
  decodePosition,
  initializeIx,
} = createProtocol(PROGRAM);
