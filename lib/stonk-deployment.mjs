// Read-only verification of a reviewed v2 deployment. No manifest flag bypasses chain evidence.
import { createHash } from "node:crypto";
import { verifyAcceptance } from "./stonk-acceptance.mjs";
import { getBase58Decoder } from "@solana/kit";
import {
  enigma2Release as release,
  enigma2Readiness,
} from "./enigma2-release.mjs";
import { v2Client, LOADER, keyBytes, bytes64 } from "./stonk-protocol.mjs";
const need = (ok, message) => {
  if (!ok) throw Error(message);
};
export async function deployedReadiness(read) {
  const initial = enigma2Readiness();
  if (release.status !== "deployed-reviewed") return initial;
  need(
    release.program &&
      release.programData &&
      release.slot &&
      release.upgradeAuthority &&
      release.codeHash,
    "The IPO v2 deployment manifest is incomplete.",
  );
  need(
    (await read("getGenesisHash")) ===
      "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    "Wrong network.",
  );
  const result = await read("getMultipleAccounts", [
    [
      release.program,
      release.programData,
      await v2Client.configAddress(),
      release.upstream.program,
      release.upstream.programData,
    ],
    { encoding: "base64", commitment: "finalized" },
  ]);
  const [p, d, c, upstream, upData] = result.value;
  const pb = bytes64(p?.data?.[0] || ""),
    db = bytes64(d?.data?.[0] || "");
  need(
    p?.owner === LOADER &&
      p.executable &&
      pb.length === 36 &&
      new DataView(pb.buffer, pb.byteOffset, pb.byteLength).getUint32(
        0,
        true,
      ) === 2 &&
      getBase58Decoder().decode(pb.slice(4)) === release.programData,
    "The IPO v2 program identity changed.",
  );
  need(
    d?.owner === LOADER &&
      !d.executable &&
      db.length === 45 + release.codeBytes,
    "The IPO v2 executable size or owner changed.",
  );
  const v = new DataView(db.buffer, db.byteOffset, db.byteLength);
  need(
    v.getUint32(0, true) === 3 &&
      String(v.getBigUint64(4, true)) === release.slot &&
      db[12] === 1 &&
      getBase58Decoder().decode(db.slice(13, 45)) ===
        release.upgradeAuthority &&
      createHash("sha256").update(db.slice(45)).digest("hex") ===
        release.codeHash,
    "The IPO v2 bytecode, slot or authority changed.",
  );
  const ub = bytes64(upstream?.data?.[0] || ""),
    ud = bytes64(upData?.data?.[0] || "");
  need(
    upstream?.owner === LOADER &&
      upstream.executable &&
      ub.length === 36 &&
      getBase58Decoder().decode(ub.slice(4)) === release.upstream.programData &&
      upData?.owner === LOADER &&
      ud.length === 45 + release.upstream.codeBytes,
    "The Stonk executable identity changed.",
  );
  need(
    new DataView(ud.buffer, ud.byteOffset, ud.byteLength).getUint32(0, true) ===
      3 &&
      String(
        new DataView(ud.buffer, ud.byteOffset, ud.byteLength).getBigUint64(
          4,
          true,
        ),
      ) === release.upstream.slot &&
      createHash("sha256").update(ud.slice(45)).digest("hex") ===
        release.upstream.codeHash,
    "The Stonk executable was upgraded. A new execution review is required.",
  );
  const config = await v2Client.decodeConfig(c);
  need(
    config.operator === release.upgradeAuthority,
    "The IPO v2 config authority changed.",
  );
  if (release.executionAccepted === true) await verifyAcceptance(read, release);
  const writesEnabled =
    release.executionAccepted === true &&
    process.env.ENIGMA_WRITES_ENABLED === "true";
  return {
    ...initial,
    verified: true,
    program: release.program,
    config,
    codeHash: release.codeHash,
    deploymentSlot: release.slot,
    lookupTable: { address: "11111111111111111111111111111111", addresses: [] },
    writesEnabled,
    filingEnabled: writesEnabled && !config.filingPaused,
    reason: !release.executionAccepted
      ? "IPO v2 is deployed; funded public acceptance remains pending."
      : !writesEnabled
        ? "Wallet actions are paused."
        : config.filingPaused
          ? "New launch windows are paused."
          : null,
    slot: result.context.slot,
    executionAcceptance: release.executionAccepted
      ? "Reviewed funded execution passed."
      : "Isolated execution passed; funded public acceptance is pending.",
  };
}
