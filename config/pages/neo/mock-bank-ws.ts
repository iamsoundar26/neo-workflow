/**
 * The bank reconciliation workspace's sample (13 Nov 2026): HDFC Current A/c
 * · September 2026, 5,000 statement lines sorted into 4,500 exact matches,
 * 350 to review (120 dates a few days apart inside the window, 30 outside it,
 * 120 amounts that differ, 80 with several possible vouchers) and 150 that
 * need a new voucher. Generated from a fixed seed, so every run is the same.
 *
 * Placed on purpose: one ₹10,000 payment suggested against a ₹9,800 voucher
 * (with a valid ₹10,000 voucher among the alternatives), 18 exact matches
 * above the review limit, 4 whose Tally voucher changed after matching, and
 * 36 bank-fee drafts beside the incompatible ones, so each rule shows itself.
 *
 * DEV: in production this is POST /api/bank-recon/runs streaming these lines;
 * none of this file ships.
 */

export type VType = "Payment" | "Receipt" | "Contra" | "Journal";
export type Issue = "date" | "amount" | "multiple";

export type WsVoucher = {
  no: string;
  date: string;
  party: string;
  /** Signed: money out is negative. */
  amount: number;
  ref?: string;
  /** Why it can't be used: it belongs to another bank line. */
  used?: string;
};

export type WsDraft = { type: VType; ledger: string; narration: string };

export type WsTxn = {
  id: string;
  kind: "exact" | "review" | "new";
  issue?: Issue;
  date: string;
  text: string;
  amount: number;
  ref?: string;
  /** exact, date, amount: the suggested voucher. multiple: the candidates. */
  vouchers: WsVoucher[];
  /** amount: other vouchers that might be the right one. */
  alts?: WsVoucher[];
  /** exact: the Tally voucher's amount after someone changed it, post-match. */
  late?: number;
  draft?: WsDraft;
  /** Listed first in its group. */
  first?: boolean;
};

export type WsRules = { tolerance: number; dateWindow: number; materiality: number };
export const WS_RULES: WsRules = { tolerance: 10, dateWindow: 3, materiality: 50000 };

export const WS_INFO = {
  bank: "HDFC Bank",
  account: "HDFC Current A/c - 0418",
  period: "1–30 Sep 2026",
  periodLong: "September 2026",
  from: "2026-09-01",
  to: "2026-09-30",
  opening: 24831540,
  file: { name: "HDFC_0418_Sep2026.xlsx", size: 1.8 * 1024 * 1024 },
  total: 5000,
};

/** The Tally rows a first export gets wrong; the clean upload has none. */
export const WS_BAD_ROWS = [
  { line: 2, ref: "tally-sep-4137", issue: "Date “09/10/2026” could be 9 Oct or 10 Sep" },
  { line: 7, ref: "", issue: "No entry ID" },
];

/* ------------------------------------------------------------------ ledgers */

export type WsLedger = { name: string; side: "out" | "in" | "both"; contra?: boolean };
export const WS_LEDGERS: WsLedger[] = [
  { name: "Bank Charges", side: "out" },
  { name: "Electricity", side: "out" },
  { name: "Rent", side: "out" },
  { name: "Professional Fees", side: "out" },
  { name: "Insurance", side: "out" },
  { name: "Telephone & Internet", side: "out" },
  { name: "Travel & Conveyance", side: "out" },
  { name: "Staff Welfare", side: "out" },
  { name: "Interest Received", side: "in" },
  { name: "Sales", side: "in" },
  { name: "Commission Received", side: "in" },
  { name: "Cash", side: "both", contra: true },
  { name: "ICICI Current A/c - 4105", side: "both", contra: true },
  { name: "Suspense", side: "both" },
];

/** Why a ledger can't take this draft, or null when it can. */
export const ledgerFit = (ledger: string, t: Pick<WsTxn, "amount" | "draft">) => {
  const l = WS_LEDGERS.find((x) => x.name === ledger);
  if (!l) return `${ledger} isn't a ledger in Tally.`;
  if (t.draft?.type === "Contra" && !l.contra)
    return `A contra entry moves money between cash and bank accounts. ${ledger} isn't one.`;
  if (t.draft?.type !== "Contra" && l.contra)
    return `${ledger} is a cash or bank account. This isn't a contra entry.`;
  if (t.amount > 0 && l.side === "out")
    return `This is money in. ${ledger} only takes payments.`;
  if (t.amount < 0 && l.side === "in")
    return `This is money out. ${ledger} only takes receipts.`;
  return null;
};

/* --------------------------------------------------------------- generation */

const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const PARTIES = [
  "Sri Lakshmi Traders", "Kapoor Estates", "Akshayakalpa Dairy", "Hopcoms", "Ownly Foods",
  "Zomato", "Swiggy", "Annapurna Supplies", "Vinayaka Packaging", "Madras Cold Storage",
  "Ganesh Poultry", "Bharat Gas", "TNEB", "Airtel Business", "Star Health",
  "Rajan & Co", "Sundaram Fasteners", "Cauvery Logistics", "Meenakshi Silks", "Deccan Agro",
  "Hindustan Spices", "Kovai Catering", "Sai Electricals", "Nandhini Foods LLP", "Lotus Traders",
  "Palani Oils", "Thanjavur Rice Mill", "Chola Distributors", "Pearl Packaging", "Surya Stationers",
  "Velan Hardware", "Amutha Textiles", "Bhavani Agencies", "Coastal Seafoods", "Dhanam Finance",
  "Eswari Dairy", "Fresh Basket", "Green Leaf Organics", "Hari Provisions", "Indira Tea Stall",
  "Jothi Bakers", "Kumaran Motors", "Latha Caterers", "Murugan Stores", "Nila Fruits",
  "Oasis Beverages", "Pandian Tiles", "Quick Courier",
];

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayGap = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

type Seed = { kind: WsTxn["kind"]; issue?: Issue; day: number; k: number };

const build = (): WsTxn[] => {
  const r = mulberry(2609);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const iso = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;
  const ref = () => String(int(100000000, 999999999));

  // The mix, shuffled, then ordered by date.
  const kinds: { kind: WsTxn["kind"]; issue?: Issue; n: number }[] = [
    { kind: "exact", n: 4500 },
    { kind: "review", issue: "date", n: 150 },
    { kind: "review", issue: "amount", n: 120 },
    { kind: "review", issue: "multiple", n: 80 },
    { kind: "new", n: 150 },
  ];
  const seeds: Seed[] = [];
  let k = 0;
  kinds.forEach((g) => {
    for (let i = 0; i < g.n; i++)
      seeds.push({ kind: g.kind, issue: g.issue, day: int(1, 30), k: k++ });
  });
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
  }
  seeds.sort((a, b) => a.day - b.day || a.k - b.k);

  let vn = 20000;
  const no = (amount: number) => `${amount < 0 ? "Pmt" : "Rcpt"}-${++vn}`;
  const text = (party: string, amount: number, rf: string) =>
    amount > 0
      ? pick([`UPI/${party}/${rf}`, `NEFT CR ${party}`, `IMPS/${party}/${rf}`, `RTGS CR ${party}`])
      : pick([`NEFT/${party}`, `UPI/${party}/${rf}`, `CHQ PAID ${int(100, 999)} ${party}`, `IMPS/${party}/${rf}`]);

  // Draft pools for the 150 new entries, dealt in a shuffled order.
  const feeText = ["SMS CHARGES QTR", "ATM CASH WDL FEE", "NEFT CHARGES", "CHQ BOOK ISSUE CHG", "DD COMMISSION", "MIN BAL CHARGES"];
  const pool: { text: string; ledger: string; type: VType; sign: 1 | -1; lo: number; hi: number }[] = [];
  const add = (n: number, text: (i: number) => string, ledger: string, type: VType, sign: 1 | -1, lo: number, hi: number) => {
    for (let i = 0; i < n; i++) pool.push({ text: text(i), ledger, type, sign, lo, hi });
  };
  add(36, (i) => feeText[i % feeText.length], "Bank Charges", "Payment", -1, 5, 1500);
  add(8, () => "INT PD SAVINGS", "Interest Received", "Receipt", 1, 300, 9000);
  add(12, () => "TNEB ELECTRICITY BILL", "Electricity", "Payment", -1, 3000, 18000);
  add(6, () => "NEFT/Kapoor Estates rent", "Rent", "Payment", -1, 20000, 60000);
  add(14, () => "NEFT/Rajan & Co professional", "Professional Fees", "Payment", -1, 2500, 25000);
  add(8, () => "STAR HEALTH PREMIUM", "Insurance", "Payment", -1, 2000, 15000);
  add(12, () => "AIRTEL BROADBAND", "Telephone & Internet", "Payment", -1, 800, 4500);
  add(14, () => "OLA/UBER CORPORATE", "Travel & Conveyance", "Payment", -1, 400, 6000);
  add(10, () => "STAFF TEA AND SNACKS", "Staff Welfare", "Payment", -1, 300, 3500);
  add(14, () => "UPI/UNKNOWN CUSTOMER", "Sales", "Receipt", 1, 500, 20000);
  add(6, () => "COMMISSION CREDIT", "Commission Received", "Receipt", 1, 800, 7000);
  add(10, (i) => (i % 2 ? "CASH DEPOSIT" : "CASH WITHDRAWAL"), "Cash", "Contra", 1, 5000, 40000);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  let exactRank = 0;
  let dateRank = 0;
  let newRank = 0;
  const LATE_AT = new Set([90, 400, 1200, 3100]);
  const HELD_AT = new Set(Array.from({ length: 18 }, (_, i) => 37 + i * 250));

  const out: WsTxn[] = seeds.map((s, idx) => {
    const id = `T${String(idx + 1).padStart(4, "0")}`;
    const date = iso(s.day);
    const party = pick(PARTIES);
    const rf = ref();

    if (s.kind === "new") {
      const p = pool[newRank++];
      const amount = p.sign * int(p.lo, p.hi);
      return {
        id, kind: "new", date, text: p.text, amount, ref: rf, vouchers: [],
        draft: { type: p.type, ledger: p.ledger, narration: p.text },
      };
    }

    const sign = r() < 0.5 ? 1 : -1;
    let amount = sign * int(150, 49000);
    if (s.kind === "exact") {
      const rank = exactRank++;
      if (HELD_AT.has(rank)) amount = sign * int(52000, 96000);
      const v: WsVoucher = { no: no(amount), date, party, amount, ref: rf };
      return {
        id, kind: "exact", date, text: text(party, amount, rf), amount, ref: rf,
        vouchers: [v],
        late: LATE_AT.has(rank) ? amount - sign * 150 : undefined,
      };
    }

    // review
    if (s.issue === "date") {
      const rank = dateRank++;
      const outside = rank % 5 === 4; // 30 of 150
      const gap = outside ? int(5, 12) : int(1, 3);
      const vd = addDays(date, r() < 0.5 ? gap : -gap);
      const v: WsVoucher = { no: no(amount), date: vd < "2026-09-01" ? addDays(date, gap) : vd, party, amount, ref: rf };
      return { id, kind: "review", issue: "date", date, text: text(party, amount, rf), amount, ref: rf, vouchers: [v] };
    }
    if (s.issue === "amount") {
      const diff = pick([40, 50, 120, 150, 200, 250, 300, 480, 500, 900]);
      const sug: WsVoucher = { no: no(amount), date, party, amount: amount - sign * diff, ref: rf };
      const alts: WsVoucher[] = [];
      if (r() < 0.7)
        alts.push({ no: no(amount), date: addDays(date, int(0, 2)), party, amount, ref: rf });
      alts.push({ no: no(amount), date, party, amount: amount + sign * int(100, 400), ref: rf });
      if (r() < 0.4)
        alts.push({ no: no(amount), date, party, amount, ref: rf, used: "Already matched to another bank line" });
      return { id, kind: "review", issue: "amount", date, text: text(party, amount, rf), amount, ref: rf, vouchers: [sug], alts };
    }
    // multiple
    const n = r() < 0.6 ? 2 : 3;
    const vs: WsVoucher[] = Array.from({ length: n }, (_, i) => ({
      no: no(amount),
      date: addDays(date, i === 0 ? 0 : int(-2, 2) || 1),
      party: i === 0 ? party : pick(PARTIES),
      amount,
      ref: i === 0 ? rf : undefined,
    }));
    return { id, kind: "review", issue: "multiple", date, text: text(party, amount, rf), amount, ref: rf, vouchers: vs };
  });

  // The ₹10,000 payment: suggested against a ₹9,800 voucher.
  const sample = out.find((t) => t.issue === "amount")!;
  sample.date = "2026-09-03";
  sample.text = "NEFT/Sri Lakshmi Traders";
  sample.amount = -10000;
  sample.ref = "N90312";
  sample.first = true;
  sample.vouchers = [{ no: "Pmt-20418", date: "2026-09-03", party: "Sri Lakshmi Traders", amount: -9800, ref: "N90312" }];
  sample.alts = [
    { no: "Pmt-20431", date: "2026-09-04", party: "Sri Lakshmi Traders", amount: -10000, ref: "N90312" },
    { no: "Pmt-20377", date: "2026-09-03", party: "Sri Lakshmi Traders", amount: -10200 },
    { no: "Pmt-20352", date: "2026-09-02", party: "Sri Lakshmi Traders", amount: -10000, used: "Already matched to another bank line" },
  ];
  return out;
};

let cache: WsTxn[] | null = null;
export const wsTxns = () => (cache ??= build());

let index: Map<string, WsTxn> | null = null;
export const wsById = (id: string) =>
  (index ??= new Map(wsTxns().map((t) => [t.id, t]))).get(id);

export const wsClosing = () =>
  WS_INFO.opening + wsTxns().reduce((n, t) => n + t.amount, 0);

export const wsDirection = () => {
  const all = wsTxns();
  return { in: all.filter((t) => t.amount > 0).length, out: all.filter((t) => t.amount < 0).length };
};
