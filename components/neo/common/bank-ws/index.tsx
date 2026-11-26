import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { deriveWs, syncApproved, useBankWs } from "@/hooks/pages/neo/use-bank-ws";
import ExactTab from "./exact";
import FinalReview, { syncLabel } from "./final";
import FreshTab, { LedgerEdit } from "./fresh";
import Overview, { SLOTS, type Focus } from "./overview";
import TransactionDetails from "./details";
import ReviewTab from "./review";
import { PRIMARY, n } from "./shared";

type Tab = "overview" | "exact" | "review" | "new";
type View =
  | { k: "tabs" }
  | { k: "review"; id: string }
  | { k: "draft"; id: string }
  | { k: "ledger"; ids: string[] }
  | { k: "final" };

/**
 * The Bank Reconciliation workspace, in Neo's side panel (13 Nov 2026): three
 * tabs with what is still pending on each, opening on Needs review, and a
 * footer that always says where you stand and leads to Review & sync. Every
 * approval is saved as it is made, so the panel can close and come back.
 *
 * DEV: the run and every line come from /api/bank-recon/runs/:id.
 */
const BankWorkspace = () => {
  const ws = useBankWs();
  const [tab, setTab] = useState<Tab>("review");
  const [view, setView] = useState<View>({ k: "tabs" });
  const [focus, setFocus] = useState<Focus | null>(null);
  if (!ws.run) {
    return (
      <p className="p-6 text-body-3 text-pi-body">
        This reconciliation has been cleared. Ask Neo to reconcile the bank to start again.
      </p>
    );
  }
  const c = deriveWs(ws).counts;
  const tabs: { id: Tab; label: string; pending?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "review", label: "Needs review", pending: c.review.pending },
    { id: "exact", label: "Exact matches", pending: c.exact.pending },
    { id: "new", label: "New entries", pending: c.fresh.pending },
  ];
  // A cell on the Overview opens its group in the sheet it belongs to.
  const drill = (f: Focus) => {
    setFocus(f);
    setTab(f.slot === "exact" ? "exact" : f.slot === "new" ? "new" : "review");
  };
  const pick = (t: Tab) => {
    setTab(t);
    setFocus(null);
  };
  const chip = focus && tab !== "overview" && (
    <div className="mb-3 flex items-center gap-2 text-body-3 text-pi-body">
      Showing
      <button
        type="button"
        onClick={() => setFocus(null)}
        data-testid="ws-focus"
        className="inline-flex h-6 items-center gap-1 rounded-full border border-pi-line-2 bg-pi-fill px-2 text-[12px] font-medium text-pi-ink hover:bg-pi-head-bg"
      >
        {focus.bucket || "All ledgers"} · {SLOTS.find((x) => x.id === focus.slot)?.label} ✕
      </button>
    </div>
  );
  const list = () => setView({ k: "tabs" });
  const final = view.k === "final";
  const running = ws.sync.state === "running";
  const pct = ws.sync.total ? Math.round((ws.sync.done / ws.sync.total) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="bank-ws">
      <div className={cn("min-h-0 flex-1 overscroll-contain", view.k === "review" || view.k === "draft" ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>
        {view.k === "tabs" && (
          <div className="p-4" role="tabpanel">
            {tab !== "overview" && chip}
            {tab === "overview" && <Overview open={drill} />}
            {tab === "exact" && <ExactTab bucket={focus?.bucket} onGoReview={() => pick("review")} open={(id) => setView({ k: "review", id })} />}
            {tab === "review" && (
              <ReviewTab
                key={focus ? `${focus.bucket}|${focus.slot}` : "all"}
                bucket={focus?.bucket}
                initial={focus && (focus.slot === "date" || focus.slot === "amount" || focus.slot === "multiple") ? focus.slot : undefined}
                open={(id) => setView({ k: "review", id })}
              />
            )}
            {tab === "new" && (
              <FreshTab
                bucket={focus?.bucket}
                open={(id) => setView({ k: "draft", id })}
                onEditLedger={(ids) => setView({ k: "ledger", ids })}
              />
            )}
          </div>
        )}
        {(view.k === "review" || view.k === "draft") && <TransactionDetails key={view.id} id={view.id} onBack={list} />}
        {view.k === "ledger" && <LedgerEdit ids={view.ids} onBack={list} />}
        {view.k === "final" && <FinalReview onBack={list} />}
      </div>

      {view.k === "tabs" && (
        <div role="tablist" aria-label="Sheets" className="flex flex-none gap-0.5 overflow-x-auto border-t border-pi-line bg-pi-head-bg px-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => pick(t.id)}
              data-testid={`ws-tab-${t.id}`}
              className={cn(
                "-mt-px flex h-9 flex-none items-center gap-1.5 whitespace-nowrap border-t-2 px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
                tab === t.id
                  ? "border-pi-brand bg-background text-pi-ink"
                  : "border-transparent text-pi-body hover:text-pi-ink"
              )}
            >
              {t.label}
              {t.pending !== undefined && (
                <span title="Pending" className="rounded-full bg-pi-fill px-1.5 text-[12px] font-medium tabular-nums text-pi-ink">
                  {n(t.pending)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <footer className="flex flex-none items-center justify-between gap-3 border-t border-pi-line bg-background px-4 py-3">
        <p className="min-w-0 text-body-3 text-pi-ink" data-testid="ws-footer-count">
          <strong>{n(c.approvedMatches + c.approvedNew)} approved</strong>
          <span className="text-pi-body"> · {n(c.pending)} pending</span>
          {c.synced > 0 && <span className="text-pi-body"> · {n(c.synced)} synced</span>}
        </p>
        {final ? (
          <button
            type="button"
            className={PRIMARY}
            disabled={running || c.staged === 0}
            onClick={() => void syncApproved()}
            data-testid="ws-sync"
          >
            {syncLabel(c.staged, running, pct)}
          </button>
        ) : (
          <button
            type="button"
            className={PRIMARY}
            onClick={() => setView({ k: "final" })}
            data-testid="ws-review-sync"
          >
            Review & sync
          </button>
        )}
      </footer>
    </div>
  );
};

export default BankWorkspace;
