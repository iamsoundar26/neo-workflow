import { useSyncExternalStore } from "react";
import {
  GROUPS_TO_APPROVE,
  LINES,
  amountOf,
  gapOf,
  isHeld,
  isNewVoucher,
  matchOf,
  newLedgerOf,
  reconOf,
  syncOf,
  type ApproveGroup,
  type MatchStatus,
  type ReviewRow,
  type VoucherEdit,
} from "@/config/pages/neo/mock-bank-review";

/**
 * What has been done to the bank lines of a review (19 Nov 2026), kept on this
 * device so the panel can close and come back.
 *
 * Two reviews share the shape and nothing else:
 *  - "sheet": the Review Table as the reference sheet has it (Bank
 *    reconciliation 2), where each line starts from the sheet's own status.
 *  - "flow": the Bank reconciliation agent's run. Every line starts
 *    unreconciled. A person approves it, Neo creates the entries, and the sync
 *    sends them to Tally. Nothing reaches Tally before the sync.
 *
 * DEV: PATCH /api/bank-recon/runs/:id/lines/:lineId, POST .../entries,
 * POST .../sync.
 */
export type Scope = "sheet" | "flow";
export type Edit = VoucherEdit;
/** `by` and `at`: who last changed the line, and when (the table's Last edited columns). */
export type Over = Record<string, { recon: string; sync: string; by?: string; at?: string }>;

type Review = {
  over: Over;
  edits: Record<string, Edit>;
  /** flow: the statement this run read, and when. */
  file?: string;
  startedAt?: string;
  /** flow: lines whose entries exist in AI Accountant. */
  created: string[];
  /** flow: the numbers given to new vouchers, by line. */
  numbers: Record<string, string>;
  /** flow: ledgers created for new parties. */
  ledgers: string[];
  syncedAt?: string;
};
type State = Record<Scope, Review>;

const blank = (): Review => ({ over: {}, edits: {}, created: [], numbers: {}, ledgers: [] });
const KEY = "neo.bank.review.v2";
let state: State = { sheet: blank(), flow: blank() };
let loaded = false;
const listeners = new Set<() => void>();

const load = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<State>;
      state = { sheet: { ...blank(), ...s.sheet }, flow: { ...blank(), ...s.flow } };
    }
  } catch {
    /* storage blocked: it holds for this visit */
  }
};
const set = (scope: Scope, next: Review) => {
  state = { ...state, [scope]: next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export const getReview = (scope: Scope = "sheet") => {
  load();
  return state[scope];
};
export const useBankReview = (scope: Scope = "sheet") =>
  useSyncExternalStore(
    subscribe,
    () => getReview(scope),
    () => state[scope]
  );

export const setLines = (scope: Scope, change: Over) => {
  const at = new Date().toISOString();
  const stamped = Object.fromEntries(Object.entries(change).map(([id, v]) => [id, { by: "You", at, ...v }]));
  set(scope, { ...getReview(scope), over: { ...getReview(scope).over, ...stamped } });
};
export const clearLines = (scope: Scope, ids: string[]) => {
  const over = { ...getReview(scope).over };
  ids.forEach((id) => delete over[id]);
  set(scope, { ...getReview(scope), over });
};
export const saveEdit = (scope: Scope, key: string, e: Edit) =>
  set(scope, { ...getReview(scope), edits: { ...getReview(scope).edits, [key]: e } });

/* ------------------------------------------------------------------ status */

/** A line's recon status now. A flow starts every line unreconciled. */
export const reconNow = (scope: Scope, r: ReviewRow, s = getReview(scope)) =>
  s.over[r.line]?.recon ??
  (scope === "sheet" ? reconOf(r) : matchOf(r) === "Excluded" ? "Excluded" : "Unreconciled");
export const syncNow = (scope: Scope, r: ReviewRow, s = getReview(scope)) =>
  s.over[r.line]?.sync ??
  (scope === "sheet"
    ? syncOf(r)
    : matchOf(r) === "Excluded"
      ? "Not applicable"
      : isNewVoucher(r.line)
        ? "Not synced"
        : "Already in Tally");

/** What approving a line records: the sheet's own words for it. */
export const approvedAs = (id: string) =>
  isNewVoucher(id)
    ? { recon: "Reconciled (manual)", sync: "Not synced" }
    : { recon: "Reconciled", sync: "Write-back pending" };

/* -------------------------------------------------------------------- flow */

export const useBankFlow = () => useBankReview("flow");
export const getFlow = () => getReview("flow");

export const startFlow = (file: string) =>
  set("flow", { ...blank(), file, startedAt: new Date().toISOString() });

export type FlowStatus = "pending" | "fix" | "approved" | "synced" | "excluded";
export const flowStatus = (r: ReviewRow, s = getFlow()): FlowStatus => {
  const recon = reconNow("flow", r, s);
  if (recon === "Excluded") return "excluded";
  if (syncNow("flow", r, s) === "Synced") return "synced";
  if (recon.startsWith("Reconciled")) return "approved";
  return gapOf(r.line, s.edits) !== 0 ? "fix" : "pending";
};
export const isCreated = (id: string, s = getFlow()) => s.created.includes(id);

/** Approve lines. One whose vouchers don't add up to the bank amount is left as it is. */
export const approveLines = (ids: string[]) => {
  const s = getFlow();
  const ok = ids.filter((id) => {
    const r = LINES.find((x) => x.line === id);
    return r && flowStatus(r, s) === "pending";
  });
  setLines("flow", Object.fromEntries(ok.map((id) => [id, approvedAs(id)])));
  return ok;
};
/** Take an approval back, until its entries are created. */
export const unapproveLines = (ids: string[]) =>
  clearLines("flow", ids.filter((id) => !isCreated(id)));
export const excludeLine = (id: string) =>
  setLines("flow", { [id]: { recon: "Excluded", sync: "Not applicable" } });

export type GroupStat = { group: MatchStatus; n: number; amount: number; pending: number; fix: number; approved: number; synced: number };
export const flowStats = (s = getFlow()) => {
  const of = (group: MatchStatus): GroupStat => {
    const rows = LINES.filter((r) => matchOf(r) === group);
    const count = (x: FlowStatus) => rows.filter((r) => flowStatus(r, s) === x).length;
    return {
      group,
      n: rows.length,
      amount: rows.reduce((n, r) => n + Math.abs(amountOf(r)), 0),
      pending: count("pending") + count("fix"),
      fix: count("fix"),
      approved: count("approved") + count("synced"),
      synced: count("synced"),
    };
  };
  const groups = (["Exact", "Potential", "No match", "Excluded"] as MatchStatus[]).map(of);
  const work = groups.filter((g) => (GROUPS_TO_APPROVE as readonly string[]).includes(g.group));
  // Approved, with no entries yet: what "Create entries" would make.
  const waiting = LINES.filter((r) => flowStatus(r, s) === "approved" && !isCreated(r.line, s));
  const fresh = waiting.filter((r) => isNewVoucher(r.line));
  const ready = LINES.filter((r) => isCreated(r.line, s) && flowStatus(r, s) === "approved");
  return {
    groups,
    lines: LINES.length,
    amount: LINES.reduce((n, r) => n + Math.abs(amountOf(r)), 0),
    toApprove: work.reduce((n, g) => n + g.n, 0),
    pending: work.reduce((n, g) => n + g.pending, 0),
    approved: work.reduce((n, g) => n + g.approved, 0),
    synced: work.reduce((n, g) => n + g.synced, 0),
    create: {
      lines: waiting.length,
      vouchers: fresh.length,
      ledgers: fresh.map((r) => newLedgerOf(r.line)).filter((x): x is string => !!x && !s.ledgers.includes(x)),
      updates: waiting.length - fresh.length,
    },
    sync: {
      lines: ready.length,
      vouchers: ready.filter((r) => isNewVoucher(r.line)).length,
      updates: ready.filter((r) => !isNewVoucher(r.line)).length,
      ledgers: s.ledgers.length,
    },
  };
};

/**
 * The lines of a group that can be approved together: nothing differs, and none
 * is large. A potential match always has something that differs, so it is read
 * line by line.
 */
export const bulkOf = (group: MatchStatus, s = getFlow()) =>
  group === "Potential"
    ? []
    : LINES.filter((r) => matchOf(r) === group && flowStatus(r, s) === "pending" && !isHeld(r));

/** The group still waiting that comes first, or null when all are approved. */
export const nextGroup = (s = getFlow()): ApproveGroup | null =>
  (flowStats(s).groups.find((g) => g.pending > 0 && g.group !== "Excluded")?.group as ApproveGroup) ?? null;

const PREFIX: Record<string, [string, number]> = { Payment: ["PYMT", 263], Receipt: ["RCPT", 126], Contra: ["CNTR", 19], Journal: ["JRNL", 1] };

/** Make the entries for every approved line: new vouchers get a number, new parties a ledger. */
export const createEntries = () => {
  const s = getFlow();
  const todo = flowStats(s).create;
  const waiting = LINES.filter((r) => flowStatus(r, s) === "approved" && !isCreated(r.line, s));
  const numbers = { ...s.numbers };
  const used: Record<string, number> = {};
  Object.values(numbers).forEach((no) => {
    const p = no.split("-")[0];
    used[p] = (used[p] || 0) + 1;
  });
  waiting
    .filter((r) => isNewVoucher(r.line))
    .forEach((r) => {
      const [p, first] = PREFIX[r.c[8]] || PREFIX.Journal;
      numbers[r.line] = `${p}-${String(first + (used[p] || 0)).padStart(3, "0")}`;
      used[p] = (used[p] || 0) + 1;
    });
  set("flow", {
    ...s,
    created: [...s.created, ...waiting.map((r) => r.line)],
    numbers,
    ledgers: [...s.ledgers, ...todo.ledgers],
  });
  return todo;
};

/** Send the created entries to Tally. */
export const syncEntries = () => {
  const s = getFlow();
  const ready = LINES.filter((r) => isCreated(r.line, s) && flowStatus(r, s) === "approved");
  set("flow", {
    ...s,
    over: {
      ...s.over,
      ...Object.fromEntries(ready.map((r) => [r.line, { recon: reconNow("flow", r, s), sync: "Synced", by: "Neo", at: new Date().toISOString() }])),
    },
    syncedAt: new Date().toISOString(),
  });
  return ready.length;
};

/* ------------------------------------------------- which group the panel shows */

export type FlowTab = ApproveGroup | "Excluded" | "All";
let focus: { tab: FlowTab; n: number } = { tab: "Exact", n: 0 };
const focusListeners = new Set<() => void>();
/** Ask the panel to show a group: the chat's match results do this. */
export const showGroup = (tab: FlowTab) => {
  focus = { tab, n: focus.n + 1 };
  focusListeners.forEach((f) => f());
};
export const useFlowFocus = () =>
  useSyncExternalStore(
    (f) => {
      focusListeners.add(f);
      return () => focusListeners.delete(f);
    },
    () => focus,
    () => focus
  );

/** The same for the sheet scope: the chat's group tiles pick the Review Table's tab. */
let sheetFocus: { tab: FlowTab; n: number } = { tab: "All", n: 0 };
const sheetListeners = new Set<() => void>();
export const showSheetGroup = (tab: FlowTab) => {
  sheetFocus = { tab, n: sheetFocus.n + 1 };
  sheetListeners.forEach((f) => f());
};
export const useSheetFocus = () =>
  useSyncExternalStore(
    (f) => {
      sheetListeners.add(f);
      return () => sheetListeners.delete(f);
    },
    () => sheetFocus,
    () => sheetFocus
  );
