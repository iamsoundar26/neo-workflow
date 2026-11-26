import { LINES, matchOf } from "@/config/pages/neo/mock-bank-review";

/**
 * The match settings Neo shows after the statement is read (PM brief, 23 Nov
 * 2026). Defaults are pre-filled; they are saved to the Accounting Policy and
 * on later runs Neo shows one line instead.
 *
 * DEV: GET/PUT /api/accounting-policy/bank-matching
 */
export type MatchSettings = {
  /** Auto-match needs amount and date to be the same, plus this third check. */
  autoRule: "either" | "reference";
  amountOn: boolean;
  amountAbs: number;
  amountPct: number;
  dateOn: boolean;
  dateDays: number;
  refOn: boolean;
  partyOn: boolean;
  /** Suggest when this many of the checks fit. */
  suggestWhen: "1" | "2" | "all";
  group: boolean;
  groupMax: number;
  dateDiffers: "keep" | "change";
  amountDiffers: "fix" | "manual";
  roundOn: boolean;
  roundUnder: number;
  fillBankDate: boolean;
  fillNarration: boolean;
  fillInstrument: boolean;
  fillTxnType: boolean;
};

export const MATCH_DEFAULTS: MatchSettings = {
  autoRule: "either",
  amountOn: true,
  amountAbs: 10,
  amountPct: 0.5,
  dateOn: true,
  dateDays: 3,
  refOn: true,
  partyOn: false,
  suggestWhen: "2",
  group: true,
  groupMax: 5,
  dateDiffers: "keep",
  amountDiffers: "fix",
  roundOn: true,
  roundUnder: 1,
  fillBankDate: true,
  fillNarration: true,
  fillInstrument: false,
  fillTxnType: false,
};

const KEY = "neo.match-settings.v1";

export const getSavedMatchSettings = (): MatchSettings | null => {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    return raw ? { ...MATCH_DEFAULTS, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
};
export const saveMatchSettings = (s: MatchSettings) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the settings still apply to this run */
  }
};


/** How many suggestion checks are on. */
const checks = (s: MatchSettings) => [s.amountOn, s.dateOn, s.refOn, s.partyOn].filter(Boolean).length;

/**
 * What the settings would give on this statement: the auto-matches stay as
 * they are; the suggestions and new entries move with the checks.
 */
export const previewOf = (s: MatchSettings) => {
  const auto = LINES.filter((r) => matchOf(r) === "Exact").length;
  const base = LINES.filter((r) => matchOf(r) === "Potential").length;
  const fresh = LINES.filter((r) => matchOf(r) === "No match").length;
  const on = checks(s);
  const review =
    on === 0
      ? 0
      : s.suggestWhen === "all"
        ? Math.round(base * 0.6)
        : s.suggestWhen === "1"
          ? base
          : on < 2
            ? Math.round(base * 0.6)
            : base;
  return { auto, review, fresh: fresh + (base - review) };
};

/** The three groups of the default card, in plain words. */
export const summaryOf = (s: MatchSettings) => ({
  auto:
    s.autoRule === "either"
      ? "Same amount, same date, same reference or narration"
      : "Same amount, same date, same reference",
  suggest: (() => {
    const bits = [
      s.amountOn ? `Amount within ₹${s.amountAbs} or ${s.amountPct}%` : "",
      s.dateOn ? `date within ${s.dateDays} days` : "",
    ].filter(Boolean);
    return bits.length ? bits.join(", ") : "No suggestions: unmatched lines become new entries";
  })(),
  dateDiffers:
    s.dateDiffers === "keep" ? "Keep voucher date, set Bank Date to the bank date" : "Change voucher date to the bank date",
  amountDiffers:
    s.amountDiffers === "fix" ? "Suggest a fix (e.g. add TDS or bank charges)" : "No suggestion, you review each one",
  fill:
    [s.fillBankDate && "Bank Date", s.fillNarration && "Narration", s.fillInstrument && "Cheque / UTR", s.fillTxnType && "Transaction type"]
      .filter(Boolean)
      .join(", ") || "Nothing",
});

/** What the person chose on the card, handed to the task that asked. */
let chosen: { settings: MatchSettings; once: boolean } = { settings: MATCH_DEFAULTS, once: false };
export const setChosenMatchSettings = (settings: MatchSettings, once: boolean) => {
  chosen = { settings, once };
};
export const chosenMatchSettings = () => chosen;
