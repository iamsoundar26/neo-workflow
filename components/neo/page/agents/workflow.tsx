import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Database,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { ACTOR_LABEL, type FlowActor, type FlowStep } from "@/config/pages/neo/agent-flow";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * An agent's workflow as a column of steps (26 Nov 2026), after the editors
 * in Zapier and HoneyBook: one card per step joined by a line, who does it
 * shown by colour and word, never by colour alone. Steps that wait for you
 * are drawn dashed. A card opens to what it reads, writes and which setting
 * changes it. "Show last run" lays the last run's result and time on the same
 * steps, as Attio and HoneyBook do.
 */
const ICON: Record<FlowActor, typeof Sparkles> = {
  neo: Sparkles,
  you: UserCheck,
  tally: Database,
};
const TINT: Record<FlowActor, string> = {
  neo: "bg-pi-brand-tint text-pi-brand",
  you: "bg-pi-warning-bg text-pi-warning",
  tally: "bg-pi-fill text-pi-ink-2",
};
const TONE = {
  ok: "border-pi-success/30 bg-pi-success-bg text-pi-success",
  ask: "border-pi-warn/30 bg-pi-warning-bg text-pi-warning",
  new: "border-pi-line-2 bg-pi-fill text-pi-ink-2",
} as const;

const Step = ({ s, n, last, showRun, open, onToggle }: { s: FlowStep; n: number; last: boolean; showRun: boolean; open: boolean; onToggle: () => void }) => {
  const Icon = ICON[s.actor];
  const human = s.actor === "you";
  return (
    <li className="relative flex gap-3" data-testid={`flow-step-${s.id}`}>
      {!last && <span aria-hidden className="absolute bottom-0 left-[15px] top-9 w-px bg-pi-line-2" />}
      <span className={cn("relative z-[1] mt-1 grid h-8 w-8 flex-none place-items-center rounded-full", TINT[s.actor])}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pb-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className={cn(
            "w-full rounded-lg border bg-background px-3.5 py-3 text-left transition-colors hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
            human ? "border-dashed border-pi-line-2" : "border-pi-line",
            open && "bg-pi-fill"
          )}
        >
          <span className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-pi-faint">
              {n} · {ACTOR_LABEL[s.actor]}
            </span>
            {showRun && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-pi-success-bg px-2 py-0.5 text-[11px] font-medium text-pi-success" data-testid="flow-run-badge">
                <Check className="h-3 w-3" aria-hidden /> Done{s.last && s.last.took !== "—" ? ` · ${s.last.took}` : ""}
              </span>
            )}
            <ChevronDown className={cn("h-4 w-4 flex-none text-pi-faint transition-transform", !showRun && "ml-auto", open && "rotate-180")} aria-hidden />
          </span>
          <span className="mt-0.5 block text-[14px] font-semibold text-pi-ink">{s.title}</span>
          <span className="mt-0.5 block text-[13px] text-pi-body">{showRun && s.last ? s.last.note : s.summary}</span>
        </button>

        {open && (
          <div className="mt-2 rounded-lg bg-accent px-3.5 py-3 text-[13px] text-pi-ink duration-150 animate-in fade-in-0" data-testid={`flow-detail-${s.id}`}>
            <ul className="flex flex-col gap-1.5">
              {s.detail.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden className="mt-[8px] h-1 w-1 flex-none rounded-full bg-pi-ink-2" />
                  {d}
                </li>
              ))}
            </ul>
            {(s.reads || s.writes) && (
              <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-pi-line pt-2.5">
                {s.reads && (
                  <>
                    <dt className="text-pi-faint">Reads</dt>
                    <dd>{s.reads}</dd>
                  </>
                )}
                {s.writes && (
                  <>
                    <dt className="text-pi-faint">Writes</dt>
                    <dd>{s.writes}</dd>
                  </>
                )}
              </dl>
            )}
            {s.setting && (
              <Link href={s.setting.href} className="mt-2.5 inline-flex items-center gap-1 font-medium text-pi-brand hover:underline">
                {s.setting.label}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        )}

        {s.branches && (
          <ul className="mt-2 grid grid-cols-3 gap-2" aria-label="Where the work goes next" data-testid="flow-branches">
            {s.branches.map((b) => (
              <li key={b.label} className={cn("rounded-md border px-2 py-1.5", TONE[b.tone])}>
                <span className="block text-[12px] font-semibold">{b.label}</span>
                <span className="block text-[11px] opacity-90">{b.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
};

const Workflow = ({ steps }: { steps: FlowStep[] }) => {
  const [showRun, setShowRun] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const neo = steps.filter((s) => s.actor !== "you").length;
  const you = steps.length - neo;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-5" data-testid="agent-workflow">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-pi-body">
          {steps.length} steps · Neo does {neo}, you decide {you}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-pi-ink">
          Last run
          <Switch checked={showRun} onCheckedChange={setShowRun} aria-label="Show last run" data-testid="flow-last-run" />
        </label>
      </div>
      <ol className="mt-4">
        {steps.map((s, i) => (
          <Step
            key={s.id}
            s={s}
            n={i + 1}
            last={i === steps.length - 1}
            showRun={showRun}
            open={openId === s.id}
            onToggle={() => setOpenId((o) => (o === s.id ? null : s.id))}
          />
        ))}
      </ol>
    </div>
  );
};

export default Workflow;
