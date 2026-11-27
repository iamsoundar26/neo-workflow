import { useCallback, useEffect, useReducer } from "react";
import { defaultsOf, type AgentNode, type Values } from "@/config/pages/neo/agent-nodes";
import { MATCH_DEFAULTS, saveMatchSettings, type MatchSettings } from "@/config/pages/neo/match-settings";

/**
 * What a person has set on an agent (27 Nov 2026). It saves as they go, and
 * every change can be undone and redone: one change, or one chat request that
 * touches several fields, is one step. Kept on this device.
 *
 * The matching rules are the same ones the bank agent asks about and the
 * Accounting policy holds, so a change here is what the next run uses.
 *
 * DEV: PUT /api/neo/agents/:id/config with { values }; history stays in the
 * browser for the session.
 */
const KEY = (id: string) => `neo.agent-config.v1.${id}`;

/** The node a field belongs to: "decision.match" is the Decision node's. */
const nodeOf = (key: string) => key.split(".")[0];
/** The nodes whose fields differ between two sets of values. */
const changedNodes = (a: Values, b: Values, at: number, into: Record<string, number>) => {
  const out = { ...into };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[nodeOf(k)] = at;
  return out;
};

type State = {
  values: Values;
  past: Values[];
  future: Values[];
  ready: boolean;
  /** When each node last changed, to say "Saved" where it happened. */
  touched: Record<string, number>;
  /** When anything last changed. */
  at: number | null;
};
type Action =
  | { t: "load"; values: Values }
  | { t: "patch"; set: Values }
  | { t: "undo" }
  | { t: "redo" };

const reduce = (s: State, a: Action): State => {
  switch (a.t) {
    case "load":
      return { values: a.values, past: [], future: [], ready: true, touched: {}, at: null };
    case "patch": {
      const values = { ...s.values, ...a.set };
      const now = Date.now();
      return { ...s, values, past: [...s.past, s.values], future: [], touched: changedNodes(s.values, values, now, s.touched), at: now };
    }
    case "undo": {
      if (!s.past.length) return s;
      const values = s.past[s.past.length - 1];
      const now = Date.now();
      return { ...s, values, past: s.past.slice(0, -1), future: [s.values, ...s.future], touched: changedNodes(s.values, values, now, s.touched), at: now };
    }
    case "redo": {
      if (!s.future.length) return s;
      const values = s.future[0];
      const now = Date.now();
      return { ...s, values, past: [...s.past, s.values], future: s.future.slice(1), touched: changedNodes(s.values, values, now, s.touched), at: now };
    }
  }
};

export const useAgentConfig = (agentId: string, nodes: AgentNode[]) => {
  const [s, dispatch] = useReducer(reduce, undefined, () => ({
    values: defaultsOf(nodes),
    past: [],
    future: [],
    ready: false,
    touched: {},
    at: null,
  }));

  // Fresh when the agent changes; then whatever was saved for it.
  useEffect(() => {
    let v = defaultsOf(nodes);
    try {
      const raw = window.localStorage.getItem(KEY(agentId));
      if (raw) v = { ...v, ...JSON.parse(raw) };
    } catch {
      /* private window: start from the defaults */
    }
    dispatch({ t: "load", values: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => {
    if (!s.ready) return;
    try {
      window.localStorage.setItem(KEY(agentId), JSON.stringify(s.values));
    } catch {
      /* not kept; fine for this session */
    }
    const m = s.values["decision.match"];
    if (m) saveMatchSettings({ ...MATCH_DEFAULTS, ...(m as MatchSettings) });
  }, [s.values, s.ready, agentId]);

  const patch = useCallback((set: Values) => dispatch({ t: "patch", set }), []);
  const undo = useCallback(() => dispatch({ t: "undo" }), []);
  const redo = useCallback(() => dispatch({ t: "redo" }), []);

  return { values: s.values, patch, undo, redo, canUndo: s.past.length > 0, canRedo: s.future.length > 0, touched: s.touched, at: s.at };
};
