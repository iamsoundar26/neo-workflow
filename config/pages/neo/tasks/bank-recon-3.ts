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
  saveBankSettings,
} from "@/hooks/pages/neo/use-bank-recon";
import type {
  NeoCard,
  NeoTask,
  NeoTaskApi,
  NeoUploadFile,
} from "@/types/pages/neo";
import { has } from "@/utils/pages/neo";
import {
  chosenMatchSettings,
  getSavedMatchSettings,
} from "@/config/pages/neo/match-settings";
import { startFlow } from "@/hooks/pages/neo/use-bank-review";
import { createThenSync, presentReview } from "./bank-review";

/**
 * Bank reconciliation 3 (20 Nov 2026), a copy of Bank reconciliation 2 to iterate on; it shares its flow and stores, the workspace version; the original
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

/**
 * The match settings: the PM's card, in the chat. Defaults are pre-filled and
 * accepted in one click; later runs show one line with a Review link.
 */
const confirmSettings = async (api: NeoTaskApi): Promise<BankSettings | null> => {
  const saved = getSavedMatchSettings();
  await api.say(
    `Your ${WS_INFO.account} statement for ${WS_INFO.period} is ready (${n(WS_INFO.total)} lines).\n\n${saved ? "Here are the settings I'll match with." : "Before I match it with your Tally vouchers, check how I'll do it:"}`
  );
  const card: Extract<NeoCard, { kind: "match-settings" }> = {
    kind: "match-settings",
    saved: !!saved,
    initial: saved ?? undefined,
  };
  const choice = await api.card(card, [{ id: "cancel", label: "Cancel" }]);
  if (choice === "cancel") return null;
  const { settings: m, once } = chosenMatchSettings();
  const s: BankSettings = {
    ledger: BANK_DEFAULTS.ledger,
    tolerance: m.amountOn ? m.amountAbs : 0,
    dateWindow: m.dateOn ? m.dateDays : 0,
    materiality: BANK_DEFAULTS.materiality,
    group: m.group,
  };
  if (!once) {
    saveBankSettings(s);
    await api.say("Saved to your Accounting Policy. I'll use these next time.");
  }
  return s;
};

/** The match results: the diagram, then one tile per group. */
const present = async (api: NeoTaskApi, _run: WsRun) => {
  await presentReview(api);
};

const bankRecon3: NeoTask = {
  id: "bank-recon-3",
  title: "Reconcile the bank (workspace, v3)",
  match: (p) =>
    has(
      p,
      /\b(bank (statement )?(recon\w*|match\w*)|recon\w* (my |the |another )?bank( statement)?)\s*(3|three|v3)\b/i
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

export default bankRecon3;
