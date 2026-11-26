import React, { useState } from "react";
import { ArrowRight, Check, CircleAlert } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  inr,
  money,
  shortDate,
} from "@/config/pages/neo/mock-bank-recon";
import {
  balancesOf,
  countsOf,
  differenceOf,
  openBankPanel,
  tallyTotal,
  useBankRun,
  type BankLineState,
  type BankRun,
} from "@/hooks/pages/neo/use-bank-recon";
import type { NeoCard } from "@/types/pages/neo";

/**
 * The cards of a bank reconciliation, in the chat. They read the live run,
 * so a change made in the side panel shows here at once. A state is always a
 * mark, a word and a count, never a colour alone. The people-facing words
 * are "Matched", "Check these" and "New entries needed".
 */

type Of<K extends NeoCard["kind"]> = Extract<NeoCard, { kind: K }>;

const shell =
  "rounded-xl border border-pi-line-2 bg-background px-4 py-3.5 shadow-contact";
const link =
  "text-[14px] font-medium text-pi-brand underline underline-offset-2 hover:text-pi-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pi-brand-border";

const rupees = (n: number) => `₹${inr(n)}`;

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-5 items-center rounded-full border border-pi-line-2 bg-pi-fill px-2 text-[12px] font-medium text-pi-ink">
    {children}
  </span>
);

export const STATUS_WORD: Record<BankLineState["status"], string> = {
  open: "Not reviewed",
  reconciled: "Reconciled",
  skipped: "Skipped",
  synced: "Synced",
};

/* ----------------------------------------------------------- summary */

const Row = ({
  mark,
  word,
  n,
  amount,
  hint,
}: {
  mark: string;
  word: string;
  n: number;
  amount?: number;
  hint: string;
}) => (
  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 py-1.5 text-[14px] leading-5">
    <span aria-hidden className="w-4 text-center font-semibold text-pi-ink">
      {mark}
    </span>
    <span className="min-w-0 text-pi-ink">
      <span className="font-semibold">
        {word} {n}
      </span>
      <span className="text-pi-body"> · {hint}</span>
    </span>
    <span className="text-right tabular-nums text-pi-ink">
      {amount === undefined ? "" : rupees(amount)}
    </span>
  </div>
);

export const BankSummaryCard = ({ card }: { card: Of<"bank-summary"> }) => {
  const total = Math.max(1, card.total);
  return (
    <div className={shell} data-testid="bank-summary">
      <h3 className="text-[16px] font-semibold leading-6 text-pi-ink">
        {card.ledger} · {card.period}
      </h3>
      <p className="mt-0.5 text-[14px] leading-5 text-pi-ink">
        {card.matched.n} of {card.total} match. {card.check.n + card.fresh.n}{" "}
        need you.
      </p>
      <div
        role="img"
        aria-label={`${card.matched.n} matched, ${card.check.n} to check, ${card.fresh.n} new entries needed`}
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-pi-fill"
      >
        <span
          className="bg-pi-success-dot"
          style={{ width: `${(card.matched.n / total) * 100}%` }}
        />
        <span
          className="bg-pi-brand"
          style={{ width: `${(card.check.n / total) * 100}%` }}
        />
        <span
          className="bg-pi-warning-dot"
          style={{ width: `${(card.fresh.n / total) * 100}%` }}
        />
      </div>
      <div className="mt-2 divide-y divide-pi-line">
        <Row
          mark="✓"
          word="Matched"
          n={card.matched.n}
          amount={card.matched.amount}
          hint="applied automatically"
        />
        <Row
          mark="≈"
          word="Check these"
          n={card.check.n}
          amount={card.check.amount}
          hint="close, grouped by cause"
        />
        <Row
          mark="+"
          word="New entries needed"
          n={card.fresh.n}
          amount={card.fresh.amount}
          hint="nothing in Tally yet"
        />
        {card.inTallyOnly.n > 0 && (
          <Row
            mark="◷"
            word="Only in Tally"
            n={card.inTallyOnly.n}
            amount={card.inTallyOnly.amount}
            hint="not on the statement yet"
          />
        )}
      </div>
      <p className="mt-2 text-[14px] font-medium leading-5 text-pi-ink">
        Nothing is sent to Tally until you approve and confirm.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------- exact */

export const BankExactCard = ({ card }: { card: Of<"bank-exact"> }) => {
  const run = useBankRun();
  const [open, setOpen] = useState(false);
  const lines = (run?.lines || []).filter((l) => card.lineIds.includes(l.line.id));
  const done = lines.length > 0 && lines.every((l) => l.status !== "open");
  return (
    <div className={shell} data-testid="bank-exact">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
        {card.heading || "Matched"} · {lines.length}
      </p>
      <p className="mt-1 flex items-start gap-2 text-[16px] font-medium leading-6 text-pi-ink">
        {done && (
          <Check aria-hidden className="mt-1 h-4 w-4 flex-none text-pi-success" />
        )}
        {card.body ||
          `${lines.length} lines match one Tally voucher each, with the same amount, date and reference.`}
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("mt-1.5", link)}
      >
        {open ? "Hide the lines" : "See the lines"}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-pi-line rounded-lg bg-pi-head-bg px-3 text-[14px] leading-5">
          {lines.map((l) => (
            <li
              key={l.line.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 py-1.5"
            >
              <span className="text-pi-body">{shortDate(l.line.date)}</span>
              <span className="min-w-0 truncate text-pi-ink">
                {l.line.text}
                <span className="text-pi-body">
                  {l.vouchers[0]
                    ? ` → ${l.vouchers[0].no}`
                    : l.draft
                      ? ` → ${l.draft.ledger}`
                      : ""}
                </span>
                {card.reasons && l.why && (
                  <span className="block text-[13px] text-pi-body">{l.why}</span>
                )}
              </span>
              <span className="tabular-nums text-pi-ink">
                {money(l.line.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* -------------------------------------------------------------- line */

const Side = ({
  title,
  children,
  amount,
}: {
  title: string;
  children: React.ReactNode;
  amount: number;
}) => (
  <div className="min-w-0 rounded-lg bg-pi-head-bg px-3 py-2 text-[14px] leading-5">
    <p className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
      {title}
    </p>
    <div className="text-pi-ink">{children}</div>
    <p className="tabular-nums text-pi-ink">{money(amount)}</p>
  </div>
);

export const BankLineCard = ({ card }: { card: Of<"bank-line"> }) => {
  const run = useBankRun();
  const l = run?.lines.find((x) => x.line.id === card.lineId);
  if (!l) return null;
  const { line, vouchers, draft } = l;
  const diff = differenceOf(l);
  const fresh = !vouchers.length;
  const sure = draft ? Math.round(draft.confidence * 100) : 0;
  const unsure = !!draft && draft.confidence < 0.7;
  return (
    <div className={shell} data-testid="bank-line" data-line={line.id}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
          {fresh ? "New entry needed" : "Check this"} · {card.n} of {card.of}
        </p>
        <Pill>
          {l.edited && l.status === "open" ? "Edited" : STATUS_WORD[l.status]}
        </Pill>
      </div>
      <p className="mt-1 text-[16px] font-medium leading-6 text-pi-ink">
        {shortDate(line.date)} · {line.text}
        <span className="tabular-nums"> · {money(line.amount)}</span>
      </p>
      <p className="mt-0.5 text-[14px] leading-5 text-pi-body">{l.why}</p>

      {!fresh && (
        <div className="mt-2 grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Side title="Bank statement" amount={line.amount}>
            <p>{line.text}</p>
            {line.ref && <p className="text-pi-body">Ref {line.ref}</p>}
          </Side>
          <ArrowRight
            aria-hidden
            className="mx-auto h-4 w-4 text-pi-body max-sm:rotate-90"
          />
          <Side
            title={`Tally${vouchers.length > 1 ? ` · ${vouchers.length} vouchers` : ""}`}
            amount={tallyTotal(l)}
          >
            <ul>
              {vouchers.map((v) => (
                <li key={v.no}>
                  {v.no} · {v.party}
                  <span className="text-pi-body"> · {shortDate(v.date)}</span>
                  {vouchers.length > 1 && (
                    <span className="tabular-nums">
                      {" "}
                      · {money(l.amounts[v.no] ?? v.amount)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Side>
        </div>
      )}

      {!fresh && diff !== 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[14px] font-medium leading-5 text-pi-ink">
          <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-pi-warning" />
          Amounts differ by {rupees(diff)}. They must be equal before you
          approve. Edit the voucher in the side panel.
        </p>
      )}

      {fresh && draft && (
        <div className="mt-2 rounded-lg bg-pi-head-bg px-3 py-2 text-[14px] leading-5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
            Voucher Neo drafted
          </p>
          <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-3">
            <dt className="text-pi-body">Type</dt>
            <dd className="text-pi-ink">{draft.type}</dd>
            <dt className="text-pi-body">Ledger</dt>
            <dd className="font-medium text-pi-ink">{draft.ledger}</dd>
            <dt className="text-pi-body">Narration</dt>
            <dd className="text-pi-ink">{draft.narration}</dd>
          </dl>
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5",
              unsure ? "font-medium text-pi-ink" : "text-pi-body"
            )}
          >
            {unsure ? (
              <CircleAlert aria-hidden className="h-4 w-4 flex-none text-pi-warning" />
            ) : (
              <Check aria-hidden className="h-4 w-4 flex-none text-pi-success" />
            )}
            {draft.confidence === 1
              ? "Changed by you"
              : unsure
                ? `Not sure (${sure}%). Check the ledger.`
                : `${sure}% sure`}
          </p>
        </div>
      )}

      <button
        type="button"
        data-testid="bank-review-edit"
        onClick={() => openBankPanel(line.id)}
        className={cn("mt-2", link)}
      >
        Review and edit
      </button>
    </div>
  );
};

/* ------------------------------------------------------------- final */

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-pi-head-bg px-3 py-2">
    <p className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
      {label}
    </p>
    <p className="text-[16px] font-semibold tabular-nums text-pi-ink">{value}</p>
  </div>
);

const useRun = (): BankRun | null => useBankRun();

export const BankFinalCard = () => {
  const run = useRun();
  if (!run) return null;
  const c = countsOf(run);
  const b = balancesOf(run);
  const pending = c.open + c.skipped;
  return (
    <div className={shell} data-testid="bank-final">
      <h3 className="text-[16px] font-semibold leading-6 text-pi-ink">
        Where you stand
      </h3>
      <p className="mt-0.5 text-[14px] leading-5 text-pi-ink">
        <span className="font-semibold">{c.reconciled} reconciled</span>
        {c.created > 0 && ` (${c.created} new vouchers)`}.{" "}
        {pending > 0 ? `${pending} still pending.` : "Nothing pending."}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Stat label="Bank balance" value={rupees(b.bank)} />
        <Stat label="Tally after sync" value={rupees(b.book)} />
        <Stat
          label="Difference"
          value={rupees(Math.abs(b.book - b.bank))}
        />
      </div>
      <p className="mt-2 text-[14px] leading-5 text-pi-body">
        {b.outstanding !== 0 &&
          `${run.inTallyOnly.length} entries in Tally (${rupees(Math.abs(b.outstanding))}) are not on the statement yet. `}
        {b.unexplained !== 0
          ? `${rupees(Math.abs(b.unexplained))} comes from ${pending} pending lines.`
          : "Every line is explained."}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------- sync */

export const BankSyncCard = () => {
  const run = useRun();
  if (!run) return null;
  const c = countsOf(run);
  const synced = !!run.syncedAt;
  const sending = synced
    ? run.lines.filter((l) => l.status === "synced")
    : run.lines.filter((l) => l.status === "reconciled");
  const fresh = sending.filter((l) => !l.vouchers.length).length;
  return (
    <div className={shell} data-testid="bank-sync">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[16px] font-semibold leading-6 text-pi-ink">
          {synced ? "Synced to Tally" : "Ready to sync to Tally"}
        </h3>
        <Pill>{synced ? "Synced" : "Not synced"}</Pill>
      </div>
      <p className="mt-0.5 text-[14px] leading-5 text-pi-ink">
        {sending.length} approved {sending.length === 1 ? "line" : "lines"}
        {fresh > 0 && `, ${fresh} of them new vouchers`}.
        {!synced && " Only approved changes are sent."}
      </p>
      {!synced && c.open + c.skipped > 0 && (
        <p className="mt-1 text-[14px] leading-5 text-pi-body">
          {c.open + c.skipped} lines are not approved. They stay here and are
          not sent.
        </p>
      )}
      {synced && (
        <p className="mt-1 flex items-center gap-1.5 text-[14px] leading-5 text-pi-body">
          <Check aria-hidden className="h-4 w-4 text-pi-success" />
          Saved to your reconciliation history.
        </p>
      )}
    </div>
  );
};
