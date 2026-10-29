"use client";
import { memo } from "react";
import Icon from "./icon";

type Props = { minutes: string; capBps: string; onMinutes: (minutes: string) => void };
function LaunchBlueprint({ minutes, capBps, onMinutes }: Props) {
  const value = Math.min(60, Math.max(1, Number(minutes) || 3));
  return (
    <aside className="launch-console" aria-label="Quick launch settings">
      <div className="console-heading"><span>MAKE ROOM FOR YOUR PEOPLE</span><Icon name="clock" size={16} /></div>
      <div className="window-readout" aria-live="polite"><strong>{value}<small>min</small></strong><span>A little time to come together.</span></div>
      <div className="window-ruler" aria-hidden="true">{Array.from({ length: 60 }, (_, i) => <i key={i} className={i < value ? "filled" : ""} />)}</div>
      <div className="console-presets" role="group" aria-label="Quick launch window">
        {[3, 15, 60].map((n) => <button key={n} type="button" aria-pressed={Number(minutes) === n} onClick={() => onMinutes(String(n))}>{n === 60 ? "1 hour" : `${n} minutes`}</button>)}
      </div>
      <div className="console-policy"><span>POOL ASSET <b>STONK</b></span><span>WALLET CAP <b>{Number(capBps) / 100}%</b></span></div>
    </aside>
  );
}
export default memo(LaunchBlueprint);
