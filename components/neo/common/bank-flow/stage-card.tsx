import React, { useMemo } from "react";
import { Check } from "lucide-react";
import { T } from "@/components/inbox/v2/ui";
import { cn } from "@/lib/utils";
import { isNewVoucher } from "@/config/pages/neo/mock-bank-review";
import { flowStats, useBankFlow } from "@/hooks/pages/neo/use-bank-review";
import type { NeoCard } from "@/types/pages/neo";
import { SHELL, plural } from "./shared";

/**
 * The two questions Neo asks after the matches are approved (19 Nov 2026):
 * create the entries, then sync them to Tally. The first follows the approvals
 * as they are made beside the chat, and can't be answered until something is
 * approved. Once answered, each stays as one line that says what happened.
 */
type Stage = Extract<NeoCard, { kind: "bank-stage" }>;

const BTN =
  "flex h-9 items-center gap-1.5 rounded-sm px-3.5 text-body-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border";
const PRIMARY = cn(BTN, "border border-pi-btn-primary-edge bg-pi-btn-fill text-primary-foreground hover:bg-primary-hover");
const PLAIN = cn(BTN, "border border-pi-line-2 bg-background text-pi-ink shadow-contact hover:bg-pi-fill");

const Settled = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <div className={cn(SHELL, "flex max-w-[640px] items-center gap-2.5 px-4 py-3 text-[13px] text-foreground")} data-testid="bank-stage-settled">
    {ok && <Check className="h-4 w-4 flex-none text-pi-success" aria-hidden />}
    <span className={cn(!ok && "text-secondary-foreground")}>{children}</span>
  </div>
);

const Fact = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <dt className={T.value}>{k}</dt>
    <dd className="text-right text-[13px] font-medium tabular-nums text-foreground">{v}</dd>
  </div>
);

/** "6 new vouchers, 1 new ledger and 15 voucher updates" */
export const entriesInWords = (x: { vouchers: number; ledgers: number; updates: number }) => {
  const parts = [
    x.vouchers ? plural(x.vouchers, "new voucher") : "",
    x.ledgers ? plural(x.ledgers, "new ledger") : "",
    x.updates ? plural(x.updates, "voucher update") : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] || "nothing";
};

const StageCard = ({ card, live, onAnswer }: { card: Stage; live: boolean; onAnswer?: (v: string) => void }) => {
  const flow = useBankFlow();
  const s = useMemo(() => flowStats(flow), [flow]);
  const made = {
    vouchers: flow.created.filter((id) => isNewVoucher(id)).length,
    ledgers: flow.ledgers.length,
    updates: flow.created.filter((id) => !isNewVoucher(id)).length,
  };

  if (card.stage === "sync") {
    if (!live)
      return flow.syncedAt ? (
        <Settled ok>Synced to Tally: {entriesInWords(made)}.</Settled>
      ) : (
        <Settled ok={false}>Not synced yet. The entries are saved in AI Accountant.</Settled>
      );
    const y = s.sync;
    return (
      <section className={cn(SHELL, "max-w-[640px] px-4 py-3.5")} data-testid="bank-stage-sync">
        <h3 className="text-[14px] font-semibold leading-5 text-foreground">Sync to Tally?</h3>
        <p className={cn(T.value, "mt-1")}>The entries are created in AI Accountant. Syncing sends them to Tally.</p>
        <dl className="mt-2 divide-y divide-neutral-gray">
          {y.vouchers > 0 && <Fact k="New vouchers" v={y.vouchers} />}
          {made.ledgers > 0 && <Fact k={made.ledgers === 1 ? "New ledger" : "New ledgers"} v={flow.ledgers.join(", ")} />}
          {y.updates > 0 && <Fact k="Vouchers updated with the bank date" v={y.updates} />}
        </dl>
        <p className={cn(T.sub, "mt-1.5")}>
          {s.pending > 0 ? `${plural(s.pending, "line")} still pending ${s.pending === 1 ? "is" : "are"} not sent. ` : ""}
          Once sent, the entries are in your Tally books.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} onClick={() => onAnswer?.("sync")} data-testid="stage-sync">
            Sync to Tally
          </button>
          <button type="button" className={PLAIN} onClick={() => onAnswer?.("later")} data-testid="stage-sync-later">
            Not now
          </button>
        </div>
      </section>
    );
  }

  if (!live)
    return flow.created.length ? (
      <Settled ok>Entries created: {entriesInWords(made)}.</Settled>
    ) : (
      <Settled ok={false}>No entries created yet. Your approvals are saved.</Settled>
    );

  const c = s.create;
  const none = c.lines === 0;
  if (none)
    return (
      <section className={cn(SHELL, "flex max-w-[640px] flex-wrap items-center justify-between gap-3 px-4 py-3")} data-testid="bank-stage-create">
        <p className={cn(T.value, "min-w-0")} data-testid="stage-progress">
          <strong className="font-semibold text-foreground">Next:</strong> approve Exact, Potential or No match lines. Then I&apos;ll ask to create the entries.
        </p>
        <button type="button" className={PLAIN} onClick={() => onAnswer?.("later")} data-testid="stage-later">
          Not now
        </button>
      </section>
    );
  return (
    <section className={cn(SHELL, "max-w-[640px] px-4 py-3.5")} data-testid="bank-stage-create">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-semibold leading-5 text-foreground">Create the entries?</h3>
        <span className={cn(T.sub, "tabular-nums")} data-testid="stage-progress">
          {s.approved} of {s.toApprove} lines approved
        </span>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-accent"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={s.toApprove}
        aria-valuenow={s.approved}
        aria-label="Lines approved"
      >
        <span className="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(s.approved / Math.max(1, s.toApprove)) * 100}%` }} />
      </div>
      {none ? (
        <p className={cn(T.value, "mt-3")}>
          Open a group in the match results and approve it. I&apos;ll create the entries for what you approve.
        </p>
      ) : (
        <>
          <dl className="mt-2 divide-y divide-neutral-gray">
            {c.vouchers > 0 && <Fact k="New vouchers" v={c.vouchers} />}
            {c.ledgers.length > 0 && <Fact k={c.ledgers.length === 1 ? "New ledger" : "New ledgers"} v={c.ledgers.join(", ")} />}
            {c.updates > 0 && <Fact k="Vouchers updated with the bank date" v={c.updates} />}
          </dl>
          <p className={cn(T.sub, "mt-1.5")}>
            {s.pending > 0 ? `${plural(s.pending, "line")} still pending ${s.pending === 1 ? "stays" : "stay"} as ${s.pending === 1 ? "it is" : "they are"}. ` : ""}
            Nothing goes to Tally until you sync.
          </p>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={none} onClick={() => onAnswer?.("go")} data-testid="stage-create">
          Create entries
        </button>
        <button type="button" className={PLAIN} onClick={() => onAnswer?.("later")} data-testid="stage-later">
          Not now
        </button>
      </div>
    </section>
  );
};

export default StageCard;
