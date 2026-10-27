const MAX = (1n << 64n) - 1n;
export function raw(text, decimals = 9) {
  if (!/^\d+(\.\d+)?$/.test(String(text)))
    throw Error("Enter a decimal amount.");
  const [w, f = ""] = String(text).split(".");
  if (f.length > decimals) throw Error("Too many decimal places.");
  const n =
    BigInt(w) * 10n ** BigInt(decimals) +
    BigInt(f.padEnd(decimals, "0") || "0");
  if (n > MAX) throw Error("Amount is too large.");
  return n;
}
export function units(value, decimals = 9) {
  const n = BigInt(value),
    s = 10n ** BigInt(decimals);
  if (n < 0n) throw Error("Negative amount");
  const f = (n % s).toString().padStart(decimals, "0").replace(/0+$/, "");
  return String(n / s) + (f ? "." + f : "");
}
export const ceilDiv = (a, b) => (a + b - 1n) / b;
export function allocationEstimate(book, amount) {
  const raised = BigInt(book.raised),
    vT = BigInt(book.vToken),
    vS = BigInt(book.vPair),
    fees = BigInt(book.feeBps),
    curve = BigInt(book.curveSupply);
  const sold = (g) => {
    const net = (g * 10000n) / (10000n + fees);
    const n = vT - ceilDiv(vS * vT, vS + net);
    return n < curve ? n : curve;
  };
  return sold(raised + BigInt(amount)) - sold(raised);
}
export function entitlement(book, position) {
  const total = BigInt(book.totalWeight);
  if (!total) return { tokens: 0n, change: 0n };
  return {
    tokens: (BigInt(book.received) * BigInt(position.weight)) / total,
    change: (BigInt(book.leftover) * BigInt(position.weight)) / total,
  };
}
// Official SDK subtracts the rounded-down slippage deduction (ceil of retained amount).
export function minimumOutput(value,bps,buy=false){
 const n=BigInt(value),b=BigInt(bps);if(b<0n||b>10000n)throw Error('Invalid slippage');
 const out=n-(n*b)/10000n;return buy&&out<1n?1n:out;
}
