import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { getAddressLookupTableEncoder } from "@solana-program/address-lookup-table";
import { getBase58Encoder } from "@solana/kit";
import {
  releaseIdentity,
  inspectBuffer,
  inspectProgram,
  inspectLookup,
  assertArtifact,
  spendPlan,
  LOADER,
  LOOKUP,
  WRITE_BYTES,
} from "../lib/release-flow.mjs";
const wallet = "11111111111111111111111111111111";
const code = new Uint8Array(
  readFileSync(new URL("../releases/v1/enigma.so", import.meta.url)),
);
const key = (s) => getBase58Encoder().encode(s);
test("one wallet derives reproducible deployment addresses without a second secret", async () => {
  const id = await releaseIdentity(wallet);
  assert.deepEqual(await releaseIdentity(wallet), id);
  assert.equal(
    id.program,
    (
      await PublicKey.createWithSeed(
        new PublicKey(wallet),
        id.programSeed,
        new PublicKey(LOADER),
      )
    ).toBase58(),
  );
  assert.notEqual(id.buffer, id.program);
  await assertArtifact(code);
  await assert.rejects(() => assertArtifact(code.slice(1)), /artifact/);
});
test("partial uploads resume only under the exact buffer owner and authority", async () => {
  const id = await releaseIdentity(wallet),
    b = new Uint8Array(37 + code.length);
  new DataView(b.buffer).setUint32(0, 1, true);
  b[4] = 1;
  b.set(key(wallet), 5);
  const a = { owner: LOADER, data: b, executable: false };
  assert.ok(inspectBuffer(a, id, code).missing.includes(0));
  b.set(code.slice(0, WRITE_BYTES), 37);
  assert.ok(!inspectBuffer(a, id, code).missing.includes(0));
  assert.throws(
    () => inspectBuffer({ ...a, owner: wallet }, id, code),
    /identity/,
  );
  b[5] = 1;
  assert.throws(() => inspectBuffer(a, id, code), /authority/);
});
test("release evidence verifies code bytes, loader identity and retained upgrade authority", async () => {
  const id = await releaseIdentity(wallet),
    p = new Uint8Array(36),
    d = new Uint8Array(45 + code.length);
  new DataView(p.buffer).setUint32(0, 2, true);
  p.set(key(id.programData), 4);
  const v = new DataView(d.buffer);
  v.setUint32(0, 3, true);
  v.setBigUint64(4, 123n, true);
  d[12] = 1;
  d.set(key(wallet), 13);
  d.set(code, 45);
  const a = { owner: LOADER, data: p, executable: true },
    b = { owner: LOADER, data: d, executable: false };
  assert.equal((await inspectProgram(a, b, id, code)).slot, "123");
  d[d.length - 1] ^= 1;
  await assert.rejects(() => inspectProgram(a, b, id, code), /bytecode/);
  d[d.length - 1] ^= 1;
  d[12] = 0;
  await assert.rejects(() => inspectProgram(a, b, id, code), /authority/);
});
test("address-table identity, ordered contents and authority are checked, and budgets conserve denominations", () => {
  const bytes = getAddressLookupTableEncoder().encode({
    deactivationSlot: 18446744073709551615n,
    lastExtendedSlot: 1n,
    lastExtendedSlotStartIndex: 0,
    authority: wallet,
    addresses: [wallet],
  });
  const a = { owner: LOOKUP, data: bytes };
  assert.equal(inspectLookup(a, wallet, [wallet]).addresses.length, 1);
  assert.throws(() => inspectLookup(a, LOADER, [wallet]), /authority/);
  assert.throws(() => inspectLookup(a, wallet, [LOADER]), /contents/);
  const q = spendPlan({
    program: "1",
    programData: "2",
    buffer: "3",
    config: "4",
    addressTable: "5",
  });
  assert.equal(q.retained, "12");
  assert.equal(q.conservativeBalance, "20000015");
  assert.equal(q.notReclaimableByCurrentCode, "5");
});
