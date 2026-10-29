import Icon from "./icon";
import { ENIGMA_X_PROFILE, xProfileUrl } from "@/lib/site-links.mjs";
export default function XLink({ url }: { url?: string | null }) {
  const href = xProfileUrl(url || ENIGMA_X_PROFILE);
  return href ? (
    <a className="header-x" href={href} target="_blank" rel="noopener noreferrer" aria-label="Project on X" title="Project on X">
      <Icon name="x" size={17} />
    </a>
  ) : (
    <button className="header-x" type="button" disabled aria-label="Project on X — profile not added yet" title="The project’s X profile will be added before launch">
      <Icon name="x" size={17} />
    </button>
  );
}
