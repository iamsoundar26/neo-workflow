import React, { useEffect, useMemo, useState } from "react";
import { Check, ListFilter, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import DateFilter, { FY_PRESETS } from "@/components/common/date-filter";
import DateRangePanel from "@/components/common/date-filter/panel";
import { ColumnFilter, QuickFilter } from "@/components/inbox/v2/filter-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip } from "@/components/common/tooltip";
import { cn } from "@/lib/utils";
import { useColumnResize } from "@/hooks/pages/inbox/use-column-resize";
import { SELECT_WIDTH, type ColumnSizes } from "@/components/inbox/v2/table-sizing";
import { AmountText, T } from "@/components/inbox/v2/ui";
import {
  CellBox,
  ColumnsButton,
  EmptyBlock,
  HEADER_CLASS,
  HeaderCell,
  Pager,
  SearchBox,
  TABLE_CLASS,
  UnderlineTabs,
  nextSort,
  sortRows,
  type SortState,
} from "@/components/inbox/v2/banking/table-parts";
import {
  LINES,
  MATCH_STATUSES,
  amountOf,
  gapOf,
  iso,
  isNewVoucher,
  matchOf,
  partsOf,
  type ReviewRow,
} from "@/config/pages/neo/mock-bank-review";
import {
  approveLines,
  approvedAs,
  clearLines,
  flowStatus,
  isCreated,
  reconNow,
  setLines,
  syncNow,
  unapproveLines,
  useBankReview,
  type FlowStatus,
  type Scope,
} from "@/hooks/pages/neo/use-bank-review";
import { Pill } from "../bank-ws/details";
import { STATE } from "./shared";

/**
 * The Review Table, drawn as the Banking module draws its transactions
 * (banking/transactions-table.tsx): Date, Voucher No., Description, Ledger,
 * Amount, with the same tabs, search, header (sort, resize), tick-box column,
 * "Reviewed" action column and pager. A line opens as Transaction Details.
 *
 * Both agents use it. The Bank reconciliation agent's panel is scope "flow"
 * (every line starts unreconciled); Bank reconciliation 2's Review Table is
 * scope "sheet" (each line starts from the reference sheet) and adds the
 * Recon and Sync status columns.
 */
type Col =
  | "txnDate" | "voucherDate" | "narration" | "amount" | "voucherNo" | "effective" | "supplierRef" | "gst"
  | "voucherType" | "costCentre" | "ledger" | "refType" | "refNo" | "bankType" | "instrNo" | "instrDate"
  | "bankDate" | "match" | "recon" | "editedBy" | "editedAt";

/** The Review Table's columns, in the sheet's order (the Action column is the last, outside this list). */
const LABEL: Record<Col, string> = {
  txnDate: "Transaction Date",
  voucherDate: "Voucher Date",
  narration: "Narration",
  amount: "Amount",
  voucherNo: "Voucher Number",
  effective: "Effective Date",
  supplierRef: "Supplier Reference Number",
  gst: "GST Registration",
  voucherType: "Voucher Type",
  costCentre: "Cost Centre",
  ledger: "Ledger",
  refType: "Reference Type",
  refNo: "Reference Number",
  bankType: "Bank Transaction Type",
  instrNo: "Instrument Number",
  instrDate: "Instrument Date",
  bankDate: "Bank Date",
  match: "Match Status",
  recon: "Reconciliation Status",
  editedBy: "Last Edited by",
  editedAt: "Last Edited at",
};
/** Columns keep their width and the table scrolls sideways, as the Banking table does with many columns. */
const w = (preferred: number, min = preferred, max = 420) => ({ min, preferred, max });
const SIZES: ColumnSizes = {
  txnDate: w(172),
  voucherDate: w(124),
  narration: w(240, 140, 640),
  amount: w(156, 156, 220),
  voucherNo: w(150),
  effective: w(112),
  supplierRef: w(150),
  gst: w(128),
  voucherType: w(112),
  costCentre: w(140),
  ledger: w(170),
  refType: w(130),
  refNo: w(140),
  bankType: w(148),
  instrNo: w(130),
  instrDate: w(116),
  bankDate: w(112),
  match: w(190, 150, 320),
  recon: w(176),
  editedBy: w(112),
  editedAt: w(180),
};
const SHOWN = Object.keys(LABEL) as Col[];
const SORTABLE = new Set<Col>(["txnDate", "narration", "amount", "match", "recon"]);
const RECON_OPTIONS = ["Pending", "Reconciled", "Excluded"].map((v) => ({ value: v, label: v }));
const MATCH_OPTIONS = MATCH_STATUSES.map((v) => ({ value: v, label: v }));
const TYPE_OPTIONS = ["Payment", "Receipt", "Contra", "Journal"].map((v) => ({ value: v, label: v }));
const LEDGER_OPTIONS = Array.from(new Set(LINES.map((r) => partsOf(r.line)[0]?.c[15]).filter(Boolean) as string[]))
  .sort()
  .map((v) => ({ value: v, label: v }));
type DateRange = { from?: Date; to?: Date };
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ACTION_WIDTH = 116;
const DASH = "–";

const dateKey = (d: string) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? 0 : t;
};
const reconTone = (v: string): "green" | "amber" | "blue" | "grey" =>
  v.startsWith("Reconciled") ? "green" : v === "Unreconciled" ? "amber" : v === "Matched" ? "blue" : "grey";
const matchTone = (m: string): "green" | "amber" | "red" | "grey" =>
  m === "Exact" ? "green" : m === "Potential" ? "amber" : m === "No match" ? "red" : "grey";

/** "Acme Traders +2": the first value, and a chip for how many more. */
const Multi = ({ values }: { values: string[] }) => {
  const v = values.filter((x) => x && x !== "-");
  if (!v.length) return <span className="text-secondary-foreground">{DASH}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{v[0]}</span>
      {v.length > 1 && (
        <span className="flex-none rounded-[4px] bg-muted px-1.5 text-caption-1 font-medium leading-5 text-primary">+{v.length - 1}</span>
      )}
    </span>
  );
};
const uniq = (xs: string[]) => Array.from(new Set(xs.filter((x) => x && x !== "-")));
const stamp = (iso?: string) => {
  const t = iso ? new Date(iso) : null;
  return t && !Number.isNaN(t.getTime())
    ? t.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
};

const TxnTable = ({
  scope = "flow",
  onOpen,
  focus,
  nonce = 0,
}: {
  scope?: Scope;
  onOpen: (id: string) => void;
  /** A group picked in the chat's checklist: the table opens filtered to it. */
  focus?: string;
  nonce?: number;
}) => {
  const review = useBankReview(scope);
  const shown = SHOWN;
  const [tab, setTab] = useState<"review" | "all">("review");
  const [matchSel, setMatchSel] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [reconSel, setReconSel] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [ledgers, setLedgers] = useState<string[]>([]);
  const [dates, setDates] = useState<DateRange>({});
  const [aiOnly, setAiOnly] = useState(false);
  const [sort, setSort] = useState<SortState<Col>>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const q = query.trim().toLowerCase();
  useEffect(() => setPage(0), [tab, matchSel, sort, size, q, reconSel, types, ledgers, dates, aiOnly]);
  const resize = useColumnResize({ shown, sizes: SIZES, storageKey: `neo.bank.${scope}.table.widths.v3` });

  const parts = (r: ReviewRow) => partsOf(r.line);
  const contra = (r: ReviewRow) => r.c[8] === "Contra";
  const type = (r: ReviewRow) => r.c[8] || (amountOf(r) < 0 ? "Payment" : "Receipt");
  const newNo = (r: ReviewRow) => review.numbers[r.line] || "Auto-generated";
  const vouchers = (r: ReviewRow) =>
    uniq(parts(r).filter((x) => !/suggestion/i.test(x.c[1])).map((x) => (x.c[10] === "(new)" ? newNo(r) : x.c[10])));
  const recon = (r: ReviewRow) => reconNow(scope, r, review);
  const reconLabel = (r: ReviewRow) => (recon(r).startsWith("Reconciled") ? "Reconciled" : recon(r));
  const touched = (r: ReviewRow) => review.over[r.line];
  const sync = (r: ReviewRow) => syncNow(scope, r, review);

  /** Where a line stands, in the flow's words. A sheet line follows its recon status. */
  const state = (r: ReviewRow): FlowStatus => {
    if (scope === "flow") return flowStatus(r, review);
    const rc = recon(r);
    if (rc === "Excluded") return "excluded";
    if (sync(r) === "Synced") return "synced";
    if (rc.startsWith("Reconciled")) return "approved";
    return gapOf(r.line, review.edits) !== 0 ? "fix" : "pending";
  };
  /** Needs Review: still to approve. All Transactions: every line. */
  const inTab = (r: ReviewRow, t: "review" | "all") => {
    const st = state(r);
    const waiting = st === "pending" || st === "fix";
    return t === "all" ? true : waiting;
  };
  useEffect(() => {
    if (!focus) return;
    const group = focus === "All" ? [] : [focus];
    setMatchSel(group);
    const open = LINES.filter((r) => !group.length || group.includes(matchOf(r))).some((r) => inTab(r, "review"));
    setTab(open ? "review" : "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, nonce]);
  const canApprove = (r: ReviewRow) => state(r) === "pending";
  const approve = (ids: string[]) => {
    if (scope === "flow") return approveLines(ids);
    const ok = ids.filter((id) => {
      const r = LINES.find((x) => x.line === id);
      return r && canApprove(r);
    });
    setLines("sheet", Object.fromEntries(ok.map((id) => [id, approvedAs(id)])));
    return ok;
  };
  const undo = (id: string) => (scope === "flow" ? unapproveLines([id]) : clearLines("sheet", [id]));
  /** Only an approval made here can be taken back. */
  const undoable = (r: ReviewRow) =>
    state(r) === "approved" && (scope === "flow" ? !isCreated(r.line, review) : !!review.over[r.line]?.recon);

  const rows = useMemo(
    () =>
      sortRows(
        LINES.filter(
          (r) =>
            inTab(r, tab) &&
            (!matchSel.length || matchSel.includes(matchOf(r))) &&
            (!q || `${r.c[1]} ${r.c[2]} ${r.c[10]} ${r.c[15]}`.toLowerCase().includes(q)) &&
            (!reconSel.length || reconSel.includes(state(r) === "pending" || state(r) === "fix" ? "Pending" : state(r) === "excluded" ? "Excluded" : "Reconciled")) &&
            (!types.length || types.includes(type(r))) &&
            (!ledgers.length || ledgers.includes(parts(r)[0]?.c[15] ?? "")) &&
            (!dates.from || iso(r.c[0]) >= isoDay(dates.from)) &&
            (!dates.to || iso(r.c[0]) <= isoDay(dates.to)) &&
            (!aiOnly || isNewVoucher(r.line))
        ),
        sort,
        {
          txnDate: (r) => dateKey(r.c[0]),
          narration: (r) => r.c[1],
          amount: (r) => amountOf(r),
          match: (r) => matchOf(r),
          recon: (r) => recon(r),
        }
      ),
    [tab, matchSel, q, reconSel, types, ledgers, dates, aiOnly, sort, review]
  );
  const anyFilter = !!(q || matchSel.length || reconSel.length || types.length || ledgers.length || dates.from || dates.to || aiOnly);
  const reset = () => { setQuery(""); setMatchSel([]); setReconSel([]); setTypes([]); setLedgers([]); setDates({}); setAiOnly(false); };
  const pageRows = rows.slice(page * size, (page + 1) * size);
  const allOnPage = !!pageRows.length && pageRows.every((r) => selected.includes(r.line));
  const picked = selected.filter((id) => LINES.some((r) => r.line === id && canApprove(r)));

  const cell = (key: Col, r: ReviewRow) => {
    const none = <span className="text-secondary-foreground">{DASH}</span>;
    const text = (v?: string) => (v && v !== "-" ? <span className="truncate">{v}</span> : none);
    const ps = parts(r);
    switch (key) {
      case "txnDate":
        return <span className="truncate">{r.c[0]}</span>;
      case "voucherDate":
        return text(r.c[9] || r.c[0]);
      case "narration":
        return (
          <Tooltip message={r.c[26] || r.c[1]} side="bottom" align="start">
            <span className="block truncate">{r.c[26] || r.c[1]}</span>
          </Tooltip>
        );
      case "amount":
        return (
          <span className="truncate tabular-nums">
            <AmountText value={Math.abs(amountOf(r))} />
            <span className="ml-1 text-caption-1 text-secondary-foreground">{amountOf(r) < 0 ? "Dr" : "Cr"}</span>
          </span>
        );
      case "voucherNo":
        return <Multi values={vouchers(r)} />;
      case "effective":
        return contra(r) ? none : text(r.c[12]);
      case "supplierRef":
        return contra(r) ? none : text(r.c[13]);
      case "gst": {
        const g = uniq(ps.map((x) => x.c[11]));
        return contra(r) || g.length !== 1 ? none : (
          <Tooltip message={g[0]} side="bottom" align="start">
            <span className="block truncate">{g[0].split(" (")[0]}</span>
          </Tooltip>
        );
      }
      case "voucherType":
        return <span className="truncate">{type(r)}</span>;
      case "costCentre":
        return <Multi values={uniq(ps.map((x) => x.c[14]))} />;
      case "ledger":
        return <Multi values={uniq(ps.map((x) => x.c[15]))} />;
      case "refType":
        return contra(r) ? none : <Multi values={uniq(ps.map((x) => x.c[17]))} />;
      case "refNo":
        return contra(r) ? none : <Multi values={uniq(ps.map((x) => x.c[18]))} />;
      case "bankType":
        return text(r.c[21]);
      case "instrNo":
        return text(r.c[22]);
      case "instrDate":
        return text(r.c[23]);
      case "bankDate":
        // Set when the line is approved.
        return state(r) === "approved" || state(r) === "synced" ? text(r.c[24] || r.c[0]) : text(r.c[24]);
      case "match": {
        const m = matchOf(r);
        const amt = r.c[6] && r.c[6] !== "-" && Number(r.c[6].replace(/,/g, "")) !== 0 ? `Amount difference ₹${r.c[6]}` : "";
        const days = Number(r.c[7]);
        const detail = amt || (days ? `Date difference ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}` : "");
        return (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <Pill tone={matchTone(m)}>{m}</Pill>
            {detail && <span className="max-w-full truncate text-caption-1 leading-4 text-secondary-foreground">{detail}</span>}
          </span>
        );
      }
      case "recon":
        return <Pill tone={reconTone(recon(r))}>{reconLabel(r)}</Pill>;
      case "editedBy":
        return <span className="truncate">{touched(r)?.by ?? "Neo"}</span>;
      case "editedAt": {
        const t = stamp(touched(r)?.at ?? review.startedAt);
        return t ? <span className="truncate">{t}</span> : none;
      }
    }
  };

  /** Approve what is ready; Review where a person has to look first (a potential match, or amounts that differ). */
  const action = (r: ReviewRow) => {
    const st = state(r);
    if (st === "synced" || (st === "approved" && !undoable(r)))
      return (
        <Tooltip message={STATE[st].label}>
          <Check aria-label={STATE[st].label} className="h-4 w-4 text-success-green-foreground" />
        </Tooltip>
      );
    if (st === "approved")
      return (
        <Tooltip message="Move back to pending">
          <Button variant="ghost" size="icon-sm" aria-label="Move back to pending" className="text-secondary-foreground"
            data-testid={`txn-undo-${r.line}`} onClick={() => undo(r.line)}>
            <Undo2 className="h-4 w-4" />
          </Button>
        </Tooltip>
      );
    if (st === "excluded") return <span className="text-secondary-foreground">{DASH}</span>;
    if (st === "fix" || matchOf(r) === "Potential")
      return (
        <Button variant="outline" size="sm" className="h-7 px-3" data-testid={`txn-review-${r.line}`} onClick={() => onOpen(r.line)}>
          Review
        </Button>
      );
    return (
      <Button size="sm" className="h-7 px-3" data-testid={`txn-approve-${r.line}`} onClick={() => approve([r.line])}>
        Approve
      </Button>
    );
  };

  const headFilter = (key: Col) => {
    switch (key) {
      case "txnDate":
        return <DateRangePanel value={dates} onApply={setDates} presets={FY_PRESETS} presetsLabel="Date range" today={new Date()} />;
      case "voucherType":
        return <ColumnFilter label="Voucher Type" options={TYPE_OPTIONS} selected={types} onChange={setTypes} />;
      case "ledger":
        return <ColumnFilter label="Ledger" options={LEDGER_OPTIONS} selected={ledgers} onChange={setLedgers} />;
      case "recon":
        return <ColumnFilter label="Reconciliation Status" options={RECON_OPTIONS} selected={reconSel} onChange={setReconSel} />;
      default:
        return undefined;
    }
  };
  const headActive = (key: Col) =>
    key === "txnDate" ? !!(dates.from || dates.to) : key === "voucherType" ? !!types.length : key === "ledger" ? !!ledgers.length : key === "recon" ? !!reconSel.length : false;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="review-table">
      <UnderlineTabs
        value={tab}
        onChange={(t) => setTab(t as "review" | "all")}
        tabs={[
          { id: "review", label: "Needs Review", count: LINES.filter((r) => inTab(r, "review")).length },
          { id: "all", label: "All Transactions", count: LINES.length },
        ]}
      />
      <div className="flex flex-none flex-wrap items-center gap-2 px-6 py-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search" label="Search bank lines" />
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Filters" data-testid="txn-filters"
              className={cn("grid h-9 w-9 flex-none place-items-center rounded-md border border-border bg-background hover:bg-accent", reconSel.length && "border-primary text-primary")}>
              <ListFilter className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <ColumnFilter label="Reconciliation Status" options={RECON_OPTIONS} selected={reconSel} onChange={setReconSel} />
          </PopoverContent>
        </Popover>
        <span className="h-6 w-px flex-none bg-neutral-gray" />
        <button type="button" aria-pressed={aiOnly} data-testid="txn-ai-only" onClick={() => setAiOnly((v) => !v)}
          className={cn("inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-label-3 font-medium hover:bg-accent",
            aiOnly ? "border-primary text-primary" : "border-border text-foreground")}>
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          AI categorised
        </button>
        <DateFilter label="Date" value={dates} onChange={setDates} className="h-9" />
        <QuickFilter label="Type" options={TYPE_OPTIONS} selected={types} onChange={setTypes} className="h-9" />
        <QuickFilter label="Ledger" options={LEDGER_OPTIONS} selected={ledgers} onChange={setLedgers} className="h-9" />
        <QuickFilter label="Match" options={MATCH_OPTIONS} selected={matchSel} onChange={setMatchSel} className="h-9" />
        <span className="ml-auto" />
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <Undo2 className="h-3 w-3" />
            Reset Filters
          </Button>
        )}
        <ColumnsButton onClick={() => undefined} />
        {picked.length > 0 && (
          <>
            <span className={T.value}>{picked.length} selected</span>
            <Button size="sm" data-testid="txn-approve-selected" onClick={() => { approve(picked); setSelected([]); }}>
              Approve selected
            </Button>
          </>
        )}
      </div>
      <div ref={resize.gridRef} className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none">
        <Table style={{ width: resize.tableWidth }} className={TABLE_CLASS}>
          <TableHeader className={HEADER_CLASS}>
            <TableRow>
              <TableHead style={{ width: SELECT_WIDTH }} className="sticky left-0 z-10 h-10 bg-accent px-3 py-0 align-middle">
                <Checkbox
                  aria-label="Select every line on this page"
                  checked={allOnPage}
                  onCheckedChange={(c) => setSelected(c ? pageRows.map((r) => r.line) : [])}
                />
              </TableHead>
              {shown.map((key) => (
                <HeaderCell
                  key={key}
                  columnKey={key}
                  label={LABEL[key]}
                  sizes={SIZES}
                  resize={resize}
                  align="left"
                  sort={SORTABLE.has(key) ? (sort?.key === key ? sort.dir : "none") : undefined}
                  filter={headFilter(key)}
                  filterActive={headActive(key)}
                  onSort={() => setSort((s) => nextSort(s, key))}
                />
              ))}
              <TableHead style={{ width: ACTION_WIDTH }} className="sticky right-0 z-10 h-10 border-l border-neutral-gray bg-accent px-3 py-0 align-middle">
                <span className={cn(T.head, "flex h-4 items-center justify-center truncate")}>Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => {
              const ticked = selected.includes(r.line);
              const ground = ticked ? "bg-accent" : "bg-background";
              return (
                <TableRow
                  key={r.line}
                  data-testid={`review-row-${r.line}`}
                  aria-selected={ticked}
                  onClick={() => onOpen(r.line)}
                  className={cn("cursor-pointer hover:bg-transparent", ticked && "bg-accent hover:bg-accent")}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className={cn("sticky left-0 z-[1] h-[52px] px-3 py-0 align-middle", ground)}>
                    <Checkbox
                      aria-label={`Select ${r.c[1]}`}
                      checked={ticked}
                      onCheckedChange={(c) => setSelected((cur) => (c ? [...cur, r.line] : cur.filter((x) => x !== r.line)))}
                    />
                  </TableCell>
                  {shown.map((key) => (
                    <TableCell key={key} className={cn("h-[52px] overflow-hidden px-3 py-0 align-middle", T.cell)}>
                      <CellBox>{cell(key, r)}</CellBox>
                    </TableCell>
                  ))}
                  <TableCell onClick={(e) => e.stopPropagation()} className={cn("sticky right-0 z-[1] h-[52px] border-l border-neutral-gray px-3 py-0 text-center align-middle", ground)}>
                    <span className="inline-flex">{action(r)}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!rows.length && <EmptyBlock title={anyFilter ? "No matching lines" : "No lines here"} body={anyFilter ? "Try a different search or filter." : undefined} />}
      </div>
      <Pager page={page} pageSize={size} total={rows.length} onPageChange={setPage} onPageSizeChange={setSize} />
    </div>
  );
};

export default TxnTable;
