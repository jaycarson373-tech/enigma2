// Shared static lookup entries. Offering/mint/position accounts remain dynamic.
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
import { configAddress } from "./protocol.mjs";
export async function lookupAddresses(
  program = PROGRAM,
  config = null,
  pumpGlobal = null,
) {
  const keys = [
    program,
    config || (await configAddress()),
    SYSTEM,
    TOKEN,
    TOKEN_2022,
    ATA,
    SOL,
    PUMP,
    PUMP_GLOBAL,
    PUMP_FEE,
    "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",
    "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
    "13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ",
    "BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s",
    "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",
    "6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP",
    "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y",
    "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt",
    ...(pumpGlobal
      ? [pumpGlobal.feeRecipient, ...pumpGlobal.buybackFeeRecipients]
      : []),
  ];
  return [...new Set(keys)];
}
