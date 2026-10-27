import type { SVGProps } from "react";
export type SymbolName =
  | "clock"
  | "star"
  | "copy"
  | "grid"
  | "list"
  | "search"
  | "arrow"
  | "arrow-up"
  | "plus"
  | "refresh"
  | "wallet"
  | "watch"
  | "stocks"
  | "activity"
  | "book"
  | "close"
  | "x"
  | "check"
  | "vault"
  | "holders"
  | "burn"
  | "chevron"
  | "menu"
  | "pause"
  | "play";
const paths: Record<SymbolName, React.ReactNode> = {
 clock:<><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
 star:<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>,
 copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/></>,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: (
    <>
      <path d="M8 5h13M8 12h13M8 19h13" />
      <path d="M3 5h.01M3 12h.01M3 19h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  "arrow-up": <path d="M5 19 19 5M5 5h14v14" />,
  plus: <path d="M12 4v16M4 12h16" />,
  refresh: (
    <>
      <path d="M20 9a8 8 0 1 0 0 6M20 3v6h-6" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V5H5a2 2 0 0 1 0-4h12v4M3 3v16a2 2 0 0 0 2 2h15V8H3" />
      <path d="M20 12h-5v5h5" />
    </>
  ),
  watch: (
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />
  ),
  stocks: (
    <>
      <path d="M3 20h18M6 16V9m6 7V4m6 12v-5M4 9h4m2-5h4m2 7h4" />
    </>
  ),
  activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
  book: (
    <>
      <path d="M12 5v16M3 3h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  x: <path d="M4 4h4l12 16h-4L4 4Zm0 16 7-8m2-2 7-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  vault: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 7v3m5 2h-3m-2 5v-3m-5-2h3M6 3v3m12 15v-3" />
    </>
  ),
  holders: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v1" />
    </>
  ),
  burn: (
    <path d="M12 2c0 6-7 7-7 13a7 7 0 0 0 14 0c0-3-2-5-3-6-1 3-2 4-3 4 1-4 1-6-1-11Z" />
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  pause: (
    <>
      <path d="M8 4v16M16 4v16" />
    </>
  ),
  play: <path d="m8 4 12 8-12 8Z" />,
};
export default function UiSymbol({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: SymbolName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
