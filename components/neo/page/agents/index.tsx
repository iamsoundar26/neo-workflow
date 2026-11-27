import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Loader, Play, Plus, Search, Sparkles } from "lucide-react";
import { MOCK_AGENTS, RECON_AGENT_ID, agentById, runPromptFor } from "@/config/pages/neo/mock-agents";
import type { AgentProfile } from "@/types/pages/neo/agents";
import { Button } from "@/components/ui/button";
import { useNeoColumnHidden } from "@/components/neo/page";
import { useStartChat } from "@/hooks/pages/neo/use-start-chat";
import { useNeo } from "@/hooks/pages/neo/use-neo";
import { useAgentRun, type AgentRun } from "@/hooks/pages/neo/use-agent-run";
import { useMyAgents, type MyAgent } from "@/hooks/pages/neo/use-my-agents";
import { cn } from "@/lib/utils";
import AgentsBar, { agentOpenHref } from "./bar";
import { AGENT_ICON } from "./panel";
import ReconAgent from "./recon";

type Props = { company: string };

/**
 * Neo › Agents (27 Nov 2026), after the Korefi agents page: a search, filters
 * with their counts, and agents in sections of cards: running, available,
 * drafts, and the ones still to come. Opening one goes to its own page, with
 * its chat and its workflow. The live recon agent's long-standing full page
 * stays at `&agent=…&view=page`.
 */
const NeoAgents = ({ company }: Props) => {
  const router = useRouter();
  const open = agentById(router.query.agent as string | undefined);
  if (open?.id === RECON_AGENT_ID && router.query.view === "page") return <ReconAgent company={company} />;
  return <Directory />;
};

type Filter = "all" | "running" | "available" | "drafts";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "available", label: "Available" },
  { id: "drafts", label: "Drafts" },
];

type Card = {
  id: string;
  name: string;
  description: string;
  chip: string;
  tone: "live" | "quiet" | "warn";
  meta: string;
  dashed?: boolean;
  /** An agent Neo can run now. */
  runnable?: boolean;
  /** The live run, when this agent is running. */
  run?: AgentRun;
};

const ofSuggested = (a: AgentProfile): Card => ({
  id: a.id,
  name: a.name,
  description: a.goal,
  chip: a.status === "live" ? "Available" : "Coming soon",
  tone: a.status === "live" ? "live" : "quiet",
  meta: a.category,
  runnable: a.status === "live",
});
const ofMine = (a: MyAgent): Card => ({
  id: a.id,
  name: a.name,
  description: a.goal,
  chip: a.status === "active" ? "Running" : a.status === "paused" ? "Paused" : "Draft",
  tone: a.status === "active" ? "live" : a.status === "paused" ? "warn" : "quiet",
  meta: `Runs ${a.schedule.toLowerCase()}`,
  dashed: a.status !== "active",
  runnable: a.status === "active",
});

const CHIP = {
  live: "bg-pi-success-bg text-pi-success",
  quiet: "bg-pi-fill text-pi-body",
  warn: "bg-pi-warning-bg text-pi-warning",
  run: "bg-pi-brand-tint text-pi-brand",
};

/** A run is a Neo chat: the running agent opens there. */
const RUN_HREF = "/inbox?module=NEO";

const BTN = "relative z-10 inline-flex h-8 flex-none items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:opacity-50";

/**
 * One agent. The whole card opens it; Run is a button of its own, so an agent
 * can be started without opening it. A running agent says where it is, or
 * what it is asking, and offers its run instead.
 */
const AgentCard = ({ c, busy, onRun }: { c: Card; busy: boolean; onRun: (id: string) => void }) => {
  const Icon = AGENT_ICON[c.id] || Sparkles;
  const waiting = c.run?.state === "needs-you";
  return (
    <li className="relative" data-testid="agent-card" data-agent={c.id}>
      <Link href={c.run ? RUN_HREF : agentOpenHref(c.id)} aria-label={c.name} className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border" />
      <div
        className={cn(
          "pointer-events-none flex h-full flex-col rounded-xl border bg-background p-3.5 transition-colors",
          c.dashed ? "border-dashed border-pi-line-2" : "border-pi-line",
          waiting ? "border-pi-warning-line" : c.run && "border-pi-brand"
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-pi-brand-tint text-pi-brand">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-pi-ink">{c.name}</span>
        </span>
        {c.run ? (
          <span className="mt-2 line-clamp-2 text-[13px] leading-5 text-pi-ink-2" data-testid="agent-run-line">
            {waiting ? c.run.question || "Waiting for your decision" : `${c.run.line}…`}
          </span>
        ) : (
          <span className="mt-2 line-clamp-2 text-[13px] leading-5 text-pi-body">{c.description}</span>
        )}
        <span className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("inline-flex flex-none items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium leading-4", waiting ? CHIP.warn : c.run ? CHIP.run : CHIP[c.tone])} data-testid="agent-chip">
            {c.run && !waiting && <Loader className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />}
            {!c.run && c.tone === "live" && <span className="h-1.5 w-1.5 rounded-full bg-pi-success-dot" />}
            {waiting ? "Needs you" : c.run ? "Running" : c.chip}
          </span>
            <span className="truncate text-[12px] leading-4 text-pi-faint">{c.meta}</span>
          </span>
          {c.run ? (
            <Link href={RUN_HREF} className={cn(BTN, "pointer-events-auto", waiting ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-pi-line-2 bg-background text-pi-ink hover:bg-pi-fill")} data-testid="card-view-run">
              {waiting ? "Review" : "View run"}
            </Link>
          ) : c.runnable ? (
            <button
              type="button"
              data-testid="card-run"
              disabled={busy}
              title={busy ? "Neo is working on another run" : `Run ${c.name}`}
              onClick={() => onRun(c.id)}
              className={cn(BTN, "pointer-events-auto bg-primary text-primary-foreground hover:bg-primary-hover")}
            >
              <Play className="h-3 w-3" fill="currentColor" aria-hidden />
              Run
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
};

const Section = ({ id, title, count, hint, children }: { id: string; title: string; count: number; hint: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="mt-6" data-testid={`section-${id}`}>
    <h2 id={id} className="flex items-baseline gap-2 text-[14px] font-semibold leading-5 text-pi-ink">
      {title}
      <span className="text-[12px] font-normal tabular-nums text-pi-faint">{count}</span>
    </h2>
    <p className="mt-0.5 border-b border-pi-line pb-2 text-[13px] leading-5 text-pi-body">{hint}</p>
    <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
  </section>
);

const Directory = () => {
  const startChat = useStartChat();
  const neo = useNeo();
  const run = useAgentRun();
  const columnHidden = useNeoColumnHidden();
  // A suggested agent you have run is saved to My agents too; it is the same agent, shown once.
  const mine = useMyAgents().filter((a) => !a.fromId);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);

  const all = useMemo(() => {
    const match = (c: Card) => !q.trim() || `${c.name} ${c.description}`.toLowerCase().includes(q.trim().toLowerCase());
    // The agent Neo is running now leads Running, whoever made it.
    const suggestedRun = run && MOCK_AGENTS.find((a) => a.id === run.agentId);
    const mineRun = run && mine.find((a) => a.id === run.agentId);
    const live: Card[] = run && suggestedRun ? [{ ...ofSuggested(suggestedRun), run }] : run && mineRun ? [{ ...ofMine(mineRun), run }] : [];
    const liveIds = new Set(live.map((c) => c.id));
    const running = [...live, ...mine.filter((a) => a.status === "active" && !liveIds.has(a.id)).map(ofMine)].filter(match);
    const drafts = mine.filter((a) => a.status !== "active" && !liveIds.has(a.id)).map(ofMine).filter(match);
    const available = MOCK_AGENTS.filter((a) => a.status === "live" && !liveIds.has(a.id)).map(ofSuggested).filter(match);
    const soon = MOCK_AGENTS.filter((a) => a.status !== "live").map(ofSuggested).filter(match);
    return { running, drafts, available, soon };
  }, [mine, q, run]);

  /** A run is a new chat, named for the agent: Run starts it there. */
  const runAgent = (id: string) => {
    if (neo.busy) return;
    void startChat(runPromptFor(id));
  };

  const counts: Record<Filter, number> = {
    all: all.running.length + all.drafts.length + all.available.length + all.soon.length,
    running: all.running.length,
    available: all.available.length,
    drafts: all.drafts.length,
  };
  const show = (f: Filter) => filter === "all" || filter === f;
  const busy = !!neo.busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={columnHidden ? "" : "lg:hidden"}>
        <AgentsBar />
      </div>
      <header className="flex h-14 flex-none items-center justify-between gap-3 border-b border-pi-line px-6 max-lg:hidden">
        <h1 className="text-[16px] font-semibold leading-6 text-pi-ink">Agents</h1>
        <Button data-testid="create-agent" onClick={() => void startChat("Create an agent")} className="h-9 rounded-md px-3.5 text-[14px] font-semibold">
          <Plus className="h-4 w-4" />
          Create agent
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1000px] px-4 pb-16 pt-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pi-faint" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search agents"
                aria-label="Search agents"
                data-testid="agents-search"
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-[14px] text-pi-ink placeholder:text-pi-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
              />
            </label>
            <div role="group" aria-label="Filter agents" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  data-testid={`pill-${f.id}`}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
                    filter === f.id ? "border-pi-brand bg-pi-brand-tint text-pi-brand" : "border-pi-line-2 bg-background text-pi-ink-2 hover:bg-pi-fill hover:text-pi-ink"
                  )}
                >
                  {f.label}
                  <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", filter === f.id ? "bg-background text-pi-brand" : "bg-pi-fill text-pi-body")}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          {show("running") && all.running.length > 0 && (
            <Section id="running" title="Running" count={all.running.length} hint="Working now, or switched on to run on their own.">
              {all.running.map((c) => (
                <AgentCard key={c.id} c={c} busy={busy} onRun={runAgent} />
              ))}
            </Section>
          )}
          {show("available") && all.available.length > 0 && (
            <Section id="available" title="Available" count={all.available.length} hint="Ready to run. Press Run, or open one to see how it works.">
              {all.available.map((c) => (
                <AgentCard key={c.id} c={c} busy={busy} onRun={runAgent} />
              ))}
            </Section>
          )}
          {show("drafts") && all.drafts.length > 0 && (
            <Section id="drafts" title="Drafts" count={all.drafts.length} hint="Agents being written. Switch one on to start it.">
              {all.drafts.map((c) => (
                <AgentCard key={c.id} c={c} busy={busy} onRun={runAgent} />
              ))}
            </Section>
          )}
          {filter === "all" && all.soon.length > 0 && (
            <>
              {more && (
                <Section id="soon" title="Coming soon" count={all.soon.length} hint="Planned agents. Open one to see what it will do.">
                  {all.soon.map((c) => (
                    <AgentCard key={c.id} c={c} busy={busy} onRun={runAgent} />
                  ))}
                </Section>
              )}
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  data-testid="show-all"
                  onClick={() => setMore((m) => !m)}
                  className="h-9 rounded-md border border-pi-line-2 bg-background px-4 text-[14px] font-medium text-pi-ink hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
                >
                  {more ? "Show fewer agents" : `Show all agents (${all.soon.length} more)`}
                </button>
              </div>
            </>
          )}
          {counts.all === 0 && (
            <p className="mt-16 text-center text-[14px] text-pi-body">No agent matches “{q}”.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default NeoAgents;
