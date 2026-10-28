// Isolated VM only. Balances/signers below are synthetic, never broadcast.
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import { address, lamports, getTransactionDecoder } from "@solana/kit";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  AccountLayout,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { enigma2Release } from "../../lib/enigma2-release.mjs";
import {
  createStonkProtocol,
  STONK,
  TOKEN,
  TOKEN_2022,
  LAUNCHLAB,
  LOADER,
  bytes64,
  keyBytes,
} from "../../lib/stonk-protocol.mjs";
export const PROGRAM = "Bh2FCMY5u6irspMD9SBm4JLxvJ66KbuL7VPjBRxoijDy";
export const pub = (k) => k.publicKey.toBase58();
export const snapshot = JSON.parse(
  readFileSync(
    new URL("../../fixtures/stonk/execution-snapshot.json", import.meta.url),
  ),
);
export async function stonkFork() {
  const svm = new LiteSVM();
  const bank = Keypair.generate(),
    a = Keypair.generate(),
    b = Keypair.generate(),
    attacker = Keypair.generate();
  const client = createStonkProtocol(PROGRAM);
  for (const k of [bank, a, b, attacker])
    svm.airdrop(address(pub(k)), lamports(10_000_000_000n));
  const set = (key, account) =>
    svm.setAccount({
      address: address(key),
      programAddress: address(account.owner),
      data: account.data,
      lamports: lamports(BigInt(account.lamports ?? 10_000_000)),
      executable: account.executable ?? false,
      space: BigInt(account.data.length),
    });
  for (let i = 0; i < snapshot.keys.length; i++) {
    const v = snapshot.accounts.value[i];
    if (v) set(snapshot.keys[i], { ...v, data: bytes64(v.data[0]) });
  }
  const upstream = gunzipSync(
    readFileSync(
      new URL("../../fixtures/stonk/launchlab.so.gz", import.meta.url),
    ),
  );
  if (createHash("sha256").update(upstream).digest("hex") !== snapshot.codeHash)
    throw Error("LaunchLab fixture hash mismatch");
  svm.addProgram(address(LAUNCHLAB), upstream);
  const code = readFileSync(
    new URL("../../releases/v2/enigma2.so", import.meta.url),
  );
  if (
    createHash("sha256").update(code).digest("hex") !== enigma2Release.codeHash
  )
    throw Error("Enigma 2 artifact hash mismatch");
  svm.addProgram(address(PROGRAM), code);
  const programData = PublicKey.findProgramAddressSync(
    [keyBytes(PROGRAM)],
    new PublicKey(LOADER),
  )[0].toBase58();
  const pd = Buffer.alloc(45 + code.length);
  pd.writeUInt32LE(3);
  pd.writeBigUInt64LE(1n, 4);
  pd[12] = 1;
  pd.set(keyBytes(pub(bank)), 13);
  pd.set(code, 45);
  set(programData, { owner: LOADER, data: pd });
  const program = Buffer.concat([
    Buffer.from([2, 0, 0, 0]),
    Buffer.from(keyBytes(programData)),
  ]);
  set(PROGRAM, { owner: LOADER, data: program, executable: true });
  for (const k of [bank, a, b, attacker]) {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(STONK),
      k.publicKey,
    );
    const data = Buffer.alloc(AccountLayout.span);
    AccountLayout.encode(
      {
        mint: new PublicKey(STONK),
        owner: k.publicKey,
        amount: 10000_000_000_000n,
        delegateOption: 0,
        delegate: PublicKey.default,
        state: 1,
        isNativeOption: 0,
        isNative: 0n,
        delegatedAmount: 0n,
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      data,
    );
    set(ata.toBase58(), { owner: TOKEN, data });
  }
  let clock = svm.getClock();
  clock.unixTimestamp = BigInt(
    Math.floor(Date.parse(snapshot.pricing.prices.observedAt) / 1000),
  );
  svm.setClock(clock);
  const readAccount = (k) => {
    const v = svm.getAccount(address(k));
    return v.exists
      ? {
          owner: v.programAddress,
          data: [Buffer.from(v.data).toString("base64"), "base64"],
          lamports: String(v.lamports),
        }
      : null;
  };
  function execute(ixs, signers, label, mustFail = false) {
    svm.expireBlockhash();
    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ...ixs.map(
        (i) =>
          new TransactionInstruction({
            programId: new PublicKey(i.programAddress),
            keys: i.accounts.map((a) => ({
              pubkey: new PublicKey(a.address),
              isSigner: !!(a.role & 2),
              isWritable: !!(a.role & 1),
            })),
            data: Buffer.from(i.data),
          }),
      ),
    ];
    const message = new TransactionMessage({
      payerKey: signers[0].publicKey,
      recentBlockhash: svm.latestBlockhash(),
      instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    tx.sign(signers);
    const wire = tx.serialize();
    if (wire.length > 1232)
      throw Error(label + " packet too large: " + wire.length);
    const result = svm.sendTransaction(getTransactionDecoder().decode(wire));
    const failed = result instanceof FailedTransactionMetadata;
    if (mustFail) {
      if (!failed) throw Error("Unexpected success: " + label);
      return result;
    }
    if (failed)
      throw Error(
        label + ": " + result.err() + "\n" + result.meta().logs().join("\n"),
      );
    return {
      label,
      wireBytes: wire.length,
      compute: Number(result.computeUnitsConsumed()),
    };
  }
  execute(
    [await client.initializeIx(pub(attacker))],
    [attacker],
    "reject authority takeover",
    true,
  );
  execute([await client.initializeIx(pub(bank))], [bank], "initialize");
  const config = await client.decodeConfig(
    readAccount(await client.configAddress()),
  );
  const terms = {
    name: "Enigma 2 isolated test",
    symbol: "egm2vm",
    uri: "https://example.com/isolated-vm-only.json",
    duration: 60,
    capBps: 50,
    raise: snapshot.pricing.raise.raw,
  };
  const { offering, ix } = await client.fileIx(pub(bank), config, terms);
  return {
    svm,
    bank,
    a,
    b,
    attacker,
    client,
    pub,
    execute,
    set,
    readAccount,
    config,
    terms,
    offering,
    ix,
    read: () => client.decodeOffering(readAccount(offering), offering),
    position: async (k) =>
      client.decodePosition(
        readAccount(await client.positionAddress(offering, pub(k))),
        offering,
        pub(k),
      ),
    tokenBalance: async (mint, wallet, token = TOKEN) => {
      const ata = await client.tokenAddress(mint, wallet, token);
      const v = readAccount(ata);
      return v ? Buffer.from(v.data[0], "base64").readBigUInt64LE(64) : 0n;
    },
  };
}
