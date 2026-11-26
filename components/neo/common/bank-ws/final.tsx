import React from "react";
import { ChevronLeft, CircleAlert } from "@/components/icons";
import { cn } from "@/lib/utils";
import { WS_INFO, wsById, wsClosing, wsTxns } from "@/config/pages/neo/mock-bank-ws";
import {
  deriveWs,
  retryFailed,
  statusOf,
  useBankWs,
} from "@/hooks/pages/neo/use-bank-ws";
import { BTN, Banner, money, n, rupees } from "./shared";

const Tile = ({ k, v, hint }: { k: string; v: string; hint?: string }) => (
  <div className="rounded-lg border border-pi-line-2 px-3 py-2.5">
    <p className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">{k}</p>
    <p className="text-[20px] font-semibold tabular-nums text-pi-ink">{v}</p>
    {hint && <p className="text-body-4 text-pi-body">{hint}</p>}
  </div>
);

/** What a sync button should say, from the counts. */
export const syncLabel = (staged: number, running: boolean, pct: number) =>
  running
    ? `Syncing… ${pct}%`
    : staged > 0
      ? `Sync ${n(staged)} approved ${staged === 1 ? "change" : "changes"} to Tally`
      : "Nothing new to sync";

/**
 * Final review, in the same panel: what is approved, what is still pending
 * (and so not sent), and, for a partial run, which Tally rows were left out
 * and why the balance comparison isn't available. The sync itself is the
 * footer's one button; a failed change is named here and retried alone.
 */
const FinalReview = ({ onBack }: { onBack: () => void }) => {
  const ws = useBankWs();
  const d = deriveWs(ws);
  const c = d.counts;
  const partial = ws.run?.partial;
  const running = ws.sync.state === "running";
  const failed = wsTxns().filter((t) => statusOf(t, ws.ov[t.id]) === "failed");
  const pendingSum = wsTxns()
    .filter((t) => {
      const s = statusOf(t, ws.ov[t.id]);
      return s === "pending" || s === "saved";
    })
    .reduce((x, t) => x + t.amount, 0);
  const bank = wsClosing();

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="ws-final">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-body-3 font-medium text-pi-brand">
        <ChevronLeft className="h-4 w-4" /> Back to review
      </button>
      <div>
        <h3 className="text-body-2 font-semibold text-pi-ink">Review & sync</h3>
        <p className="text-body-4 text-pi-body">
          {WS_INFO.account} · {WS_INFO.periodLong}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile k="Approved matches" v={n(c.approvedMatches)} hint="Exact and reviewed" />
        <Tile k="Approved new vouchers" v={n(c.approvedNew)} />
        <Tile
          k="Pending items"
          v={n(c.pending)}
          hint={`${n(c.exact.pending)} exact · ${n(c.review.pending)} review · ${n(c.fresh.pending)} new`}
        />
      </div>
      <p className="text-body-3 text-pi-body">
        Pending items are not sent to Tally. They stay here for next time.
      </p>

      {partial ? (
        <section className="rounded-lg border border-pi-line-2 bg-pi-fill p-3" data-testid="ws-partial">
          <h4 className="flex items-center gap-1.5 text-body-3 font-semibold text-pi-ink">
            <CircleAlert className="h-4 w-4" />
            Partial · {n(partial.length)} Tally {partial.length === 1 ? "row" : "rows"} excluded
          </h4>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-body-3 text-pi-ink">
            {partial.map((r) => (
              <li key={r.line}>
                Line {r.line}
                {r.ref ? ` · ${r.ref}` : ""}
                <span className="text-pi-body"> — {r.issue}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-body-3 text-pi-body" data-testid="ws-no-balance">
            Balance comparison unavailable. Tally&apos;s balance depends on every row, and {partial.length === 1 ? "one was" : "these were"} left out. Upload a corrected export and run again to compare.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Balances">
          <Tile k="Bank balance" v={rupees(bank)} />
          <Tile k="Tally after sync" v={rupees(bank - pendingSum)} />
          <Tile
            k="Difference"
            v={rupees(Math.abs(pendingSum))}
            hint={pendingSum === 0 ? "Fully reconciled" : `From ${n(c.pending)} pending items`}
          />
        </section>
      )}

      {(running || ws.sync.state === "done") && (
        <section className="flex flex-col gap-2 rounded-lg border border-pi-line-2 p-3" aria-live="polite" data-testid="ws-sync-status">
          <div className="flex items-center justify-between text-body-3 text-pi-ink">
            <span className="font-medium">
              {running ? "Sending to Tally…" : "Sync finished"}
            </span>
            <span className="tabular-nums text-pi-body">
              {n(ws.sync.done)} of {n(ws.sync.total)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-pi-fill" role="progressbar" aria-valuenow={ws.sync.done} aria-valuemax={ws.sync.total}>
            <div
              className={cn("h-full rounded-full bg-pi-brand transition-[width] duration-200")}
              style={{ width: `${ws.sync.total ? (ws.sync.done / ws.sync.total) * 100 : 0}%` }}
            />
          </div>
          {!running && (
            <p className="text-body-3 text-pi-ink">
              <strong>{n(c.synced)} synced</strong>
              {c.failed > 0 && <> · <strong>{n(c.failed)} failed</strong></>}
              {c.pending > 0 && <span className="text-pi-body"> · {n(c.pending)} still pending, not sent</span>}
            </p>
          )}
        </section>
      )}

      {failed.length > 0 && !running && (
        <section className="rounded-lg border border-pi-line-2 bg-pi-fill p-3" data-testid="ws-failed">
          <h4 className="text-body-3 font-semibold text-pi-ink">
            {n(failed.length)} {failed.length === 1 ? "change" : "changes"} failed
          </h4>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-body-3 text-pi-ink">
            {failed.map((t) => (
              <li key={t.id}>
                <span className="font-medium">{t.text}</span>{" "}
                <span className="tabular-nums text-pi-body">{money(t.amount)}</span>
                <span className="block text-body-4 text-pi-body">{ws.ov[t.id]?.err}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={cn(BTN, "mt-2")} onClick={() => void retryFailed()} data-testid="ws-retry">
            Retry {n(failed.length)} failed
          </button>
          <p className="mt-1.5 text-body-4 text-pi-body">
            Changes that already synced stay synced.
          </p>
        </section>
      )}

      {c.synced > 0 && !running && failed.length === 0 && c.staged === 0 && (
        <Banner>
          <p className="font-medium">
            {n(c.synced)} {c.synced === 1 ? "change is" : "changes are"} in Tally. Saved in your reconciliation history.
          </p>
        </Banner>
      )}
    </div>
  );
};

export default FinalReview;
void wsById;
