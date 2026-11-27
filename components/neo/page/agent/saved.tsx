import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** True for a moment after `at`, then false: what a "Saved" flash is made of. */
const useRecent = (at: number | null | undefined, ms: number) => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!at) return;
    const left = ms - (Date.now() - at);
    if (left <= 0) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), left);
    return () => window.clearTimeout(t);
  }, [at, ms]);
  return on;
};

/**
 * Where a change landed: a quiet "Saved" at the end of the node's heading that
 * fades after a few seconds. Fields save as you change them, so this is the
 * answer to "did that take?", placed on the card that changed.
 */
export const SavedChip = ({ at }: { at?: number }) => {
  const on = useRecent(at, 2800);
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="saved-chip"
      className={cn(
        "ml-auto inline-flex flex-none items-center gap-1 rounded-full bg-pi-success-bg px-2 py-0.5 text-[12px] font-medium leading-4 text-pi-success transition-opacity duration-300",
        on ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <Check className="h-3 w-3" aria-hidden />
      {on ? "Saved" : ""}
    </span>
  );
};

/**
 * The page-level answer, in the bar: nothing before the first change, then
 * "Saving as you go" confirmed by a check that pulses on every change.
 */
export const SaveStatus = ({ at }: { at: number | null }) => {
  const on = useRecent(at, 1600);
  if (!at) return <span className="text-[12px] text-pi-faint max-md:hidden">Changes save as you make them</span>;
  return (
    <span data-testid="save-status" role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[12px] text-pi-body max-md:hidden">
      <span className={cn("grid h-4 w-4 place-items-center rounded-full bg-pi-success-bg text-pi-success transition-transform", on && "scale-125")}>
        <Check className="h-3 w-3" aria-hidden />
      </span>
      All changes saved
    </span>
  );
};
