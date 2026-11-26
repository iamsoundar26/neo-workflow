import { BANK3_AGENT_ID } from "@/config/pages/neo/mock-agents";

/**
 * An agent's workflow, as steps (26 Nov 2026): who does each one (Neo, you,
 * or Tally), what it reads and writes, and what the last run did. The same
 * list draws the Workflow tab; it is a description of the agent, not a
 * builder, so there is nothing here the agent has to obey.
 *
 * DEV: GET /api/neo/agents/:id/workflow returns { steps, lastRun } built from
 * the agent's skill list; per-step status comes from the run log.
 */
export type FlowActor = "neo" | "you" | "tally";

export type FlowStep = {
  id: string;
  title: string;
  actor: FlowActor;
  /** One line, plain words. */
  summary: string;
  /** What it does, a few short lines. */
  detail: string[];
  reads?: string;
  writes?: string;
  /** A setting that changes this step, with where to change it. */
  setting?: { label: string; href: string };
  /** Where the work splits by what Neo finds. */
  branches?: { label: string; note: string; tone: "ok" | "ask" | "new" }[];
  /** The last run, for the overlay. */
  last?: { took: string; note: string };
};

export const ACTOR_LABEL: Record<FlowActor, string> = {
  neo: "Neo does",
  you: "You decide",
  tally: "In Tally",
};

const BANK3: FlowStep[] = [
  {
    id: "upload",
    title: "You share the bank statement",
    actor: "you",
    summary: "PDF or Excel, any bank.",
    detail: ["Drop the file in the chat or pick it from your files.", "Neo asks for the account and month only if it can't tell."],
    writes: "Nothing yet",
    last: { took: "—", note: "HDFC statement, Sep 2026" },
  },
  {
    id: "read",
    title: "Neo reads the statement",
    actor: "neo",
    summary: "Finds the bank, the dates and every transaction.",
    detail: ["Works out the bank, account and period.", "Lists each line with date, narration, reference and amount.", "Tells you if a page could not be read."],
    reads: "Bank statement",
    last: { took: "6s", note: "5,000 lines read" },
  },
  {
    id: "settings",
    title: "Confirm how to match",
    actor: "you",
    summary: "One short card; skipped when your saved settings are enough.",
    detail: ["Shows the match settings in plain words.", "Use them as saved, change them, or use different ones for this statement only."],
    setting: { label: "Edit in Accounting policy", href: "/inbox?module=NEO&page=policy" },
    last: { took: "—", note: "Used your saved settings" },
  },
  {
    id: "vouchers",
    title: "Neo gets your bank vouchers",
    actor: "tally",
    summary: "Unreconciled vouchers for this account and period.",
    detail: ["Read-only: nothing in Tally changes in this step."],
    reads: "Bank vouchers",
    last: { took: "3s", note: "4,862 vouchers" },
  },
  {
    id: "match",
    title: "Neo matches line by line",
    actor: "neo",
    summary: "Each line is matched to a voucher, even one line to several.",
    detail: ["Amount and date first, then reference and narration.", "Small differences go to review instead of matching on their own."],
    reads: "Statement lines, vouchers",
    setting: { label: "Matching rules", href: "/inbox?module=NEO&page=policy" },
    branches: [
      { label: "Exact", note: "Matched for you", tone: "ok" },
      { label: "Potential", note: "You review", tone: "ask" },
      { label: "No match", note: "New entry", tone: "new" },
    ],
    last: { took: "14s", note: "9 exact · 6 potential · 6 no match" },
  },
  {
    id: "review",
    title: "You review and approve",
    actor: "you",
    summary: "Approve in bulk, then look at what differs.",
    detail: ["Approve all exact matches in one click.", "Open any line to see the voucher beside it.", "Nothing moves on until you say so."],
    last: { took: "4 min", note: "21 of 22 approved" },
  },
  {
    id: "entries",
    title: "Neo drafts the missing entries",
    actor: "neo",
    summary: "A voucher for each line with no match, ready to change.",
    detail: ["Picks the ledger from your past entries.", "Leaves anything it is unsure about for you."],
    writes: "Draft vouchers",
    last: { took: "5s", note: "6 drafts" },
  },
  {
    id: "sync",
    title: "Neo syncs to Tally",
    actor: "tally",
    summary: "Only after you confirm.",
    detail: ["Writes the new vouchers and sets the bank date on matched ones.", "Fills only fields that are empty."],
    writes: "Vouchers and bank dates",
    last: { took: "8s", note: "22 lines reconciled" },
  },
];

export const flowFor = (agentId: string): FlowStep[] | undefined =>
  agentId === BANK3_AGENT_ID ? BANK3 : undefined;
