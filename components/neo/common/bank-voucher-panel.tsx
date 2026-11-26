import React, { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Lock,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/inbox/v2/ui";
import { Textarea } from "@/components/ui/textarea";
import { ComboBox } from "@/components/common/combo-box";
import { cn } from "@/lib/utils";
import { gstRegistrationsOf } from "@/config/pages/inbox/mock-banking";
import {
  TYPE_BY_LABEL,
  ledgerGroupsFor,
  typeOptionsFor,
} from "@/components/inbox/v2/banking/transactions-table";
import { NANDHINI_ID } from "@/config/pages/neo/mock-recon";
import {
  VOUCHERS,
  draftFor,
  gap,
  inr,
  type TallyVoucher,
  type VoucherDraft,
} from "@/config/pages/neo/mock-bank-recon";
import {
  approveLines,
  chooseVouchers,
  reopenLine,
  setVoucherAmount,
  updateDraft,
  useBankRun,
  type BankLineState,
} from "@/hooks/pages/neo/use-bank-recon";
import {
  BTN,
  Card,
  F,
  Header,
  PRIME,
  Pill,
  Summary,
  VoucherCardView,
  type Badge,
} from "./bank-ws/details";

/**
 * A bank line's voucher, beside the chat (18 Nov 2026), from the AI Accountant
 * designs ("Exact match", "Potential Match", "No Match", "Edit Voucher").
 * The bank amount and what is unreconciled about it; the vouchers Neo suggests,
 * or all of them, to tick one or several; the pencil edits a voucher's amount;
 * Create Voucher drafts a new one. Match & Reconcile only goes through when the
 * vouchers add up to the bank amount. A reconciled line is locked until you
 * remove the reconciliation.
 *
 * "Bank reconciliation 2" uses the same panel (bank-ws/details.tsx).
 *
 * DEV: PATCH /api/bank-recon/runs/:id/lines/:lineId.
 */

type Props = { lineId: string; onClose: () => void };

const COMBO = { hasSearch: false, isMultiSelect: false, hideClearButton: true } as const;
const dec = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

const Body = ({ l, onClose }: { l: BankLineState; onClose: () => void }) => {
  const run = useBankRun();
  const gst = gstRegistrationsOf(NANDHINI_ID);
  const bankLedger = run?.ledger || "HDFC Current A/c - 0418";
  const credit = l.line.amount > 0;
  const synced = l.status === "synced";
  const done = l.status === "reconciled" || synced;

  // Vouchers other lines have taken, and the ones this line stands on.
  const taken = useMemo(
    () =>
      new Set(
        (run?.lines || [])
          .filter((x) => x.line.id !== l.line.id)
          .flatMap((x) => x.vouchers.map((v) => v.no))
      ),
    [run, l.line.id]
  );
  const suggested = useMemo(() => {
    const own = l.vouchers;
    const near = VOUCHERS.filter(
      (v) =>
        Math.sign(v.amount) === Math.sign(l.line.amount) &&
        !taken.has(v.no) &&
        !own.some((x) => x.no === v.no) &&
        gap(v.date, l.line.date) <= (run?.settings.dateWindow ?? 3) &&
        Math.abs(v.amount - l.line.amount) <= Math.abs(l.line.amount) * 0.1
    );
    return [...own, ...near];
  }, [l.vouchers, l.line, taken, run]);

  const [tab, setTab] = useState<"ai" | "all">("ai");
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sameSide, setSameSide] = useState(true);
  const [hideUsed, setHideUsed] = useState(true);
  const [ticked, setTicked] = useState<string[]>(l.vouchers.map((v) => v.no));
  const [amounts, setAmounts] = useState<Record<string, number>>(l.amounts);
  const [form, setForm] = useState<{ v?: TallyVoucher } | null>(null);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");

  const amt = (v: TallyVoucher) => amounts[v.no] ?? v.amount;
  const all = useMemo(
    () => [...suggested, ...VOUCHERS.filter((v) => !suggested.some((s) => s.no === v.no))],
    [suggested]
  );
  const selection = all.filter((v) => ticked.includes(v.no));
  const sum = selection.reduce((n, v) => n + amt(v), 0);
  const diff = Math.round(Math.abs(sum - l.line.amount) * 100) / 100;

  const badgeOf = (v: TallyVoucher): Badge => {
    if (!suggested.some((s) => s.no === v.no)) return null;
    return v.amount === l.line.amount && v.date === l.line.date ? "exact" : "potential";
  };
  const cardOf = (v: TallyVoucher) => ({
    no: v.no,
    amount: amt(v),
    date: v.date,
    party: v.party,
    ref: v.ref,
    used: taken.has(v.no) ? "Matched to another bank line" : undefined,
  });

  const shown = (tab === "ai" ? suggested : all).filter((v) => {
    if (tab === "all") {
      if (sameSide && Math.sign(v.amount) !== Math.sign(l.line.amount)) return false;
      if (hideUsed && taken.has(v.no)) return false;
    }
    const s = q.trim().toLowerCase();
    return !s || `${v.no} ${v.party} ${v.ref || ""}`.toLowerCase().includes(s);
  });
  const toggle = (v: TallyVoucher) => {
    setError("");
    setTicked((t) => (t.includes(v.no) ? t.filter((x) => x !== v.no) : [...t, v.no]));
  };

  const commitSelection = () => {
    const same =
      selection.length === l.vouchers.length && selection.every((v) => l.vouchers.some((x) => x.no === v.no));
    if (!same) chooseVouchers(l.line.id, selection);
    selection.forEach((v) => {
      if (amt(v) !== (l.amounts[v.no] ?? v.amount) || !same) setVoucherAmount(l.line.id, v.no, Math.abs(amt(v)));
    });
  };
  const match = () => {
    if (!selection.length) return setError("Select a voucher first.");
    if (diff !== 0)
      return setError(`The amounts differ by ₹${inr(diff)}. Select vouchers that add up to the bank amount, or edit a voucher.`);
    commitSelection();
    if (approveLines([l.line.id]).length) return setError("The amounts must be equal before you approve.");
    onClose();
  };

  const banner = done && (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-pi-warning-line bg-pi-warning-bg px-3 py-2.5 text-[14px] text-pi-warning" data-testid="ws-locked">
      <Lock className="mt-0.5 h-4 w-4 flex-none" />
      {synced
        ? "This transaction has been synced."
        : "This transaction is reconciled and in All Transactions. To make changes, revert it back to Needs Review using the button below."}
    </div>
  );

  const header = (
    <Header
      amount={l.line.amount}
      text={l.line.text}
      date={l.line.date}
      account={bankLedger.replace("HDFC Current A/c - ", "HDFC ")}
      reconciled={done}
      synced={synced}
      onClose={onClose}
    />
  );

  /* ------------------------------------------------------------ the form */
  const fresh = l.vouchers.length === 0;
  const showForm = form || (fresh && !done && !matching);
  if (showForm || (done && fresh)) return <Form />;

  function Form() {
    const editing = form?.v;
    const [draft, setDraft] = useState<VoucherDraft>(() => l.draft || draftFor(l.line));
    const [gstId, setGstId] = useState(gst[0]?.uuid || "");
    const [date, setDate] = useState(editing?.date || l.line.date);
    const [value, setValue] = useState(String(Math.abs(editing ? amt(editing) : l.line.amount)));
    const [extra, setExtra] = useState<{ ledger: string; amount: string }[]>([]);
    const [msg, setMsg] = useState("");
    const total = Math.abs(editing ? editing.amount : l.line.amount);
    const allocated = (Number(value) || 0) + extra.reduce((n, x) => n + (Number(x.amount) || 0), 0);
    const remaining = Math.round((Number(editing ? value : total) - (editing ? Number(value) : allocated)) * 100) / 100;
    const groups = ledgerGroupsFor(TYPE_BY_LABEL[draft.type] ?? null, bankLedger, NANDHINI_ID);
    const ledgerOpts = groups.flatMap((g) => g.options.map((o) => ({ label: o, value: o })));

    const save = (create: boolean) => {
      if (editing) {
        setAmounts((a) => ({ ...a, [editing.no]: (credit ? 1 : -1) * (Number(value) || 0) }));
        setTicked((t) => (t.includes(editing.no) ? t : [...t, editing.no]));
        setForm(null);
        return;
      }
      if (!draft.ledger || !draft.type) return setMsg("Choose a voucher type and a ledger first.");
      chooseVouchers(l.line.id, [], draft);
      updateDraft(l.line.id, { ...draft, confidence: 1 });
      if (create) {
        if (allocated !== total) return setMsg(`₹${inr(Math.abs(total - allocated))} is still unallocated. Allocate the full amount to create the record.`);
        approveLines([l.line.id]);
        return onClose();
      }
      setMsg("Draft saved. It is not approved yet.");
    };
    const ro = done;

    return (
      <div className="flex h-full min-h-0 flex-col bg-background" data-testid="ws-draft">
        {header}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-pi-page p-4">
          {done && banner}
          <Card title="Voucher Configuration">
            <div className="grid grid-cols-3 gap-3">
              <F label="Voucher Type">
                <ComboBox
                  title="Voucher Type"
                  options={typeOptionsFor({ crDr: credit ? "credit" : "debit" }).map((x) => ({ label: x, value: x }))}
                  selectedValue={editing ? (credit ? "Receipt" : "Payment") : draft.type}
                  onChange={(v) => {
                    const type = String(v) as VoucherDraft["type"];
                    const allowed = ledgerGroupsFor(TYPE_BY_LABEL[type] ?? null, bankLedger, NANDHINI_ID).flatMap((g) => g.options);
                    setDraft((d) => ({ ...d, type, ledger: allowed.includes(d.ledger) ? d.ledger : "" }));
                  }}
                  {...COMBO}
                  disabled={ro || !!editing}
                />
              </F>
              <F label="Voucher No.">
                <Input value={editing ? editing.no : draft.voucherNo} disabled={ro || !!editing} onChange={(e) => setDraft((d) => ({ ...d, voucherNo: e.target.value }))} className="h-10" />
              </F>
              <F label="GST Registration">
                <ComboBox title="GST Registration" options={gst.map((g) => ({ label: g.label, value: g.uuid }))} selectedValue={gstId} onChange={(v) => setGstId(String(v))} {...COMBO} disabled={ro} />
              </F>
            </div>
            <F label="Voucher Date" className="mt-3">
              <DateField value={date} disabled={ro} onChange={setDate} />
            </F>
          </Card>

          <Card title="Ledger Allocation">
            <div className="grid grid-cols-[minmax(0,1fr)_150px] items-end gap-2">
              <F label="Ledger">
                {editing ? (
                  <Input value={editing.party} disabled className="h-10" />
                ) : (
                  <ComboBox
                    title="Select Ledger"
                    options={ledgerOpts}
                    optionGroups={groups.map((g) => ({ label: g.heading, options: g.options.map((o) => ({ label: o, value: o })) }))}
                    selectedValue={draft.ledger}
                    onChange={(v) => { setDraft((d) => ({ ...d, ledger: String(v) })); setMsg(""); }}
                    isMultiSelect={false}
                    hideClearButton
                    disabled={ro}
                  />
                )}
              </F>
              <F label="Amount">
                <Input
                  inputMode="decimal"
                  aria-label="Amount"
                  data-testid="ws-form-amount"
                  disabled={ro || !editing}
                  value={value}
                  onChange={(e) => { setMsg(""); setValue(e.target.value.replace(/[^0-9.]/g, "")); }}
                  className="h-10 text-right tabular-nums"
                />
              </F>
            </div>
            {extra.map((x, i) => (
              <div key={i} className="mt-2 grid grid-cols-[minmax(0,1fr)_150px] gap-2">
                <ComboBox title="Select Ledger" options={ledgerOpts} selectedValue={x.ledger} onChange={(v) => setExtra((e) => e.map((r, k) => (k === i ? { ...r, ledger: String(v) } : r)))} {...COMBO} hasSearch />
                <Input inputMode="decimal" aria-label="Amount" value={x.amount} onChange={(e) => setExtra((r) => r.map((y, k) => (k === i ? { ...y, amount: e.target.value.replace(/[^0-9.]/g, "") } : y)))} className="h-10 text-right tabular-nums" />
              </div>
            ))}
            {!ro && !editing && (
              <button type="button" className="mt-2 inline-flex items-center gap-2 px-1 py-2 text-[14px] font-medium text-pi-brand" onClick={() => setExtra((e) => [...e, { ledger: "", amount: "" }])}>
                <Plus className="h-4 w-4" /> Add Another Reference
              </button>
            )}
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3 border-t border-pi-line pt-3">
              <F label="Narration (Optional)">
                <Textarea value={draft.narration} disabled={ro} onChange={(e) => setDraft((d) => ({ ...d, narration: e.target.value }))} className="min-h-[72px]" />
              </F>
              <dl className="self-start rounded-lg border border-pi-line-2 bg-pi-page text-[14px]">
                <div className="flex items-center justify-between border-b border-pi-line px-3 py-2.5">
                  <dt className="font-medium text-pi-body">Total Allocated</dt>
                  <dd className="font-semibold tabular-nums text-pi-ink">₹ {dec(editing ? Number(value) || 0 : allocated)}</dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <dt className="font-medium text-pi-body">Amount Remaining</dt>
                  <dd data-testid="ws-remaining" className={cn("font-semibold tabular-nums", (editing ? 0 : Math.round((total - allocated) * 100) / 100) !== 0 ? "text-pi-danger" : "text-pi-ink")}>
                    ₹ {dec(editing ? 0 : Math.round((total - allocated) * 100) / 100)}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>
          {(msg || error) && <p role="status" data-testid="ws-why" className="text-[13px] text-pi-ink">{msg || error}</p>}
        </div>
        <footer className="flex flex-none items-center justify-between gap-2 border-t border-neutral-gray bg-background px-6 py-3">
          {editing ? (
            <button type="button" className={BTN} onClick={() => setForm(null)}><span aria-hidden>‹</span> Back</button>
          ) : (
            <button type="button" className={BTN} data-testid="ws-match-voucher" onClick={() => { setForm(null); setMatching(true); }}>
              <ArrowLeftRight className="h-4 w-4" /> Match Voucher
            </button>
          )}
          {!ro && (
            <div className="flex gap-2">
              <button type="button" className={BTN} data-testid="bank-save" onClick={() => save(false)}>
                <Save className="h-4 w-4" /> Save
              </button>
              {!editing && (
                <button type="button" className={PRIME} data-testid="ws-create-record" onClick={() => save(true)}>
                  <Check className="h-4 w-4" /> Create Record
                </button>
              )}
            </div>
          )}
          {ro && !synced && (
            <button type="button" className={PRIME} onClick={() => reopenLine(l.line.id)}>
              <Undo2 className="h-4 w-4" /> Remove Reconciliation
            </button>
          )}
        </footer>
      </div>
    );
  }

  /* ----------------------------------------------------------- the match view */
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="ws-review-detail">
      {header}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {banner}
        <Summary amount={l.line.amount} sum={sum} count={selection.length} />
        <div className="px-4 pt-3">
          <div role="tablist" className="inline-flex rounded-lg border border-pi-line-2">
            {([["ai", "Suggested By AIA"], ["all", "All Vouchers"]] as const).map(([id, label], i) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                data-testid={`ws-vtab-${id}`}
                className={cn(
                  "h-9 px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
                  i === 0 ? "rounded-l-lg" : "rounded-r-lg border-l border-pi-line-2",
                  tab === id ? "bg-pi-brand-tint text-pi-brand" : "text-pi-body hover:text-pi-ink"
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
              <span className="border-l border-pi-brand-border pl-2">{Number(sameSide) + Number(hideUsed)}</span>
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
            <VoucherCardView key={v.no} v={cardOf(v)} badge={badgeOf(v)} on={ticked.includes(v.no)} readOnly={done} onToggle={() => toggle(v)} onEdit={() => setForm({ v })} />
          ))}
        </div>
      </div>
      {error && (
        <p role="status" data-testid="bank-panel-error" className="flex-none border-t border-pi-line bg-pi-page px-4 py-2 text-[13px] text-pi-ink">
          {error}
        </p>
      )}
      <footer className="flex flex-none items-center justify-between gap-2 border-t border-neutral-gray bg-background px-6 py-3">
        {done ? (
          synced ? (
            <span />
          ) : (
            <button type="button" className={PRIME} data-testid="ws-remove-rec" onClick={() => reopenLine(l.line.id)}>
              <Undo2 className="h-4 w-4" /> Remove Reconciliation
            </button>
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

const BankVoucherPanel = ({ lineId, onClose }: Props) => {
  const run = useBankRun();
  const l = run?.lines.find((x) => x.line.id === lineId);
  if (!l) return null;
  // A new key per opening so the fields start from the live line.
  return <Body key={`${l.line.id}-${l.status}-${l.vouchers.map((v) => v.no).join()}`} l={l} onClose={onClose} />;
};

export default BankVoucherPanel;
