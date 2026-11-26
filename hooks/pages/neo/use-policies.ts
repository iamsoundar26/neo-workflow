import { useSyncExternalStore } from "react";

/**
 * Accounting policies (19 Nov 2026): short written rules, kept by module. A
 * policy belongs to one module (set when it is added) and records who created
 * it and who last changed it. Editing changes the name, the description and
 * the "last updated" details; the creator never changes.
 *
 * DEV: GET/POST/PATCH /api/companies/:id/accounting-policies?module=.
 */
export const MODULES = ["GST", "Banking", "Purchase", "Sales", "Inventory"] as const;
export type PolicyModule = (typeof MODULES)[number];

export type Policy = {
  id: string;
  module: PolicyModule;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

/** The person using the prototype. */
export const ME = "Soundar R";

const KEY = "neo.policies.v3";
const RULES_KEY = "neo.policy-rules.v1";
const uid = () => Math.random().toString(36).slice(2, 9);

const seed = (
  module: PolicyModule,
  name: string,
  description: string,
  by: string,
  at: string,
  upBy = by,
  upAt = at
): Policy => ({ id: uid(), module, name, description, createdBy: by, createdAt: at, updatedBy: upBy, updatedAt: upAt });

const SAMPLE: Policy[] = [
  seed("GST", "GST rate on services", "Charge 18% GST on professional and consulting services unless the invoice says otherwise.", "Priya Nair", "2026-08-12T10:00:00Z", "Soundar R", "2026-10-30T09:30:00Z"),
  seed("GST", "Input tax credit on vehicles", "Do not claim input tax credit on cars and two-wheelers used by staff.", "Arun Kumar", "2026-09-02T10:00:00Z"),
  seed("GST", "Reverse charge on rent", "Treat rent paid to an unregistered owner as reverse charge and book the tax on the same date.", "Priya Nair", "2026-09-21T10:00:00Z"),
  seed("Banking", "Match bank lines to vouchers", "Match a bank line to a voucher when the amount, date and reference are the same. Allow Rs 10 and 3 days of difference.", "Soundar R", "2026-08-05T10:00:00Z", "Priya Nair", "2026-11-04T14:15:00Z"),
  seed("Banking", "Bank charges and interest", "Post bank and SMS charges to Bank Charges and interest received to Interest Income.", "Arun Kumar", "2026-08-19T10:00:00Z"),
  seed("Banking", "Large payments", "Ask for approval before posting any bank payment of Rs 50,000 or more.", "Priya Nair", "2026-10-08T10:00:00Z"),
  seed("Purchase", "Purchase bill approval", "Bills above Rs 25,000 need a second approver before they are posted.", "Arun Kumar", "2026-07-28T10:00:00Z", "Soundar R", "2026-11-11T11:00:00Z"),
  seed("Purchase", "TDS on contractors", "Deduct TDS under 194C on payments to contractors above Rs 30,000 in a single bill.", "Priya Nair", "2026-09-14T10:00:00Z"),
  seed("Sales", "Payment terms", "Use 30 days as the default payment term on all sales invoices.", "Soundar R", "2026-08-01T10:00:00Z"),
  seed("Sales", "Credit notes", "Raise a credit note within the same month a sale is returned or cancelled.", "Arun Kumar", "2026-10-17T10:00:00Z"),
  seed("Inventory", "Stock valuation", "Value closing stock at the weighted average cost.", "Priya Nair", "2026-08-09T10:00:00Z", "Arun Kumar", "2026-10-02T16:45:00Z"),
];

/**
 * Rules (19 Nov 2026): the "when this, do that" cases of a module, kept beside
 * its policies. A policy says what the company does; a rule says what Neo does
 * automatically when a line or a bill looks a certain way.
 */
export type Rule = {
  id: string;
  module: PolicyModule;
  when: string;
  whenValue: string;
  then: string;
  thenValue: string;
  active: boolean;
  updatedBy: string;
  updatedAt: string;
};

export const RULE_OPTIONS: Record<PolicyModule, { when: string[]; then: string[] }> = {
  GST: { when: ["Item or service is", "Party is", "Amount is above (₹)"], then: ["Charge GST at (%)", "Do not claim input credit", "Treat as reverse charge"] },
  Banking: { when: ["Bank narration contains", "Amount is above (₹)", "Party is"], then: ["Post to ledger", "Ask me before posting", "Post as a contra entry"] },
  Purchase: { when: ["Bill amount is above (₹)", "Supplier is", "Item is"], then: ["Ask for a second approval", "Deduct TDS under section", "Post to ledger"] },
  Sales: { when: ["Customer is", "Invoice amount is above (₹)", "Item is"], then: ["Use payment terms of (days)", "Ask me before posting", "Add a discount of (%)"] },
  Inventory: { when: ["Item group is", "Stock falls below (units)", "Item is"], then: ["Value at", "Tell me to reorder", "Do not track stock"] },
};

const rule = (module: PolicyModule, when: string, whenValue: string, then: string, thenValue: string, active = true, upBy = "Priya Nair", upAt = "2026-10-20T10:00:00Z"): Rule => ({
  id: uid(), module, when, whenValue, then, thenValue, active, updatedBy: upBy, updatedAt: upAt,
});
const SAMPLE_RULES: Rule[] = [
  rule("GST", "Item or service is", "Consulting", "Charge GST at (%)", "18"),
  rule("GST", "Party is", "Staff reimbursements", "Do not claim input credit", "—", false, "Arun Kumar", "2026-09-30T10:00:00Z"),
  rule("Banking", "Bank narration contains", "SMS CHGS", "Post to ledger", "Bank Charges"),
  rule("Banking", "Bank narration contains", "INT CREDIT", "Post to ledger", "Interest Income"),
  rule("Banking", "Amount is above (₹)", "50000", "Ask me before posting", "—", true, "Soundar R", "2026-11-04T10:00:00Z"),
  rule("Purchase", "Bill amount is above (₹)", "25000", "Ask for a second approval", "—"),
  rule("Sales", "Customer is", "Retail walk-in", "Use payment terms of (days)", "0"),
  rule("Inventory", "Stock falls below (units)", "20", "Tell me to reorder", "—"),
];

let state: Policy[] | null = null;
let rules: Rule[] | null = null;
let loaded = false;
const listeners = new Set<() => void>();

const load = () => {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? (JSON.parse(raw) as Policy[]) : null;
    const r = window.localStorage.getItem(RULES_KEY);
    rules = r ? (JSON.parse(r) as Rule[]) : null;
  } catch {
    state = null;
    rules = null;
  }
  state ??= SAMPLE;
  rules ??= SAMPLE_RULES;
};
const set = (next: Policy[]) => {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the policies hold for this visit */
  }
  listeners.forEach((f) => f());
};

export const getPolicies = () => {
  load();
  return state!;
};
export const usePolicies = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => (typeof window === "undefined" ? [] : getPolicies()),
    () => []
  );

export const deletePolicy = (id: string) => set(getPolicies().filter((p) => p.id !== id));

export const addPolicy = (module: PolicyModule, v: Pick<Policy, "name" | "description">) => {
  const now = new Date().toISOString();
  const id = uid();
  set([
    { id, module, name: v.name.trim(), description: v.description.trim(), createdBy: ME, createdAt: now, updatedBy: ME, updatedAt: now },
    ...getPolicies(),
  ]);
  return id;
};

/** Changes the text and the "last updated" details. Created by and created date stay. */
export const editPolicy = (id: string, v: Pick<Policy, "name" | "description">) =>
  set(
    getPolicies().map((p) =>
      p.id === id
        ? { ...p, name: v.name.trim(), description: v.description.trim(), updatedBy: ME, updatedAt: new Date().toISOString() }
        : p
    )
  );

/* ------------------------------------------------------------------ rules */

const setRules = (next: Rule[]) => {
  rules = next;
  try {
    window.localStorage.setItem(RULES_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  listeners.forEach((f) => f());
};
export const getRules = () => {
  load();
  return rules!;
};
export const useRules = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => (typeof window === "undefined" ? [] : getRules()),
    () => []
  );

type RuleBody = Pick<Rule, "when" | "whenValue" | "then" | "thenValue">;
export const addRule = (module: PolicyModule, v: RuleBody) =>
  setRules([{ ...v, id: uid(), module, active: true, updatedBy: ME, updatedAt: new Date().toISOString() }, ...getRules()]);
export const editRule = (id: string, v: RuleBody) =>
  setRules(getRules().map((r) => (r.id === id ? { ...r, ...v, updatedBy: ME, updatedAt: new Date().toISOString() } : r)));
export const toggleRule = (id: string) =>
  setRules(getRules().map((r) => (r.id === id ? { ...r, active: !r.active, updatedBy: ME, updatedAt: new Date().toISOString() } : r)));
export const deleteRule = (id: string) => setRules(getRules().filter((r) => r.id !== id));
