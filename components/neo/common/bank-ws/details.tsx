import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Building2,
  Calendar,
  Check,
  CircleAlert,
  CloudOff,
  Cloud,
  Landmark,
  Lock,
  Pencil,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldCard, DateField, Pill as StdPill, T, type PillTone } from "@/components/inbox/v2/ui";
import { Textarea } from "@/components/ui/textarea";
import { ComboBox } from "@/components/common/combo-box";
import { cn } from "@/lib/utils";
import {
  WS_LEDGERS,
  ledgerFit,
  wsById,
  wsTxns,
  type VType,
  type WsTxn,
  type WsVoucher,
} from "@/config/pages/neo/mock-bank-ws";
import {
  approveDrafts,
  deriveWs,
  issueOf,
  kindOf,
  ledgerOf,
  matchVouchers,
  revoke,
  saveDraft,
  saveVouchers,
  statusOf,
  useBankWs,
  voucherList,
  vouchersFor,
} from "@/hooks/pages/neo/use-bank-ws";
import { money, n, rupees, shortDate } from "./shared";

/**
 * Transaction details (18 Nov 2026), from the AI Accountant designs ("Exact
 * match", "Potential Match", "No Match", "Edit Voucher", "Details page"). One
 * panel for every line: the bank amount, what is unreconciled about it, and
 * the vouchers Neo suggests, or all of them. Tick one or several; the bar says
 * what they add up to against the bank line. The pencil edits a voucher.
 * Create Voucher drafts a new one. Match & Reconcile stages the match for sync;
 * a reconciled line is locked until you remove the reconciliation, a synced
 * one stays locked.
 */

export const inr = (x: number) => Math.abs(x).toLocaleString("en-IN");
export const side = (x: number) => (x < 0 ? "Dr" : "Cr");
export const kind = (v: { no: string }) =>
  /^(pmt|pymt)/i.test(v.no) ? "Payment" : /^(rcpt|rct)/i.test(v.no) ? "Receipt" : /^(cntr|ctr)/i.test(v.no) ? "Contra" : "Journal";

/** The product's own button styles (components/ui/button), for the plain <button>s here. */
export const BTN = buttonVariants({ variant: "outline" });
export const PRIME = buttonVariants({ variant: "default" });

/* ------------------------------------------------------- vouchers to pick from */

/** The vouchers that are not suggested: other open ones, and ones taken elsewhere. */
const pool = (() => {
  let cache: WsVoucher[] | null = null;
  return () =>
    (cache ??= wsTxns()
      .filter((t) => t.kind === "exact")
      .slice(300, 340)
      .map((t, i) => ({
        ...t.vouchers[0],
        used: i % 3 === 0 ? "Matched to another bank line" : undefined,
      })));
})();

const allVouchers = (t: WsTxn): WsVoucher[] => {
  const mine = voucherList(t);
  const seen = new Set(mine.map((v) => v.no));
  return [...mine, ...pool().filter((v) => !seen.has(v.no))];
};

export type Badge = "exact" | "potential" | null;
const badgeOf = (t: WsTxn, v: WsVoucher): Badge => {
  const suggested = voucherList(t).some((x) => x.no === v.no);
  if (!suggested) return null;
  return v.amount === t.amount && v.date === t.date ? "exact" : "potential";
};

/* ---------------------------------------------------------------- the pieces */

const Info = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0 border-l border-pi-line pl-3 first:border-l-0 first:pl-0">
    <p className="text-[12px] leading-4 text-pi-body">{label}</p>
    <div className="mt-1 flex h-5 min-w-0 items-center text-[14px] font-medium leading-5 text-pi-ink">{children}</div>
  </div>
);

const TONE: Record<"grey" | "green" | "blue" | "amber" | "red", PillTone> = {
  grey: "neutral",
  green: "ok",
  blue: "info",
  amber: "warn",
  red: "error",
};
/** A status pill, from the product's own Pill (inbox/v2/ui). */
export const Pill = ({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) => (
  <StdPill tone={TONE[tone]} className="inline-flex h-5 flex-none items-center justify-center gap-1 whitespace-nowrap rounded-[4px] border-0 px-2 py-0 text-caption-1 font-medium leading-none [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1 [&_svg]:size-3 [&_svg]:flex-none">
    {children}
  </StdPill>
);

export const Header = ({
  amount,
  text,
  date,
  reconciled,
  synced,
  account = "ICICI 5610",
  onClose,
  config,
}: {
  amount: number;
  text: string;
  date: string;
  reconciled: boolean;
  synced: boolean;
  account?: string;
  onClose: () => void;
  config?: React.ReactNode;
}) => (
  <header className="flex-none border-b border-pi-line px-4 pb-3 pt-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <button type="button" aria-label="Back to the list" title="Back to the list" data-testid="detail-back" onClick={onClose} className="-ml-1.5 grid h-8 w-8 flex-none place-items-center rounded-md text-pi-body hover:bg-pi-fill hover:text-pi-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h3 className="truncate text-[18px] font-medium leading-6 text-pi-ink">Transaction Details</h3>
      </div>
      {config && <div className="flex flex-none items-center gap-2">{config}</div>}
    </div>
    <div className="mt-2 flex items-center gap-2">
      <span className="text-[24px] font-semibold leading-8 tabular-nums text-pi-ink">₹ {inr(amount)}</span>
      <Pill tone="blue">{amount < 0 ? "Debit" : "Credit"}</Pill>
    </div>
    <div className="mt-2 grid grid-cols-[1.1fr_1fr_1.1fr_1fr_1.15fr] gap-x-3">
      <Info label="Description"><span title={text} className="truncate">{text}</span></Info>
      <Info label="Account">
        <span className="inline-flex min-w-0 items-center gap-1"><Landmark className="h-3.5 w-3.5 flex-none text-pi-brand" /><span className="truncate">{account}</span></span>
      </Info>
      <Info label="Transaction Date"><span className="truncate">{shortDate(date)} 2026</span></Info>
      <Info label="Status">
        <Pill tone={reconciled ? "green" : "grey"}>{reconciled ? "Reconciled" : "Unreconciled"}</Pill>
      </Info>
      <Info label="Sync Status">
        {synced ? (
          <Pill tone="blue"><Cloud className="h-3 w-3" />Synced</Pill>
        ) : (
          <Pill tone="grey"><CloudOff className="h-3 w-3" />Not Synced</Pill>
        )}
      </Info>
    </div>
  </header>
);

export const Summary = ({ amount, sum, count }: { amount: number; sum: number; count: number }) => {
  const diff = Math.abs(sum - amount);
  const bad = count > 0 && diff > 0;
  const exact = count > 0 && diff === 0;
  return (
    <div
      data-testid="ws-summary"
      className={cn(
        "mx-4 mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[14px]",
        bad ? "border-pi-danger-line bg-pi-danger-bg" : "border-pi-line-2 bg-pi-page"
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-pi-body">
        <span className="font-medium text-pi-ink tabular-nums">₹ {inr(amount)}</span>•<span>1 Bank Line</span>
        <ArrowLeftRight className="h-3.5 w-3.5 text-pi-brand" />
        <span className="font-medium text-pi-ink tabular-nums">₹ {inr(sum)}</span>•
        <span>
          {count} {count === 1 ? "Voucher" : "Vouchers"}
        </span>
      </span>
      {exact ? (
        <Pill tone="green"><Check className="h-3 w-3" />Exact match</Pill>
      ) : bad ? (
        <Pill tone="red"><CircleAlert className="h-3 w-3" />Difference ₹{inr(diff)}</Pill>
      ) : (
        <Pill tone="grey"><CircleAlert className="h-3 w-3" />Select Voucher</Pill>
      )}
    </div>
  );
};

export type CardV = { no: string; amount: number; date: string; party: string; ref?: string; used?: string };

export const VoucherCardView = ({
  v,
  badge,
  on,
  readOnly,
  onToggle,
  onEdit,
}: {
  v: CardV;
  badge: Badge;
  on: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) => (
  <div
    data-testid={`ws-voucher-${v.no}`}
    onClick={() => !readOnly && !v.used && onToggle()}
    className={cn(
      "flex items-center gap-3 rounded-xl border px-3 py-3",
      on ? "border-pi-brand bg-pi-brand-tint/30" : "border-pi-line-2 bg-background",
      !readOnly && !v.used && "cursor-pointer hover:bg-pi-fill",
      v.used && "opacity-70"
    )}
  >
    <input
      type="checkbox"
      aria-label={`Select ${v.no}`}
      checked={on}
      disabled={readOnly || !!v.used}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 flex-none cursor-pointer rounded-xs border-pi-line-2 accent-[var(--palette-blue-600,#3b4cca)] disabled:cursor-not-allowed"
    />
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-pi-ink">
        {kind(v)} - ₹{inr(v.amount)} {side(v.amount)}
        {badge === "exact" && <Pill tone="green"><Check className="h-3 w-3" />Exact match</Pill>}
        {badge === "potential" && <Pill tone="amber">Potential Match</Pill>}
        {v.used && <Pill tone="grey">{v.used}</Pill>}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-pi-body">
        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{shortDate(v.date)} 2026</span>
        <span aria-hidden className="h-3 border-l border-pi-line-2" />
        <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{v.party}</span>
        <span aria-hidden className="h-3 border-l border-pi-line-2" />
        <span>Ref No: <span className="text-pi-brand">{v.ref || v.no}</span></span>
      </p>
    </div>
    {!readOnly && (
      <button
        type="button"
        aria-label={`Edit ${v.no}`}
        data-testid={`ws-edit-${v.no}`}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="grid h-8 w-8 flex-none place-items-center rounded-md text-pi-body hover:bg-pi-fill hover:text-pi-ink"
      >
        <Pencil className="h-4 w-4" />
      </button>
    )}
  </div>
);

/* -------------------------------------------------------------------- the form */

type Alloc = { ledger: string; amount: string };
const LEDGER_NAMES = (t: WsTxn) => WS_LEDGERS.filter((l) => !ledgerFit(l.name, t)).map((l) => ({ label: l.name, value: l.name }));

/** The sheet's field panel (FieldCard) with the children laid out by the caller. */
export const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <FieldCard title={title} plain>{children}</FieldCard>
);
export const F = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <Field label={label} className={className}>{children}</Field>
);
export const COMBO = { hasSearch: false, isMultiSelect: false, hideClearButton: true } as const;

/** Edit a voucher, or draft a new one when the line has none. */
const VoucherForm = ({
  t,
  voucher,
  readOnly,
  onDone,
  onBackToMatch,
  banner,
}: {
  t: WsTxn;
  /** A voucher being edited. Without one, a new voucher is drafted. */
  voucher?: WsVoucher;
  readOnly: boolean;
  onDone: (edited?: WsVoucher) => void;
  onBackToMatch: () => void;
  banner?: React.ReactNode;
}) => {
  const ws = useBankWs();
  const o = ws.ov[t.id];
  const draft = t.draft;
  const credit = t.amount > 0;
  const total = Math.abs(voucher ? voucher.amount : t.amount);
  const [type, setType] = useState<VType>(draft?.type || (credit ? "Receipt" : "Payment"));
  const [no, setNo] = useState(voucher?.no || `${credit ? "RCT" : "PMT"}/2026-27/${String(Number(t.id.replace(/\D/g, "")) % 1000).padStart(3, "0")}`);
  const [gst, setGst] = useState("Headoffice");
  const [date, setDate] = useState(voucher?.date || t.date);
  const [lines, setLines] = useState<Alloc[]>([
    { ledger: voucher ? voucher.party : ledgerOf(t, o), amount: String(total) },
  ]);
  const [extra, setExtra] = useState<Alloc[]>([]);
  const [narr, setNarr] = useState(draft?.narration || t.text);
  const [msg, setMsg] = useState("");
  const allocated = [...lines, ...extra].reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const remaining = Math.round((total - allocated) * 100) / 100;
  const status = statusOf(t, o);
  const locked = readOnly;

  const fit = !voucher && lines[0]?.ledger ? ledgerFit(lines[0].ledger, t) : null;
  const set = (list: Alloc[], setList: (l: Alloc[]) => void, i: number, c: Partial<Alloc>) =>
    setList(list.map((x, k) => (k === i ? { ...x, ...c } : x)));
  const opts = LEDGER_NAMES(t);
  const row = (list: Alloc[], setList: (l: Alloc[]) => void, i: number, first: boolean) => (
    <div key={i} className="grid grid-cols-[minmax(0,1fr)_150px] items-end gap-2">
      <F label={first ? "Ledger" : ""}>
        {voucher ? (
          <Input value={list[i].ledger} disabled={locked} onChange={(e) => set(list, setList, i, { ledger: e.target.value })} className="h-10" />
        ) : (
          <ComboBox
            title="Select Ledger"
            options={opts}
            selectedValue={list[i].ledger}
            onChange={(v) => { set(list, setList, i, { ledger: String(v) }); setMsg(""); }}
            {...COMBO}
            hasSearch
            disabled={locked}
          />
        )}
      </F>
      <F label={first ? "Amount" : ""} className="items-stretch">
        <Input
          inputMode="decimal"
          aria-label="Amount"
          disabled={locked}
          value={list[i].amount}
          onChange={(e) => { set(list, setList, i, { amount: e.target.value.replace(/[^0-9.]/g, "") }); setMsg(""); }}
          className="h-10 text-right tabular-nums"
          data-testid={first && list === lines ? "ws-form-amount" : undefined}
        />
      </F>
    </div>
  );

  const save = (create: boolean) => {
    if (voucher) {
      const amt = (credit ? 1 : -1) * (Number(lines[0].amount) || 0);
      onDone({ ...voucher, amount: amt, date });
      return;
    }
    const ledger = lines[0].ledger;
    const r = saveDraft(t.id, ledger);
    if (!r.ok) return setMsg(r.reason);
    if (create) {
      if (remaining !== 0) return setMsg(`₹${inr(remaining)} is still unallocated. Allocate the full amount to create the record.`);
      approveDrafts([t.id]);
      return onDone();
    }
    setMsg("Draft saved. It is not approved yet.");
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-pi-page p-4" data-testid="ws-draft">
        {banner}
        <Card title="Voucher Configuration">
          <div className="grid grid-cols-3 gap-3">
            <F label="Voucher Type">
              <ComboBox title="Voucher Type" options={(["Payment", "Receipt", "Contra", "Journal"] as VType[]).map((x) => ({ label: x, value: x }))} selectedValue={type} onChange={(v) => setType(String(v) as VType)} {...COMBO} disabled={locked} />
            </F>
            <F label="Voucher No.">
              <Input value={no} disabled={locked} onChange={(e) => setNo(e.target.value)} className="h-10" />
            </F>
            <F label="GST Registration">
              <ComboBox title="GST Registration" options={["Headoffice", "Chennai branch"].map((x) => ({ label: x, value: x }))} selectedValue={gst} onChange={(v) => setGst(String(v))} {...COMBO} disabled={locked} />
            </F>
          </div>
          <F label="Voucher Date" className="mt-3">
            <DateField value={date} disabled={locked} onChange={setDate} />
          </F>
        </Card>

        <Card title="Ledger Allocation">
          <div className="flex flex-col gap-2">
            {lines.map((_, i) => row(lines, setLines, i, i === 0))}
          </div>
          {!locked && (
            <button type="button" className="mt-2 inline-flex items-center gap-2 px-1 py-2 text-[14px] font-medium text-pi-brand" onClick={() => setLines([...lines, { ledger: "", amount: "" }])}>
              <Plus className="h-4 w-4" /> Add Another Reference
            </button>
          )}
          <div className="mt-2 border-t border-pi-line pt-3">
            <p className="text-[14px] text-pi-body">Additional Ledger</p>
            <div className="mt-2 flex flex-col gap-2">{extra.map((_, i) => row(extra, setExtra, i, false))}</div>
            {!locked && (
              <button type="button" className={cn(BTN, "mt-2 h-9")} onClick={() => setExtra([...extra, { ledger: "", amount: "" }])}>
                <Plus className="h-4 w-4" /> Add ledger
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3 border-t border-pi-line pt-3">
            <F label="Narration (Optional)">
              <Textarea value={narr} disabled={locked} onChange={(e) => setNarr(e.target.value)} className="min-h-[72px]" />
            </F>
            <dl className="self-start rounded-lg border border-pi-line-2 bg-pi-page text-[14px]">
              <div className="flex items-center justify-between border-b border-pi-line px-3 py-2.5">
                <dt className="font-medium text-pi-body">Total Allocated</dt>
                <dd className="font-semibold tabular-nums text-pi-ink">₹ {allocated.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <dt className="font-medium text-pi-body">Amount Remaining</dt>
                <dd data-testid="ws-remaining" className={cn("font-semibold tabular-nums", remaining !== 0 ? "text-pi-danger" : "text-pi-ink")}>
                  ₹ {remaining.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
        {(msg || fit) && (
          <p role="status" data-testid="ws-why" className="text-[13px] text-pi-ink">{msg || fit}</p>
        )}
      </div>
      <footer className="flex flex-none items-center justify-between gap-2 border-t border-neutral-gray bg-background px-6 py-3">
        {voucher ? (
          <button type="button" className={BTN} onClick={onBackToMatch}><span aria-hidden>‹</span> Back</button>
        ) : (
          <button type="button" className={BTN} onClick={onBackToMatch} data-testid="ws-match-voucher">
            <ArrowLeftRight className="h-4 w-4" /> Match Voucher
          </button>
        )}
        {!locked && (
          <div className="flex gap-2">
            <button type="button" className={BTN} data-testid="ws-save-draft" onClick={() => save(false)}>
              <Save className="h-4 w-4" /> Save
            </button>
            {!voucher && (
              <button type="button" className={PRIME} data-testid="ws-create-record" onClick={() => save(true)}>
                <Check className="h-4 w-4" /> Create Record
              </button>
            )}
          </div>
        )}
        {locked && status === "approved" && (
          <button type="button" className={PRIME} onClick={() => revoke(t.id)}>
            <Undo2 className="h-4 w-4" /> Remove Reconciliation
          </button>
        )}
      </footer>
    </>
  );
};

/* -------------------------------------------------------------------- the panel */

const TransactionDetails = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const ws = useBankWs();
  deriveWs(ws);
  const t = wsById(id);
  const o = t ? ws.ov[t.id] : undefined;
  const k = t ? kindOf(t, o) : "new";
  const status = t ? statusOf(t, o) : "pending";
  const done = status === "approved" || status === "synced" || status === "failed";
  const locked = done;

  const [tab, setTab] = useState<"ai" | "all">(k === "exact" ? "ai" : "ai");
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sameSide, setSameSide] = useState(true);
  const [hideUsed, setHideUsed] = useState(true);
  const [edits, setEdits] = useState<Record<string, WsVoucher>>({});
  const [form, setForm] = useState<{ v?: WsVoucher } | null>(null);
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [matching, setMatching] = useState(false);

  const list = useMemo(() => (t ? allVouchers(t) : []), [t]);
  const withEdits = (v: WsVoucher) => edits[v.no] || v;

  // What is ticked: the line's current vouchers until you change it.
  const current = t ? vouchersFor(t, o) : [];
  const ticked = picked ?? (t && k !== "new" ? current.map((v) => v.no) : []);
  const pickedV = list.map(withEdits).filter((v) => ticked.includes(v.no));
  const extraPicked = current.filter((v) => !list.some((x) => x.no === v.no));
  const selection = [...pickedV, ...extraPicked.filter((v) => ticked.includes(v.no))];

  if (!t) return null;

  const suggested = voucherList(t).map(withEdits);
  const filters = Number(sameSide) + Number(hideUsed);
  const shown = (tab === "ai" ? suggested : list.map(withEdits)).filter((v) => {
    if (tab === "all") {
      if (sameSide && Math.sign(v.amount) !== Math.sign(t.amount)) return false;
      if (hideUsed && v.used) return false;
    }
    const s = q.trim().toLowerCase();
    return !s || `${v.no} ${v.party} ${v.ref || ""}`.toLowerCase().includes(s);
  });

  const toggle = (v: WsVoucher) =>
    setPicked(ticked.includes(v.no) ? ticked.filter((x) => x !== v.no) : [...ticked, v.no]);

  const match = () => {
    const r = matchVouchers(t.id, selection);
    if (r.ok) onBack();
    else setMsg(r.reason);
  };

  const banner = locked && (
    <div className="flex items-start gap-2 rounded-lg border border-pi-warning-line bg-pi-warning-bg px-3 py-2.5 text-[14px] text-pi-warning" data-testid="ws-locked">
      <Lock className="mt-0.5 h-4 w-4 flex-none" />
      {status === "synced"
        ? "This transaction has been synced."
        : "This transaction is reconciled and in All Transactions. To make changes, revert it back to Needs Review using the button below."}
    </div>
  );

  // New entries, and "Create Voucher", open the form; a line with no voucher starts there.
  const formView = form || (k === "new" && !done && !matching ? {} : null);
  if (formView || (done && k === "new")) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background" data-testid="ws-detail">
        <Header amount={t.amount} text={t.text} date={t.date} reconciled={done} synced={status === "synced"} onClose={onBack} />
        <VoucherForm
          key={`${t.id}-${form?.v?.no || "new"}`}
          t={t}
          voucher={form?.v}
          readOnly={locked}
          banner={banner}
          onBackToMatch={() => (form ? setForm(null) : (setMatching(true), undefined))}
          onDone={(edited) => {
            if (edited) {
              setEdits((e) => ({ ...e, [edited.no]: edited }));
              setPicked((p) => Array.from(new Set([...(p ?? ticked), edited.no])));
              const others = selection.filter((v) => v.no !== edited.no);
              saveVouchers(t.id, [...others, edited]);
              setForm(null);
            } else onBack();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="ws-review-detail">
      <Header amount={t.amount} text={t.text} date={t.date} reconciled={done} synced={status === "synced"} onClose={onBack} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {banner && <div className="px-4 pt-3">{banner}</div>}
        <Summary amount={t.amount} sum={selection.reduce((a, v) => a + v.amount, 0)} count={selection.length} />
        <div className="px-4 pt-3">
          <div role="tablist" className="inline-flex rounded-lg border border-pi-line-2">
            {([["ai", "Suggested By AIA"], ["all", "All Vouchers"]] as const).map(([id2, label], i) => (
              <button
                key={id2}
                role="tab"
                aria-selected={tab === id2}
                onClick={() => setTab(id2)}
                data-testid={`ws-vtab-${id2}`}
                className={cn(
                  "h-9 px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
                  i === 0 ? "rounded-l-lg" : "rounded-r-lg border-l border-pi-line-2",
                  tab === id2 ? "bg-pi-brand-tint text-pi-brand" : "text-pi-body hover:text-pi-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === "all" && (
          <div className="relative flex items-center gap-2 px-4 pt-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pi-body" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." aria-label="Search vouchers" className="h-10 pl-9" />
            </div>
            <button type="button" aria-label="Filters" aria-expanded={filterOpen} onClick={() => setFilterOpen((x) => !x)} className="inline-flex h-10 items-center gap-2 rounded-md border border-pi-brand-border bg-pi-brand-tint/40 px-3 text-[14px] font-medium text-pi-brand">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="border-l border-pi-brand-border pl-2">{filters}</span>
            </button>
            {filterOpen && (
              <div className="absolute right-4 top-14 z-20 w-64 rounded-lg border border-pi-line-2 bg-background p-3 shadow-lg">
                {([["Same side as the bank line", sameSide, setSameSide], ["Hide vouchers matched elsewhere", hideUsed, setHideUsed]] as const).map(([label, v, set]) => (
                  <label key={label} className="flex cursor-pointer items-center gap-2 py-1.5 text-[14px] text-pi-ink">
                    <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-[var(--palette-blue-600,#3b4cca)]" />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 px-4 py-3">
          {shown.length === 0 && (
            <p className="rounded-lg border border-dashed border-pi-line-2 px-4 py-8 text-center text-[14px] text-pi-body">
              {tab === "ai" ? "Neo found no voucher for this line. Search All Vouchers, or create a voucher." : "No vouchers match."}
            </p>
          )}
          {shown.map((v) => (
            <VoucherCardView key={v.no} v={v} badge={badgeOf(t, v)} on={ticked.includes(v.no)} readOnly={locked} onToggle={() => toggle(v)} onEdit={() => setForm({ v })} />
          ))}
        </div>
      </div>
      {msg && (
        <p role="status" data-testid="ws-why" className="flex-none border-t border-pi-line bg-pi-page px-4 py-2 text-[13px] text-pi-ink">
          {msg}
        </p>
      )}
      <footer className="flex flex-none items-center justify-between gap-2 border-t border-neutral-gray bg-background px-6 py-3">
        {locked ? (
          status === "approved" ? (
            <button type="button" className={PRIME} data-testid="ws-remove-rec" onClick={() => revoke(t.id)}>
              <Undo2 className="h-4 w-4" /> Remove Reconciliation
            </button>
          ) : (
            <span />
          )
        ) : (
          <>
            <button type="button" className={BTN} data-testid="ws-create-voucher" onClick={() => { setMatching(false); setForm({}); }}>
              <Plus className="h-4 w-4" /> Create Voucher
            </button>
            <button type="button" className={PRIME} data-testid="ws-approve-match" disabled={selection.length === 0} onClick={match}>
              <Check className="h-4 w-4" /> Match & Reconcile
            </button>
          </>
        )}
      </footer>
    </div>
  );
};

export default TransactionDetails;
