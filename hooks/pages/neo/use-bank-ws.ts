import { useSyncExternalStore } from "react";
import {
  WS_BAD_ROWS,
  WS_RULES,
  dayGap,
  ledgerFit,
  wsById,
  wsTxns,
  type Issue,
  type WsRules,
  type WsTxn,
  type WsVoucher,
} from "@/config/pages/neo/mock-bank-ws";

/**
 * The bank reconciliation workspace's run (13 Nov 2026), kept on this device
 * so the panel can close and the review pick up again. Approving only stages
 * a change for sync; nothing reaches Tally until the one Sync button, and a
 * line you leave pending is never sent.
 *
 * A line is "pending" until you approve it, "approved" once staged, then
 * "synced" or "failed". A new voucher draft passes through "saved" first.
 *
 * DEV: GET/PATCH /api/bank-recon/runs/:id/lines, POST .../approve (bulk,
 * rechecked server-side), POST .../sync (streams per-line results).
 */
export type WsStatus = "pending" | "saved" | "approved" | "synced" | "failed";

type Ov = {
  s?: "saved" | "approved";
  /** The voucher chosen for a review line. */
  v?: string;
  /** Vouchers picked or edited in the details panel: they replace the suggestion. */
  vs?: WsVoucher[];
  /** The ledger on a new-voucher draft. */
  l?: string;
  /** An exact match that moved to review: the voucher's changed amount. */
  late?: number;
  sync?: "synced" | "failed";
  err?: string;
};

export type WsRun = {
  id: string;
  startedAt: string;
  rules: WsRules;
  /** Tally rows left out of a partial run. */
  partial?: { line: number; ref: string; issue: string }[];
  failedOnce?: boolean;
};

type State = {
  run: WsRun | null;
  ov: Record<string, Ov>;
  sync: { state: "idle" | "running" | "done"; done: number; total: number };
};

const KEY = "neo.bankws.v1";
let state: State = { run: null, ov: {}, sync: { state: "idle", done: 0, total: 0 } };
let loaded = false;
const listeners = new Set<() => void>();

const load = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Pick<State, "run" | "ov">;
      state = { ...state, run: s.run, ov: s.ov || {} };
    }
  } catch {
    /* storage blocked: the run holds for this visit */
  }
};
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ run: state.run, ov: state.ov }));
  } catch {
    /* ignore */
  }
  derived = null;
  listeners.forEach((f) => f());
};

export const getWs = () => {
  load();
  return state;
};
export const useBankWs = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    getWs,
    () => state
  );

export const startWs = (
  rules: Partial<WsRules> = {},
  partial?: WsRun["partial"]
) => {
  load();
  set({
    run: {
      id: `ws-${Date.now().toString(36)}`,
      startedAt: new Date().toISOString(),
      rules: { ...WS_RULES, ...rules },
      partial,
    },
    ov: {},
    sync: { state: "idle", done: 0, total: 0 },
  });
};

export const clearWs = () =>
  set({ run: null, ov: {}, sync: { state: "idle", done: 0, total: 0 } });

/* --------------------------------------------------------------- selectors */

export const voucherList = (t: WsTxn): WsVoucher[] => {
  const seen = new Set<string>();
  return [...t.vouchers, ...(t.alts || [])].filter(
    (v) => !seen.has(v.no) && !!seen.add(v.no)
  );
};

export const kindOf = (t: WsTxn, o?: Ov): "exact" | "review" | "new" =>
  t.kind === "exact" && o?.late !== undefined ? "review" : t.kind;
export const issueOf = (t: WsTxn, o?: Ov): Issue | undefined =>
  t.kind === "exact" && o?.late !== undefined ? "amount" : t.issue;

export const statusOf = (t: WsTxn, o?: Ov): WsStatus =>
  o?.sync ?? o?.s ?? "pending";
export const isOpen = (s: WsStatus) => s === "pending" || s === "saved";

/** The voucher a review line stands on now: your choice, else the suggestion. */
export const voucherFor = (t: WsTxn, o?: Ov): WsVoucher | undefined => {
  if (o?.vs?.length === 1) return o.vs[0];
  if (o?.vs && o.vs.length > 1) return undefined;
  if (o?.v) return voucherList(t).find((v) => v.no === o.v);
  if (t.issue === "multiple") return undefined;
  const v = t.vouchers[0];
  return o?.late !== undefined && v ? { ...v, amount: o.late } : v;
};

export const ledgerOf = (t: WsTxn, o?: Ov) => o?.l ?? t.draft?.ledger ?? "";

/** Why this voucher can't settle the line, or null when it can. */
export const voucherProblem = (
  t: WsTxn,
  v: WsVoucher | undefined,
  rules: WsRules
) => {
  if (!v) return "Choose a voucher first.";
  if (v.used) return `${v.no} can't be used: ${v.used.toLowerCase()}.`;
  const d = Math.abs(v.amount - t.amount);
  return d > rules.tolerance
    ? `The amounts differ by ₹${d.toLocaleString("en-IN")}. Choose a voucher with the same amount, or leave it pending.`
    : null;
};

/** Date differences the rules allow in bulk: same amount, inside the window. */
export const batchable = (t: WsTxn, o: Ov | undefined, rules: WsRules) => {
  const v = voucherFor(t, o);
  return (
    issueOf(t, o) === "date" &&
    statusOf(t, o) === "pending" &&
    !!v &&
    dayGap(t.date, v.date) <= rules.dateWindow &&
    Math.abs(v.amount - t.amount) <= rules.tolerance
  );
};

export const isHeld = (t: WsTxn, rules: WsRules) =>
  Math.abs(t.amount) >= rules.materiality;

type Derived = {
  exact: WsTxn[];
  review: WsTxn[];
  fresh: WsTxn[];
  counts: ReturnType<typeof countAll>;
};
let derived: Derived | null = null;

const countAll = (lists: { exact: WsTxn[]; review: WsTxn[]; fresh: WsTxn[] }, ov: State["ov"]) => {
  const tally = (xs: WsTxn[]) => {
    let pending = 0;
    let saved = 0;
    let approved = 0;
    let synced = 0;
    let failed = 0;
    xs.forEach((t) => {
      const s = statusOf(t, ov[t.id]);
      if (s === "pending") pending++;
      else if (s === "saved") saved++;
      else if (s === "approved") approved++;
      else if (s === "synced") synced++;
      else failed++;
    });
    return {
      total: xs.length,
      pending: pending + saved,
      drafts: pending,
      saved,
      approved: approved + synced + failed,
      staged: approved,
      synced,
      failed,
    };
  };
  const exact = tally(lists.exact);
  const review = tally(lists.review);
  const fresh = tally(lists.fresh);
  const issues = (["date", "amount", "multiple"] as const).map((i) => {
    const rows = lists.review.filter((t) => issueOf(t, ov[t.id]) === i);
    return [i, tally(rows)] as const;
  });
  return {
    exact,
    review,
    fresh,
    issue: Object.fromEntries(issues) as Record<Issue, ReturnType<typeof tally>>,
    pending: exact.pending + review.pending + fresh.pending,
    approvedMatches: exact.approved + review.approved,
    approvedNew: fresh.approved,
    staged: exact.staged + review.staged + fresh.staged,
    synced: exact.synced + review.synced + fresh.synced,
    failed: exact.failed + review.failed + fresh.failed,
  };
};

export const deriveWs = (s: State = getWs()): Derived => {
  if (derived) return derived;
  const exact: WsTxn[] = [];
  const review: WsTxn[] = [];
  const fresh: WsTxn[] = [];
  wsTxns().forEach((t) => {
    const k = kindOf(t, s.ov[t.id]);
    (k === "exact" ? exact : k === "review" ? review : fresh).push(t);
  });
  review.sort((a, b) => Number(!!b.first) - Number(!!a.first));
  derived = { exact, review, fresh, counts: countAll({ exact, review, fresh }, s.ov) };
  return derived;
};

/* ----------------------------------------------------------------- actions */

const patch = (changes: Record<string, Ov>) =>
  set({ ov: { ...state.ov, ...changes } });
const ovOf = (id: string) => getWs().ov[id];
const rulesOf = () => getWs().run?.rules ?? WS_RULES;

export type Recheck = { id: string; why: string };
const inr = (n: number) => n.toLocaleString("en-IN");

/**
 * Approve exact matches, checking each again first. A row whose Tally voucher
 * changed since matching, or that is above the review limit, isn't approved:
 * it comes back as a row that still needs review.
 */
export const approveExact = (ids: string[]) => {
  const rules = rulesOf();
  const changes: Record<string, Ov> = {};
  const still: Recheck[] = [];
  let approved = 0;
  ids.forEach((id) => {
    const t = wsById(id);
    const o = ovOf(id);
    if (!t || kindOf(t, o) !== "exact" || statusOf(t, o) !== "pending") return;
    if (isHeld(t, rules)) {
      still.push({ id, why: `Above your review limit of ₹${inr(rules.materiality)}. Approve it one at a time.` });
      return;
    }
    if (t.late !== undefined) {
      changes[id] = { ...o, late: t.late };
      still.push({
        id,
        why: `${t.vouchers[0].no} changed to ₹${inr(Math.abs(t.late))} in Tally after matching.`,
      });
      return;
    }
    changes[id] = { ...o, s: "approved" };
    approved++;
  });
  patch(changes);
  return { approved, still };
};

/** Approve one line you've looked at (a held match, or a reviewed one). */
export const approveOne = (id: string) => {
  const t = wsById(id);
  if (!t) return { ok: false as const, reason: "Not found." };
  const o = ovOf(id);
  if (kindOf(t, o) === "exact") {
    patch({ [id]: { ...o, s: "approved" } });
    return { ok: true as const };
  }
  const problem = voucherProblem(t, voucherFor(t, o), rulesOf());
  if (problem) return { ok: false as const, reason: problem };
  patch({ [id]: { ...o, s: "approved" } });
  return { ok: true as const };
};

export const chooseVoucher = (id: string, no: string) =>
  patch({ [id]: { ...ovOf(id), v: no } });

/** The vouchers a line stands on now: one or several, edits included. */
export const vouchersFor = (t: WsTxn, o?: Ov): WsVoucher[] =>
  o?.vs?.length ? o.vs : voucherFor(t, o) ? [voucherFor(t, o)!] : [];

/**
 * Match a line to the vouchers picked in the details panel. Their total must be
 * within the amount tolerance of the bank line, and none may belong to another
 * line. Approving only stages the match for sync.
 */
export const matchVouchers = (id: string, vouchers: WsVoucher[]) => {
  const t = wsById(id);
  if (!t) return { ok: false as const, reason: "Not found." };
  if (!vouchers.length) return { ok: false as const, reason: "Select a voucher first." };
  if (kindOf(t, ovOf(id)) === "new")
    return { ok: false as const, reason: "Nothing in Tally matched this line when Neo compared them. Create a voucher for it instead." };
  const used = vouchers.find((v) => v.used);
  if (used) return { ok: false as const, reason: `${used.no} can't be used: ${used.used!.toLowerCase()}.` };
  const sum = vouchers.reduce((n, v) => n + v.amount, 0);
  const d = Math.abs(sum - t.amount);
  if (d > rulesOf().tolerance)
    return { ok: false as const, reason: `The amounts differ by ₹${inr(d)}. Select vouchers that add up to the bank amount, or edit a voucher.` };
  patch({ [id]: { ...ovOf(id), vs: vouchers, v: vouchers[0].no, s: "approved" } });
  return { ok: true as const };
};

/** Keep an edited voucher (its amount changed) as the choice, without approving. */
export const saveVouchers = (id: string, vouchers: WsVoucher[]) =>
  patch({ [id]: { ...ovOf(id), vs: vouchers, v: vouchers[0]?.no } });

export const revoke = (id: string) => {
  const o = ovOf(id);
  if (!o || o.sync === "synced") return;
  patch({ [id]: { ...o, s: o.l !== undefined ? "saved" : undefined, sync: undefined, err: undefined } });
};

export const batchIds = () => {
  const { ov } = getWs();
  const rules = rulesOf();
  return deriveWs().review.filter((t) => batchable(t, ov[t.id], rules)).map((t) => t.id);
};

/** Approve date differences in bulk, only those that still pass the rules. */
export const approveDateBatch = (only?: string[]) => {
  const rules = rulesOf();
  const { ov } = getWs();
  const ids = only ? batchIds().filter((id) => only.includes(id)) : batchIds();
  const changes: Record<string, Ov> = {};
  ids.forEach((id) => {
    const t = wsById(id)!;
    if (batchable(t, ov[id], rules)) changes[id] = { ...ov[id], s: "approved" };
  });
  patch(changes);
  return Object.keys(changes).length;
};

export const saveDraft = (id: string, ledger: string) => {
  const t = wsById(id);
  const o = ovOf(id);
  if (!t || !isOpen(statusOf(t, o))) return { ok: false as const, reason: "This draft is already approved." };
  const why = ledgerFit(ledger, t);
  if (why) return { ok: false as const, reason: why };
  patch({ [id]: { ...o, l: ledger, s: "saved" } });
  return { ok: true as const };
};

export const saveDrafts = (ids: string[]) => {
  const changes: Record<string, Ov> = {};
  ids.forEach((id) => {
    const t = wsById(id);
    const o = ovOf(id);
    if (t && statusOf(t, o) === "pending") changes[id] = { ...o, s: "saved" };
  });
  patch(changes);
  return Object.keys(changes).length;
};

export type LedgerPreview = {
  ledger: string;
  apply: string[];
  blocked: Recheck[];
  unchanged: string[];
  from: Record<string, number>;
};

/** What changing these drafts to a ledger would do, and what it can't. */
export const previewLedger = (ids: string[], ledger: string): LedgerPreview => {
  const out: LedgerPreview = { ledger, apply: [], blocked: [], unchanged: [], from: {} };
  ids.forEach((id) => {
    const t = wsById(id);
    const o = ovOf(id);
    if (!t) return;
    const s = statusOf(t, o);
    if (kindOf(t, o) !== "new" || !isOpen(s)) {
      out.blocked.push({ id, why: "Already approved. Undo the approval to change it." });
      return;
    }
    const why = ledgerFit(ledger, t);
    if (why) {
      out.blocked.push({ id, why });
      return;
    }
    const cur = ledgerOf(t, o);
    out.from[cur] = (out.from[cur] || 0) + 1;
    if (cur === ledger) out.unchanged.push(id);
    else out.apply.push(id);
  });
  return out;
};

/** Apply the change to the drafts that accept it; they are saved, not approved. */
export const applyLedger = (ids: string[], ledger: string) => {
  const p = previewLedger(ids, ledger);
  const changes: Record<string, Ov> = {};
  p.apply.forEach((id) => {
    changes[id] = { ...ovOf(id), l: ledger, s: "saved" };
  });
  patch(changes);
  return p;
};

/** Approve saved drafts. A draft that isn't saved yet is named, not approved. */
export const approveDrafts = (ids: string[]) => {
  const changes: Record<string, Ov> = {};
  const notSaved: string[] = [];
  ids.forEach((id) => {
    const t = wsById(id);
    const o = ovOf(id);
    if (!t || kindOf(t, o) !== "new") return;
    const s = statusOf(t, o);
    if (s === "saved") changes[id] = { ...o, s: "approved" };
    else if (s === "pending") notSaved.push(id);
  });
  patch(changes);
  return { approved: Object.keys(changes).length, notSaved };
};

/* -------------------------------------------------------------------- sync */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stagedIds = (want: "approved" | "failed") =>
  wsTxns()
    .filter((t) => statusOf(t, getWs().ov[t.id]) === want)
    .map((t) => t.id);

const runSync = async (ids: string[], failId?: string) => {
  const total = ids.length;
  set({ sync: { state: "running", done: 0, total } });
  const steps = Math.min(12, Math.max(1, total));
  const size = Math.ceil(total / steps);
  for (let i = 0; i < total; i += size) {
    await sleep(220);
    const chunk = ids.slice(i, i + size);
    const changes: Record<string, Ov> = {};
    chunk.forEach((id) => {
      const o = ovOf(id);
      changes[id] =
        id === failId
          ? {
              ...o,
              sync: "failed",
              err: "Tally rejected this entry: the voucher date is in a period that is locked.",
            }
          : { ...o, sync: "synced", err: undefined };
    });
    state = { ...state, ov: { ...state.ov, ...changes } };
    set({ sync: { state: "running", done: Math.min(total, i + size), total } });
  }
  set({ sync: { state: "done", done: total, total } });
};

/**
 * Send the approved changes. The prototype fails one entry the first time,
 * so a retry can be shown: a new voucher if there is one, else the first line.
 */
export const syncApproved = async () => {
  const s = getWs();
  if (s.sync.state === "running" || !s.run) return;
  const ids = stagedIds("approved");
  if (!ids.length) return;
  const failId = s.run.failedOnce
    ? undefined
    : ids.find((id) => wsById(id)?.kind === "new") ?? ids[0];
  if (failId) set({ run: { ...s.run, failedOnce: true } });
  await runSync(ids, failId);
};

/** Retry only what failed; what already synced stays as it is. */
export const retryFailed = async () => {
  const ids = stagedIds("failed");
  if (!ids.length || getWs().sync.state === "running") return;
  await runSync(ids);
};

/** Tally rows left out of a partial run, with what was wrong with each. */
export const partialRows = () => getWs().run?.partial ?? [];
export { WS_BAD_ROWS };
