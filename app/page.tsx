import Terminal from "@/components/terminal";
import { xProfileUrl } from "@/lib/site-links.mjs";
export default function Page() {
  return <Terminal xUrl={xProfileUrl(process.env.BLOCK_X_URL || process.env.IPO_X_URL || process.env.OPENBELL_X_URL || process.env.ENIGMA_X_URL)} />;
}
