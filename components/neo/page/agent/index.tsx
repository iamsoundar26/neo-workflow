import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, Loader, Play, Redo2, Sparkles, Undo2 } from "lucide-react";
import { NeoMenuButton } from "@/components/neo/page";
import { AGENT_ICON } from "@/components/neo/page/agents/panel";
import { AGENTS_HREF } from "@/components/neo/page/agents/bar";
import { MOCK_AGENTS, agentById, runPromptFor } from "@/config/pages/neo/mock-agents";
import { flowFor, type Quick, type Values } from "@/config/pages/neo/agent-nodes";
import { useAgentConfig } from "@/hooks/pages/neo/use-agent-config";
import { useMyAgents } from "@/hooks/pages/neo/use-my-agents";
import { useNeo } from "@/hooks/pages/neo/use-neo";
import { useStartChat } from "@/hooks/pages/neo/use-start-chat";
import { useAgentRun } from "@/hooks/pages/neo/use-agent-run";
import type { NeoMessage } from "@/types/pages/neo";
import type { AgentNode } from "@/config/pages/neo/agent-nodes";
import { cn } from "@/lib/utils";
import AgentChat, { type ChatMsg } from "./agent-chat";
import ConfigList from "./config-panel";
import { SaveStatus } from "./saved";
import Canvas, { type NodeState } from "./canvas";

/** The agent open, from the directory's list or the ones you made. */
const useAgentView = (id?: string) => {
  const mine = useMyAgents().find((a) => a.id === id);
  const suggested = agentById(id);
  return useMemo(() => {
    if (suggested)
      return {
        id: suggested.id,
        name: suggested.name,
        description: suggested.goal,
        chip: suggested.status === "live" ? "Available" : "Coming soon",
        sources: suggested.sources.map((s) => ({ label: s.label, from: s.from })),
        runnable: suggested.status === "live",
        eta: suggested.eta,
      };
    if (mine)
      return {
        id: mine.id,
        name: mine.name,
        description: mine.goal,
        chip: mine.status === "active" ? "Active" : mine.status === "paused" ? "Paused" : "Draft",
        sources: [{ label: mine.data, from: "Your data" }],
        runnable: mine.status === "active",
        eta: mine.status === "active" ? undefined : `${mine.status === "draft" ? "A draft" : "Paused"}: switch it on to run it`,
      };
    return undefined;
  }, [suggested, mine]);
};

let seq = 0;

/**
 * Where a run has got to, by node. Neo's steps and cards say it: reading the
 * statement, the match settings, the results to review, the sync. Everything
 * before the node it is on is done; the node itself works, or waits on you.
 */
const progress = (msgs: NeoMessage[], nodes: AgentNode[], waiting: boolean): Record<string, NodeState> => {
  const ids = nodes.map((n) => n.id);
  const labels = msgs.flatMap((m) => m.steps?.filter((s) => s.kind !== "thought").map((s) => s.label) ?? []);
  const kinds = msgs.map((m) => m.card?.kind).filter(Boolean) as string[];
  let idx = 0;
  const bump = (id: string) => {
    if (ids.includes(id)) idx = Math.max(idx, ids.indexOf(id));
  };
  if (ids.includes("read")) {
    if (labels.length) bump("read");
    if (kinds.some((k) => k === "voucher-desk" || k === "source-fix")) bump("check");
    if (kinds.some((k) => k === "match-settings" || k === "bank-summary" || k === "bank-match") || labels.some((l) => /compar|match|unreconciled/i.test(l))) bump("decision");
    if (kinds.includes("bank-line")) bump("ai");
    if (kinds.some((k) => k === "bank-stage" || k === "bank-review" || k === "bank-exact")) bump("review");
    if (kinds.some((k) => k === "bank-sync" || k === "bank-final")) bump("sync");
  } else idx = Math.min(ids.length - 1, Math.floor(labels.length / 2));
  const out: Record<string, NodeState> = {};
  ids.forEach((id, i) => {
    if (i < idx) out[id] = "done";
    else if (i === idx) out[id] = waiting ? "waiting" : "active";
  });
  return out;
};

/**
 * An agent's page (27 Nov 2026), after the Korefi agent page: the agent's
 * name in the bar; its chat on the left; on the right what it does and two
 * tabs. Preview is the workflow as an open canvas; Configuration is every
 * node's fields in one scrolling list. While the agent runs, the left shows
 * the run itself, as in Neo's chat, and the canvas shows where it has got to.
 */
const NeoAgentPage = () => {
  const router = useRouter();
  const id = router.query.agent as string | undefined;
  const view = useAgentView(id);
  const neo = useNeo();
  const run = useAgentRun();
  const startChat = useStartChat();
  const flow = useMemo(() => flowFor(view?.id ?? "", (view?.sources ?? []).map((s) => s.label)), [view?.id, view?.sources]);
  const cfg = useAgentConfig(view?.id ?? "none", flow.nodes);
  const [tab, setTab] = useState<"preview" | "config">("preview");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  // A node to scroll to once the Configuration list is on screen.
  const goTo = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => {
      list.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const running = !!view && run?.agentId === view.id ? run : null;

  // A different agent starts from its Preview, with a fresh chat.
  useEffect(() => {
    setTab("preview");
    setMsgs([]);
  }, [view?.id]);

  useEffect(() => {
    const target = goTo.current;
    if (tab !== "config" || !target) return;
    goTo.current = null;
    const el = document.getElementById(`cfg-${target}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-pi-brand");
    const t = window.setTimeout(() => el.classList.remove("ring-2", "ring-pi-brand"), 1600);
    timers.current.push(t);
  }, [tab, msgs.length]);

  const nodeState = useMemo(
    () => (running && view ? progress(neo.messages.filter((m) => m.runId === neo.busy), flow.nodes, running.state === "needs-you") : undefined),
    [running, view, neo.messages, neo.busy, flow.nodes]
  );

  if (!view)
    return (
      <div className="grid min-h-0 flex-1 place-content-center gap-3 text-center">
        <p className="text-[14px] text-pi-body">That agent isn&apos;t here any more.</p>
        <Link href={AGENTS_HREF} className="text-[14px] font-medium text-pi-brand hover:underline">
          Back to Agents
        </Link>
      </div>
    );

  const Icon = AGENT_ICON[view.id] || Sparkles;
  const busyElsewhere = !!neo.busy && !running;
  const waiting = running?.state === "needs-you";

  const open = (nodeId: string) => {
    goTo.current = nodeId;
    setTab("config");
  };
  const say = (m: Omit<ChatMsg, "id">) => setMsgs((cur) => [...cur, { ...m, id: ++seq }]);
  const reply = (set: Values, text: string, nodeId: string) => {
    const t = window.setTimeout(() => {
      cfg.patch(set);
      say({ from: "neo", text, undoable: true });
      open(nodeId);
    }, 450);
    timers.current.push(t);
  };
  const onSend = (text: string) => {
    say({ from: "you", text });
    const hit = flow.interpret(text, cfg.values);
    if (hit) return reply(hit.set, hit.reply, hit.node);
    const key = flow.notes.key;
    const was = String(cfg.values[key] ?? "").trim();
    const title = flow.nodes.find((n) => n.id === flow.notes.node)?.title ?? "the notes";
    reply({ [key]: was ? `${was}\n${text}` : text }, `I've added that to \u201c${title}\u201d. You can edit it on the right.`, flow.notes.node);
  };
  const onQuick = (q: Quick) => {
    say({ from: "you", text: q.label });
    reply(q.set, q.reply, q.node);
  };
  const onUndo = (msgId: number) => {
    cfg.undo();
    setMsgs((cur) => cur.map((m) => (m.id === msgId ? { ...m, undoable: false } : m)));
  };
  /** Run now starts a new Neo chat, named for the agent. */
  const runNow = () => {
    if (!neo.busy) void startChat(runPromptFor(view.id));
  };
  const IconBtn = ({ label, on, off, children }: { label: string; on: () => void; off: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={off}
      onClick={on}
      className="grid h-8 w-8 place-items-center rounded-md text-pi-body transition-colors hover:bg-pi-fill hover:text-pi-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:opacity-35"
    >
      {children}
    </button>
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="agent-page">
      <header className="flex h-14 flex-none items-center gap-2 border-b border-pi-line px-4">
        <NeoMenuButton className="-ml-2" />
        <Link
          href={AGENTS_HREF}
          aria-label="Back to Agents"
          title="Back to Agents"
          className="grid h-8 w-8 place-items-center rounded-md text-pi-body hover:bg-pi-fill hover:text-pi-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 truncate text-[16px] font-semibold leading-6 text-pi-ink" data-testid="agent-title">
          {view.name}
        </h1>
        {running ? (
          <span
            data-testid="agent-state"
            className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-4", running.state === "needs-you" ? "bg-pi-warning-bg text-pi-warning" : "bg-pi-brand-tint text-pi-brand")}
          >
            {running.state === "running" && <Loader className="h-3 w-3 flex-none animate-spin motion-reduce:animate-none" aria-hidden />}
            <span className="truncate">{running.state === "needs-you" ? "Needs you" : "Running"}</span>
          </span>
        ) : (
          <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-4", view.chip === "Available" || view.chip === "Active" ? "bg-pi-success-bg text-pi-success" : "bg-pi-fill text-pi-body")}>{view.chip}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-2"><SaveStatus at={cfg.at} /></span>
          <IconBtn label="Undo" on={cfg.undo} off={!cfg.canUndo}>
            <Undo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Redo" on={cfg.redo} off={!cfg.canRedo}>
            <Redo2 className="h-4 w-4" />
          </IconBtn>
          {running ? (
            <Link
              href="/inbox?module=NEO"
              data-testid="view-run"
              className="ml-2 flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
            >
              {waiting ? "Review" : "View run"}
            </Link>
          ) : (
            <button
              type="button"
              data-testid="run-now"
              disabled={!view.runnable || !!neo.busy}
              title={!view.runnable ? view.eta || "Not available yet" : busyElsewhere ? "Neo is working on another run" : undefined}
              onClick={runNow}
              className="ml-2 flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Run now
            </button>
          )}
        </div>
      </header>

      {/* Like Neo's chat with a document beside it: the conversation runs the
          full height on white, and the other side is its own panel on the grey,
          with a white bar on top and its content in cards. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex min-h-[460px] w-full flex-none flex-col border-pi-line-2 bg-background max-lg:border-b lg:min-h-0 lg:w-[400px] lg:border-r">
          <AgentChat name={view.name} quick={flow.quick} messages={msgs} onSend={onSend} onQuick={onQuick} onUndo={onUndo} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-pi-page" data-testid="agent-right">
          <div role="tablist" aria-label="Agent" className="flex h-12 flex-none items-end gap-6 border-b border-pi-line-2 bg-background px-5">
            {(
              [
                ["preview", "Preview"],
                ["config", "Configuration"],
              ] as const
            ).map(([tid, label]) => (
              <button
                key={tid}
                type="button"
                role="tab"
                aria-selected={tab === tid}
                data-testid={`tab-${tid}`}
                onClick={() => setTab(tid)}
                className={cn(
                  "-mb-px h-12 border-b-2 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
                  tab === tid ? "border-pi-brand text-pi-ink" : "border-transparent text-pi-body hover:text-pi-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-none items-start gap-3 border-b border-pi-line-2 bg-background px-5 py-3">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-pi-brand-tint text-pi-brand">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <p className="min-w-0 pt-1 text-[14px] leading-5 text-pi-body [text-wrap:pretty]">{view.description}</p>
          </div>
          {tab === "preview" ? (
            <div className="relative min-h-[420px] flex-1" data-testid="panel-preview" role="tabpanel">
              <Canvas nodes={flow.nodes} state={nodeState} onSelect={open} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="agent-scroll" role="tabpanel">
              <div className="mx-auto max-w-[920px] px-5 pb-10 pt-5">
                <ConfigList nodes={flow.nodes} values={cfg.values} onChange={cfg.patch} touched={cfg.touched} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NeoAgentPage;
