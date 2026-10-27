export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return (
      new URL(origin).host ===
      (req.headers.get("host") || new URL(req.url).host)
    );
  } catch {
    return false;
  }
}
export async function body(req, max = 14000) {
  const text = await req.text();
  if (text.length > max) throw Error("Request too large");
  return JSON.parse(text);
}

export function publicError(error,fallback){
 const message=typeof error?.message==='string'?error.message:'';
 if(/https?:|api.?key|bearer|authorization/i.test(message))return fallback;
 return /^(Use |Choose |Enter |Upload |The selected |The wallet cap |The metadata |The upstream |The protocol |The pool |This |Only SOL|New launch |Wallet actions|Trading is paused|Buy amounts|Unknown wallet|Unknown trade)/.test(message)?message:fallback;
}
export function rpcFailureMessage(method, validated = true, paused = false) {
  if (paused) return "Launch transactions open after program deployment and verification.";
  if (!validated) return "This request could not be prepared. Nothing was submitted.";
  if (method === "sendTransaction") return "Submission could not be confirmed. Check the saved transaction before retrying.";
  if (method === "simulateTransaction") return "The transaction preview could not complete. Nothing was submitted.";
  return "Network data could not refresh. Try again shortly.";
}
