import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Folder, Loader2, PanelRight, TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useColumnResize } from "@/hooks/pages/inbox/use-column-resize";
import type { ColumnSizes } from "@/components/inbox/v2/table-sizing";
import { AmountText, StatusPill, T } from "@/components/inbox/v2/ui";
import {
  CellBox,
  EmptyBlock,
  HEADER_CLASS,
  HeaderCell,
  Pager,
  SearchBox,
  TABLE_CLASS,
  UnderlineTabs,
  day,
  nextSort,
  sortRows,
  type SortState,
} from "@/components/inbox/v2/banking/table-parts";
import Preview from "@/components/inbox/v2/preview";
import SalesUpload from "@/components/inbox/v2/sales-upload";
import { toast } from "sonner";
import StatementPanel from "./statement-panel";
import { senderUser, useStore, type Item } from "@/components/inbox/v2/store";
import { useNeo } from "@/hooks/pages/neo/use-neo";
import { closeDocPreview, useDocPreview } from "@/hooks/pages/neo/use-doc-preview";
import { sameDoc } from "@/utils/pages/neo/canvas";
import type { NeoCard, NeoMessage } from "@/types/pages/neo";

/**
 * Voucher Desk in the chat: what an upload became, and one quiet chip that
 * opens the Inbox in the shared side panel, filtered to exactly that upload.
 * The chip is a contextual link, not an action: nothing opens by itself, and
 * a click replaces whatever the panel was showing. The original file is
 * opened from the attachment in the person's own message, not from here.
 *
 * DEV: the filter is GET /api/inbox/items?uploadBatch=:id (or ids=…).
 */

type DeskCard = Extract<NeoCard, { kind: "voucher-desk" }>;

export const isRefCard = (card?: NeoCard) => card?.kind === "voucher-desk";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ chat */

const Chip = ({ message, n }: { message: NeoMessage; n: number }) => {
  const neo = useNeo();
  const preview = useDocPreview();
  const selected = !preview && sameDoc(neo.messages, neo.canvas, message);
  return (
    <button
      type="button"
      aria-pressed={selected}
      title="Open in the side panel"
      data-testid="desk-chip"
      onClick={() => {
        closeDocPreview();
        if (!sameDoc(neo.messages, neo.canvas, message)) neo.setCanvas(message.id);
      }}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
        selected
          ? "border-pi-brand-border bg-pi-brand-tint text-pi-ink"
          : "border-pi-line bg-background text-pi-ink-2 hover:border-pi-line-2 hover:bg-pi-fill hover:text-pi-ink"
      )}
    >
      <Folder className="h-3.5 w-3.5 flex-none text-pi-body" aria-hidden />
      <span className="truncate">Voucher Desk · {plural(n, "file")}</span>
      <PanelRight className="h-3.5 w-3.5 flex-none text-pi-faint" aria-hidden />
    </button>
  );
};

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-3">
    <dt className="w-20 flex-none text-pi-body">{k}</dt>
    <dd className="min-w-0 truncate font-medium text-pi-ink">{v}</dd>
  </div>
);

/** "2 purchase bills · 1 sales invoice", from what was actually uploaded. */
const byType = (files: DeskCard["files"]) => {
  const counts = new Map<string, number>();
  files.forEach((f) => counts.set(f.type, (counts.get(f.type) || 0) + 1));
  return [...counts].map(([type, n]) => plural(n, type.toLowerCase()));
};

export const DeskChat = ({ message, card }: { message: NeoMessage; card: DeskCard }) => {
  const n = card.files.length;
  if (card.state === "processing")
    return (
      <p className="flex items-center gap-2 text-body-3 text-pi-body" data-testid="desk-processing">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        Processing {plural(n, "file")}…
      </p>
    );
  if (card.state === "failed")
    return (
      <p className="flex items-start gap-2 text-body-3 text-pi-body" data-testid="desk-failed">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none text-pi-warning" aria-hidden />
        {card.error || "The upload didn't finish."}
      </p>
    );
  const one = card.files[0];
  const sale = /sales/i.test(one?.type || "");
  // The statement was already summarised in Neo's own words just above.
  if (card.statement)
    return (
      <div>
        <Chip message={message} n={n} />
      </div>
    );
  return (
    <div className="flex flex-col gap-2.5" data-testid="desk-summary">
      {card.sales ? (
        <dl className="flex flex-col gap-0.5 text-body-3">
          <Row k="Type" v="Sales invoices" />
          <Row k="Rows" v={String(card.sales.rows)} />
          <Row k="Check" v={card.sales.attention ? `${plural(card.sales.attention, "row")} need attention` : "All rows are ready"} />
        </dl>
      ) : n === 1 ? (
        <dl className="flex flex-col gap-0.5 text-body-3">
          <Row k="Type" v={one.type} />
          <Row k={sale ? "Customer" : "Supplier"} v={one.party || "—"} />
          <Row k="Total" v={`₹${new Intl.NumberFormat("en-IN").format(one.amount)}`} />
        </dl>
      ) : (
        <ul className="list-disc pl-5 text-body-3 text-pi-ink">
          {byType(card.files).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <div>
        <Chip message={message} n={n} />
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------- panel */

/** The Inbox's tabs, in its order. */
const TABS = ["All", "Need review", "Approved", "Duplicate"] as const;
type Tab = (typeof TABS)[number];
const inTab = (x: Item, tab: Tab) =>
  tab === "All"
    ? true
    : tab === "Need review"
      ? ["Needs Review", "Received", "Extracting", "Failed"].includes(x.status)
      : tab === "Approved"
        ? x.status === "Approved"
        : x.status === "Duplicate";

const COLS = ["file", "vendor", "type", "amount", "status", "source", "user", "received"] as const;
type Col = (typeof COLS)[number];
const LABEL: Record<Col, string> = {
  file: "File",
  vendor: "Vendor",
  type: "Voucher type",
  amount: "Amount",
  status: "Status",
  source: "Source",
  user: "User",
  received: "Received",
};
const SIZES: ColumnSizes = {
  file: { min: 120, preferred: 150, max: 400 },
  vendor: { min: 110, preferred: 150, max: 320 },
  type: { min: 124, preferred: 128, max: 220 },
  amount: { min: 108, preferred: 112, max: 200 },
  status: { min: 128, preferred: 132, max: 200 },
  source: { min: 96, preferred: 100, max: 200 },
  user: { min: 110, preferred: 120, max: 240 },
  received: { min: 124, preferred: 128, max: 220 },
};
const SORTABLE = new Set<Col>(["file", "vendor", "type", "amount", "status", "received"]);
const SOURCE = { email: "Email", whatsapp: "WhatsApp", upload: "Upload", neo: "Neo chat" } as const;
const value: Record<Col, (x: Item) => string | number> = {
  file: (x) => x.file.name,
  vendor: (x) => x.form.party,
  type: (x) => x.form.voucherType,
  amount: (x) => x.amount,
  status: (x) => x.status,
  source: (x) => x.source,
  user: (x) => senderUser(x),
  received: (x) => Date.parse(x.received) || 0,
};

const Unavailable = ({ what }: { what: string }) => (
  <div className="flex flex-1 items-center justify-center p-8" data-testid="desk-unavailable">
    <EmptyBlock title={`${what} no longer available`} body="It was deleted or moved. Nothing else is shown in its place." />
  </div>
);

/**
 * A spreadsheet of sales invoices: the Sales module's own upload preview for
 * this import batch, Edit Mapping and Create Invoices included.
 */
const SalesPanel = ({ card }: { card: DeskCard }) => {
  const neo = useNeo();
  const { company } = useStore();
  const [step, setStep] = useState<"mapping" | "preview">("preview");
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background" data-testid="sales-preview-panel">
      <SalesUpload
        key={step}
        step={step}
        batchId={card.sales!.importBatchId}
        company={company}
        onNavigate={(next) => next !== "upload" && setStep(next)}
        onExit={() => neo.setCanvas(null)}
        notify={(message, kind = "success") =>
          kind === "error" ? toast.error(message) : kind === "warning" ? toast.warning(message) : kind === "info" ? toast.info(message) : toast.success(message)
        }
      />
    </div>
  );
};

/** The Inbox, narrowed to this upload; a row opens its preview here. */
export const DeskPanel = ({ card }: { card: DeskCard }) => {
  if (card.sales) return <SalesPanel card={card} />;
  if (card.statement) return <StatementPanel source={card.statement.source} />;
  return <InboxPanel card={card} />;
};

const InboxPanel = ({ card }: { card: DeskCard }) => {
  const { items, company } = useStore();
  const [scope, setScope] = useState<"batch" | "all">("batch");
  const [tab, setTab] = useState<Tab>("All");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState<SortState<Col>>(null);
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const resize = useColumnResize({ shown: [...COLS], sizes: SIZES, storageKey: "neo.voucher-desk.widths.v2" });

  const ids = useMemo(() => new Set(card.files.map((f) => f.id)), [card]);
  const live = (x: Item) => x.status !== "Deleted" && !x.priorVoucher;
  const scoped = useMemo(
    () => (scope === "batch" ? items.filter((x) => ids.has(x.id) && live(x)) : items.filter((x) => x.company === company && live(x))),
    [items, scope, ids, company]
  );
  const missing = card.files.length - items.filter((x) => ids.has(x.id) && live(x)).length;
  const types = useMemo(() => ["All", ...new Set(scoped.map((x) => x.form.voucherType).filter(Boolean))], [scoped]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      sortRows(
        scoped.filter(
          (x) =>
            inTab(x, tab) &&
            (type === "All" || x.form.voucherType === type) &&
            (!q || `${x.file.name} ${x.form.party} ${x.form.invoiceNo}`.toLowerCase().includes(q))
        ),
        sort,
        value
      ),
    [scoped, tab, type, q, sort]
  );
  useEffect(() => setPage(0), [scope, tab, type, q, sort, size]);
  const pageRows = rows.slice(page * size, (page + 1) * size);
  const opened = openId ? items.find((x) => x.id === openId) : undefined;
  const filtered = !!q || type !== "All";

  if (opened)
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="desk-record">
        <div className="flex flex-none items-center gap-2 border-b border-neutral-gray px-4 py-2">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-pi-body hover:bg-pi-fill hover:text-pi-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Voucher Desk
          </button>
          <span className={cn(T.value, "min-w-0 truncate")}>{opened.file.name}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Preview item={opened} />
        </div>
      </div>
    );

  if (scope === "batch" && !scoped.length)
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="desk-panel">
        <Unavailable what={card.files.length === 1 ? "This document is" : "These documents are"} />
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="desk-panel">
      <UnderlineTabs
        value={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={TABS.map((t) => ({ id: t, label: t, count: scoped.filter((x) => inTab(x, t)).length }))}
      />
      <div className="flex flex-none flex-wrap items-center gap-3 px-6 py-4">
        <SearchBox value={query} onChange={setQuery} placeholder="Search" label="Search documents" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Voucher type" className={cn("h-9 w-auto min-w-[150px] gap-2 rounded-md border-border px-3", T.cell)}>
            <span className="text-secondary-foreground">Voucher type:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((x) => (
              <SelectItem key={x} value={x}>
                {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex-1" />
        {scope === "batch" ? (
          <span
            data-testid="desk-filter"
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-pi-brand-border bg-pi-brand-tint pl-3 pr-1 text-[12px] font-medium text-pi-ink"
          >
            This upload · {plural(card.files.length, "file")}
            <button
              type="button"
              aria-label="Clear the filter and show every document"
              onClick={() => setScope("all")}
              data-testid="desk-clear"
              className="grid h-5 w-5 place-items-center rounded-full text-pi-body hover:bg-background hover:text-pi-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
            >
              ×
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setScope("batch")}
            data-testid="desk-restore"
            className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-primary hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
          >
            Back to this upload
          </button>
        )}
      </div>
      {scope === "batch" && missing > 0 && (
        <p className={cn(T.sub, "px-6 pb-2")}>{plural(missing, "file")} no longer available.</p>
      )}
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
            {pageRows.map((x) => (
              <TableRow
                key={x.id}
                data-testid={`desk-row-${x.id}`}
                onClick={() => setOpenId(x.id)}
                className="cursor-pointer"
              >
                <TableCell className="w-0 p-0" />
                {COLS.map((k) => (
                  <TableCell
                    key={k}
                    className={cn("h-[45px] overflow-hidden px-3 py-0 align-middle", T.cell, k === "amount" && "text-right")}
                  >
                    <CellBox>
                      {k === "status" ? (
                        <StatusPill status={x.status} />
                      ) : k === "amount" ? (
                        <span className="truncate tabular-nums">
                          <AmountText value={x.amount} />
                        </span>
                      ) : k === "source" ? (
                        <span className="truncate">{SOURCE[x.source]}</span>
                      ) : k === "user" ? (
                        <span className="truncate">{senderUser(x)}</span>
                      ) : k === "received" ? (
                        <span className="truncate">{day(x.received)}</span>
                      ) : k === "type" ? (
                        <span className="truncate">{x.form.voucherType}</span>
                      ) : k === "vendor" ? (
                        <span className="truncate">{x.form.party || "—"}</span>
                      ) : (
                        <span className="truncate">{x.file.name}</span>
                      )}
                    </CellBox>
                  </TableCell>
                ))}
                <TableCell className="w-0 p-0" />
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <EmptyBlock
            title={filtered ? "No matching documents" : tab === "All" ? "Nothing here" : `Nothing in ${tab}`}
            body={filtered ? "Try a different search or voucher type." : undefined}
          />
        )}
      </div>
      <Pager page={page} pageSize={size} total={rows.length} onPageChange={setPage} onPageSizeChange={setSize} />
    </div>
  );
};
