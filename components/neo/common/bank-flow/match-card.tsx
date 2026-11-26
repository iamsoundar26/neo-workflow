import React, { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HEADER_CLASS, TABLE_CLASS } from "@/components/inbox/v2/banking/table-parts";
import { T } from "@/components/inbox/v2/ui";
import { cn } from "@/lib/utils";
import { flowStats, useBankFlow, type FlowTab, type GroupStat } from "@/hooks/pages/neo/use-bank-review";
import { Pill } from "../bank-ws/details";
import { tone } from "../bank-review/detail";
import { GroupState, SHELL, plural, rupees, useOpenGroup } from "./shared";

/**
 * The match results, in the chat (19 Nov 2026): the table the 3-way recon
 * says its own, one row per match status. Each row opens beside the chat to
 * review and approve that group. The card follows the run, so a group says so
 * once it is approved.
 */

const AsTable = ({ groups, total, onOpen }: { groups: GroupStat[]; total: { n: number; amount: number; pending: number }; onOpen: (t: FlowTab) => void }) => {
  const th = cn("h-9 bg-accent px-3 py-0", T.head);
  const td = cn("h-10 px-3 py-0", T.cell);
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-gray" data-testid="match-table">
      <Table className={TABLE_CLASS}>
        <TableHeader className={HEADER_CLASS}>
          <TableRow>
            <TableHead className={th}>Match status</TableHead>
            <TableHead className={cn(th, "w-[84px] text-right")}>Bank lines</TableHead>
            <TableHead className={cn(th, "w-[120px] text-right")}>Amount (₹)</TableHead>
            <TableHead className={cn(th, "w-[230px]")}>Pending action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow
              key={g.group}
              role="button"
              tabIndex={0}
              data-testid={`match-row-${g.group}`}
              aria-label={`${g.group}: open to review`}
              onClick={() => onOpen(g.group as FlowTab)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(g.group as FlowTab);
                }
              }}
              className="cursor-pointer border-0 outline-none focus-visible:bg-muted/40"
            >
              <TableCell className={td}><Pill tone={tone(g.group) as "green"}>{g.group}</Pill></TableCell>
              <TableCell className={cn(td, "text-right tabular-nums")}>{g.n}</TableCell>
              <TableCell className={cn(td, "text-right tabular-nums")}>{rupees(g.amount).slice(1)}</TableCell>
              <TableCell className={td}>
                <span className="flex items-center justify-between gap-2">
                  <GroupState g={g} />
                  <span className="inline-flex h-6 flex-none items-center gap-0.5 rounded-md border border-border px-2 text-[12px] font-medium text-foreground">
                    {g.pending > 0 ? "Review" : "View"}
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </span>
                </span>
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-0 hover:bg-transparent">
            <TableCell className={cn(td, "font-semibold")}>Total</TableCell>
            <TableCell className={cn(td, "text-right font-semibold tabular-nums")}>{total.n}</TableCell>
            <TableCell className={cn(td, "text-right font-semibold tabular-nums")}>{rupees(total.amount).slice(1)}</TableCell>
            <TableCell className={cn(td, "font-semibold")}>{total.pending ? `${total.pending} to approve` : "None"}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};

const MatchCard = () => {
  const flow = useBankFlow();
  const s = useMemo(() => flowStats(flow), [flow]);
  const open = useOpenGroup();
  return (
    <section className={cn(SHELL, "max-w-[640px] px-4 py-3.5")} data-testid="bank-match" aria-label="Match results">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold leading-5 text-foreground">Match results</h3>
        <p className={T.sub}>
          {plural(s.lines, "bank line")} · {rupees(s.amount)}. Open a row to review and approve it.
        </p>
      </div>
      <AsTable groups={s.groups} total={{ n: s.lines, amount: s.amount, pending: s.pending }} onOpen={open} />
    </section>
  );
};

export default MatchCard;
