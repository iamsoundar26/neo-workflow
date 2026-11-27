import { useMemo } from "react";
import { useNeo } from "@/hooks/pages/neo/use-neo";
import { awaitingYou } from "@/hooks/pages/neo/use-unread";
import { agentById } from "@/config/pages/neo/mock-agents";
import { useMyAgents } from "@/hooks/pages/neo/use-my-agents";
import type { NeoMessage } from "@/types/pages/neo";

/**
 * Which agent is running, and whether it needs you (27 Nov 2026). A run is a
 * Neo chat with the agent's id on it, so this reads the live run from the
 * runtime and says it in the agent's terms: where it is, or what it is
 * asking. The directory, the agent page and Needs review all draw from it.
 *
 * DEV: GET /api/neo/runs?status=running,needs-you, one row per run.
 */
export type AgentRun = {
  agentId: string;
  agentName: string;
  chatId: string;
  state: "running" | "needs-you";
  /** Where the work is: the step it is on. */
  line: string;
  /** What it is asking, when it needs you. */
  question?: string;
  startedAt?: string;
};

const CARD_ASK: Record<string, string> = {
  "match-settings": "Confirm how to match",
  "bank-stage": "Review the match results",
  "bank-review": "Review the match results",
  "bank-match": "Review the match results",
  "bank-exact": "Approve the exact matches",
  "bank-line": "Check a line",
  "source-fix": "Fix a problem with the statement",
  "bank-sync": "Confirm syncing to Tally",
  "bank-final": "Confirm the entries to create",
  "voucher-desk": "Check the vouchers",
  decisions: "Decide on the open items",
  "guide-choice": "Choose how to continue",
  "guide-upload": "Share the files Neo needs",
  "sources-upload": "Share the files Neo needs",
};

const waitingOn = (m?: NeoMessage) =>
  m ? m.ask?.question || (m.card ? CARD_ASK[m.card.kind] : undefined) || m.text || "Needs your decision" : undefined;

export const useAgentRun = (): AgentRun | null => {
  const neo = useNeo();
  const mine = useMyAgents();
  return useMemo(() => {
    if (!neo.busy || !neo.agentId) return null;
    const msgs = neo.messages.filter((m) => m.runId === neo.busy && m.role === "neo");
    const wait = [...msgs].reverse().find((m) => (m.ask && !m.ask.answer) || (m.actions?.length && !m.chosen));
    let line = "Getting started";
    for (const m of [...msgs].reverse()) {
      const s = m.steps?.slice().reverse().find((x) => x.kind !== "thought");
      if (s) {
        line = s.label;
        break;
      }
    }
    const name = agentById(neo.agentId)?.name || mine.find((a) => a.id === neo.agentId)?.name || "Agent";
    return {
      agentId: neo.agentId,
      agentName: name,
      chatId: neo.chatId,
      state: awaitingYou(neo) ? "needs-you" : "running",
      line,
      question: waitingOn(wait),
      startedAt: neo.runs.find((r) => r.id === neo.busy)?.startedAt,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neo.busy, neo.agentId, neo.messages, neo.runs, neo.chatId, mine]);
};

/** What is waiting for a person across the agents that are running. */
export const useNeedsReview = (): AgentRun[] => {
  const run = useAgentRun();
  return run && run.state === "needs-you" ? [run] : [];
};
