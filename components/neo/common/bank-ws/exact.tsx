import React, { useMemo, useState } from "react";
import { ChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import { wsById } from "@/config/pages/neo/mock-bank-ws";
import {
  approveExact,
  approveOne,
  deriveWs,
  isHeld,
  revoke,
  statusOf,
  useBankWs,
  type Recheck,
} from "@/hooks/pages/neo/use-bank-ws";
import SheetGrid from "./grid";
import { bucketOf } from "./overview";
import {
  BTN,
  Banner,
  Check1,
  Compare,
  Empty,
  LINK,
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
  useSel,
} from "./shared";

/**
 * Exact matches: same amount, date and reference. Approve in bulk. "Select
 * this page" takes the 25 you see; "Select all eligible matches" takes every
 * match that can be approved in bulk, and any row can be left out. Before
 * anything is approved the count is stated, and each row is checked again
 * when you confirm: one that changed meanwhile is not approved and shows
 * under "still need review". Approving stages the change for sync.
 */
const ExactTab = ({ onGoReview, bucket, open: openDetail }: { onGoReview: () => void; bucket?: string; open: (id: string) => void }) => {
  const ws = useBankWs();
  const d = deriveWs(ws);
  const rules = ws.run!.rules;
  const [show, setShow] = useState<"open" | "approved">("open");
  const [page, setPage] = useState(0);
  const [size] = usePageSize();
  const [look, setLook] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ approved: number; still: Recheck[] } | null>(null);

  const mine = useMemo(
    () => d.exact.filter((t) => !bucket || bucketOf(t, ws.ov[t.id]) === bucket),
    [d.exact, ws.ov, bucket]
  );
  const open = useMemo(
    () => mine.filter((t) => statusOf(t, ws.ov[t.id]) === "pending"),
    [mine, ws.ov]
  );
  const done = useMemo(
    () => mine.filter((t) => statusOf(t, ws.ov[t.id]) !== "pending"),
    [mine, ws.ov]
  );
  const eligible = useMemo(
    () => open.filter((t) => !isHeld(t, rules)).map((t) => t.id),
    [open, rules]
  );
  const sel = useSel(eligible);
  const rows = show === "open" ? open : done;
  const pageRows = rows.slice(page * size, (page + 1) * size);
  const pageIds = pageRows.map((t) => t.id);

  const apply = () => {
    const r = approveExact(sel.ids());
    setResult(r);
    setConfirming(false);
    sel.clear();
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="ws-exact">
      <p className="text-body-3 text-pi-body">
        Same amount, date and reference as a voucher in Tally. Approving stages them for sync; nothing is sent until you sync.
      </p>
      <Seg
        value={show}
        onChange={(v) => { setShow(v); setPage(0); setLook(null); }}
        items={[
          { id: "open", label: "To approve", count: open.length },
          { id: "approved", label: "Approved", count: done.length },
        ]}
      />

      {result && (
        <Banner onClose={() => setResult(null)} tone={result.still.length ? "warn" : "info"}>
          <p className="font-medium">
            {n(result.approved)} {result.approved === 1 ? "match" : "matches"} approved.
          </p>
          {result.still.length > 0 && (
            <>
              <p>
                {n(result.still.length)} still {result.still.length === 1 ? "needs" : "need"} review after the recheck, so {result.still.length === 1 ? "it was" : "they were"} not approved:
              </p>
              <ul className="list-disc pl-4">
                {result.still.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    {wsById(s.id)?.text} · {money(wsById(s.id)?.amount || 0)}: {s.why}
                  </li>
                ))}
              </ul>
              <button type="button" className={LINK} onClick={onGoReview}>
                Open Needs review
              </button>
            </>
          )}
        </Banner>
      )}

      {show === "open" && open.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-pi-line-2 bg-pi-fill px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-body-3 text-pi-ink">
              <Check1
                label="Select this page"
                checked={sel.pageSelected(pageIds)}
                onChange={(on) => sel.togglePage(pageIds, on)}
              />
              Select this page
              <span className="text-pi-body">({Math.min(size, pageIds.filter((id) => eligible.includes(id)).length)})</span>
            </label>
            <button
              type="button"
              className={LINK}
              onClick={sel.selectAll}
              disabled={sel.all && sel.excluded === 0}
            >
              Select all eligible matches ({n(eligible.length)})
            </button>
            {sel.count > 0 && (
              <button type="button" className={LINK} onClick={sel.clear}>
                Clear selection
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-3 text-pi-ink" aria-live="polite" data-testid="ws-exact-selected">
              <strong>{n(sel.count)} selected</strong>
              {sel.all && sel.excluded > 0 && (
                <span className="text-pi-body"> · {n(sel.excluded)} left out</span>
              )}
              {open.length - eligible.length > 0 && (
                <span className="text-pi-body">
                  {" "}· {n(open.length - eligible.length)} above ₹{n(rules.materiality)} are approved one at a time
                </span>
              )}
            </p>
            <button
              type="button"
              className={PRIMARY}
              disabled={sel.count === 0}
              onClick={() => setConfirming(true)}
              data-testid="ws-exact-approve"
            >
              Approve {n(sel.count)} {sel.count === 1 ? "match" : "matches"}
            </button>
          </div>
          {confirming && (
            <div
              role="alertdialog"
              aria-label="Confirm approval"
              className="mt-1 flex flex-col gap-2 rounded-lg border border-pi-line-2 bg-background p-3"
            >
              <p className="text-body-3 text-pi-ink">
                <strong>
                  {n(sel.count)} {sel.count === 1 ? "match" : "matches"} will be approved.
                </strong>{" "}
                They move to Approved and are staged for sync. Nothing is sent to Tally yet. Each one is checked again as you confirm.
              </p>
              <div className="flex gap-2">
                <button type="button" className={PRIMARY} onClick={apply} data-testid="ws-exact-confirm">
                  Approve {n(sel.count)} {sel.count === 1 ? "match" : "matches"}
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
        <Empty>{show === "open" ? "Every exact match is approved." : "Nothing approved here yet."}</Empty>
      ) : (
        <SheetGrid
          rows={pageRows}
          start={page * size}
          rowKey={(t) => t.id}
          testId={(t) => `ws-exact-${t.id}`}
          rowLabel={(t) => `Inspect ${t.text}`}
          onRow={(t) => openDetail(t.id)}
          selected={(t) => show === "open" && sel.isSel(t.id)}
          check={{
            head: null,
            cell: (t) =>
              show === "open" ? (
                <Check1
                  label={`Select ${t.text}`}
                  checked={sel.isSel(t.id)}
                  disabled={isHeld(t, rules)}
                  onChange={() => sel.toggle(t.id)}
                />
              ) : null,
          }}
          columns={[
            { id: "date", label: "Date", width: 70, render: (t) => shortDate(t.date) },
            { id: "text", label: "Bank description", width: 210, render: (t) => <span className="font-medium">{t.text}</span> },
            { id: "v", label: "Voucher", width: 90, render: (t) => t.vouchers[0].no },
            { id: "party", label: "Party", width: 140, render: (t) => t.vouchers[0].party },
            { id: "amt", label: "Amount", width: 100, num: true, render: (t) => money(t.amount) },
            {
              id: "st",
              label: "Status",
              width: 110,
              render: (t) => {
                const held = isHeld(t, rules) && show === "open";
                const st = statusOf(t, ws.ov[t.id]);
                return <StatusChip status={st} label={held ? "Review first" : st === "pending" ? "Matched" : undefined} />;
              },
            },
          ]}
        />
      )}
      <Pager page={page} total={rows.length} onPage={setPage} />
    </div>
  );
};

export default ExactTab;
