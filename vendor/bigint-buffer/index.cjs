"use strict";
// SPL layout utilities need these four unsigned integer conversions. Avoid the
// upstream native converter's memory-safety vulnerability entirely. Bound work
// and reject overflow rather than silently truncating a financial amount.
const MAX_BYTES = 4096;
function bytes(value) {
  if (!(value instanceof Uint8Array) || value.length > MAX_BYTES)
    throw new TypeError("Expected a bounded byte buffer.");
  return Buffer.from(value);
}
function decode(value, little) {
  const buffer = bytes(value);
  if (little) buffer.reverse();
  return buffer.length ? BigInt("0x" + buffer.toString("hex")) : 0n;
}
function encode(value, width, little) {
  if (
    typeof value !== "bigint" ||
    value < 0n ||
    !Number.isSafeInteger(width) ||
    width < 0 ||
    width > MAX_BYTES
  )
    throw new RangeError("Expected an unsigned bigint and bounded byte width.");
  if (value >> BigInt(width * 8))
    throw new RangeError("Integer does not fit the requested width.");
  const result = Buffer.alloc(width);
  for (let i = 0; i < width; i++) {
    result[little ? i : width - 1 - i] = Number(value & 255n);
    value >>= 8n;
  }
  return result;
}
exports.toBigIntLE = (value) => decode(value, true);
exports.toBigIntBE = (value) => decode(value, false);
exports.toBufferLE = (value, width) => encode(value, width, true);
exports.toBufferBE = (value, width) => encode(value, width, false);
