export const PROGRAM = "D158PpJ63Z6s1qr9REFh7FqUVebhhQ1c825YQ9MhC7mb";
export const PROGRAM_DATA = "EJgF6kKXrtSspHrjzCgypQcVJcZtz4Zy5sBt4x2bYxag";
export const DEPLOYMENT_SLOT = 460517743n;
export const CODE_HASH =
  "bb657f9fbc0b43b03b16826d6c37869f3ce220cc2f826145fb4575ececbf94f2";
export const LOOKUP_TABLE = "5AEBSHzJRJZoaakH8z8ZwonpE9C1FQEYcvKydretzTmR";
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
