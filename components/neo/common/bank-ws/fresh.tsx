import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { ComboBox } from "@/components/common/combo-box";
import { Input } from "@/components/ui/input";
import {
  WS_LEDGERS,
  ledgerFit,
  wsById,
} from "@/config/pages/neo/mock-bank-ws";
import {
  applyLedger,
  approveDrafts,
  deriveWs,
  ledgerOf,
  previewLedger,
  revoke,
  saveDraft,
  saveDrafts,
  statusOf,
  useBankWs,
  type LedgerPreview,
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
  shortDate,
  useSel,
  type Sel,
} from "./shared";

const COMBO = {
  hasSearch: true,
  isMultiSelect: false,
  hideClearButton: true,
} as const;

/**
 * New entries: a drafted voucher for each bank line Tally has nothing for.
 * Open one to change its ledger and save the draft; or select several and
 * change their ledger together. Saving is not approving: a saved draft stays
 * unapproved until you approve it, and only approved drafts are synced.
 */
const FreshTab = ({
  open,
  onEditLedger,
  bucket,
}: {
  open: (id: string) => void;
  onEditLedger: (ids: string[]) => void;
  bucket?: string;
}) => {
  const ws = useBankWs();
  const d = deriveWs(ws);
  const [show, setShow] = useState<"open" | "approved">("open");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [size] = usePageSize();
  const [note, setNote] = useState<React.ReactNode>(null);

  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return d.fresh.filter((t) => {
      const s = statusOf(t, ws.ov[t.id]);
      if ((show === "open") !== (s === "pending" || s === "saved")) return false;
      if (bucket && bucketOf(t, ws.ov[t.id]) !== bucket) return false;
      return (
        !text ||
        t.text.toLowerCase().includes(text) ||
        ledgerOf(t, ws.ov[t.id]).toLowerCase().includes(text) ||
        (t.draft?.type || "").toLowerCase().includes(text)
      );
    });
  }, [d.fresh, ws.ov, show, q, bucket]);
  const eligible = useMemo(() => (show === "open" ? rows.map((t) => t.id) : []), [rows, show]);
  const sel = useSel(eligible);
  const pageRows = rows.slice(page * size, (page + 1) * size);
  const pageIds = pageRows.map((t) => t.id);
  const c = d.counts.fresh;

  return (
    <div className="flex flex-col gap-3" data-testid="ws-new">
      <p className="text-body-3 text-pi-body">
        Nothing in Tally matches these. Each has a draft voucher from your accounting policy. Saving a draft does not approve it.
      </p>
      <Seg
        value={show}
        onChange={(v) => { setShow(v); setPage(0); sel.clear(); }}
        items={[
          { id: "open", label: "To approve", count: c.pending },
          { id: "approved", label: "Approved", count: c.approved },
        ]}
      />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setPage(0); }}
        placeholder="Search by description, ledger or voucher type"
        aria-label="Search drafts"
        className="h-9"
      />
      {note && <Banner onClose={() => setNote(null)}>{note}</Banner>}

      {show === "open" && rows.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-pi-line-2 bg-pi-fill px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-body-3 text-pi-ink">
              <Check1
                label="Select this page"
                checked={sel.pageSelected(pageIds)}
                onChange={(on) => sel.togglePage(pageIds, on)}
              />
              Select this page
            </label>
            <button type="button" className={LINK} onClick={sel.selectAll}>
              Select all {n(rows.length)} shown
            </button>
            {sel.count > 0 && (
              <button type="button" className={LINK} onClick={sel.clear}>
                Clear selection
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-3 text-pi-ink" aria-live="polite" data-testid="ws-new-selected">
              <strong>{n(sel.count)} selected</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={BTN}
                disabled={sel.count === 0}
                onClick={() => onEditLedger(sel.ids())}
                data-testid="ws-edit-ledger"
              >
                Edit ledger
              </button>
              <button
                type="button"
                className={BTN}
                disabled={sel.count === 0}
                onClick={() => {
                  const k = saveDrafts(sel.ids());
                  setNote(`${n(k)} ${k === 1 ? "draft" : "drafts"} saved as they are. Saved is not approved.`);
                }}
              >
                Save drafts
              </button>
              <button
                type="button"
                className={PRIMARY}
                disabled={sel.count === 0}
                data-testid="ws-new-approve"
                onClick={() => {
                  const r = approveDrafts(sel.ids());
                  sel.clear();
                  setNote(
                    <>
                      <p className="font-medium">
                        {n(r.approved)} saved {r.approved === 1 ? "draft" : "drafts"} approved and staged for sync.
                      </p>
                      {r.notSaved.length > 0 && (
                        <p>
                          {n(r.notSaved.length)} {r.notSaved.length === 1 ? "draft is" : "drafts are"} not saved yet, so {r.notSaved.length === 1 ? "it was" : "they were"} left pending. Save {r.notSaved.length === 1 ? "it" : "them"} first.
                        </p>
                      )}
                    </>
                  );
                }}
              >
                Approve saved drafts
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>{q ? "No drafts match that search." : show === "open" ? "Every draft is approved." : "Nothing approved here yet."}</Empty>
      ) : (
        <SheetGrid
          rows={pageRows}
          start={page * size}
          rowKey={(t) => t.id}
          testId={(t) => `ws-new-${t.id}`}
          rowLabel={(t) => `Open draft ${t.text}`}
          onRow={(t) => open(t.id)}
          selected={(t) => show === "open" && sel.isSel(t.id)}
          check={{
            head: null,
            cell: (t) =>
              show === "open" ? (
                <Check1 label={`Select ${t.text}`} checked={sel.isSel(t.id)} onChange={() => sel.toggle(t.id)} />
              ) : null,
          }}
          columns={[
            { id: "date", label: "Date", width: 70, render: (t) => shortDate(t.date) },
            { id: "text", label: "Bank description", width: 200, render: (t) => <span className="font-medium">{t.text}</span> },
            { id: "amt", label: "Amount", width: 96, num: true, render: (t) => money(t.amount) },
            { id: "type", label: "Voucher type", width: 90, render: (t) => t.draft!.type },
            { id: "ledger", label: "Drafted ledger", width: 150, render: (t) => ledgerOf(t, ws.ov[t.id]) },
            {
              id: "st",
              label: "Status",
              width: 96,
              render: (t) => {
                const s = statusOf(t, ws.ov[t.id]);
                return <StatusChip status={s} label={s === "pending" ? "Draft" : undefined} />;
              },
            },
          ]}
        />
      )}
      <Pager page={page} total={rows.length} onPage={setPage} />
    </div>
  );
};

/** One draft, opened: the bank line, the draft's ledger, Save draft. */
export const DraftDetail = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const ws = useBankWs();
  const t = wsById(id);
  const o = ws.ov[id];
  const [ledger, setLedger] = useState(t ? ledgerOf(t, o) : "");
  const [msg, setMsg] = useState("");
  if (!t || !t.draft) return null;
  const s = statusOf(t, o);
  const editable = s === "pending" || s === "saved";
  const problem = ledgerFit(ledger, t);
  const options = WS_LEDGERS.filter((l) => !ledgerFit(l.name, t) || l.name === ledger).map((l) => ({
    label: l.name,
    value: l.name,
  }));

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="ws-draft">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-body-3 font-medium text-pi-brand">
        <ChevronLeft className="h-4 w-4" /> Back to New entries
      </button>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-body-2 font-semibold text-pi-ink">{t.text}</h3>
          <p className="text-body-4 text-pi-body">New {t.draft.type.toLowerCase()} voucher</p>
        </div>
        <StatusChip status={s} label={s === "pending" ? "Draft" : undefined} />
      </div>
      <Compare t={t} empty="A new voucher will be created in Tally." />
      <div className="flex flex-col gap-1.5 rounded-lg border border-pi-line-2 p-3">
        <label className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
          Ledger
        </label>
        {editable ? (
          <ComboBox
            title="Select Ledger"
            options={options}
            selectedValue={ledger}
            onChange={(v) => { setLedger(String(v)); setMsg(""); }}
            {...COMBO}
          />
        ) : (
          <p className="text-body-3 text-pi-ink">{ledger}</p>
        )}
        <p className="text-body-4 text-pi-body">
          Voucher type {t.draft.type} · Narration {t.draft.narration}
        </p>
        {(problem || msg) && (
          <p role="status" className="text-body-3 text-pi-ink">{msg || problem}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {editable ? (
          <button
            type="button"
            className={PRIMARY}
            data-testid="ws-save-draft"
            onClick={() => {
              const r = saveDraft(id, ledger);
              setMsg(r.ok ? "Draft saved. It is not approved yet." : r.reason);
            }}
          >
            Save draft
          </button>
        ) : null}
        {s === "saved" && (
          <button
            type="button"
            className={BTN}
            data-testid="ws-approve-draft"
            onClick={() => { approveDrafts([id]); onBack(); }}
          >
            Approve draft
          </button>
        )}
        {s === "pending" && (
          <span className="self-center text-body-4 text-pi-body">Save the draft to approve it.</span>
        )}
        {s === "approved" && (
          <button type="button" className={BTN} onClick={() => revoke(id)}>
            Undo approval
          </button>
        )}
      </div>
    </div>
  );
};

/** Edit ledger for several drafts: preview first, then apply to the ones that fit. */
export const LedgerEdit = ({
  ids,
  onBack,
}: {
  ids: string[];
  onBack: () => void;
}) => {
  useBankWs();
  const [ledger, setLedger] = useState("");
  const [applied, setApplied] = useState<LedgerPreview | null>(null);
  const p = ledger ? previewLedger(ids, ledger) : null;

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="ws-ledger-edit">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-body-3 font-medium text-pi-brand">
        <ChevronLeft className="h-4 w-4" /> Back to New entries
      </button>
      <div>
        <h3 className="text-body-2 font-semibold text-pi-ink">Edit ledger</h3>
        <p className="text-body-4 text-pi-body">
          {n(ids.length)} selected {ids.length === 1 ? "draft" : "drafts"}. Preview the change, then apply it.
        </p>
      </div>

      {!applied && (
        <>
          <div className="flex flex-col gap-1.5 rounded-lg border border-pi-line-2 p-3">
            <label className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
              Proposed ledger
            </label>
            <ComboBox
              title="Select Ledger"
              options={WS_LEDGERS.map((l) => ({ label: l.name, value: l.name }))}
              selectedValue={ledger}
              onChange={(v) => setLedger(String(v))}
              {...COMBO}
            />
          </div>
          {p && <Preview p={p} />}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY}
              disabled={!p || p.apply.length === 0}
              data-testid="ws-ledger-apply"
              onClick={() => setApplied(applyLedger(ids, ledger))}
            >
              {p && p.apply.length
                ? `Apply to ${n(p.apply.length)} ${p.apply.length === 1 ? "draft" : "drafts"}`
                : "Apply"}
            </button>
            <button type="button" className={BTN} onClick={onBack}>
              Cancel
            </button>
          </div>
        </>
      )}

      {applied && (
        <>
          <Banner>
            <p className="font-medium" data-testid="ws-ledger-done">
              Ledger changed to {applied.ledger} on {n(applied.apply.length)} {applied.apply.length === 1 ? "draft" : "drafts"}.
            </p>
            <p>They are saved, not approved. Approve them when you are ready.</p>
          </Banner>
          {applied.blocked.length > 0 && (
            <Preview p={{ ...applied, apply: [], unchanged: [] }} />
          )}
          <div>
            <button type="button" className={PRIMARY} onClick={onBack}>
              Back to New entries
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const Preview = ({ p }: { p: LedgerPreview }) => (
  <div className="flex flex-col gap-3">
    {(p.apply.length > 0 || p.unchanged.length > 0) && (
      <section className="rounded-lg border border-pi-line-2 p-3" aria-label="Affected rows">
        <h4 className="text-body-3 font-semibold text-pi-ink">
          {n(p.apply.length)} will change
        </h4>
        <p className="text-body-4 text-pi-body">
          From {Object.entries(p.from).map(([l, k]) => `${l} (${n(k)})`).join(", ")} to {p.ledger}
          {p.unchanged.length ? ` · ${n(p.unchanged.length)} already use it` : ""}
        </p>
        <ul className="mt-1.5 flex flex-col gap-0.5 text-body-3 text-pi-ink">
          {p.apply.slice(0, 4).map((id) => {
            const t = wsById(id)!;
            return (
              <li key={id} className="flex justify-between gap-3">
                <span className="truncate">{t.text}</span>
                <span className="flex-none tabular-nums text-pi-body">{money(t.amount)}</span>
              </li>
            );
          })}
          {p.apply.length > 4 && (
            <li className="text-body-4 text-pi-body">and {n(p.apply.length - 4)} more</li>
          )}
        </ul>
      </section>
    )}
    {p.blocked.length > 0 && (
      <section className="rounded-lg border border-pi-line-2 bg-pi-fill p-3" aria-label="Rows that cannot accept the change" data-testid="ws-blocked">
        <h4 className="text-body-3 font-semibold text-pi-ink">
          {n(p.blocked.length)} can&apos;t take this ledger
        </h4>
        <ul className="mt-1.5 flex flex-col gap-1 text-body-3 text-pi-ink">
          {p.blocked.slice(0, 5).map((b) => {
            const t = wsById(b.id)!;
            return (
              <li key={b.id}>
                <span className="font-medium">{t.text}</span>{" "}
                <span className="tabular-nums text-pi-body">{money(t.amount)}</span>
                <span className="block text-body-4 text-pi-body">{b.why}</span>
              </li>
            );
          })}
          {p.blocked.length > 5 && (
            <li className="text-body-4 text-pi-body">and {n(p.blocked.length - 5)} more</li>
          )}
        </ul>
      </section>
    )}
  </div>
);

export type { Sel };
export default FreshTab;
