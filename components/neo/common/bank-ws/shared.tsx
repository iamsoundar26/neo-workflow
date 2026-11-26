import React, { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Pager as StdPager } from "@/components/inbox/v2/banking/table-parts";
import { Check, ChevronLeft, ChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import { inr, money, shortDate } from "@/config/pages/neo/mock-bank-recon";
import type { WsTxn, WsVoucher } from "@/config/pages/neo/mock-bank-ws";
import type { WsStatus } from "@/hooks/pages/neo/use-bank-ws";

export const PAGE = 25;
export const n = (x: number) => x.toLocaleString("en-IN");
export const rupees = (x: number) => `₹${inr(x)}`;
export { money, shortDate };

export const BTN =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-pi-line-2 bg-background px-3 text-body-3 font-medium text-pi-ink shadow-contact transition-colors hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:cursor-not-allowed disabled:opacity-50";
export const PRIMARY =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-pi-btn-primary-edge bg-pi-btn-fill px-3 text-body-3 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:cursor-not-allowed disabled:opacity-50";
export const LINK =
  "text-body-3 font-medium text-pi-brand underline underline-offset-2 hover:text-pi-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pi-brand-border disabled:no-underline disabled:opacity-50";

const WORD: Record<WsStatus, string> = {
  pending: "Pending",
  saved: "Saved",
  approved: "Approved",
  synced: "Synced",
  failed: "Failed",
};

/** A status is always a word and a mark, never a colour alone. */
export const StatusChip = ({
  status,
  label,
}: {
  status: WsStatus;
  label?: string;
}) => {
  const done = status === "approved" || status === "synced";
  return (
    <span
      className={cn(
        "inline-flex h-5 flex-none items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[12px] font-medium",
        done
          ? "border-pi-brand-border bg-pi-brand-tint text-pi-brand"
          : status === "failed"
            ? "border-pi-line-2 bg-pi-fill font-semibold text-pi-ink"
            : "border-pi-line-2 bg-pi-fill text-pi-ink"
      )}
    >
      {done && <Check className="h-3 w-3" />}
      {status === "failed" && <span aria-hidden>!</span>}
      {label ?? WORD[status]}
    </span>
  );
};

export const Banner = ({
  children,
  onClose,
  tone = "info",
}: {
  children: React.ReactNode;
  onClose?: () => void;
  tone?: "info" | "warn";
}) => (
  <div
    role="status"
    className={cn(
      "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-body-3 text-pi-ink",
      tone === "warn" ? "border-pi-line-2 bg-pi-fill" : "border-pi-brand-border bg-pi-brand-tint"
    )}
  >
    <div className="min-w-0 flex-1 space-y-1">{children}</div>
    {onClose && (
      <button type="button" onClick={onClose} className={LINK}>
        Dismiss
      </button>
    )}
  </div>
);

export const Seg = <T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number }[];
}) => (
  <div className="flex flex-wrap gap-1.5" role="group">
    {items.map((i) => (
      <button
        key={i.id}
        type="button"
        aria-pressed={value === i.id}
        onClick={() => onChange(i.id)}
        className={cn(
          "h-8 rounded-full border px-3 text-body-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
          value === i.id
            ? "border-pi-brand-border bg-pi-brand-tint font-semibold text-pi-ink"
            : "border-pi-line-2 bg-background text-pi-body hover:bg-pi-fill hover:text-pi-ink"
        )}
      >
        {i.label}
        {i.count !== undefined && (
          <span className="ml-1.5 tabular-nums text-pi-body">{n(i.count)}</span>
        )}
      </button>
    ))}
  </div>
);

/* One page size for every sheet of the workspace, as the Banking tables keep theirs. */
let pageSize = 25;
const sizeListeners = new Set<() => void>();
export const usePageSize = () =>
  [
    useSyncExternalStore(
      (f) => {
        sizeListeners.add(f);
        return () => sizeListeners.delete(f);
      },
      () => pageSize,
      () => 25
    ),
    (n: number) => {
      pageSize = n;
      sizeListeners.forEach((f) => f());
    },
  ] as const;

/** The product's pager (Banking and Purchases registers): rows per page, then first, previous, next, last. */
export const Pager = ({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) => {
  const [size, setSize] = usePageSize();
  return <StdPager page={page} pageSize={size} total={total} onPageChange={onPage} onPageSizeChange={setSize} />;
};

/* ------------------------------------------------------------- selection */

/**
 * Selecting rows, without holding thousands of ids. Pick rows or a page one
 * by one; or pick everything eligible and then exclude the ones you don't
 * want. `ids()` is what is selected right now, among what is eligible.
 */
export const useSel = (eligible: string[]) => {
  const [all, setAll] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [out, setOut] = useState<Set<string>>(new Set());
  const ok = useMemo(() => new Set(eligible), [eligible]);

  const isSel = useCallback(
    (id: string) => ok.has(id) && (all ? !out.has(id) : ids.has(id)),
    [ok, all, out, ids]
  );
  const flip = (s: Set<string>, id: string) => {
    const x = new Set(s);
    if (!x.delete(id)) x.add(id);
    return x;
  };
  const selected = useMemo(
    () => (all ? eligible.filter((id) => !out.has(id)) : eligible.filter((id) => ids.has(id))),
    [all, eligible, out, ids]
  );
  return {
    all,
    count: selected.length,
    excluded: all ? eligible.length - selected.length : 0,
    ids: () => selected,
    isSel,
    toggle: (id: string) => (all ? setOut((s) => flip(s, id)) : setIds((s) => flip(s, id))),
    pageSelected: (page: string[]) => {
      const e = page.filter((id) => ok.has(id));
      return e.length > 0 && e.every(isSel);
    },
    togglePage: (page: string[], on: boolean) => {
      const e = page.filter((id) => ok.has(id));
      if (all) setOut((s) => { const x = new Set(s); e.forEach((id) => (on ? x.delete(id) : x.add(id))); return x; });
      else setIds((s) => { const x = new Set(s); e.forEach((id) => (on ? x.add(id) : x.delete(id))); return x; });
    },
    selectAll: () => { setAll(true); setOut(new Set()); },
    clear: () => { setAll(false); setIds(new Set()); setOut(new Set()); },
  };
};
export type Sel = ReturnType<typeof useSel>;

export const Check1 = ({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) => (
  <input
    type="checkbox"
    aria-label={label}
    checked={checked}
    disabled={disabled}
    onChange={(e) => onChange(e.target.checked)}
    onClick={(e) => e.stopPropagation()}
    className="h-4 w-4 flex-none cursor-pointer rounded-xs border-pi-line-2 disabled:cursor-not-allowed disabled:opacity-40"
  />
);

/* ----------------------------------------------------------- comparison */

const Fact = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-1 text-body-3">
    <dt className="flex-none text-pi-body">{k}</dt>
    <dd className="min-w-0 break-words text-right text-pi-ink">{v}</dd>
  </div>
);

/** The bank transaction and a Tally voucher, side by side. */
export const Compare = ({
  t,
  v,
  empty,
  dateNote,
}: {
  t: WsTxn;
  v?: WsVoucher;
  empty?: string;
  dateNote?: string;
}) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <section className="rounded-lg border border-pi-line-2 p-3" aria-label="Bank transaction">
      <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-pi-body">
        Bank transaction
      </h4>
      <dl>
        <Fact k="Date" v={shortDate(t.date)} />
        <Fact k="Description" v={t.text} />
        <Fact k="Reference" v={t.ref || "—"} />
        <Fact k="Amount" v={<strong className="tabular-nums">{money(t.amount)}</strong>} />
      </dl>
    </section>
    <section className="rounded-lg border border-pi-line-2 p-3" aria-label="Tally voucher">
      <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-pi-body">
        Tally voucher
      </h4>
      {v ? (
        <dl>
          <Fact k="Voucher" v={v.no} />
          <Fact
            k="Date"
            v={
              <>
                {shortDate(v.date)}
                {dateNote && <span className="block text-body-4 text-pi-body">{dateNote}</span>}
              </>
            }
          />
          <Fact k="Party" v={v.party} />
          <Fact k="Reference" v={v.ref || "—"} />
          <Fact k="Amount" v={<strong className="tabular-nums">{money(v.amount)}</strong>} />
        </dl>
      ) : (
        <p className="py-3 text-body-3 text-pi-body">{empty || "No voucher chosen yet."}</p>
      )}
    </section>
  </div>
);

export const Row = ({
  children,
  onClick,
  selected,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  label?: string;
}) => (
  <div
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    aria-label={label}
    onClick={onClick}
    onKeyDown={(e) => {
      if (onClick && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
        e.preventDefault();
        onClick();
      }
    }}
    className={cn(
      "flex items-center gap-3 border-b border-pi-line px-3 py-2.5 text-left outline-none last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border",
      onClick && "cursor-pointer hover:bg-pi-fill",
      selected && "bg-pi-brand-tint"
    )}
  >
    {children}
  </div>
);

export const List = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-lg border border-pi-line-2 bg-background">{children}</div>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-dashed border-pi-line-2 px-4 py-8 text-center text-body-3 text-pi-body">
    {children}
  </p>
);
