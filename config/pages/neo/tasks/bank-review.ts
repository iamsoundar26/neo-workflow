import { createEntries, flowStats, syncEntries } from "@/hooks/pages/neo/use-bank-review";
import { entriesInWords } from "@/components/neo/common/bank-flow/stage-card";
import type { NeoTaskApi } from "@/types/pages/neo";

/**
 * The match results (20 Nov 2026): one short line, then one table with a row per
 * match status. Each row has its own Approve or Review button and a View button
 * that opens the Review Table on that group. Balances, recon and sync status
 * belong to later stages.
 */
export const presentReview = async (api: NeoTaskApi) => {
  const f = flowStats();
  await api.say(`**Matching is done.** ${f.toApprove} of ${f.lines} lines are ready for your approval.`);
  api.show({ kind: "bank-review" });
};

/**
 * What comes after the approvals, in both bank reconciliations: Neo asks to
 * create the entries for what was approved, then to send them to Tally.
 * Nothing reaches Tally before the second answer.
 */
export const createThenSync = async (api: NeoTaskApi): Promise<string> => {
  // 6. The first question: create the entries for what was approved.
  await api.checkpoint();
  let create = "go";
  for (;;) {
    create = await api.card({ kind: "bank-stage", stage: "create" }, [
      { id: "go", label: "Create entries", primary: true },
      { id: "later", label: "Not now" },
    ]);
    if (create !== "go" || flowStats().create.lines > 0) break;
    // A shortcut can answer before anything is approved: ask again.
    await api.say("Nothing is approved yet, so there are no entries to create. Approve a group first.");
  }
  if (create !== "go") {
    await api.say(
      "Your approvals are saved and nothing was created. Ask me to reconcile the bank again when you are ready."
    );
    return "Approvals saved";
  }
  const creating = await api.step("Creating the entries in AI Accountant");
  await api.wait(1500);
  const made = createEntries();
  const words = entriesInWords({
    vouchers: made.vouchers,
    ledgers: made.ledgers.length,
    updates: made.updates,
  });
  creating(`Created ${words}`);
  await api.say(
    `**The entries are ready:** ${words}. They are in AI Accountant and not in Tally yet.`
  );

  // The second question: send them to Tally.
  await api.checkpoint();
  const sync = await api.card({ kind: "bank-stage", stage: "sync" }, [
    { id: "sync", label: "Sync to Tally", primary: true, risk: "commit" },
    { id: "later", label: "Not now" },
  ]);
  if (sync !== "sync") {
    await api.say(
      "Not synced. The entries stay in AI Accountant, and nothing was sent to Tally."
    );
    return "Entries created";
  }
  const sending = await api.step("Sending the entries to Tally");
  await api.wait(1500);
  const sent = syncEntries();
  sending(`Sent ${sent} ${sent === 1 ? "entry" : "entries"} to Tally`);
  const left = flowStats().pending;
  await api.say(
    [
      `**Done.** ${sent} ${sent === 1 ? "line" : "lines"} reconciled and synced to Tally.`,
      left ? `${left} ${left === 1 ? "line was" : "lines were"} left pending and not sent. They stay in the Review Table.` : "",
      "Here is where each group ended up:",
    ]
      .filter(Boolean)
      .join("\n\n")
  );
  api.show({ kind: "bank-review", summary: true });
  await api.say("This run is saved in your reconciliation history.");
  api.suggest(["Reconcile another bank account"]);
  return "Synced";
};
