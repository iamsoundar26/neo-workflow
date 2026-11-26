import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HEADER_CLASS, TABLE_CLASS } from "@/components/inbox/v2/banking/table-parts";
import { T } from "@/components/inbox/v2/ui";
import { cn } from "@/lib/utils";

/**
 * A sheet, drawn with the product's own table (components/ui/table, and the
 * grid classes the Banking tables share): fixed layout, hairlines between
 * cells, the grey frozen header, 12px cell text. The row-number gutter and the
 * grouped header row are the 3-way recon report's, so a recon sheet reads the
 * same in every module. Rows are the same lines the list showed; clicking one
 * still opens the same detail.
 */
export type Col<T> = {
  id: string;
  label: string;
  width: number;
  /** Right-align numbers. */
  num?: boolean;
  render: (row: T) => React.ReactNode;
};

type Props<R> = {
  columns: Col<R>[];
  rows: R[];
  /** Row number of the first row, for pages. */
  start?: number;
  rowKey: (row: R) => string;
  testId?: (row: R) => string | undefined;
  onRow?: (row: R) => void;
  rowLabel?: (row: R) => string;
  selected?: (row: R) => boolean;
  /** A leading checkbox column. */
  check?: { head: React.ReactNode; cell: (row: R) => React.ReactNode };
  /** A full-width band above a row, for groups. */
  band?: (row: R, i: number) => React.ReactNode;
  /** Content under a row, for an opened row. */
  below?: (row: R) => React.ReactNode;
  /** A header row above the column names: a name and how many columns it spans. */
  groups?: { label: string; span: number }[];
};

function SheetGrid<R>({
  columns,
  rows,
  start = 0,
  rowKey,
  testId,
  onRow,
  rowLabel,
  selected,
  check,
  band,
  below,
  groups,
}: Props<R>) {
  const span = columns.length + 1 + (check ? 1 : 0);
  const width = 40 + (check ? 40 : 0) + columns.reduce((a, c) => a + c.width, 0);
  const head = "sticky z-20 h-10 bg-accent px-3 py-0";
  return (
    <div className="overflow-auto overscroll-none rounded-lg border border-neutral-gray bg-background">
      <Table style={{ width, minWidth: "100%" }} className={TABLE_CLASS}>
        <colgroup>
          <col style={{ width: 40 }} />
          {check && <col style={{ width: 40 }} />}
          {columns.map((c) => (
            <col key={c.id} style={{ width: c.width }} />
          ))}
        </colgroup>
        <TableHeader className={HEADER_CLASS}>
          {groups && (
            <TableRow>
              <TableHead className="sticky left-0 top-0 z-30 h-8 bg-accent px-0" />
              {check && <TableHead className="sticky top-0 z-20 h-8 bg-accent px-0" />}
              {groups.map((g) => (
                <TableHead
                  key={g.label}
                  colSpan={g.span}
                  className={cn("sticky top-0 z-20 h-8 bg-accent px-3 py-0 uppercase tracking-wide", T.head, "text-[11px]")}
                >
                  {g.label}
                </TableHead>
              ))}
            </TableRow>
          )}
          <TableRow>
            <TableHead className={cn(head, "left-0 z-30 px-0", groups ? "top-8" : "top-0")} />
            {check && <TableHead className={cn(head, groups ? "top-8" : "top-0")}>{check.head}</TableHead>}
            {columns.map((c) => (
              <TableHead key={c.id} className={cn(head, T.head, groups ? "top-8" : "top-0", c.num && "text-right")}>
                <span className="block truncate">{c.label}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const on = selected?.(r);
            return (
              <React.Fragment key={rowKey(r)}>
                {band?.(r, i) && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={span} className={cn("bg-accent px-3 py-1.5 font-semibold", T.cell)}>
                      {band(r, i)}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow
                  data-testid={testId?.(r)}
                  data-state={on ? "selected" : undefined}
                  role={onRow ? "button" : undefined}
                  tabIndex={onRow ? 0 : undefined}
                  aria-label={rowLabel?.(r)}
                  onClick={onRow ? () => onRow(r) : undefined}
                  onKeyDown={
                    onRow
                      ? (e) => {
                          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                            e.preventDefault();
                            onRow(r);
                          }
                        }
                      : undefined
                  }
                  className={cn("border-0 outline-none focus-visible:bg-muted/40", onRow && "cursor-pointer")}
                >
                  <TableCell className={cn("sticky left-0 z-[1] bg-accent px-1 py-0 text-right tabular-nums text-secondary-foreground", T.cell)}>
                    {start + i + 1}
                  </TableCell>
                  {check && <TableCell className="px-3 py-0">{check.cell(r)}</TableCell>}
                  {columns.map((c) => (
                    <TableCell key={c.id} className={cn("h-[45px] overflow-hidden px-3 py-0 align-middle", T.cell, c.num && "text-right tabular-nums")}>
                      <span className="block truncate">{c.render(r)}</span>
                    </TableCell>
                  ))}
                </TableRow>
                {below?.(r) && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={span} className="bg-section p-3">{below(r)}</TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default SheetGrid;
