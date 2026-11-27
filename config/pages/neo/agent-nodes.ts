import { BANK2_AGENT_ID, BANK3_AGENT_ID } from "@/config/pages/neo/mock-agents";
import { MATCH_DEFAULTS, type MatchSettings } from "@/config/pages/neo/match-settings";

/**
 * An agent as a workflow of nodes (27 Nov 2026), after the Korefi agent page
 * and the node types product laid out: Trigger, Input / data, Processing,
 * Validation, Decision, AI reasoning, Human intervention, Action / output.
 *
 * Each node lists the fields it takes, so the configuration panel is drawn
 * from this and nothing else; adding an agent, or a field, is data only.
 * Values live under "<node id>.<field key>".
 *
 * DEV: GET /api/neo/agents/:id/workflow returns { nodes }; PUT .../config
 * saves { values } as the person edits.
 */
export type NodeType =
  | "trigger"
  | "input"
  | "processing"
  | "validation"
  | "decision"
  | "ai"
  | "human"
  | "action";

export const NODE_TYPES: Record<NodeType, { label: string; help: string; example: string }> = {
  trigger: { label: "Trigger", help: "Determines when the workflow should start.", example: "Manual request, file uploaded, scheduled execution" },
  input: { label: "Input / data", help: "Collects the information required for execution.", example: "Bank statement, ledger data, accounting policies" },
  processing: { label: "Processing", help: "Reads, extracts or transforms information.", example: "Extract transactions from a PDF" },
  validation: { label: "Validation", help: "Checks whether the information is correct and complete.", example: "Check duplicate entries, balances and dates" },
  decision: { label: "Decision", help: "Determines which path the workflow should follow.", example: "Exact match, potential match or no match" },
  ai: { label: "AI reasoning", help: "Interprets information and recommends a resolution.", example: "Suggest a ledger or explain a matching difference" },
  human: { label: "Human intervention", help: "Waits for clarification, review or approval.", example: "Approve 920 exact matches" },
  action: { label: "Action / output", help: "Performs an authorised action or returns a result.", example: "Post entries, update records, generate summary" },
};

export type Option = { v: string; l: string };
export type Field =
  | { kind: "select"; key: string; label: string; options: Option[]; def: string }
  | { kind: "toggle"; key: string; label: string; hint?: string; def: boolean }
  | { kind: "checks"; key: string; label: string; options: { k: string; l: string }[]; def: string[] }
  | { kind: "text"; key: string; label: string; placeholder: string; def: string }
  | { kind: "match"; key: string; label: string };

export type AgentNode = {
  id: string;
  type: NodeType;
  title: string;
  /** Under the node in the row: what it holds, in a few words. */
  sub: string;
  fields: Field[];
  /** Where the work splits by what the node finds: drawn as paths on the canvas. */
  branches?: { label: string; note: string; tone: "ok" | "ask" | "new"; goes: string }[];
};

export type Values = Record<string, unknown>;
export const vkey = (node: string, field: string) => `${node}.${field}`;

/** The flow every agent gets, filled with the agent's own words. */
const generic = (sources: string[]): AgentNode[] => [
  {
    id: "trigger",
    type: "trigger",
    title: "When it starts",
    sub: "You ask",
    fields: [
      { kind: "select", key: "start", label: "Starts when", def: "ask", options: [{ v: "ask", l: "You ask in chat" }, { v: "file", l: "A file is shared" }, { v: "schedule", l: "On a schedule" }] },
      { kind: "select", key: "when", label: "Repeats", def: "never", options: [{ v: "never", l: "Doesn't repeat" }, { v: "week", l: "Every Monday, 8 AM" }, { v: "month", l: "On the 1st of the month" }] },
    ],
  },
  {
    id: "input",
    type: "input",
    title: "What it reads",
    sub: sources.slice(0, 2).join(", ") || "Your data",
    fields: [{ kind: "checks", key: "sources", label: "Reads", def: sources, options: sources.map((s) => ({ k: s, l: s })) }],
  },
  {
    id: "work",
    type: "processing",
    title: "Prepare the work",
    sub: "Reads and compares",
    fields: [
      { kind: "toggle", key: "ocr", label: "Read scanned pages", hint: "For photos and scans", def: false },
      { kind: "text", key: "notes", label: "Tell Neo more", placeholder: "Anything Neo should know, in your own words", def: "" },
    ],
  },
  {
    id: "review",
    type: "human",
    title: "You check it",
    sub: "Approve or change",
    fields: [
      { kind: "select", key: "mode", label: "Ask me to approve", def: "all", options: [{ v: "all", l: "Everything, before it moves on" }, { v: "diff", l: "Only what differs" }] },
    ],
  },
  {
    id: "out",
    type: "action",
    title: "What you get",
    sub: "A summary",
    fields: [
      { kind: "select", key: "format", label: "Send the result as", def: "chat", options: [{ v: "chat", l: "A message in chat" }, { v: "xlsx", l: "An Excel file" }, { v: "pdf", l: "A PDF" }] },
    ],
  },
];

/** Bank reconciliation, in the eight node types. */
const bank = (): AgentNode[] => [
  {
    id: "trigger",
    type: "trigger",
    title: "Statement shared",
    sub: "You share a file",
    fields: [
      { kind: "select", key: "start", label: "Starts when", def: "file", options: [{ v: "file", l: "You share a statement" }, { v: "ask", l: "You ask in chat" }, { v: "schedule", l: "On a schedule" }] },
      { kind: "select", key: "when", label: "Repeats", def: "never", options: [{ v: "never", l: "Doesn't repeat" }, { v: "week", l: "Every Monday, 8 AM" }, { v: "month", l: "On the 1st of the month" }] },
      { kind: "checks", key: "files", label: "Accepts", def: ["pdf", "xlsx"], options: [{ k: "pdf", l: "PDF" }, { k: "xlsx", l: "Excel" }, { k: "csv", l: "CSV" }] },
    ],
  },
  {
    id: "input",
    type: "input",
    title: "Statement and books",
    sub: "Statement, vouchers, policy",
    fields: [
      { kind: "checks", key: "sources", label: "Reads", def: ["statement", "vouchers", "policy"], options: [{ k: "statement", l: "Bank statement" }, { k: "vouchers", l: "Bank vouchers from Tally" }, { k: "policy", l: "Accounting policy" }] },
      { kind: "select", key: "period", label: "Period", def: "statement", options: [{ v: "statement", l: "The statement's own period" }, { v: "month", l: "One month, which I pick" }] },
    ],
  },
  {
    id: "read",
    type: "processing",
    title: "Read the statement",
    sub: "Lines, dates, amounts",
    fields: [
      { kind: "toggle", key: "bank", label: "Find the bank and account", hint: "From the statement itself", def: true },
      { kind: "toggle", key: "ocr", label: "Read scanned pages", hint: "For photos and scans", def: false },
      { kind: "select", key: "locked", label: "Password-protected file", def: "ask", options: [{ v: "ask", l: "Ask me for the password" }, { v: "skip", l: "Skip the file" }] },
    ],
  },
  {
    id: "check",
    type: "validation",
    title: "Check the statement",
    sub: "Balances, dates, duplicates",
    fields: [
      { kind: "checks", key: "checks", label: "Check", def: ["dup", "bal", "dates"], options: [{ k: "dup", l: "Duplicate lines" }, { k: "bal", l: "Opening and closing balance" }, { k: "dates", l: "Dates inside the period" }] },
      { kind: "select", key: "fail", label: "If a check fails", def: "ask", options: [{ v: "ask", l: "Stop and ask me" }, { v: "flag", l: "Carry on and flag it" }] },
    ],
  },
  {
    id: "decision",
    type: "decision",
    title: "Match line by line",
    sub: "Exact, potential, none",
    fields: [{ kind: "match", key: "match", label: "Matching rules" }],
    branches: [
      { label: "Exact", note: "Matched for you", tone: "ok", goes: "review" },
      { label: "Potential", note: "You review", tone: "ask", goes: "ai" },
      { label: "No match", note: "New entry", tone: "new", goes: "ai" },
    ],
  },
  {
    id: "ai",
    type: "ai",
    title: "Explain the differences",
    sub: "Ledger and reason",
    fields: [
      { kind: "toggle", key: "ledger", label: "Suggest a ledger for new entries", hint: "From your past entries", def: true },
      { kind: "toggle", key: "explain", label: "Explain why a line didn't match", def: true },
      { kind: "select", key: "sure", label: "Only suggest when Neo is", def: "high", options: [{ v: "high", l: "Very sure (90% or more)" }, { v: "mid", l: "Fairly sure (75% or more)" }] },
      { kind: "text", key: "notes", label: "Tell Neo more", placeholder: "e.g. Treat SMS charges as Bank Charges", def: "" },
    ],
  },
  {
    id: "review",
    type: "human",
    title: "Review and approve",
    sub: "You decide",
    fields: [
      { kind: "select", key: "mode", label: "Ask me to approve", def: "bulk", options: [{ v: "bulk", l: "Exact matches in bulk, then what differs" }, { v: "each", l: "Every line, one by one" }, { v: "auto", l: "Exact matches automatically; ask only about the rest" }] },
      { kind: "select", key: "who", label: "Who approves", def: "me", options: [{ v: "me", l: "Me" }, { v: "acct", l: "Any accountant on the team" }] },
      { kind: "select", key: "remind", label: "Remind me after", def: "1d", options: [{ v: "1d", l: "1 day" }, { v: "3d", l: "3 days" }, { v: "never", l: "Never" }] },
    ],
  },
  {
    id: "sync",
    type: "action",
    title: "Sync to Tally",
    sub: "Entries and bank dates",
    fields: [
      { kind: "select", key: "before", label: "Before writing to Tally", def: "ask", options: [{ v: "ask", l: "Ask me to confirm" }, { v: "auto", l: "Write straight away" }] },
      { kind: "checks", key: "fill", label: "Fill if empty", def: ["date", "narr"], options: [{ k: "date", l: "Bank Date" }, { k: "narr", l: "Narration" }, { k: "utr", l: "Cheque / UTR" }, { k: "type", l: "Transaction type" }] },
      { kind: "select", key: "report", label: "Send the summary as", def: "chat", options: [{ v: "chat", l: "A message in chat" }, { v: "xlsx", l: "An Excel file" }, { v: "pdf", l: "A PDF" }] },
    ],
  },
];

/** What a person can ask for in a tap, per flow; each is a few value changes. */
export type Quick = { label: string; set: Values; reply: string; node: string };

const BANK_QUICK: Quick[] = [
  { label: "Run every Monday at 8 AM", set: { "trigger.start": "schedule", "trigger.when": "week" }, reply: "It will now start every Monday at 8 AM.", node: "trigger" },
  { label: "Read scanned statements too", set: { "read.ocr": true }, reply: "I'll read scanned pages as well.", node: "read" },
  { label: "Match amounts within ₹50", set: { "decision.match": { ...MATCH_DEFAULTS, amountAbs: 50 } }, reply: "Lines within ₹50 of a voucher now go to review.", node: "decision" },
  { label: "Approve exact matches for me", set: { "review.mode": "auto" }, reply: "Exact matches will be approved for you. I'll ask only about the rest.", node: "review" },
];
const GENERIC_QUICK: Quick[] = [
  { label: "Run every Monday at 8 AM", set: { "trigger.start": "schedule", "trigger.when": "week" }, reply: "It will now start every Monday at 8 AM.", node: "trigger" },
  { label: "Read scanned pages too", set: { "work.ocr": true }, reply: "I'll read scanned pages as well.", node: "work" },
  { label: "Send the result as Excel", set: { "out.format": "xlsx" }, reply: "You'll get the result as an Excel file.", node: "out" },
];

export type AgentFlow = {
  nodes: AgentNode[];
  quick: Quick[];
  /** Where words that match nothing are kept, so nothing said is lost. */
  notes: { key: string; node: string };
  /** The numbers the person gave: "within ₹50". */
  interpret: (text: string, values: Values) => { set: Values; reply: string; node: string } | null;
};

const interpretBank = (text: string, values: Values) => {
  const t = text.toLowerCase();
  const rupees = t.match(/(?:₹|rs\.?|rupees?)\s*(\d+)|within\s*(\d+)/);
  if (rupees && /(match|within|tolerance|differ)/.test(t)) {
    const n = Number(rupees[1] || rupees[2]);
    const cur = (values["decision.match"] as MatchSettings | undefined) ?? MATCH_DEFAULTS;
    return { set: { "decision.match": { ...cur, amountAbs: n } }, reply: `Lines within ₹${n} of a voucher now go to review.`, node: "decision" };
  }
  const days = t.match(/(\d+)\s*days?/);
  if (days && /(date|within|window)/.test(t)) {
    const cur = (values["decision.match"] as MatchSettings | undefined) ?? MATCH_DEFAULTS;
    return { set: { "decision.match": { ...cur, dateDays: Number(days[1]) } }, reply: `Dates up to ${days[1]} days apart are now suggested for review.`, node: "decision" };
  }
  if (/(monday|weekly|every week|schedule)/.test(t)) return { set: { "trigger.start": "schedule", "trigger.when": "week" }, reply: "It will now start every Monday at 8 AM.", node: "trigger" };
  if (/(scan|ocr|photo)/.test(t)) return { set: { "read.ocr": true }, reply: "I'll read scanned pages as well.", node: "read" };
  if (/(approve|approval)/.test(t) && /(auto|exact|for me)/.test(t)) return { set: { "review.mode": "auto" }, reply: "Exact matches will be approved for you. I'll ask only about the rest.", node: "review" };
  if (/(tally)/.test(t) && /(ask|confirm|before)/.test(t)) return { set: { "sync.before": "ask" }, reply: "I'll ask you before anything goes to Tally.", node: "sync" };
  if (/(excel|xlsx)/.test(t)) return { set: { "sync.report": "xlsx" }, reply: "You'll get the summary as an Excel file.", node: "sync" };
  return null;
};
const interpretGeneric = (text: string) => {
  const t = text.toLowerCase();
  if (/(monday|weekly|every week|schedule)/.test(t)) return { set: { "trigger.start": "schedule", "trigger.when": "week" }, reply: "It will now start every Monday at 8 AM.", node: "trigger" };
  if (/(scan|ocr|photo)/.test(t)) return { set: { "work.ocr": true }, reply: "I'll read scanned pages as well.", node: "work" };
  if (/(excel|xlsx)/.test(t)) return { set: { "out.format": "xlsx" }, reply: "You'll get the result as an Excel file.", node: "out" };
  return null;
};

export const flowFor = (agentId: string, sources: string[]): AgentFlow =>
  agentId === BANK3_AGENT_ID || agentId === BANK2_AGENT_ID
    ? { nodes: bank(), quick: BANK_QUICK, notes: { key: "ai.notes", node: "ai" }, interpret: interpretBank }
    : { nodes: generic(sources), quick: GENERIC_QUICK, notes: { key: "work.notes", node: "work" }, interpret: (t) => interpretGeneric(t) };

/** Each field's starting value. */
export const defaultsOf = (nodes: AgentNode[]): Values => {
  const v: Values = {};
  for (const n of nodes)
    for (const f of n.fields) v[vkey(n.id, f.key)] = f.kind === "match" ? MATCH_DEFAULTS : f.def;
  return v;
};
