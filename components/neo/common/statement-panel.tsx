import React, { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip } from "@/components/common/tooltip";
import { cn } from "@/lib/utils";
import { useColumnResize } from "@/hooks/pages/inbox/use-column-resize";
import type { ColumnSizes } from "@/components/inbox/v2/table-sizing";
import { AmountText, T } from "@/components/inbox/v2/ui";
import {
  CellBox,
  EmptyBlock,
  HEADER_CLASS,
  HeaderCell,
  Pager,
  SearchBox,
  TABLE_CLASS,
  nextSort,
  sortRows,
  type SortState,
} from "@/components/inbox/v2/banking/table-parts";
import { LINES, REVIEW_FILE, REVIEW_INFO, amountOf } from "@/config/pages/neo/mock-bank-review";
import { WS_INFO, wsTxns } from "@/config/pages/neo/mock-bank-ws";

/**
 * The statement Neo read, drawn as the Banking module draws a statement's
 * transactions (banking/transactions-table.tsx): Date, Description, Ref,
 * Amount, with the same header, sort, resize, search and pager. Read-only:
 * approving the lines happens in the Review Table.
 *
 * DEV: GET /api/banking/statements/:id/transactions.
 */
type Col = "date" | "description" | "ref" | "amount";
const COLS: Col[] = ["date", "description", "ref", "amount"];
const LABEL: Record<Col, string> = { date: "Date", description: "Description", ref: "Reference", amount: "Amount" };
const SIZES: ColumnSizes = {
  date: { min: 104, preferred: 112, max: 180 },
  description: { min: 160, preferred: 260, max: 640 },
  ref: { min: 112, preferred: 150, max: 260 },
  amount: { min: 124, preferred: 140, max: 220 },
};
const SORTABLE = new Set<Col>(["date", "description", "amount"]);
const time = (d: string) => Date.parse(d) || 0;

type Line = { id: string; date: string; text: string; ref: string; amount: number };
const iso = (d: string) => Date.parse(`${d}T00:00:00Z`) || 0;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }).replace(/ /g, "-");

const StatementPanel = ({ source = "review" }: { source?: "review" | "ws" }) => {
  const all = useMemo<Line[]>(
    () =>
      source === "ws"
        ? wsTxns().map((t) => ({ id: t.id, date: t.date, text: t.text, ref: t.ref || "", amount: t.amount }))
        : LINES.map((r) => ({ id: r.line, date: r.c[0], text: r.c[1], ref: r.c[2], amount: amountOf(r) })),
    [source]
  );
  const head = source === "ws" ? `${WS_INFO.account} · ${WS_INFO.period}` : `${REVIEW_INFO.bankLedger} · ${REVIEW_INFO.period}`;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<Col>>(null);
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const resize = useColumnResize({ shown: COLS, sizes: SIZES, storageKey: "neo.bank.statement.widths.v1" });
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      sortRows(
        all.filter((r) => !q || `${r.text} ${r.ref}`.toLowerCase().includes(q)),
        sort,
        { date: (r) => (source === "ws" ? iso(r.date) : time(r.date)), description: (r) => r.text, amount: (r) => r.amount }
      ),
    [q, sort, all, source]
  );
  useEffect(() => setPage(0), [q, sort, size]);
  const pageRows = rows.slice(page * size, (page + 1) * size);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="statement-panel">
      <div className="flex flex-none flex-wrap items-center gap-3 px-6 py-4">
        <SearchBox value={query} onChange={setQuery} placeholder="Search" label="Search transactions" />
        <span className="flex-1" />
        <span className={cn(T.sub, "min-w-0 truncate")}>
          {head} · {all.length.toLocaleString("en-IN")} transactions
        </span>
      </div>
      <div ref={resize.gridRef} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none">
        <Table style={{ width: resize.tableWidth }} className={TABLE_CLASS}>
          <TableHeader className={HEADER_CLASS}>
            <TableRow>
              <TableHead style={{ width: 0 }} className="h-10 w-0 p-0" aria-hidden />
              {COLS.map((k) => (
                <HeaderCell
                  key={k}
                  columnKey={k}
                  label={LABEL[k]}
                  sizes={SIZES}
                  resize={resize}
                  align={k === "amount" ? "right" : "left"}
                  sort={SORTABLE.has(k) ? (sort?.key === k ? sort.dir : "none") : undefined}
                  onSort={() => setSort((s) => nextSort(s, k))}
                />
              ))}
              <TableHead style={{ width: 0 }} className="h-10 w-0 p-0" aria-hidden />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => (
              <TableRow key={r.id} data-testid={`statement-row-${r.id}`} className="hover:bg-transparent">
                <TableCell className="w-0 p-0" />
                {COLS.map((k) => (
                  <TableCell
                    key={k}
                    className={cn("h-[45px] overflow-hidden px-3 py-0 align-middle", T.cell, k === "amount" && "text-right")}
                  >
                    <CellBox>
                      {k === "date" ? (
                        <span className="truncate">{source === "ws" ? day(r.date) : r.date}</span>
                      ) : k === "description" ? (
                        <Tooltip message={r.text} side="bottom" align="start">
                          <span className="block truncate">{r.text}</span>
                        </Tooltip>
                      ) : k === "ref" ? (
                        <span className="truncate">{r.ref || "—"}</span>
                      ) : (
                        <span className="flex flex-col items-end">
                          <span className="truncate tabular-nums">
                            <AmountText value={Math.abs(r.amount)} />
                          </span>
                          <span className="text-caption-1 text-secondary-foreground">{r.amount < 0 ? "Debit" : "Credit"}</span>
                        </span>
                      )}
                    </CellBox>
                  </TableCell>
                ))}
                <TableCell className="w-0 p-0" />
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && <EmptyBlock title="No matching transactions" body="Try a different search." />}
      </div>
      <Pager page={page} pageSize={size} total={rows.length} onPageChange={setPage} onPageSizeChange={setSize} />
    </div>
  );
};

export default StatementPanel;
export const STATEMENT_FILE = REVIEW_FILE;
