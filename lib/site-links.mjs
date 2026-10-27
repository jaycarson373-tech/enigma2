// Public profile only. Never turn an arbitrary environment URL into a header link.
export const ENIGMA_X_PROFILE = "https://x.com/Enigma_markets";
export function xProfileUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const name = url.pathname.replace(/^\/|\/$/g, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) ||
      url.search || url.hash || !/^[A-Za-z0-9_]{1,15}$/.test(name) ||
      ["home", "intent", "share", "i", "search", "explore", "settings"].includes(name.toLowerCase())) return null;
    return `https://x.com/${name}`;
  } catch { return null; }
}
