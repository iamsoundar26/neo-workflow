import { companyOf, getState } from "@/components/inbox/v2/store";
import { NANDHINI_ID } from "@/config/pages/neo/mock-recon";
import {
  BANK_DEFAULTS,
  BANK_LEDGERS,
  type BankSettings,
} from "@/config/pages/neo/mock-bank-recon";
import {
  REVIEW_FILE,
  REVIEW_INFO,
  summary,
  inr,
} from "@/config/pages/neo/mock-bank-review";
import {
  getSavedBankSettings,
  saveBankSettings,
} from "@/hooks/pages/neo/use-bank-recon";
import {
  createEntries,
  flowStats,
  startFlow,
  syncEntries,
} from "@/hooks/pages/neo/use-bank-review";
import { entriesInWords } from "@/components/neo/common/bank-flow/stage-card";
import type {
  NeoCard,
  NeoTask,
  NeoTaskApi,
  NeoUploadFile,
} from "@/types/pages/neo";
import { has } from "@/utils/pages/neo";
import { decide } from "./shared";
import { createThenSync } from "./bank-review";

/**
 * Bank reconciliation (19 Nov 2026), the way an accountant works it: upload
 * the statement, see what Neo read, see how its lines met the vouchers in Tally
 * (a flow diagram or a table, in the chat), open Exact, Potential and No match
 * in the Review Table beside the chat and approve each, then answer Neo's two
 * questions: create the entries, and sync them to Tally. The chat carries no
 * per-line cards.
 *
 * "Bank reconciliation 2" (bank-recon-2.ts) is the workspace version.
 *
 * DEV: POST /api/bank-recon/runs; the Tally reads and writes go through the
 * connector.
 */

const LEDGERS = [REVIEW_INFO.bankLedger, ...BANK_LEDGERS];

/** The statement, asked for on the same upload card the payout check uses. */
const askStatement = async (api: NeoTaskApi) => {
  const company = api.context.company || getState().company;
  const card: Extract<NeoCard, { kind: "sources-upload" }> = {
    kind: "sources-upload",
    slots: [
      {
        id: "bank",
        label: "Bank statement",
        hint: "PDF or Excel, from net banking",
      },
    ],
    context: {
      client: companyOf(company)?.name || "Nandhini Deluxe",
      period: REVIEW_INFO.period,
      from: "2026-10-01",
      to: "2026-10-31",
    },
    files: api.attachments.map(
      (h): NeoUploadFile => ({ slot: "", name: h.name, size: h.size ?? 0 })
    ),
  };
  card.sample = [
    {
      slot: "bank",
      name: REVIEW_FILE.name,
      size: REVIEW_FILE.size,
      state: "ready",
      label: `${REVIEW_INFO.bankLedger} · Bank statement`,
      range: REVIEW_INFO.period,
      rows: summary().total.n,
    },
  ];
  await api.say(
    "I can help you match your bank transactions with Tally.\n\nFirst, upload your bank statement. PDF or Excel is fine. No file handy? Use the sample."
  );
  const choice = await api.card(card, [
    { id: "go", label: "Reconcile", primary: true },
    { id: "sample", label: "Use the sample" },
    { id: "cancel", label: "Cancel" },
  ]);
  if (choice === "cancel") return null;
  return (
    card.files.find((f) => f.state === "ready" && f.slot)?.name || REVIEW_FILE.name
  );
};

/** What Neo read from the statement, said in words. */
const readingText = (file: string) => {
  const s = summary();
  return [
    `I read **${file}**. Here is what I found:`,
    "",
    `- **Bank:** HDFC Bank, ${REVIEW_INFO.bankLedger}`,
    `- **Period:** ${REVIEW_INFO.period}`,
    `- **Transactions:** ${s.total.n}`,
    `- **Balances:** opening ₹${inr(s.balances.opening)}, closing ₹${inr(s.balances.bank)}`,
    `- **Missing days:** none. The statement covers the whole month.`,
  ].join("\n");
};

/** The settings, asked on the first run only and saved for the next. */
const confirmSettings = async (
  api: NeoTaskApi
): Promise<BankSettings | null> => {
  const saved = getSavedBankSettings();
  if (saved) {
    await api.say(
      `I'll use the settings you saved for **${saved.ledger}**. You can change them in Accounting Policy.`
    );
    return saved;
  }
  const { choice, picks } = await decide(
    api,
    "Confirm bank details",
    [
      {
        id: "ledger",
        header: "Bank ledger",
        question: "Which Tally ledger is this bank account?",
        why: "It matches the account on your statement.",
        recommended: LEDGERS[0],
        options: LEDGERS.map((l) => ({ id: l, label: l })),
      },
      {
        id: "rules",
        header: "Matching rules",
        question: "Which matching rules should I use?",
        why: "The recommended rules: amounts up to ₹10 apart, dates up to 3 days apart, and I always ask you about ₹50,000 or more.",
        recommended: "default",
        options: [
          { id: "default", label: "Use recommended settings" },
          { id: "custom", label: "Choose my own" },
        ],
      },
      {
        id: "tolerance",
        header: "Amount",
        question: "How far apart can the amounts be?",
        recommended: "10",
        options: [
          { id: "10", label: "Up to ₹10" },
          { id: "0", label: "Exactly the same" },
          { id: "50", label: "Up to ₹50" },
        ],
        when: { id: "rules", in: ["custom"] },
      },
      {
        id: "window",
        header: "Dates",
        question: "How many days apart can the dates be?",
        recommended: "3",
        options: [
          { id: "3", label: "3 days" },
          { id: "0", label: "The same day" },
          { id: "7", label: "7 days" },
        ],
        when: { id: "rules", in: ["custom"] },
      },
      {
        id: "material",
        header: "Big amounts",
        question: "From what amount should I always ask you?",
        why: "Even when it matches exactly.",
        recommended: "50000",
        options: [
          { id: "50000", label: "₹50,000 or more" },
          { id: "10000", label: "₹10,000 or more" },
          { id: "100000", label: "₹1,00,000 or more" },
        ],
        when: { id: "rules", in: ["custom"] },
      },
      {
        id: "group",
        header: "Group matches",
        question: "Match several entries together?",
        why: "When one bank line adds up to several vouchers. You check every group.",
        recommended: "yes",
        options: [
          { id: "yes", label: "Yes, match multiple entries together" },
          { id: "no", label: "No, one entry at a time" },
        ],
      },
    ],
    [
      { id: "go", label: "Save and continue", primary: true },
      { id: "cancel", label: "Cancel" },
    ]
  );
  if (choice !== "go") return null;
  const num = (v: string | undefined, d: number) =>
    v && Number.isFinite(Number(v)) ? Number(v) : d;
  const s: BankSettings = {
    ledger: picks.ledger || BANK_DEFAULTS.ledger,
    tolerance: num(picks.tolerance, BANK_DEFAULTS.tolerance),
    dateWindow: num(picks.window, BANK_DEFAULTS.dateWindow),
    materiality: num(picks.material, BANK_DEFAULTS.materiality),
    group: picks.group !== "no",
  };
  saveBankSettings(s);
  await api.say(
    "Saved. I'll use these next time, so I won't ask again."
  );
  return s;
};

const bankRecon: NeoTask = {
  id: "bank-recon",
  title: "Reconcile the bank",
  match: (p) =>
    has(
      p,
      /\b(bank (statement )?(recon\w*|match\w*)|recon\w* (my |the |another )?bank)\b/i
    )
      ? 96
      : 0,
  run: async (api) => {
    const company = api.context.company || getState().company;
    if (company !== NANDHINI_ID) {
      await api.say(
        `No bank data for ${companyOf(company)?.name} yet. Switch to **Nandhini Deluxe** at the top to try.`
      );
      return "No bank data for this client";
    }

    // 1. Upload.
    await api.checkpoint();
    const file = await askStatement(api);
    if (!file) return "Not started";

    // 2. Read it and say what was found.
    api.sources([file]);
    const reading = await api.step(`Reading ${file}`);
    await api.wait(1400);
    reading(`Read ${file}: ${summary().total.n} transactions`);
    await api.say("Here is the statement you uploaded, in Voucher Desk. It is read-only: open it to check the lines against my summary below.");
    // The statement, as the Banking module lists its transactions.
    api.show({
      kind: "voucher-desk",
      batchId: `statement-${file}`,
      state: "ready",
      files: [{ id: "statement", name: file, type: "Bank statement", party: "", amount: 0 }],
      statement: { file: file, lines: summary().total.n },
    });
    await api.say(readingText(file));

    // 3. Settings, first run only.
    await api.checkpoint();
    const settings = await confirmSettings(api);
    if (!settings) return "Not started";

    // 4. Match with Tally.
    const getting = await api.step("Getting your unreconciled vouchers from Tally");
    await api.wait(900);
    getting("Got your unreconciled vouchers from Tally");
    const comparing = await api.step(
      `Matching ${summary().total.n} transactions with your vouchers`
    );
    await api.wait(1300);
    startFlow(file);
    comparing("Matching done");
    await api.checkpoint();

    // 5. The match results, and the Review Table to approve them in.
    const f = flowStats();
    await api.say(
      `**Matching is done.** ${f.toApprove} of ${f.lines} lines are ready for your approval. Open a group to see what I matched and approve it.`
    );
    api.show({ kind: "bank-match" });
    api.show({ kind: "bank-review", quick: true });

    // 6. Create the entries, then sync them to Tally.
    return createThenSync(api);
  },
};

export default bankRecon;
