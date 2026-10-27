import {deployment} from "./enigma-deployment.mjs";
export const PROGRAM = deployment.program;
export const PROGRAM_DATA = deployment.programData;
export const DEPLOYMENT_SLOT = BigInt(deployment.slot);
export const CODE_HASH = deployment.codeHash;
export const LOOKUP_TABLE = deployment.lookupTable || "11111111111111111111111111111111";
export const SYSTEM = "11111111111111111111111111111111";
export const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const SOL = "So11111111111111111111111111111111111111112";
export const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_GLOBAL = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
export const PUMP_FEE = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
export const WINDOW_PRESETS = [1, 3, 5, 10, 15, 30, 60];
export function durationSeconds(minutes) {
  const n = Number(minutes);
  if (!Number.isInteger(n) || n < 1 || n > 60)
    throw Error("Choose a window from 1 to 60 minutes.");
  return n * 60;
}
