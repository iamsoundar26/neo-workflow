import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import { dayGap, type Issue, type WsTxn } from "@/config/pages/neo/mock-bank-ws";
import {
  approveDateBatch,
  approveOne,
  batchIds,
  batchable,
  chooseVoucher,
  deriveWs,
  issueOf,
  revoke,
  statusOf,
  useBankWs,
  voucherFor,
  voucherList,
  voucherProblem,
} from "@/hooks/pages/neo/use-bank-ws";
import SheetGrid from "./grid";
import { bucketOf } from "./overview";
import {
  BTN,
  Banner,
  Compare,
  Empty,
  List,
  PRIMARY,
  Pager,
  usePageSize,
  Row,
  Seg,
  StatusChip,
  money,
  n,
  rupees,
  shortDate,
} from "./shared";

const GROUP: Record<Issue, string> = {
  date: "Date differs",
  amount: "Amount differs",
  multiple: "Multiple possible vouchers",
};

/**
 * Needs review: lines that are close to Tally but not certain, grouped by what
 * differs. A row opens in this same panel with the bank transaction and the
 * suggested voucher side by side. Approve match only turns on when a voucher
 * with the same amount stands behind it; "multiple" lines stay pending until
 * you pick one. Only date differences inside the configured window can be
 * approved together.
 */
const ReviewTab = ({ open, bucket, initial }: { open: (id: string) => void; bucket?: string; initial?: Issue }) => {
  const ws = useBankWs();
  const d = deriveWs(ws);
  const rules = ws.run!.rules;
  const [group, setGroup] = useState<Issue>(initial || "date");
  const [show, setShow] = useState<"open" | "approved">("open");
  const [page, setPage] = useState(0);
  const [size] = usePageSize();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const inGroup = useMemo(
    () =>
      d.review.filter(
        (t) =>
          issueOf(t, ws.ov[t.id]) === group &&
          (!bucket || bucketOf(t, ws.ov[t.id]) === bucket)
      ),
    [d.review, ws.ov, group, bucket]
  );
  const rows = inGroup.filter((t) =>
    show === "open" ? statusOf(t, ws.ov[t.id]) === "pending" : statusOf(t, ws.ov[t.id]) !== "pending"
  );
  const pageRows = rows.slice(page * size, (page + 1) * size);
  const inView = new Set(rows.map((t) => t.id));
  const ids = group === "date" && show === "open" ? batchIds().filter((id) => inView.has(id)) : [];
  const c = d.counts.issue;
  const outside = group === "date" ? rows.length - ids.length : 0;

  return (
    <div className="flex flex-col gap-3" data-testid="ws-review">
      <p className="text-body-3 text-pi-body">
        Close to a voucher in Tally, but not certain. Open one to compare them.
      </p>
      <Seg
        value={group}
        onChange={(g) => { setGroup(g); setPage(0); setDone(null); }}
        items={(["date", "amount", "multiple"] as const).map((g) => ({
          id: g,
          label: GROUP[g],
          count: c[g].pending,
        }))}
      />
      <Seg
        value={show}
        onChange={(v) => { setShow(v); setPage(0); }}
        items={[
          { id: "open", label: "Pending", count: c[group].pending },
          { id: "approved", label: "Approved", count: c[group].approved },
        ]}
      />

      {done !== null && (
        <Banner onClose={() => setDone(null)}>
          <p className="font-medium">
            {n(done)} date {done === 1 ? "difference" : "differences"} approved and staged for sync.
          </p>
        </Banner>
      )}

      {group === "date" && show === "open" && rows.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-pi-line-2 bg-pi-fill px-3 py-2.5">
          <p className="text-body-3 text-pi-ink">
            <strong>{n(ids.length)}</strong> of {n(rows.length)} pass your rules: the same amount and a date within {rules.dateWindow} days.
            {outside > 0 && (
              <span className="text-pi-body">
                {" "}The other {n(outside)} are outside the window, so review them one by one.
              </span>
            )}
          </p>
          <div>
            <button
              type="button"
              className={PRIMARY}
              disabled={ids.length === 0}
              onClick={() => setConfirming(true)}
              data-testid="ws-date-batch"
            >
              Approve {n(ids.length)} within your rules
            </button>
          </div>
          {confirming && (
            <div role="alertdialog" className="flex flex-col gap-2 rounded-lg border border-pi-line-2 bg-background p-3">
              <p className="text-body-3 text-pi-ink">
                <strong>{n(ids.length)} date differences will be approved.</strong> Only ones that still pass your rules are approved. Nothing is sent to Tally yet.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={PRIMARY}
                  onClick={() => { setDone(approveDateBatch(ids)); setConfirming(false); setPage(0); }}
                >
                  Approve {n(ids.length)}
                </button>
                <button type="button" className={BTN} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>{show === "open" ? `No pending ${GROUP[group].toLowerCase()} lines.` : "Nothing approved in this group yet."}</Empty>
      ) : (
        <SheetGrid
          rows={pageRows}
          start={page * size}
          rowKey={(t) => t.id}
          testId={(t) => `ws-review-${t.id}`}
          rowLabel={(t) => `Open ${t.text}`}
          onRow={(t) => open(t.id)}
          columns={[
            { id: "date", label: "Date", width: 70, render: (t) => shortDate(t.date) },
            { id: "text", label: "Bank description", width: 200, render: (t) => <span className="font-medium">{t.text}</span> },
            {
              id: "v",
              label: "Suggested voucher",
              width: 150,
              render: (t) => {
                const v = voucherFor(t, ws.ov[t.id]);
                return v ? `${v.no} · ${shortDate(v.date)}` : <span className="text-pi-body">Choose a voucher</span>;
              },
            },
            { id: "bank", label: "Bank", width: 96, num: true, render: (t) => money(t.amount) },
            {
              id: "tally",
              label: "Tally",
              width: 96,
              num: true,
              render: (t) => {
                const v = voucherFor(t, ws.ov[t.id]);
                return v ? money(v.amount) : "–";
              },
            },
            {
              id: "note",
              label: "What differs",
              width: 170,
              render: (t) => {
                const v = voucherFor(t, ws.ov[t.id]);
                const diff = v ? Math.abs(v.amount - t.amount) : 0;
                return group === "multiple" && !v
                  ? `${t.vouchers.length} vouchers could match`
                  : group === "amount" && diff
                    ? `${rupees(diff)} ${Math.abs(v!.amount) < Math.abs(t.amount) ? "less" : "more"} in Tally`
                    : group === "date" && v
                      ? `${dayGap(t.date, v.date)} ${dayGap(t.date, v.date) === 1 ? "day" : "days"} apart${batchable(t, ws.ov[t.id], rules) ? "" : " · outside window"}`
                      : "Same amount";
              },
            },
            { id: "st", label: "Status", width: 96, render: (t) => <StatusChip status={statusOf(t, ws.ov[t.id])} /> },
          ]}
        />
      )}
      <Pager page={page} total={rows.length} onPage={setPage} />
    </div>
  );
};

/** One review line, opened: both sides, the difference, and what you can do. */
export const ReviewDetail = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const ws = useBankWs();
  const t = deriveWs(ws).review.find((x) => x.id === id) as WsTxn | undefined;
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState("");
  if (!t) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <button type="button" className={BTN} onClick={onBack}>Back to the list</button>
        <Empty>This line is no longer in Needs review.</Empty>
      </div>
    );
  }
  const rules = ws.run!.rules;
  const o = ws.ov[t.id];
  const issue = issueOf(t, o)!;
  const v = voucherFor(t, o);
  const s = statusOf(t, o);
  const problem = voucherProblem(t, v, rules);
  const diff = v ? v.amount - t.amount : 0;
  const options = voucherList(t);
  const gap = v ? dayGap(t.date, v.date) : 0;

  const approve = () => {
    const r = approveOne(t.id);
    if (r.ok) onBack();
    else setMsg(r.reason);
  };

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="ws-review-detail">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-body-3 font-medium text-pi-brand">
        <ChevronLeft className="h-4 w-4" /> Back to {GROUP[issue]}
      </button>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-body-2 font-semibold text-pi-ink">{t.text}</h3>
          <p className="text-body-4 text-pi-body">{GROUP[issue]}{o?.late !== undefined ? " · Tally changed after matching" : ""}</p>
        </div>
        <StatusChip status={s} />
      </div>

      <Compare
        t={t}
        v={v}
        empty={issue === "multiple" ? `${t.vouchers.length} vouchers could be this payment. Choose one.` : undefined}
        dateNote={v && gap > 0 ? `${gap} ${gap === 1 ? "day" : "days"} from the bank date` : undefined}
      />

      {v && diff !== 0 && Math.abs(diff) > rules.tolerance && (
        <div role="alert" className="rounded-lg border border-pi-line-2 bg-pi-fill px-3 py-2.5 text-body-3 text-pi-ink" data-testid="ws-diff">
          <strong>{rupees(Math.abs(diff))} difference.</strong> The bank shows {money(t.amount)} and the voucher {money(v.amount)}. They must match before this can be approved.
        </div>
      )}
      {v && issue === "date" && gap > rules.dateWindow && (
        <div role="note" className="rounded-lg border border-pi-line-2 bg-pi-fill px-3 py-2.5 text-body-3 text-pi-ink">
          The dates are {gap} days apart, outside your {rules.dateWindow}-day window. You can still approve it here.
        </div>
      )}

      {picking && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-pi-line-2 p-3">
          <legend className="px-1 text-body-3 font-semibold text-pi-ink">Choose another voucher</legend>
          {options.map((opt) => {
            const why = voucherProblem(t, opt, rules);
            const chosen = v?.no === opt.no;
            return (
              <label
                key={opt.no}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2",
                  chosen ? "border-pi-brand-border bg-pi-brand-tint" : "border-pi-line-2 hover:bg-pi-fill"
                )}
              >
                <input
                  type="radio"
                  name="voucher"
                  className="mt-1"
                  checked={chosen}
                  onChange={() => { chooseVoucher(t.id, opt.no); setMsg(""); }}
                  data-testid={`ws-voucher-${opt.no}`}
                />
                <span className="min-w-0 flex-1 text-body-3">
                  <span className="block font-medium text-pi-ink">
                    {opt.no} · {money(opt.amount)} · {shortDate(opt.date)}
                  </span>
                  <span className="block text-body-4 text-pi-body">
                    {opt.party}
                    {why ? ` · ${opt.used ? "Can't use: " + opt.used.toLowerCase() : "Amount " + (Math.abs(opt.amount) < Math.abs(t.amount) ? "is less" : "is more")}` : " · Same amount"}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {(problem || msg) && (
        <p className="text-body-3 text-pi-body" role="status" data-testid="ws-why">
          {msg || problem}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {s === "pending" ? (
          <>
            <button type="button" className={PRIMARY} disabled={!!problem} onClick={approve} data-testid="ws-approve-match">
              Approve match
            </button>
            <button type="button" className={BTN} onClick={() => setPicking((p) => !p)}>
              {issue === "multiple" && !v ? "Choose a voucher" : "Choose another voucher"}
            </button>
            <button type="button" className={BTN} onClick={onBack}>
              Leave pending
            </button>
          </>
        ) : s === "approved" ? (
          <button type="button" className={BTN} onClick={() => { revoke(t.id); }}>
            Undo approval
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default ReviewTab;
