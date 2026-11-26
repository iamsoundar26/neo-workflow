import React, { useState } from "react";
import { Check, Lock, Plus, Save, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ComboBox } from "@/components/common/combo-box";
import { DateField, Notice } from "@/components/inbox/v2/ui";
import { cn } from "@/lib/utils";
import {
  amountOf,
  editKey,
  gapOf,
  iso,
  isNewVoucher,
  lineById,
  matchOf,
  partsOf,
  signed,
  vouchersOf,
} from "@/config/pages/neo/mock-bank-review";
import {
  approveLines,
  approvedAs,
  clearLines,
  excludeLine,
  isCreated,
  reconNow,
  saveEdit,
  setLines,
  syncNow,
  unapproveLines,
  useBankReview,
  type Edit,
  type Scope,
} from "@/hooks/pages/neo/use-bank-review";
import { BTN, COMBO, Card, F, Header, PRIME, Pill, Summary, VoucherCardView, inr } from "../bank-ws/details";

/**
 * One bank line of a review, opened (19 Nov 2026): Transaction Details as the
 * AI Accountant designs draw it. The bank amount, what it is matched to and
 * why, the voucher cards with a pencil to edit, or the voucher Neo drafted.
 * Approving needs the vouchers to add up to the bank amount.
 *
 * In the Bank reconciliation flow the action is "Approve", and a line whose
 * entries are created is locked. In the reference sheet's table the action is
 * the sheet's own word (Reconcile, Match & Reconcile, Approve).
 */

export const tone = (m: string) =>
  m === "Exact" ? "green" : m === "Potential" ? "amber" : m === "No match" ? "red" : "grey";

const LEDGERS = ["Office Rent", "Electricity Expenses", "Bank Charges", "Interest Income", "Raj Logistics", "Patel Supplies", "Mehta & Sons", "Singh Caterers", "Verma Consultants", "Anand Stores", "Bansal Traders", "TDS Payable 194J", "Input CGST 9%", "Input SGST 9%", "ICICI Bank A/c", "Cash"];

const VoucherForm = ({
  kind,
  start,
  total,
  credit,
  locked,
  onBack,
  onSave,
}: {
  kind: "new" | "edit";
  start: Edit & { no: string };
  total: number;
  credit: boolean;
  locked: boolean;
  onBack: () => void;
  onSave: (e: Edit & { no: string }, create: boolean) => string | void;
}) => {
  const [e, setE] = useState(start);
  const [msg, setMsg] = useState("");
  const remaining = Math.round((total - e.amount) * 100) / 100;
  const set = (c: Partial<typeof e>) => { setMsg(""); setE((x) => ({ ...x, ...c })); };
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-pi-page p-4" data-testid="ws-draft">
        <Card title="Voucher Configuration">
          <div className="grid grid-cols-3 gap-3">
            <F label="Voucher Type">
              <ComboBox title="Voucher Type" options={(credit ? ["Receipt", "Contra", "Journal"] : ["Payment", "Contra", "Journal"]).map((x) => ({ label: x, value: x }))} selectedValue={e.type} onChange={(v) => set({ type: String(v) })} {...COMBO} disabled={locked} />
            </F>
            <F label="Voucher No."><Input value={e.no} disabled={locked} onChange={(x) => set({ no: x.target.value })} className="h-10" /></F>
            <F label="GST Registration">
              <ComboBox title="GST Registration" options={["Maharashtra (27AAACD1234F1Z5)", "Not registered"].map((x) => ({ label: x, value: x }))} selectedValue={e.gst || "Maharashtra (27AAACD1234F1Z5)"} onChange={(v) => set({ gst: String(v) })} {...COMBO} disabled={locked} />
            </F>
          </div>
          <F label="Voucher Date" className="mt-3"><DateField value={e.date} disabled={locked} onChange={(d) => set({ date: d })} /></F>
        </Card>
        <Card title="Ledger Allocation">
          <div className="grid grid-cols-[minmax(0,1fr)_150px] items-end gap-2">
            <F label="Ledger">
              <ComboBox title="Select Ledger" options={[...new Set([e.ledger, ...LEDGERS].filter(Boolean))].map((x) => ({ label: x, value: x }))} selectedValue={e.ledger} onChange={(v) => set({ ledger: String(v) })} {...COMBO} hasSearch disabled={locked} />
            </F>
            <F label="Amount">
              <Input inputMode="decimal" aria-label="Amount" data-testid="ws-form-amount" disabled={locked} value={String(e.amount || "")} onChange={(x) => set({ amount: Number(x.target.value.replace(/[^0-9.]/g, "")) || 0 })} className="h-10 text-right tabular-nums" />
            </F>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3 border-t border-pi-line pt-3">
            <F label="Narration (Optional)"><Textarea value={e.narration} disabled={locked} onChange={(x) => set({ narration: x.target.value })} className="min-h-[72px]" /></F>
            <dl className="self-start rounded-lg border border-pi-line-2 bg-pi-page text-[14px]">
              <div className="flex items-center justify-between border-b border-pi-line px-3 py-2.5"><dt className="font-medium text-pi-body">Total Allocated</dt><dd className="font-semibold tabular-nums text-pi-ink">₹ {inr(e.amount)}</dd></div>
              <div className="flex items-center justify-between px-3 py-2.5"><dt className="font-medium text-pi-body">Amount Remaining</dt><dd data-testid="ws-remaining" className={cn("font-semibold tabular-nums", remaining !== 0 ? "text-pi-danger" : "text-pi-ink")}>₹ {inr(remaining)}</dd></div>
            </dl>
          </div>
        </Card>
        {msg && <p role="status" data-testid="ws-why" className="text-[13px] text-pi-ink">{msg}</p>}
      </div>
      <footer className="flex flex-none items-center justify-between gap-2 border-t border-neutral-gray bg-background px-6 py-3">
        <button type="button" className={BTN} onClick={onBack}><span aria-hidden>‹</span> Back</button>
        {!locked && (
          <div className="flex gap-2">
            <button type="button" className={BTN} data-testid="ws-save-draft" onClick={() => { const r = onSave(e, false); if (r) setMsg(r); }}><Save className="h-4 w-4" /> Save</button>
            {kind === "new" && <button type="button" className={PRIME} data-testid="ws-create-record" onClick={() => { const r = onSave(e, true); if (r) setMsg(r); }}><Check className="h-4 w-4" /> Create Record</button>}
          </div>
        )}
      </footer>
    </>
  );
};

const LineDetail = ({ id, scope, onClose }: { id: string; scope: Scope; onClose: () => void }) => {
  const review = useBankReview(scope);
  const [form, setForm] = useState<{ no: string } | "new" | null>(null);
  const [msg, setMsg] = useState("");
  const line = lineById(id);
  if (!line) return null;

  const flow = scope === "flow";
  const parts = partsOf(id);
  const amount = amountOf(line);
  const recon = reconNow(scope, line, review);
  const synced = syncNow(scope, line, review) === "Synced";
  const reconciled = recon.startsWith("Reconciled");
  const done = reconciled || recon === "Excluded";
  // Once its entries exist, a line is no longer changed from here.
  const fixed = flow && (isCreated(id, review) || synced);
  const vouchers = vouchersOf(id, review.edits);
  const fresh = isNewVoucher(id);
  const counted = vouchers.filter((v) => !v.alt);
  const sum = counted.reduce((n, v) => n + v.amount, 0);
  const gap = gapOf(id, review.edits);
  const action = flow
    ? "Approve"
    : line.c[30] || (matchOf(line) === "Potential" ? "Match & Reconcile" : matchOf(line) === "No match" ? "Approve" : matchOf(line) === "Exact" ? "Reconcile" : "");
  const approve = () => (flow ? approveLines([id]) : setLines(scope, { [id]: approvedAs(id) }));
  const exclude = () => (flow ? excludeLine(id) : setLines(scope, { [id]: { recon: "Excluded", sync: "Not applicable" } }));
  const undo = () => (flow ? (recon === "Excluded" ? clearLines(scope, [id]) : unapproveLines([id])) : clearLines(scope, [id]));

  const header = (
    <Header amount={amount} text={line.c[1]} date={iso(line.c[0])} account="HDFC XX4521" reconciled={reconciled} synced={synced} onClose={() => { setMsg(""); onClose(); }} />
  );

  if (form) {
    const editing = form !== "new" ? parts.find((r) => r.c[10] === form.no) : undefined;
    const base = editing || parts.find((r) => r.c[15]) || line;
    const key = editKey(id, form === "new" ? base.c[10] || "(new)" : form.no);
    const prior = review.edits[key];
    const start = {
      no: form === "new" ? review.numbers[id] || `${amount > 0 ? "RCPT" : "PYMT"}-NEW` : base.c[10],
      type: prior?.type || base.c[8] || (amount < 0 ? "Payment" : "Receipt"),
      gst: prior?.gst || base.c[11],
      date: prior?.date || iso(base.c[9] || line.c[0]),
      ledger: prior?.ledger || base.c[15],
      amount: prior?.amount ?? Math.abs(signed(base.c[16]) || amount),
      narration: prior?.narration ?? (base.c[26] || line.c[1]),
    };
    return (
      <div className="flex h-full min-h-0 flex-col bg-background" data-testid="review-detail">
        {header}
        <VoucherForm
          kind={form === "new" ? "new" : "edit"}
          start={start}
          total={Math.abs(amount)}
          credit={amount > 0}
          locked={done}
          onBack={() => setForm(null)}
          onSave={(e, create) => {
            if (create && Math.round((Math.abs(amount) - e.amount) * 100) !== 0) return `₹${inr(Math.abs(amount) - e.amount)} is still unallocated. Allocate the full amount to create the record.`;
            saveEdit(scope, key, e);
            setForm(null);
            if (create) {
              approve();
              if (flow) onClose();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="review-detail">
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3">
        {fixed && (
          <Notice tone="warning" className="mx-4 mt-3 flex items-start gap-2" data-testid="ws-locked">
            <Lock className="mt-0.5 h-4 w-4 flex-none" />
            {synced ? "This line is synced to Tally." : "The entries for this line are created. It can't be changed here."}
          </Notice>
        )}
        {vouchers.length > 0 && !fresh && <Summary amount={amount} sum={sum} count={counted.length} />}
        {!fresh && !done && gap !== 0 && counted.length === 1 && (
          <div className="mx-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent px-3 py-2" data-testid="use-bank-amount">
            <span className="text-[13px] text-foreground">The voucher is ₹{inr(gap)} {Math.abs(counted[0].amount) < Math.abs(amount) ? "less" : "more"} than the bank.</span>
            <button
              type="button"
              className={BTN}
              onClick={() => {
                const r = parts.find((x) => x.c[10] === counted[0].no) || line;
                saveEdit(scope, editKey(id, counted[0].no), {
                  type: r.c[8] || (amount < 0 ? "Payment" : "Receipt"),
                  gst: r.c[11],
                  date: counted[0].date,
                  ledger: r.c[15] || counted[0].party,
                  amount: Math.abs(amount),
                  narration: r.c[26] || line.c[1],
                });
                setMsg("");
              }}
            >
              Use the bank amount (₹{inr(amount)})
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2 px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-pi-body">
            <Pill tone={tone(matchOf(line)) as "green"}>{matchOf(line)}</Pill>
            {line.c[5]}
            {line.c[6] && line.c[6] !== "-" && <span>· Amount diff ₹{line.c[6]}</span>}
            {line.c[7] && line.c[7] !== "-" && line.c[7] !== "0" && <span>· Date diff {line.c[7]} days</span>}
          </div>
          {!fresh &&
            vouchers.map((v) => (
              <VoucherCardView key={v.no} v={v} badge={matchOf(line) === "Exact" ? "exact" : "potential"} on={!v.alt} readOnly={done} onToggle={() => undefined} onEdit={() => setForm({ no: v.no })} />
            ))}
        </div>
        {(fresh || vouchers.length === 0) && matchOf(line) !== "Excluded" && (
          <div className="px-4">
            <Card title="New voucher Neo drafted">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
                {[
                  ["Voucher no.", review.numbers[id] || "Given when the entry is created"],
                  ["Voucher type", line.c[8]],
                  ["Voucher date", line.c[9]],
                  ["Ledger", parts.map((r) => r.c[15] && `${r.c[15]} ${r.c[16]}`).filter(Boolean).join(" · ")],
                  ["Narration", line.c[26]],
                  ["Why", line.c[5]],
                ].map(([k, val]) => (
                  <React.Fragment key={k}>
                    <dt className="text-pi-body">{k}</dt>
                    <dd className="text-pi-ink">{val || "—"}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {!done && (
                <button type="button" className="mt-2 text-[14px] font-medium text-pi-brand underline underline-offset-2" data-testid="review-edit-draft" onClick={() => setForm("new")}>
                  Edit voucher
                </button>
              )}
            </Card>
          </div>
        )}
      </div>
      {msg && <p role="status" data-testid="ws-why" className="flex-none border-t border-pi-line bg-pi-page px-4 py-2 text-[13px] text-pi-ink">{msg}</p>}
      <footer className="flex flex-none items-center justify-between gap-2 border-t border-neutral-gray bg-background px-6 py-3">
        {done ? (
          fixed ? (
            <span />
          ) : (
            <button type="button" className={BTN} onClick={undo} data-testid="review-undo">
              <Undo2 className="h-4 w-4" /> {recon === "Excluded" ? "Include again" : "Undo approval"}
            </button>
          )
        ) : (
          <div className="flex gap-2">
            <button type="button" className={BTN} onClick={exclude}>Exclude</button>
            <button type="button" className={BTN} data-testid="ws-create-voucher" onClick={() => setForm("new")}><Plus className="h-4 w-4" /> Create Voucher</button>
          </div>
        )}
        {!done && action && action !== "Exclude" && (
          <button
            type="button"
            className={PRIME}
            data-testid="review-action"
            onClick={() => {
              if (gap !== 0) return setMsg(`The amounts differ by ₹${inr(gap)}. Edit a voucher until they match, then approve.`);
              setMsg("");
              approve();
              if (flow) onClose();
            }}
          >
            <Check className="h-4 w-4" /> {action}
          </button>
        )}
      </footer>
    </div>
  );
};

export default LineDetail;
