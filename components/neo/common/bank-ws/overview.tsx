import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Issue, WsTxn } from "@/config/pages/neo/mock-bank-ws";
import {
  deriveWs,
  issueOf,
  kindOf,
  ledgerOf,
  statusOf,
  useBankWs,
} from "@/hooks/pages/neo/use-bank-ws";
import { n } from "./shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HEADER_CLASS, TABLE_CLASS } from "@/components/inbox/v2/banking/table-parts";
import { T } from "@/components/inbox/v2/ui";

/**
 * The Overview sheet (17 Nov 2026): every statement line placed by ledger and
 * by how Neo matched it. A cell says how much and how many are still pending;
 * clicking it opens that group in its own sheet. Read-only: nothing here
 * approves anything.
 */
export type Slot = "exact" | Issue | "new";
export type Focus = { bucket: string; slot: Slot };

export const SLOTS: { id: Slot; label: string }[] = [
  { id: "exact", label: "Exact matches" },
  { id: "date", label: "Date differs" },
  { id: "amount", label: "Amount differs" },
  { id: "multiple", label: "Multiple" },
  { id: "new", label: "New entries" },
];

/** Matched lines by who paid whom; new entries by the ledger drafted for them. */
export const bucketOf = (t: WsTxn, o: Parameters<typeof ledgerOf>[1]) =>
  kindOf(t, o) === "new"
    ? ledgerOf(t, o) || "No ledger"
    : t.amount > 0
      ? "Customer receipts"
      : "Vendor payments";

export const slotOf = (t: WsTxn, o: Parameters<typeof ledgerOf>[1]): Slot => {
  const k = kindOf(t, o);
  return k === "exact" ? "exact" : k === "new" ? "new" : issueOf(t, o)!;
};

type Cell = { n: number; sum: number; pending: number };
const blank = (): Cell => ({ n: 0, sum: 0, pending: 0 });
/** Lakh and crore, so a cell stays narrow. */
const short = (x: number) => {
  const a = Math.abs(x);
  const v = a >= 1e7 ? `${(a / 1e7).toFixed(2)} Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)} L` : n(Math.round(a));
  return `${x < 0 ? "−" : "+"}₹${v}`;
};

const Overview = ({ open }: { open: (f: Focus) => void }) => {
  const ws = useBankWs();
  const d = deriveWs(ws);
  const { rows, totals } = useMemo(() => {
    const m = new Map<string, Record<Slot, Cell>>();
    const tot = { exact: blank(), date: blank(), amount: blank(), multiple: blank(), new: blank() } as Record<Slot, Cell>;
    [...d.exact, ...d.review, ...d.fresh].forEach((t) => {
      const o = ws.ov[t.id];
      const b = bucketOf(t, o);
      const s = slotOf(t, o);
      const row = m.get(b) || { exact: blank(), date: blank(), amount: blank(), multiple: blank(), new: blank() };
      const open = ["pending", "saved"].includes(statusOf(t, o));
      [row[s], tot[s]].forEach((c) => {
        c.n++;
        c.sum += t.amount;
        if (open) c.pending++;
      });
      m.set(b, row);
    });
    const order = ["Customer receipts", "Vendor payments"];
    const rows = [...m.entries()].sort(
      (a, b) =>
        (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) ||
        a[0].localeCompare(b[0])
    );
    return { rows, totals: tot };
  }, [d, ws.ov]);

  const sum = (r: Record<Slot, Cell>) =>
    SLOTS.reduce((a, s) => ({ n: a.n + r[s.id].n, sum: a.sum + r[s.id].sum, pending: a.pending + r[s.id].pending }), blank());

  const th = "h-10 bg-accent px-3 py-0";
  const body = (c: Cell, tip: string, onClick?: () => void, bold?: boolean) =>
    c.n === 0 ? (
      <TableCell className={cn("px-3 py-1 text-center text-secondary-foreground", T.cell)}>–</TableCell>
    ) : (
      <TableCell title={tip} className={cn("p-0", c.pending ? "bg-badge-notice/40" : "bg-badge-positive/40")}>
        <button
          type="button"
          disabled={!onClick}
          onClick={onClick}
          className={cn(
            "block w-full px-3 py-1.5 text-right tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            onClick && "cursor-pointer hover:brightness-95",
            bold && "font-semibold"
          )}
        >
          <span className={cn("block", T.cell)}>{short(c.sum)}</span>
          <span className={cn("block text-[11px]", "text-secondary-foreground")}>
            {c.pending ? `${n(c.pending)} pending` : `${n(c.n)} approved`}
          </span>
        </button>
      </TableCell>
    );

  const grand = sum(totals);
  return (
    <div className="flex flex-col gap-3" data-testid="ws-overview">
      <p className={T.value}>
        Every line by ledger and by how Neo matched it. Yellow still has pending lines; green is all approved. Click a cell to open it.
      </p>
      <div className="overflow-auto overscroll-none rounded-lg border border-neutral-gray bg-background">
        <Table className={cn(TABLE_CLASS, "min-w-[640px]")}>
          <TableHeader className={HEADER_CLASS}>
            <TableRow>
              <TableHead className={cn(th, T.head, "sticky left-0 z-30 w-[128px]")}>Ledger</TableHead>
              {SLOTS.map((s) => (
                <TableHead key={s.id} className={cn(th, T.head)}>{s.label}</TableHead>
              ))}
              <TableHead className={cn(th, T.head, "text-right")}>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([b, r]) => (
              <TableRow key={b} data-testid={`ws-ov-${b}`} className="border-0">
                <TableCell className={cn("sticky left-0 z-10 bg-accent px-3 py-1.5 font-medium", T.cell)}>
                  <span className="block truncate" title={b}>{b}</span>
                </TableCell>
                {SLOTS.map((s) => (
                  <React.Fragment key={s.id}>
                    {body(
                      r[s.id],
                      `${s.label} · ${b}: ${n(r[s.id].n)} lines · ${n(r[s.id].pending)} pending`,
                      () => open({ bucket: b, slot: s.id })
                    )}
                  </React.Fragment>
                ))}
                {body(sum(r), `${b}: ${n(sum(r).n)} lines`, undefined, true)}
              </TableRow>
            ))}
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell className={cn("sticky left-0 z-10 bg-accent px-3 py-1.5 font-semibold", T.cell)}>Total</TableCell>
              {SLOTS.map((s) => (
                <React.Fragment key={s.id}>
                  {body(totals[s.id], `${s.label}: ${n(totals[s.id].n)} lines · ${n(totals[s.id].pending)} pending`, () => open({ bucket: "", slot: s.id }), true)}
                </React.Fragment>
              ))}
              {body(grand, `${n(grand.n)} lines`, undefined, true)}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Overview;
