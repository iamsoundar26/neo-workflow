import { companyOf, getState } from "@/components/inbox/v2/store";
import { NANDHINI_ID } from "@/config/pages/neo/mock-recon";
import {
  BANK_DEFAULTS,
  BANK_LEDGERS,
  type BankSettings,
} from "@/config/pages/neo/mock-bank-recon";
import {
  WS_INFO,
  wsClosing,
  wsDirection,
} from "@/config/pages/neo/mock-bank-ws";
import {
  deriveWs,
  getWs,
  startWs,
  type WsRun,
} from "@/hooks/pages/neo/use-bank-ws";
import {
  getSavedBankSettings,
  saveBankSettings,
} from "@/hooks/pages/neo/use-bank-recon";
import type {
  NeoCard,
  NeoTask,
  NeoTaskApi,
  NeoUploadFile,
} from "@/types/pages/neo";
import { has } from "@/utils/pages/neo";
import { decide } from "./shared";
import { startFlow } from "@/hooks/pages/neo/use-bank-review";
import { createThenSync, presentReview } from "./bank-review";

/**
 * Bank reconciliation 2 (13 Nov 2026), the workspace version; the original
 * keeps the line-by-line chat review in bank-recon.ts: upload the statement, Neo reads it and
 * says what it found, you confirm, the settings are asked once and saved, and Neo matches all 5,000 transactions. The chat
 * says how many matched and how many need you, and ends on one Bank
 * Reconciliation artifact. Everything after that happens in the side panel,
 * which opens only when the artifact is clicked.
 *
 * DEV: POST /api/bank-recon/runs; the Tally reads and writes go through the
 * connector.
 */

const n = (x: number) => x.toLocaleString("en-IN");
const rupees = (x: number) => `₹${n(x)}`;

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
      period: WS_INFO.periodLong,
      from: WS_INFO.from,
      to: WS_INFO.to,
    },
    files: api.attachments.map(
      (h): NeoUploadFile => ({ slot: "", name: h.name, size: h.size ?? 0 })
    ),
  };
  card.sample = [
    {
      slot: "bank",
      name: WS_INFO.file.name,
      size: WS_INFO.file.size,
      state: "ready",
      label: `${WS_INFO.account} · Bank statement`,
      range: WS_INFO.period,
      rows: WS_INFO.total,
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
  const own = card.files.find((f) => f.state === "ready" && f.slot)?.name;
  return { file: own || WS_INFO.file.name };
};

/**
 * A yes/no question that takes over the prompt box, the way the settings
 * sheet does, instead of a separate card above it. Returns the option picked,
 * or null when it was cancelled.
 */
const confirm = async (
  api: NeoTaskApi,
  title: string,
  question: string,
  options: { id: string; label: string }[],
  go: string
) => {
  const card = {
    kind: "decisions" as const,
    title,
    items: [
      {
        id: "answer",
        question,
        options,
        recommended: options[0].id,
        pick: options[0].id,
      },
    ],
  };
  const choice = await api.card(card, [
    { id: "go", label: go, primary: true },
    { id: "cancel", label: "Cancel" },
  ]);
  return choice === "go" ? card.items[0].pick : null;
};

/** What Neo read from the statement, as a table. */
const readingText = (file: string) => {
  const d = wsDirection();
  return [
    `I read **${file}**. Here is what I found:`,
    "",
    "| Statement | Details |",
    "|---|---|",
    `| Bank | ${WS_INFO.bank}, ${WS_INFO.account} |`,
    `| Period | ${WS_INFO.period} |`,
    `| Transactions | ${n(WS_INFO.total)} (${n(d.in)} money in, ${n(d.out)} money out) |`,
    `| Balances | Opening ${rupees(WS_INFO.opening)}, closing ${rupees(wsClosing())} |`,
    "| Missing days | None. The statement covers the whole month. |",
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
        recommended: BANK_LEDGERS[0],
        options: BANK_LEDGERS.map((l) => ({ id: l, label: l })),
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

/** The match results: the diagram, then one tile per group. */
const present = async (api: NeoTaskApi, _run: WsRun) => {
  await presentReview(api);
};

const bankRecon2: NeoTask = {
  id: "bank-recon-2",
  title: "Reconcile the bank (workspace)",
  match: (p) =>
    has(
      p,
      /\b(bank (statement )?(recon\w*|match\w*)|recon\w* (my |the |another )?bank( statement)?)\s*(2|two|v2)\b/i
    )
      ? 97
      : 0,
  run: async (api) => {
    const company = api.context.company || getState().company;
    if (company !== NANDHINI_ID) {
      await api.say(
        `No bank data for ${companyOf(company)?.name} yet. Switch to **Nandhini Deluxe** at the top to try.`
      );
      return "No bank data for this client";
    }

    // Pick up a run left half way.
    const prior = getWs();
    if (prior.run && prior.sync.state !== "running") {
      const c = deriveWs(prior).counts;
      if (c.approvedMatches + c.approvedNew + c.synced > 0 && c.pending > 0) {
        const again = await confirm(
          api,
          "Pick up where you left off",
          `You have a reconciliation for ${WS_INFO.account}, ${WS_INFO.periodLong} in progress: ${n(c.approvedMatches + c.approvedNew)} approved, ${n(c.pending)} pending. Continue it?`,
          [
            { id: "continue", label: "Yes, continue it" },
            { id: "new", label: "No, start a new one" },
          ],
          "Continue"
        );
        if (again === null) return "Not started";
        if (again === "continue") {
          await api.say("Here is where you left off. Your approvals are saved.");
          api.show({ kind: "bank-ws", runId: prior.run.id });
          return "Resumed";
        }
      }
    }

    // 2. Upload.
    await api.checkpoint();
    const up = await askStatement(api);
    if (!up) return "Not started";

    // 3. Read it, say what was found, ask to confirm.
    api.sources([up.file]);
    const reading = await api.step(`Reading ${up.file}`);
    await api.wait(1400);
    reading(`Read ${up.file}: ${n(WS_INFO.total)} transactions`);
    await api.say("Here is the statement you uploaded, in Voucher Desk. It is read-only: open it to check the lines against my summary below.");
    // The statement, as the Banking module lists its transactions.
    api.show({
      kind: "voucher-desk",
      batchId: `statement-${up.file}`,
      state: "ready",
      files: [{ id: "statement", name: up.file, type: "Bank statement", party: "", amount: 0 }],
      statement: { file: up.file, lines: WS_INFO.total, source: "ws" },
    });
    await api.say(readingText(up.file));
    const ok = await confirm(
      api,
      "Check the statement",
      "Does this look right?",
      [
        { id: "yes", label: "Yes, continue" },
        { id: "no", label: "No, I'll upload another file" },
      ],
      "Continue"
    );
    if (ok !== "yes") {
      await api.say("No problem. Ask me again when you have the right statement.");
      return "Statement not confirmed";
    }

    // 4. Settings, first run only.
    await api.checkpoint();
    const settings = await confirmSettings(api);
    if (!settings) return "Not started";

    // 5. The Tally vouchers.
    const getting = await api.step("Getting your unreconciled vouchers from Tally");
    await api.wait(900);
    getting("Got your unreconciled vouchers from Tally");

    // 6. Match, with brief progress.
    const comparing = await api.step(
      `Comparing ${n(WS_INFO.total)} transactions with your vouchers`
    );
    for (let i = 1; i <= 5; i++) {
      api.status("Matching your bank statement", {
        done: i * 1000,
        total: WS_INFO.total,
      });
      await api.wait(380);
    }
    // The run the approvals, the entries and the sync are kept in.
    startFlow(up.file);
    startWs(
      {
        tolerance: settings.tolerance,
        dateWindow: settings.dateWindow,
        materiality: settings.materiality,
      }
    );
    const c = deriveWs().counts;
    comparing(
      `${n(c.exact.total)} exact, ${n(c.review.total)} to review, ${n(c.fresh.total)} new`
    );
    api.status(null);
    await api.checkpoint();
    await present(api, getWs().run!);
    // Then: create the entries for what is approved, and sync them to Tally.
    return createThenSync(api);
  },
};

export default bankRecon2;
