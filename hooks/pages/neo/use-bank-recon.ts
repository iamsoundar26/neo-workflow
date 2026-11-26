import { useSyncExternalStore } from "react";
import {
  BANK_DEFAULTS,
  STATEMENT_INFO,
  closingBalance,
  reconcile,
  type BankSettings,
  type Matched,
  type TallyVoucher,
  type VoucherDraft,
} from "@/config/pages/neo/mock-bank-recon";

/**
 * The bank reconciliation in progress (13 Nov 2026), kept on this device so
 * review can stop and pick up again before anything is sent to Tally.
 *
 * A line is matched when it is linked to voucher(s), reconciled once you
 * confirm it, and synced after Tally has it. Unreviewed lines are never sent.
 *
 * DEV: GET/PATCH /api/bank-recon/runs/:id, POST .../sync.
 */
export type BankStatus = "open" | "reconciled" | "skipped" | "synced";

export type BankLineState = Matched & {
  status: BankStatus;
  /** Tally amounts edited here, by voucher number. */
  amounts: Record<string, number>;
  /** The person changed something on this line. */
  edited?: boolean;
};

export type BankRun = {
  id: string;
  settings: BankSettings;
  period: string;
  ledger: string;
  lines: BankLineState[];
  inTallyOnly: TallyVoucher[];
  startedAt: string;
  syncedAt?: string;
};

export type BankHistory = {
  id: string;
  period: string;
  ledger: string;
  at: string;
  reconciled: number;
  created: number;
  status: "Synced";
};

const RUN_KEY = "neo.bank.run.v1";
const SETTINGS_KEY = "neo.bank.settings.v1";
const HISTORY_KEY = "neo.bank.history.v1";

let run: BankRun | null = null;
let loaded = false;
const listeners = new Set<() => void>();

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the run holds for this visit */
  }
};
const load = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  run = read<BankRun | null>(RUN_KEY, null);
};
const emit = () => {
  if (run) write(RUN_KEY, run);
  listeners.forEach((f) => f());
};

export const getBankRun = () => {
  load();
  return run;
};

export const useBankRun = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => getBankRun(),
    () => null
  );

export const startBankRun = (settings: BankSettings) => {
  load();
  const result = reconcile(settings);
  run = {
    id: `bank-${Date.now().toString(36)}`,
    settings,
    period: STATEMENT_INFO.period,
    ledger: settings.ledger,
    lines: result.lines.map((m) => ({ ...m, status: "open", amounts: {} })),
    inTallyOnly: result.inTallyOnly,
    startedAt: new Date().toISOString(),
  };
  emit();
  return run;
};

const patch = (id: string, f: (l: BankLineState) => BankLineState) => {
  if (!run) return;
  run = {
    ...run,
    lines: run.lines.map((l) => (l.line.id === id ? f(l) : l)),
  };
  emit();
};

export const lineOf = (id: string) => getBankRun()?.lines.find((l) => l.line.id === id);

/** What Tally holds for this line, with edits: a signed total. */
export const tallyTotal = (l: BankLineState) =>
  l.vouchers.reduce((n, v) => n + (l.amounts[v.no] ?? v.amount), 0);

/** Bank minus Tally for a matched line; a new voucher always equals the bank. */
export const differenceOf = (l: BankLineState) =>
  l.group === "none" && !l.vouchers.length ? 0 : l.line.amount - tallyTotal(l);

export const setVoucherAmount = (id: string, no: string, amount: number) =>
  patch(id, (l) => ({
    ...l,
    edited: true,
    amounts: { ...l.amounts, [no]: l.line.amount < 0 ? -Math.abs(amount) : Math.abs(amount) },
  }));

/** Pick other vouchers for a line, or none to draft a new one. */
export const chooseVouchers = (
  id: string,
  vouchers: TallyVoucher[],
  draft?: VoucherDraft
) =>
  patch(id, (l) => ({
    ...l,
    edited: true,
    vouchers,
    amounts: {},
    grouped: vouchers.length > 1,
    group: vouchers.length ? "potential" : "none",
    draft: vouchers.length ? undefined : draft || l.draft,
    why: vouchers.length ? "You chose these vouchers." : "You chose a new voucher.",
  }));

export const updateDraft = (id: string, change: Partial<VoucherDraft>) =>
  patch(id, (l) =>
    l.draft
      ? { ...l, edited: true, draft: { ...l.draft, ...change, confidence: 1 } }
      : l
  );

/** Confirm lines. A matched line only reconciles when the amounts are equal. */
export const approveLines = (ids: string[]) => {
  const refused: string[] = [];
  ids.forEach((id) => {
    const l = lineOf(id);
    if (!l) return;
    if (differenceOf(l) !== 0) {
      refused.push(id);
      return;
    }
    patch(id, (x) => ({ ...x, status: "reconciled" }));
  });
  return refused;
};

export const skipLine = (id: string) =>
  patch(id, (l) => ({ ...l, status: "skipped" }));

export const reopenLine = (id: string) =>
  patch(id, (l) => ({ ...l, status: "open" }));

/** Bank and Tally balances, with what is still unexplained. */
export const balancesOf = (r: BankRun) => {
  const bank = closingBalance();
  const outstanding = r.inTallyOnly.reduce((n, v) => n + v.amount, 0);
  const unexplained = r.lines
    .filter((l) => l.status !== "reconciled" && l.status !== "synced")
    .reduce((n, l) => n + differenceOf(l) + (l.group === "none" && !l.vouchers.length ? l.line.amount : 0), 0);
  return {
    bank,
    book: bank - unexplained + outstanding,
    outstanding,
    unexplained,
  };
};

export const countsOf = (r: BankRun) => {
  const by = (g: Matched["group"]) => r.lines.filter((l) => l.group === g);
  const done = (l: BankLineState) => l.status === "reconciled" || l.status === "synced";
  return {
    total: r.lines.length,
    exact: by("exact"),
    potential: by("potential"),
    none: by("none"),
    reconciled: r.lines.filter(done).length,
    created: r.lines.filter((l) => done(l) && !l.vouchers.length).length,
    skipped: r.lines.filter((l) => l.status === "skipped").length,
    open: r.lines.filter((l) => l.status === "open").length,
  };
};

/** Send only the reconciled lines; the rest stay as they are. */
export const syncRun = () => {
  if (!run) return null;
  const c = countsOf(run);
  const at = new Date().toISOString();
  run = {
    ...run,
    syncedAt: at,
    lines: run.lines.map((l) =>
      l.status === "reconciled" ? { ...l, status: "synced" } : l
    ),
  };
  const history = read<BankHistory[]>(HISTORY_KEY, []);
  write(HISTORY_KEY, [
    {
      id: run.id,
      period: run.period,
      ledger: run.ledger,
      at,
      reconciled: c.reconciled,
      created: c.created,
      status: "Synced",
    } satisfies BankHistory,
    ...history,
  ].slice(0, 20));
  emit();
  return c;
};

/* ------------------------------------------------- saved settings (first run) */

export const getSavedBankSettings = (): BankSettings | null => {
  if (typeof window === "undefined") return null;
  const s = read<BankSettings | null>(SETTINGS_KEY, null);
  return s ? { ...BANK_DEFAULTS, ...s } : null;
};
export const saveBankSettings = (s: BankSettings) => write(SETTINGS_KEY, s);

/* ------------------------------------------------------------- side panel */

let panel: string | null = null;
const panelListeners = new Set<() => void>();
const emitPanel = () => panelListeners.forEach((f) => f());
export const openBankPanel = (lineId: string) => {
  panel = lineId;
  emitPanel();
};
export const closeBankPanel = () => {
  if (panel === null) return;
  panel = null;
  emitPanel();
};
export const useBankPanel = () =>
  useSyncExternalStore(
    (f) => {
      panelListeners.add(f);
      return () => panelListeners.delete(f);
    },
    () => panel,
    () => null
  );
