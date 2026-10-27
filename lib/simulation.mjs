// A missing or malformed RPC result is not evidence that a transaction passed.
export function requireSimulation(result, minimumSlot = 0) {
  const slot=result?.context?.slot,v=result?.value;
  if(!Number.isSafeInteger(slot)||slot<minimumSlot||!v||!Object.hasOwn(v,'err')||v.err!==null||!Number.isSafeInteger(v.unitsConsumed)||v.unitsConsumed<0||v.unitsConsumed>1400000)
    throw Error('The transaction preview could not be verified. Nothing was submitted.');
  return v;
}
export function requireLamports(value, label='Balance') {
  if(!Number.isSafeInteger(value)||value<0)throw Error(`${label} could not be verified. Nothing was submitted.`);
  return BigInt(value);
}
export function requireNetworkFee(value) {
  const fee=requireLamports(value,'Network cost');
  if(fee===0n||fee>1000000n)throw Error('Network cost is outside this review’s limit. Nothing was submitted.');
  return fee;
}
