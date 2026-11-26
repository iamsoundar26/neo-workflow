import React, { useEffect, useMemo, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnderlineTabs } from "@/components/inbox/v2/banking/table-parts";
import { Notice, T } from "@/components/inbox/v2/ui";
import { cn } from "@/lib/utils";
import {
  HELD,
  LINES,
  amountOf,
  inr,
  isHeld,
  isNewVoucher,
  ledgersOf,
  matchOf,
  vouchersOf,
  type MatchStatus,
  type ReviewRow,
} from "@/config/pages/neo/mock-bank-review";
import {
  approveLines,
  bulkOf,
  flowStats,
  flowStatus,
  unapproveLines,
  useBankFlow,
  useFlowFocus,
  type FlowStatus,
  type FlowTab,
} from "@/hooks/pages/neo/use-bank-review";
import SheetGrid, { type Col } from "../bank-ws/grid";
import { Pill } from "../bank-ws/details";
import TxnTable from "./txn-table";
import LineDetail, { tone } from "../bank-review/detail";
import { plural, STATE } from "./shared";

/**
 * The Review Table beside the chat, in the Bank reconciliation (19 Nov 2026):
 * the work of approving, in the order a person does it. Exact, Potential and
 * No match each open as a short list with what Neo matched and why; a line
 * opens as Transaction Details to see the voucher, edit it and approve. What
 * can be approved together has one button, with Undo. The whole sheet, every
 * column, is one switch away.
 *
 * Nothing here changes the books. Approving only records the decision; Neo
 * asks in the chat to create the entries, then to sync them.
 *
 * DEV: PATCH /api/bank-recon/runs/:id/lines/:lineId.
 */

const GROUP_NOTE: Record<string, string> = {
  Exact: `The amount, date and reference are the same as the voucher in Tally. Lines of ₹${HELD.toLocaleString("en-IN")} or more are approved one at a time.`,
  Potential: "Close to a voucher in Tally, but something differs. Open a line to see what, then approve it or fix it.",
  "No match": "Nothing in Tally matches these. Neo drafted a voucher for each, from your accounting policy.",
  Excluded: "Left out of this reconciliation. They are not sent to Tally.",
};
const WHAT: Record<string, string> = { Exact: "Approve", Potential: "Review", "No match": "Approve" };

const GroupView = ({ group, onOpen }: { group: MatchStatus; onOpen: (id: string) => void }) => {
  const flow = useBankFlow();
  const [done, setDone] = useState<string[] | null>(null);
  useEffect(() => setDone(null), [group]);

  const all = LINES.filter((r) => matchOf(r) === group);
  const order: FlowStatus[] = ["fix", "pending", "approved", "synced", "excluded"];
  const rows = [...all].sort((a, b) => order.indexOf(flowStatus(a, flow)) - order.indexOf(flowStatus(b, flow)));
  const bulk = bulkOf(group, flow);

  /** The line under the narration: what it is matched to, or posted to, and why. */
  const under = (r: ReviewRow) => {
    const to = isNewVoucher(r.line)
      ? ledgersOf(r.line).map((l) => l.name).join(" + ")
      : vouchersOf(r.line, flow.edits).filter((v) => !v.alt).map((v) => `${v.no} · ${v.party}`).join(" + ");
    const st = flowStatus(r, flow);
    const note = st === "fix" ? "Amounts differ" : st === "pending" && isHeld(r) ? "Large amount" : "";
    return [to && `${group === "No match" ? "Post to" : "→"} ${to}`, note].filter(Boolean).join(" · ");
  };
  const cols: Col<ReviewRow>[] = [
    { id: "d", label: "Date", width: 66, render: (r) => r.c[0].slice(0, 6) },
    {
      id: "n",
      label: "Bank narration",
      width: 250,
      render: (r) => (
        <span className="block leading-4">
          <span className="block truncate font-medium">{r.c[1]}</span>
          <span className="block truncate text-[11px] text-secondary-foreground" title={r.c[5]}>{under(r) || r.c[5]}</span>
        </span>
      ),
    },
    { id: "a", label: "Amount (₹)", width: 112, num: true, render: (r) => `${inr(amountOf(r))} ${amountOf(r) < 0 ? "Dr" : "Cr"}` },
    {
      id: "x",
      label: "",
      width: 112,
      render: (r) => {
        const st = flowStatus(r, flow);
        if (st !== "pending" && st !== "fix") return <Pill tone={STATE[st].tone}>{STATE[st].label}</Pill>;
        const easy = st === "pending" && group !== "Potential" && !isHeld(r);
        return (
          <button
            type="button"
            data-testid={`row-action-${r.line}`}
            onClick={(e) => {
              e.stopPropagation();
              if (easy) {
                approveLines([r.line]);
                setDone(null);
              } else onOpen(r.line);
            }}
            className={cn(
              "inline-flex h-7 items-center rounded-md border px-3 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              easy ? "border-pi-btn-primary-edge bg-pi-btn-fill text-primary-foreground hover:bg-primary-hover" : "border-border bg-background text-foreground hover:bg-neutral-gray"
            )}
          >
            {easy ? WHAT[group] : "Review"}
          </button>
        );
      },
    },
  ];

  return (
    <>
      <div className="flex flex-none flex-col gap-3 px-6 py-4">
        <p className={T.value}>{GROUP_NOTE[group]}</p>
        {done && (
          <Notice tone="success" className="flex flex-wrap items-center justify-between gap-2" data-testid="bulk-done">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-pi-success" /> {plural(done.length, "line")} approved.</span>
            <Button variant="link" size="sm" data-testid="bulk-undo" onClick={() => { unapproveLines(done); setDone(null); }}>
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </Button>
          </Notice>
        )}
        {bulk.length > 0 && (
          <Notice tone="info" className="flex flex-wrap items-center justify-between gap-3" data-testid="bulk-bar">
            <span className="text-foreground">
              <strong>{bulk.length}</strong> {bulk.length === 1 ? "line" : "lines"} can be approved together
              {group === "No match" && <span className="text-secondary-foreground"> · Neo creates the vouchers when you say so</span>}
            </span>
            <Button data-testid="bulk-go" onClick={() => setDone(approveLines(bulk.map((r) => r.line)))}>
              <Check className="h-4 w-4" /> Approve {bulk.length}
            </Button>
          </Notice>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
        <SheetGrid
          rows={rows}
          rowKey={(r) => r.line}
          testId={(r) => `review-row-${r.line}`}
          onRow={(r) => onOpen(r.line)}
          rowLabel={(r) => `Open ${r.c[1]}`}
          columns={cols}
        />
      </div>
    </>
  );
};

const BankFlowPanel = () => {
  const flow = useBankFlow();
  const focus = useFlowFocus();
  const stats = useMemo(() => flowStats(flow), [flow]);
  const [view, setView] = useState<"groups" | "table">("groups");
  const [tab, setTab] = useState<FlowTab>("Exact");
  const [open, setOpen] = useState<string | null>(null);
  // The match results open a group here.
  useEffect(() => {
    if (focus.n === 0) return;
    setTab(focus.tab === "All" ? "Exact" : focus.tab);
    setView("groups");
    setOpen(null);
  }, [focus.n]);

  if (open) return <LineDetail key={open} id={open} scope="flow" onClose={() => setOpen(null)} />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="bank-flow-panel">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-neutral-gray px-6 py-2.5">
        <p className={cn(T.value, "min-w-0 truncate")} data-testid="flow-progress">
          <strong className="font-semibold text-foreground">{stats.approved}</strong> of {stats.toApprove} lines approved
        </p>
        <div role="radiogroup" aria-label="Show as" className="inline-flex flex-none rounded-md border border-border p-0.5">
          {([["groups", "By group"], ["table", "Full table"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              onClick={() => setView(id)}
              data-testid={`panel-view-${id}`}
              className={cn(
                "h-6 rounded-[4px] px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === id ? "bg-accent text-primary" : "text-secondary-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === "table" ? (
        <TxnTable onOpen={setOpen} />
      ) : (
        <>
          <UnderlineTabs
            value={tab}
            onChange={(t) => setTab(t as FlowTab)}
            tabs={stats.groups.map((g) => ({
              id: g.group,
              label: g.group,
              count: g.group === "Excluded" ? g.n : g.pending,
            }))}
          />
          <GroupView key={tab} group={(tab === "All" ? "Exact" : tab) as MatchStatus} onOpen={setOpen} />
        </>
      )}
    </div>
  );
};

export default BankFlowPanel;
