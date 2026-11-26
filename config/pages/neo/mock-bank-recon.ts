/**
 * Bank reconciliation (13 Nov 2026): one statement, the vouchers Tally has
 * not reconciled yet, and the matching that sorts every statement line into
 * exact, potential or no match in one pass.
 *
 * The data is November 2026 for Nandhini Deluxe's HDFC Current A/c - 0418.
 * The rules follow the PRD: exact = one voucher with the same amount, date
 * and reference; potential = looks alike but not every rule agrees, or one
 * line adds up several vouchers (a group, always reviewed); no match = a new
 * voucher drafted from the accounting policy. A line at or above the
 * materiality limit is always reviewed.
 *
 * DEV: POST /api/bank-recon/runs { ledger, statement, settings } streams the
 * lines; this file only stands in for it.
 */

export type BankSettings = {
  /** The Tally bank ledger. */
  ledger: string;
  /** Rupees a voucher may differ from the bank amount. */
  tolerance: number;
  /** Days a voucher date may differ from the statement date. */
  dateWindow: number;
  /** Lines at or above this amount are always reviewed. */
  materiality: number;
  /** Suggest one bank line against several vouchers. */
  group: boolean;
};

export const BANK_DEFAULTS: BankSettings = {
  ledger: "HDFC Current A/c - 0418",
  tolerance: 10,
  dateWindow: 3,
  materiality: 50000,
  group: true,
};

export const BANK_LEDGERS = [
  "HDFC Current A/c - 0418",
  "ICICI Current A/c - 4105",
];

export const STATEMENT_INFO = {
  bank: "HDFC Bank",
  account: "HDFC Current A/c - 0418",
  period: "1–30 Nov 2026",
  from: "2026-11-01",
  to: "2026-11-30",
  opening: 482300,
  file: { name: "HDFC_0418_Nov2026.pdf", size: 212 * 1024 },
};

export type Instrument =
  | "upi"
  | "card"
  | "neft"
  | "imps"
  | "cheque"
  | "payout"
  | "cash"
  | "other";

export type BankLine = {
  id: string;
  date: string;
  text: string;
  ref?: string;
  /** Credit is positive, debit negative. */
  amount: number;
  instrument: Instrument;
};

export type TallyVoucher = {
  no: string;
  date: string;
  party: string;
  amount: number;
  ref?: string;
  instrument: Instrument;
};

export const STATEMENT: BankLine[] = [
  { id: "T1", date: "2026-11-02", text: "UPI SETTLEMENT HDFC", ref: "UPI0211", amount: 48250, instrument: "upi" },
  { id: "T2", date: "2026-11-03", text: "CARD SETTLEMENT HDFC", ref: "MPR0311", amount: 42780, instrument: "card" },
  { id: "T3", date: "2026-11-04", text: "ZOMATO PAYOUT", ref: "ZMT1104", amount: 38210, instrument: "payout" },
  { id: "T4", date: "2026-11-06", text: "NEFT/Kapoor Estates rent", ref: "N0401", amount: -60000, instrument: "neft" },
  { id: "T5", date: "2026-11-07", text: "CHQ PAID 000231 Hopcoms", ref: "000231", amount: -18500, instrument: "cheque" },
  { id: "T6", date: "2026-11-08", text: "SWIGGY PAYOUT", ref: "SWG1108", amount: 21340, instrument: "payout" },
  { id: "T7", date: "2026-11-10", text: "NEFT/Akshayakalpa Dairy", ref: "N0415", amount: -20000, instrument: "neft" },
  { id: "T8", date: "2026-11-12", text: "IMPS/Ownly settlement", ref: "IM7731", amount: 30000, instrument: "imps" },
  { id: "T9", date: "2026-11-14", text: "TNEB ELECTRICITY BILL", amount: -7250, instrument: "other" },
  { id: "T10", date: "2026-11-16", text: "SMS CHARGES QTR", amount: -354, instrument: "other" },
  { id: "T11", date: "2026-11-18", text: "INT PD SAVINGS", amount: 1126, instrument: "other" },
  { id: "T12", date: "2026-11-20", text: "UPI/Nandhini Foods LLP", ref: "UPI5530", amount: -15000, instrument: "upi" },
  { id: "T13", date: "2026-11-22", text: "CASH DEPOSIT", amount: 9800, instrument: "cash" },
  { id: "T14", date: "2026-11-25", text: "CHQ PAID 000240 Akshayakalpa", ref: "000240", amount: -22400, instrument: "cheque" },
  { id: "T15", date: "2026-11-28", text: "CARD SETTLEMENT HDFC", ref: "MPR2811", amount: 14500, instrument: "card" },
];

export const VOUCHERS: TallyVoucher[] = [
  { no: "Rcpt-501", date: "2026-11-02", party: "HDFC UPI Receivable – JP Nagar", amount: 48250, ref: "UPI0211", instrument: "upi" },
  { no: "Rcpt-502", date: "2026-11-03", party: "HDFC Card Receivable – JP Nagar", amount: 42780, ref: "MPR0311", instrument: "card" },
  { no: "Rcpt-503", date: "2026-11-04", party: "Zomato Receivable", amount: 38210, ref: "ZMT1104", instrument: "payout" },
  { no: "Pmt-211", date: "2026-11-06", party: "Rent", amount: -60000, ref: "N0401", instrument: "neft" },
  { no: "Pmt-212", date: "2026-11-07", party: "Hopcoms (creditor)", amount: -18500, ref: "000231", instrument: "cheque" },
  { no: "Rcpt-504", date: "2026-11-11", party: "Swiggy Receivable", amount: 21340, instrument: "payout" },
  { no: "Pmt-213", date: "2026-11-11", party: "Akshayakalpa Dairy (creditor)", amount: -19990, instrument: "neft" },
  { no: "Rcpt-505", date: "2026-11-12", party: "Ownly Receivable", amount: 18000, instrument: "imps" },
  { no: "Rcpt-506", date: "2026-11-13", party: "Ownly Receivable", amount: 12000, instrument: "imps" },
  { no: "Pmt-214", date: "2026-11-25", party: "Akshayakalpa Dairy (creditor)", amount: -22400, ref: "000240", instrument: "cheque" },
  { no: "Rcpt-507", date: "2026-11-28", party: "HDFC Card Receivable – JP Nagar", amount: 14500, ref: "MPR2811", instrument: "card" },
  // In Tally, not on the statement yet.
  { no: "Pmt-215", date: "2026-11-28", party: "Hopcoms (creditor)", amount: -5600, ref: "000238", instrument: "cheque" },
  { no: "Rcpt-508", date: "2026-11-29", party: "HDFC UPI Receivable – JP Nagar", amount: 8300, instrument: "upi" },
];

export type VoucherDraft = {
  type: "Payment" | "Receipt" | "Contra";
  ledger: string;
  voucherNo: string;
  narration: string;
  notes: string;
  confidence: number;
};

/** What Neo drafts for a line nothing in Tally explains (the accounting policy). */
const POLICY: {
  test: RegExp;
  type: VoucherDraft["type"];
  ledger: string;
  narration: (l: BankLine) => string;
  confidence: number;
}[] = [
  {
    test: /tneb|electric/i,
    type: "Payment",
    ledger: "Electricity",
    narration: () => "Electricity bill for November",
    confidence: 0.91,
  },
  {
    test: /charges/i,
    type: "Payment",
    ledger: "Bank Charges",
    narration: () => "SMS charges for the quarter",
    confidence: 0.88,
  },
  {
    test: /int pd|interest/i,
    type: "Receipt",
    ledger: "Suspense A/c",
    narration: () => "Savings account interest",
    confidence: 0.55,
  },
  {
    test: /cash deposit/i,
    type: "Contra",
    ledger: "Cash",
    narration: () => "Cash deposited at the branch",
    confidence: 0.79,
  },
  {
    test: /nandhini foods/i,
    type: "Payment",
    ledger: "Nandhini Foods LLP (creditor)",
    narration: () => "Paid to Nandhini Foods LLP",
    confidence: 0.62,
  },
];

let nextNo = 216;
export const draftFor = (l: BankLine): VoucherDraft => {
  const hit = POLICY.find((p) => p.test.test(l.text));
  const type: VoucherDraft["type"] =
    hit?.type ?? (l.amount < 0 ? "Payment" : "Receipt");
  return {
    type,
    ledger: hit?.ledger ?? "Suspense A/c",
    voucherNo: `${type === "Receipt" ? "Rcpt" : type === "Contra" ? "Ctr" : "Pmt"}-${nextNo++}`,
    narration: hit ? hit.narration(l) : l.text,
    notes: "",
    confidence: hit?.confidence ?? 0.4,
  };
};

export type Group = "exact" | "potential" | "none";

export type Matched = {
  line: BankLine;
  group: Group;
  vouchers: TallyVoucher[];
  /** One line against several vouchers: always reviewed. */
  grouped: boolean;
  /** Why it is not exact, in a sentence. */
  why: string;
  draft?: VoucherDraft;
};

export type BankResult = {
  lines: Matched[];
  /** Vouchers left over: in Tally, not on the statement. */
  inTallyOnly: TallyVoucher[];
};

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000;
export const gap = (a: string, b: string) => Math.abs(day(a) - day(b));

export const inr = (n: number) =>
  Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const money = (n: number) => `${n < 0 ? "−" : ""}₹${inr(n)}`;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Every combination of 2..max vouchers. */
const combos = (xs: TallyVoucher[], max: number): TallyVoucher[][] => {
  const out: TallyVoucher[][] = [];
  const go = (start: number, cur: TallyVoucher[]) => {
    if (cur.length >= 2) out.push([...cur]);
    if (cur.length === max) return;
    for (let i = start; i < xs.length; i++) go(i + 1, [...cur, xs[i]]);
  };
  go(0, []);
  return out;
};

/** Sort every statement line, in date order, taking each voucher once. */
export const reconcile = (s: BankSettings): BankResult => {
  nextNo = 216;
  const pool = [...VOUCHERS];
  const take = (vs: TallyVoucher[]) =>
    vs.forEach((v) => pool.splice(pool.indexOf(v), 1));
  const lines: Matched[] = [];
  const material = (l: BankLine) => Math.abs(l.amount) >= s.materiality;

  for (const line of STATEMENT) {
    const same = pool.filter(
      (v) => Math.sign(v.amount) === Math.sign(line.amount)
    );

    // Exact: one voucher, same amount, date and reference.
    const exact = same.find(
      (v) =>
        v.amount === line.amount &&
        v.date === line.date &&
        !!v.ref &&
        v.ref === line.ref
    );
    if (exact) {
      take([exact]);
      lines.push(
        material(line)
          ? {
              line,
              group: "potential",
              vouchers: [exact],
              grouped: false,
              why: `Matches ${exact.no} exactly, but it is ₹${inr(s.materiality)} or more, so you check it.`,
            }
          : { line, group: "exact", vouchers: [exact], grouped: false, why: "" }
      );
      continue;
    }

    // Potential: looks alike, but not every rule agrees.
    const near = same
      .map((v) => {
        const amount = Math.abs(v.amount - line.amount) <= s.tolerance;
        const date = gap(v.date, line.date) <= s.dateWindow;
        const instrument = v.instrument === line.instrument;
        return { v, amount, date, instrument, n: +amount + +date + +instrument };
      })
      .filter((c) => c.amount && c.date && c.instrument)
      .sort(
        (a, b) =>
          Math.abs(a.v.amount - line.amount) -
            Math.abs(b.v.amount - line.amount) ||
          gap(a.v.date, line.date) - gap(b.v.date, line.date)
      )[0];
    if (near && !material(line)) {
      take([near.v]);
      const diff = Math.abs(near.v.amount - line.amount);
      const days = gap(near.v.date, line.date);
      const parts = [
        diff
          ? `Tally has ₹${inr(diff)} ${Math.abs(near.v.amount) < Math.abs(line.amount) ? "less" : "more"} than the bank`
          : "",
        days ? `${days} ${plural(days, "day", "days")} apart` : "",
        !near.v.ref ? "no reference in Tally" : "",
      ].filter(Boolean);
      lines.push({
        line,
        group: "potential",
        vouchers: [near.v],
        grouped: false,
        why: parts.join(", ") || "Close, but the reference differs",
      });
      continue;
    }

    // Group: one bank line adding up several vouchers.
    const grouped =
      s.group &&
      !material(line) &&
      combos(same, 3).find((c) => {
        const sum = c.reduce((n, v) => n + v.amount, 0);
        return (
          Math.abs(sum - line.amount) <= s.tolerance &&
          c.every((v) => gap(v.date, line.date) <= s.dateWindow) &&
          new Set(c.map((v) => v.party)).size === 1
        );
      });
    if (grouped) {
      take(grouped);
      lines.push({
        line,
        group: "potential",
        vouchers: grouped,
        grouped: true,
        why: `${grouped.length} vouchers from ${grouped[0].party} add up to the bank amount. Groups always need your check.`,
      });
      continue;
    }

    // No match: a new voucher, drafted.
    lines.push({
      line,
      group: "none",
      vouchers: [],
      grouped: false,
      why: "Nothing in Tally matches this line.",
      draft: draftFor(line),
    });
  }
  return { lines, inTallyOnly: pool };
};

/** Vouchers a person may pick instead, for a line: its side, still free. */
export const candidatesFor = (
  line: BankLine,
  taken: Set<string>
): TallyVoucher[] =>
  VOUCHERS.filter(
    (v) =>
      Math.sign(v.amount) === Math.sign(line.amount) &&
      (!taken.has(v.no) || false)
  ).sort((a, b) => gap(a.date, line.date) - gap(b.date, line.date));

export const sumAbs = (xs: { amount: number }[]) =>
  xs.reduce((n, x) => n + Math.abs(x.amount), 0);

export const closingBalance = () =>
  STATEMENT_INFO.opening + STATEMENT.reduce((n, l) => n + l.amount, 0);
