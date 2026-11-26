import React, { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type AvatarState =
  | "idle"
  | "thinking"
  | "writing"
  | "waiting"
  | "paused";

type Props = { className?: string; state?: AvatarState };

/**
 * Neo's reply avatar (Bank reconciliation 3, 23 Nov 2026): a bronze sparkle
 * with three dots. It has a state for each moment of a reply:
 *  - idle: just the sparkle, still; the dots are hidden
 *  - thinking: the dots rise in a wave, the sparkle turns slowly, a warm halo breathes
 *  - writing: the same, quicker, and the sparkle twinkles with the words
 *  - waiting: the dots hold and the last one blinks: your turn
 *  - paused: everything holds, dimmed
 *  - done: when work ends the sparkle pops once and throws three small sparks
 * Hover turns the sparkle a quarter and ripples the dots; a click makes it
 * squish and throw sparks. Every motion stops under reduced-motion.
 */
const NeoAvatar = ({ className, state = "idle" }: Props) => {
  const uid = useId().replace(/:/g, "");
  const [pop, setPop] = useState(0);
  const [burst, setBurst] = useState(0);
  const was = useRef(state);

  // Work just ended: one celebratory pop.
  useEffect(() => {
    const busy = (s: AvatarState) => s === "thinking" || s === "writing";
    if (busy(was.current) && !busy(state) && state !== "waiting" && state !== "paused")
      setPop((n) => n + 1);
    was.current = state;
  }, [state]);

  return (
    <span
      aria-hidden
      data-state={state}
      onClick={() => setBurst((n) => n + 1)}
      className={cn(
        "neo-avatar relative inline-grid h-6 w-12 flex-none cursor-pointer select-none place-items-center",
        className
      )}
    >
      <span className="neo-avatar-halo absolute inset-y-0 left-0 w-8 rounded-full" />
      <svg viewBox="0 0 58 32" className="relative h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E6B77E" />
            <stop offset="0.5" stopColor="#A9763C" />
            <stop offset="1" stopColor="#6E4320" />
          </linearGradient>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}c`}>
            <path d="M16 2C17.5 10 22 14.5 30 16C22 17.5 17.5 22 16 30C14.5 22 10 17.5 2 16C10 14.5 14.5 10 16 2Z" />
          </clipPath>
        </defs>
        {/* sparks thrown on done / click */}
        <g key={`s${pop}-${burst}`} className={cn("neo-sparks", (pop || burst) && "is-on")}>
          <circle className="neo-spark neo-spark-1" cx="16" cy="16" r="1.6" fill="#E6B77E" />
          <circle className="neo-spark neo-spark-2" cx="16" cy="16" r="1.3" fill="#E0A86B" />
          <circle className="neo-spark neo-spark-3" cx="16" cy="16" r="1.1" fill="#A9763C" />
        </g>
        <g className={cn("neo-star", pop > 0 && "neo-star-pop")} key={`p${pop}-${burst}`}>
          <path
            d="M16 2C17.5 10 22 14.5 30 16C22 17.5 17.5 22 16 30C14.5 22 10 17.5 2 16C10 14.5 14.5 10 16 2Z"
            fill={`url(#${uid}b)`}
          />
          <g clipPath={`url(#${uid}c)`}>

          </g>
        </g>
        <g fill={`url(#${uid}b)`}>
          <circle className="neo-dot neo-dot-1" cx="40" cy="16" r="2.6" />
          <circle className="neo-dot neo-dot-2" cx="47" cy="16" r="2.6" />
          <circle className="neo-dot neo-dot-3" cx="54" cy="16" r="2.6" />
        </g>
      </svg>
    </span>
  );
};

export default NeoAvatar;
