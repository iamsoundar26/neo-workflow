import React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useNeo } from "@/hooks/pages/neo/use-neo";
import { closeDocPreview, useDocPreview } from "@/hooks/pages/neo/use-doc-preview";
import {
  approveLines,
  bulkOf,
  flowStats,
  showSheetGroup,
  useBankFlow,
  useSheetFocus,
  type FlowTab,
  type GroupStat,
} from "@/hooks/pages/neo/use-bank-review";
import { inr, type MatchStatus } from "@/config/pages/neo/mock-bank-review";
import { sameDoc } from "@/utils/pages/neo/canvas";
import { Pill } from "../bank-ws/details";
import type { NeoMessage } from "@/types/pages/neo";

/**
 * The match results, as one table in the chat (20 Nov 2026): a row per match
 * status with its lines, amount and what is left to do. The row carries its own
 * action (Approve the ready lines, or Review) and a View button that opens the
 * Review Table on that group. It is live, so a row turns to "Approved" and then
 * "Synced" as the work is done, here or in the Review Table. After the sync the
 * same table is shown again as the closing summary, without the buttons.
 */
const TONE: Record<MatchStatus, "green" | "amber" | "red" | "grey"> = {
  Exact: "green",
  Potential: "amber",
  "No match": "red",
  Excluded: "grey",
};
const head = "h-10 bg-accent px-3 text-label-3 font-semibold text-secondary-foreground";

const ReviewGroups = ({ message, summary = false }: { message: NeoMessage; summary?: boolean }) => {
  const neo = useNeo();
  const preview = useDocPreview();
  const focus = useSheetFocus();
  const flow = useBankFlow();
  const s = flowStats(flow);
  const open = !preview && sameDoc(neo.messages, neo.canvas, message);
  const go = (tab: FlowTab) => {
    closeDocPreview();
    showSheetGroup(tab);
    if (!sameDoc(neo.messages, neo.canvas, message)) neo.setCanvas(message.id);
  };

  const action = (g: GroupStat) => {
    if (g.group === "Excluded") return <span className="text-secondary-foreground">Left out</span>;
    if (g.pending === 0)
      return (
        <span className="inline-flex items-center gap-1 font-medium text-success-green-foreground">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {g.synced === g.n ? "Synced" : "Approved"}
        </span>
      );
    if (summary) return <span className="text-secondary-foreground">{g.pending} pending</span>;
    const ready = bulkOf(g.group, flow).length;
    return ready > 0 ? (
      <Button size="sm" className="h-7 px-3" data-testid={`group-approve-${g.group}`} onClick={(e) => { e.stopPropagation(); approveLines(bulkOf(g.group).map((r) => r.line)); }}>
        Approve {ready}
      </Button>
    ) : (
      <Button variant="outline" size="sm" className="h-7 px-3" data-testid={`group-review-${g.group}`} onClick={(e) => { e.stopPropagation(); go(g.group as FlowTab); }}>
        Review {g.pending}
      </Button>
    );
  };

  const pending = s.groups.reduce((n, g) => n + (g.group === "Excluded" ? 0 : g.pending), 0);
  return (
    <div className="max-w-[560px] overflow-hidden rounded-lg border border-neutral-gray bg-background" data-testid={summary ? "final-summary" : "review-groups"}>
      <Table className="table-fixed text-body-3">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(head, "w-[104px]")}>Match status</TableHead>
            <TableHead className={cn(head, "w-[84px] whitespace-nowrap text-right")}>Bank lines</TableHead>
            <TableHead className={cn(head, "w-[116px] whitespace-nowrap border-r border-neutral-gray text-right")}>Amount (₹)</TableHead>
            <TableHead className={head}>{summary ? "Status" : "Pending action"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.groups.map((g) => {
            const selected = open && focus.tab === g.group;
            return (
              <TableRow key={g.group} data-testid={`group-tile-${g.group}`} data-done={g.pending === 0} tabIndex={0} role="button" aria-label={`Open ${g.group} lines in the Review Table`}
                onClick={() => go(g.group as FlowTab)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) go(g.group as FlowTab); }}
                className={cn("cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border", selected && "bg-pi-brand-tint")}>
                <TableCell className="h-11 px-3 py-0">
                  <Pill tone={TONE[g.group]}>{g.group}</Pill>
                </TableCell>
                <TableCell className="px-3 py-0 text-right tabular-nums">{g.n}</TableCell>
                <TableCell className="border-r border-neutral-gray px-3 py-0 text-right tabular-nums">{inr(g.amount)}</TableCell>
                <TableCell className="px-3 py-0">
                  <span className="flex items-center gap-2">
                    {action(g)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="hover:bg-transparent">
            <TableCell className="h-11 px-3 py-0 font-semibold">Total</TableCell>
            <TableCell className="px-3 py-0 text-right font-semibold tabular-nums">{s.lines}</TableCell>
            <TableCell className="border-r border-neutral-gray px-3 py-0 text-right font-semibold tabular-nums">{inr(s.amount)}</TableCell>
            <TableCell className="px-3 py-0 font-semibold">{pending ? `${pending} pending` : "None"}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

export default ReviewGroups;
