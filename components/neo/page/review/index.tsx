import React from "react";
import Link from "next/link";
import { ClipboardCheck, Sparkles } from "lucide-react";
import { NeoMenuButton } from "@/components/neo/page";
import { AGENT_ICON } from "@/components/neo/page/agents/panel";
import { useNeedsReview } from "@/hooks/pages/neo/use-agent-run";

/**
 * Needs review (27 Nov 2026): everything an agent that is running has stopped
 * to ask you, across all agents, in one list. Each row names the agent and
 * what it needs, and Review opens that run where it is waiting. When nothing
 * is waiting, it says so.
 *
 * DEV: GET /api/neo/reviews, one row per open question or sign-off.
 */
const NeoReview = () => {
  const items = useNeedsReview();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="needs-review">
      <header className="flex h-14 flex-none items-center gap-2 border-b border-pi-line px-4 lg:px-6">
        <NeoMenuButton className="-ml-2" />
        <h1 className="text-[16px] font-semibold leading-6 text-pi-ink">Needs review</h1>
        {items.length > 0 && <span className="rounded-full bg-pi-warning-bg px-2 py-0.5 text-[12px] font-medium tabular-nums text-pi-warning">{items.length}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-4 pb-16 pt-5 sm:px-6">
          <p className="text-[13px] leading-5 text-pi-body">Agents that are running stop here when they need a decision from you. Nothing moves on until you answer.</p>
          {items.length === 0 ? (
            <div className="mt-10 grid place-items-center gap-2 text-center" data-testid="review-empty">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-pi-fill text-pi-faint">
                <ClipboardCheck className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-[14px] font-semibold text-pi-ink">Nothing needs your review</p>
              <p className="max-w-[40ch] text-[13px] leading-5 text-pi-body">When a running agent needs you, it shows up here.</p>
              <Link href="/inbox?module=NEO&page=agents" className="mt-1 text-[13px] font-medium text-pi-brand hover:underline">
                Go to Agents
              </Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-pi-line overflow-hidden rounded-xl border border-pi-line">
              {items.map((r) => {
                const Icon = AGENT_ICON[r.agentId] || Sparkles;
                return (
                  <li key={r.chatId} data-testid="review-item" className="flex items-center gap-3 bg-background px-4 py-3">
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-pi-warning-bg text-pi-warning">
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold leading-5 text-pi-ink">{r.agentName}</span>
                      <span className="block truncate text-[13px] leading-5 text-pi-body">{r.question || "Needs your decision"}</span>
                    </span>
                    <Link
                      href="/inbox?module=NEO"
                      data-testid="review-open"
                      className="inline-flex h-8 flex-none items-center rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
                    >
                      Review
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default NeoReview;
