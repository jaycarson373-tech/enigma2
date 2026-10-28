"use client";
import Icon from "./icon";
import { memo } from "react";

type Props = {
  minutes: string;
  capBps: string;
  onMinutes: (minutes: string) => void;
};
/** A view of the creator's settings, never simulated activity or a market. */
function LaunchBlueprint({ minutes, capBps, onMinutes }: Props) {
  const value = Math.min(60, Math.max(1, Number(minutes) || 3));
  return (
    <aside className="launch-console" aria-label="Quick launch settings">
      <div className="console-heading">
        <span>
          <i /> ENIGMA / LAUNCH SETTINGS
        </span>
        <Icon name="grid" size={13} />
      </div>
      <p className="visually-hidden" aria-live="polite">
        Selected window: {value} minutes.
      </p>
      <div className="console-body">
        <div className="cipher-dial" aria-hidden="true">
          <svg viewBox="0 0 240 240" fill="none">
            <defs>
              <linearGradient
                id="dial-metal"
                x1="28"
                y1="20"
                x2="210"
                y2="220"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#b7ceff" />
                <stop offset="1" stopColor="#466aa8" />
              </linearGradient>
            </defs>
            <circle cx="120" cy="120" r="108" stroke="#27364d" />
            <circle
              cx="120"
              cy="120"
              r="89"
              stroke="#20314c"
              strokeDasharray="2 9"
            />
            {Array.from({ length: 60 }, (_, i) => (
              <path
                key={i}
                d={i % 5 === 0 ? "M120 14v10" : "M120 16v4"}
                stroke={i % 5 === 0 ? "#9cb8ec" : "#3d506e"}
                transform={`rotate(${i * 6} 120 120)`}
              />
            ))}
            <g
              className="cipher-rotor"
              style={{ transform: `rotate(${value * 6}deg)` }}
            >
              <path
                d="M120 12a108 108 0 0 1 102.7 74.6"
                stroke="url(#dial-metal)"
                strokeWidth="2"
              />
              <path d="m120 30-4 7h8z" fill="#a9c6ff" />
              <circle cx="120" cy="12" r="3" fill="#c2d7ff" />
            </g>
            <path
              d="M42 68h17M181 172h17M68 198v-17M172 59V42"
              stroke="#44658f"
            />
            <circle cx="120" cy="120" r="71" fill="#101a2a" stroke="#314465" />
            <path d="M120 49v8m0 126v8M49 120h8m126 0h8" stroke="#6585b6" />
          </svg>
          <div className="dial-readout">
            <span>
              {value === 60 ? "1" : value}
              <em>{value === 60 ? "hr" : "min"}</em>
            </span>
            <small>YOUR LAUNCH WINDOW</small>
          </div>
        </div>
        <div className="console-settings">
          <p>Set the opening.</p>
          <span>
            Pick a window.
            <br />
            Take it into your launch.
          </span>
          <div
            className="console-presets"
            role="group"
            aria-label="Quick launch window"
          >
            {[3, 15, 60].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={Number(minutes) === n}
                onClick={() => onMinutes(String(n))}
              >
                {n === 60 ? "1 hour" : `${n} min`}
              </button>
            ))}
          </div>
          <a href="/docs#allocation">
            How allocation works <Icon name="arrow-up" size={11} />
          </a>
        </div>
      </div>
      <div className="console-policy">
        <span>
          POOL IN <b>STONK</b>
        </span>
        <span>
          WALLET CAP <b>{Number(capBps) / 100}%</b>
        </span>
        <span>
          FIRST BUY <b>Atomic</b>
        </span>
      </div>
    </aside>
  );
}

export default memo(LaunchBlueprint);
