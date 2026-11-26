import { REVIEW_ROWS } from "./mock-bank-review-rows";

/**
 * The bank recon review (18 Nov 2026), from the reference sheet: the Review
 * Table is the source of truth, and every number in the Review Summary is
 * counted from its bank-line rows, so the two can never disagree.
 *
 * DEV: GET /api/bank-recon/runs/:id/review returns these rows and counts.
 */

export const REVIEW_INFO = {
  company: "Demo Traders Pvt Ltd",
  bankLedger: "HDFC Current A/c XX4521",
  period: "01-Oct-26 to 31-Oct-26",
  gaps: "None found",
  opening: 500000,
  booksClosing: 618681,
};

export const REVIEW_FILE = { name: "HDFC_XX4521_Oct2026.xlsx", size: 48 * 1024 };

export type MatchStatus = "Exact" | "Potential" | "No match" | "Excluded";
export const MATCH_STATUSES: MatchStatus[] = ["Exact", "Potential", "No match", "Excluded"];
export const RECON_STATUSES = ["Reconciled", "Reconciled (manual)", "Matched", "Unreconciled", "Excluded"] as const;
export const SYNC_STATUSES = ["Already in Tally", "Write-back pending", "Not synced", "Synced", "Not applicable"] as const;

/** One row of the Review Table, columns in the sheet's order. */
export type ReviewRow = {
  /** Bank line id (L1…), shared by the rows of a split line. */
  line: string;
  /** A second voucher, reference or ledger of the line above. */
  sub: boolean;
  c: string[];
};

export const COLS = [
  "Txn date", "Bank narration", "Ref / cheque no.", "Amount (₹)", "Match status", "Matched on / rule",
  "Amount diff (₹)", "Date diff (days)", "Voucher type", "Voucher date", "Voucher no.", "GST registration",
  "Effective date", "Supplier ref no.", "Cost centre", "Ledger", "Amount (₹)", "Type of ref", "Name / Ref no.",
  "Due date", "Bill amount (₹)", "Transaction type", "Instrument no.", "Instrument date", "Bank date",
  "Bank alloc amount (₹)", "Voucher narration", "Fields AiA will fill", "Recon status", "Sync status", "Action",
] as const;

export const ROWS: ReviewRow[] = (() => {
  let n = 0;
  return REVIEW_ROWS.map((c) => {
    const sub = !c[0];
    if (!sub) n++;
    return { line: `L${n}`, sub, c };
  });
})();

/** The bank-line rows, one per statement line. */
export const LINES = ROWS.filter((r) => !r.sub);

/** A signed number from "60,000.00 Dr" (money out is negative) or "12,500.00 Cr". */
export const signed = (s: string) => {
  const m = s.trim().match(/^([\d,.]+)\s*(Dr|Cr)?/);
  if (!m) return 0;
  const v = Number(m[1].replace(/,/g, ""));
  return m[2] === "Dr" ? -v : v;
};

export const inr = (n: number) =>
  Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const matchOf = (r: ReviewRow) => r.c[4] as MatchStatus;
export const reconOf = (r: ReviewRow) => r.c[28];
export const syncOf = (r: ReviewRow) => r.c[29];
/** Waiting on a person: still unreconciled. */
export const isPending = (r: ReviewRow) => reconOf(r) === "Unreconciled";

export const summary = () => {
  const by = (m: MatchStatus) => LINES.filter((r) => matchOf(r) === m);
  const abs = (rs: ReviewRow[]) => rs.reduce((n, r) => n + Math.abs(signed(r.c[3])), 0);
  const match = MATCH_STATUSES.map((m) => ({
    label: m === "Excluded" ? "Excluded" : m,
    n: by(m).length,
    amount: abs(by(m)),
    pending: by(m).filter(isPending).length,
  }));
  const count = <T extends string>(list: readonly T[], f: (r: ReviewRow) => string) =>
    list.map((k) => ({ label: k, n: LINES.filter((r) => f(r) === k).length }));
  const dr = LINES.reduce((n, r) => n + Math.max(0, -signed(r.c[3])), 0);
  const cr = LINES.reduce((n, r) => n + Math.max(0, signed(r.c[3])), 0);
  const bank = REVIEW_INFO.opening + cr - dr;
  return {
    match,
    total: { n: LINES.length, amount: abs(LINES), pending: LINES.filter(isPending).length },
    recon: count(RECON_STATUSES, reconOf),
    sync: count(SYNC_STATUSES, syncOf),
    balances: {
      opening: REVIEW_INFO.opening,
      dr,
      cr,
      bank,
      books: REVIEW_INFO.booksClosing,
      diff: bank - REVIEW_INFO.booksClosing,
    },
  };
};

/** The match results, as the one table Neo says in the chat. */
export const matchResultsMarkdown = () => {
  const s = summary();
  return [
    "| Match status | Bank lines | Amount (₹) | Pending action |",
    "|---|---:|---:|---:|",
    ...s.match.map((m) => `| ${m.label} | ${m.n} | ${inr(m.amount)} | ${m.pending} |`),
    `| **Total** | **${s.total.n}** | **${inr(s.total.amount)}** | **${s.total.pending}** |`,
  ].join("\n");
};

/**
 * How the statement and Tally were checked against each other, drawn in
 * plain text: both sides meet in the match check, and each match status
 * says what happens to its lines next. Every number is counted from the
 * lines, as the table was.
 */
export const matchDiagram = (pendingOf?: Record<string, number>) => {
  const s = summary();
  const pad = (t: string, w: number) => {
    const x = t.length > w ? t.slice(0, w) : t;
    const l = Math.floor((w - x.length) / 2);
    return " ".repeat(l) + x + " ".repeat(w - x.length - l);
  };
  const L = 26, G = 9, W = 15;
  const total = 2 * (L + 2) + G;
  const box = (a: string, b: string) => [
    "┌" + "─".repeat(L) + "┐",
    "│" + pad(a, L) + "│",
    "│" + pad(b, L) + "│",
    "└" + "─".repeat(Math.floor(L / 2)) + "┬" + "─".repeat(L - Math.floor(L / 2) - 1) + "┘",
  ];
  const left = box("Bank statement", `${s.total.n} lines · Rs ${inr(s.total.amount)}`);
  const right = box("Tally books", "unreconciled vouchers");
  const top = left.map((l, i) => l + " ".repeat(G) + right[i]);
  const lc = 1 + Math.floor(L / 2);
  const rc = L + 2 + G + lc;
  const mid = Math.floor((lc + rc) / 2);
  const joiner = Array.from({ length: total }, (_, i) =>
    i === lc ? "└" : i === rc ? "┘" : i === mid ? "┬" : i > lc && i < rc ? "─" : " "
  ).join("");
  const centre = (t: string) => " ".repeat(Math.max(0, mid - Math.floor(t.length / 2))) + t;
  const g = s.match;
  const cells = (f: (m: (typeof g)[number]) => string) => "│" + g.map((m) => pad(f(m), W)).join("│") + "│";
  const rule = (a: string, b: string, c: string) => a + g.map(() => "─".repeat(W)).join(b) + c;
  const NOTE: Record<string, [string, string]> = {
    Exact: ["same amount,", "date and ref"],
    Potential: ["close, but one", "thing differs"],
    "No match": ["nothing in", "Tally"],
    Excluded: ["left out of", "this recon"],
  };
  const NEXT: Record<string, [string, string]> = {
    Exact: ["Reconcile", "as they are"],
    Potential: ["Review, then", "reconcile"],
    "No match": ["Neo drafts", "a new entry"],
    Excluded: ["Not sent", "to Tally"],
  };
  const arrows = "│" + g.map(() => pad("▼", W)).join("│") + "│";
  return [
    ...top,
    joiner,
    centre("▼"),
    centre("MATCH CHECK"),
    centre("amount · date · reference"),
    rule("┌", "┬", "┐"),
    cells((m) => m.label.toUpperCase()),
    cells((m) => `${m.n} ${m.n === 1 ? "line" : "lines"}`),
    cells((m) => `Rs ${inr(m.amount)}`),
    rule("├", "┼", "┤"),
    cells((m) => NOTE[m.label][0]),
    cells((m) => NOTE[m.label][1]),
    rule("├", "┼", "┤"),
    arrows,
    cells((m) => NEXT[m.label][0]),
    cells((m) => NEXT[m.label][1]),
    cells((m) => {
      const n = pendingOf ? pendingOf[m.label] ?? 0 : m.pending;
      return n ? `${n} pending` : "none pending";
    }),
    rule("└", "┴", "┘"),
  ].join("\n");
};

/** Pending lines Neo can settle together: exact matches, and new entries drafted from the policy. */
export const isBulkEligible = (r: ReviewRow, recon = reconOf(r)) =>
  recon === "Unreconciled" && (matchOf(r) === "Exact" || matchOf(r) === "No match");
export const bulkLines = () => LINES.filter((r) => isBulkEligible(r));

/* ------------------------------------------------------- lines and vouchers */

const MON: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
/** "01-Oct-26" as 2026-10-01. */
export const iso = (d: string) => {
  const m = d.match(/^(\d{2})-([A-Za-z]{3})-(\d{2})$/);
  return m ? `20${m[3]}-${MON[m[2]]}-${m[1]}` : "";
};

export const lineById = (id: string) => LINES.find((r) => r.line === id);
/** A bank line with the rows under it (second voucher, more references, more ledgers). */
export const partsOf = (id: string) => ROWS.filter((r) => r.line === id);
export const amountOf = (r: ReviewRow) => signed(r.c[3]);

/** A voucher edited in the panel: kept per line, so one draft never changes another. */
export type VoucherEdit = { date: string; ledger: string; amount: number; narration: string; type: string; gst: string };
export const editKey = (line: string, no: string) => `${line}|${no}`;

export type LineVoucher = {
  no: string;
  /** Signed, on the bank line's side. */
  amount: number;
  date: string;
  party: string;
  ref: string;
  /** Another candidate Neo found: shown, not counted. */
  alt: boolean;
};

/** The vouchers a line stands on, with any edit made here. */
export const vouchersOf = (id: string, edits: Record<string, VoucherEdit> = {}): LineVoucher[] => {
  const line = lineById(id);
  if (!line) return [];
  const side = amountOf(line) < 0 ? -1 : 1;
  return partsOf(id)
    .filter((r) => r.c[10])
    .map((r) => {
      const e = edits[editKey(id, r.c[10])];
      return {
        alt: /suggestion/i.test(r.c[1]),
        no: r.c[10],
        amount: e ? side * e.amount : signed(r.c[25] ? `${r.c[25]} ${side < 0 ? "Dr" : "Cr"}` : r.c[16]),
        date: e?.date || iso(r.c[9]),
        party: e?.ledger || r.c[15] || "—",
        ref: r.c[18] || r.c[10],
      };
    });
};

/** Nothing in Tally matched: the voucher is one Neo drafted. */
export const isNewVoucher = (id: string) => partsOf(id).some((r) => r.c[10] === "(new)");

/** Bank amount less the vouchers counted for it. Zero means it can be approved. */
export const gapOf = (id: string, edits: Record<string, VoucherEdit> = {}) => {
  const line = lineById(id);
  if (!line || isNewVoucher(id)) return 0;
  const sum = vouchersOf(id, edits).filter((v) => !v.alt).reduce((n, v) => n + v.amount, 0);
  return Math.round(Math.abs(sum - amountOf(line)) * 100) / 100;
};

/** The ledgers a drafted voucher posts to, in words: "Bank Charges 500.00 Dr · Input CGST 9% 45.00 Dr". */
export const ledgersOf = (id: string) =>
  partsOf(id)
    .filter((r) => r.c[15])
    .map((r) => ({ name: r.c[15], amount: r.c[16] }));

/**
 * A party Tally doesn't have yet: its ledger is created with the voucher.
 * In this sample, the lines whose party Neo read off the narration.
 */
export const newLedgerOf = (id: string) => {
  const line = lineById(id);
  return line && /party from narration/i.test(line.c[5]) ? line.c[15] : null;
};

/** The three groups a person approves, in the order they are worked. */
export const GROUPS_TO_APPROVE = ["Exact", "Potential", "No match"] as const;
export type ApproveGroup = (typeof GROUPS_TO_APPROVE)[number];

/** At or above this a line is always approved one at a time (the accounting policy's review limit). */
export const HELD = 50000;
export const isHeld = (r: ReviewRow) => Math.abs(amountOf(r)) >= HELD;
