function durationSeconds(minutes) {
  const n = Number(minutes);
  if (!Number.isInteger(n) || n < 1 || n > 60)
    throw Error("Choose a window from 1 to 60 minutes.");
  return n * 60;
}
export function validateTerms(input, config) {
  const name = String(input.name || "").trim(),
    symbol = String(input.symbol || "").trim(),
    uri = String(input.uri || "");
  if (!name || new TextEncoder().encode(name).length > 32)
    throw Error("Use a name up to 32 bytes.");
  if (!/^[A-Za-z0-9]{1,10}$/.test(symbol))
    throw Error(
      "Use 1–10 letters or digits for the ticker. Lowercase is supported.",
    );
  if (
    !/^https:\/\/(ipfs\.io|gateway\.pinata\.cloud|[a-z0-9.-]+\.public\.blob\.vercel-storage\.com)\//.test(
      uri,
    ) &&
    !/^https:\/\/arweave.net\/[A-Za-z0-9_-]+$/.test(uri)
  )
    throw Error("Upload the coin image and metadata before review.");
  if (uri.length > 200) throw Error("The metadata link is too long.");
  const duration = durationSeconds(input.minutes);
  if (duration < config.minDuration || duration > config.maxDuration)
    throw Error("The selected window is outside the current protocol limits.");
  const capBps = Number(input.capBps);
  if (
    !Number.isInteger(capBps) ||
    capBps < config.minCapBps ||
    capBps > config.maxCapBps
  )
    throw Error("The wallet cap is outside current protocol limits.");
  return { name, symbol, uri, duration, capBps, creatorFeeBps: 0 };
}
