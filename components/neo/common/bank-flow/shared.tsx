import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNeo } from "@/hooks/pages/neo/use-neo";
import { showGroup, type FlowStatus, type FlowTab, type GroupStat } from "@/hooks/pages/neo/use-bank-review";
import { sameDoc } from "@/utils/pages/neo/canvas";

/** A card in the chat, as the other bank cards draw theirs. */
export const SHELL = "rounded-xl border border-pi-line-2 bg-background shadow-contact";

export const rupees = (n: number, decimals = 2) =>
  `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Open the Review Table beside the chat, on one group. */
export const useOpenGroup = () => {
  const neo = useNeo();
  return (tab: FlowTab) => {
    showGroup(tab);
    const m = [...neo.messages].reverse().find((x) => x.card?.kind === "bank-review" && x.card.quick);
    if (m && !sameDoc(neo.messages, neo.canvas, m)) neo.setCanvas(m.id);
  };
};

/** Where a group stands, in a few words. */
export const GroupState = ({ g, className }: { g: GroupStat; className?: string }) => {
  if (g.group === "Excluded") return <span className={cn("text-secondary-foreground", className)}>Left out</span>;
  if (g.pending === 0)
    return (
      <span className={cn("inline-flex items-center gap-1 font-medium text-pi-success", className)}>
        <Check className="h-3 w-3" aria-hidden />
        {g.synced === g.n ? "Synced" : "Approved"}
      </span>
    );
  return (
    <span className={cn("text-secondary-foreground", className)}>
      {g.approved > 0 ? `${g.approved} approved · ${g.pending} to go` : `${g.pending} to approve`}
    </span>
  );
};

/** How a line's state reads, in words and colour. */
export const STATE: Record<FlowStatus, { label: string; tone: "grey" | "green" | "amber" | "blue" }> = {
  pending: { label: "To approve", tone: "grey" },
  fix: { label: "Amounts differ", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  synced: { label: "Synced", tone: "blue" },
  excluded: { label: "Excluded", tone: "grey" },
};
