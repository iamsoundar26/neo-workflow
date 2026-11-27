import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Loader, Maximize2, Minus, Plus } from "lucide-react";
import { NODE_TYPES, type AgentNode } from "@/config/pages/neo/agent-nodes";
import { cn } from "@/lib/utils";
import { NODE_ICON, NODE_TINT } from "./node-style";

export type NodeState = "done" | "active" | "waiting";

const W = 264;
const H = 80;
const GAP = 48;
const BW = 200;
const BH = 56;
const BX = BW + 24;

type Box = { x: number; y: number; w: number; h: number };
type Edge = { from: string; to: string };
type Branch = { id: string; label: string; note: string; tone: "ok" | "ask" | "new"; goes: string };

/**
 * A fixed layout: one column, top to bottom, as in Lindy. Where a node splits
 * its work the paths sit side by side under it and join again lower down.
 * Positions are centres; the whole drawing is shifted so nothing is negative.
 */
const layout = (nodes: AgentNode[]) => {
  const pos: Record<string, Box> = {};
  const edges: Edge[] = [];
  const branches: Branch[] = [];
  let y = 0;
  let prev: AgentNode | null = null;
  let afterSplit = false;
  for (const n of nodes) {
    const x = afterSplit ? BX / 2 : 0;
    pos[n.id] = { x, y, w: W, h: H };
    if (prev && !prev.branches) edges.push({ from: prev.id, to: n.id });
    for (const b of branches) if (b.goes === n.id) edges.push({ from: b.id, to: n.id });
    afterSplit = false;
    y += H + GAP;
    if (n.branches?.length) {
      n.branches.forEach((b, i) => {
        const id = `${n.id}:${i}`;
        const bx = (i - (n.branches!.length - 1) / 2) * BX;
        pos[id] = { x: bx, y, w: BW, h: BH };
        branches.push({ id, ...b });
        edges.push({ from: n.id, to: id });
      });
      y += BH + GAP;
      afterSplit = true;
    }
    prev = n;
  }
  const xs = Object.values(pos);
  const minX = Math.min(...xs.map((b) => b.x - b.w / 2));
  const maxX = Math.max(...xs.map((b) => b.x + b.w / 2));
  for (const b of Object.values(pos)) b.x -= minX;
  return { pos, edges, branches, width: maxX - minX, height: y - GAP };
};

/** The colour of a node's left edge: its family, readable before the words. */
const FAMILY: Record<string, string> = {
  trigger: "var(--pi-line-strong)",
  input: "var(--pi-line-strong)",
  processing: "var(--pi-brand-vivid)",
  validation: "var(--pi-brand-vivid)",
  decision: "var(--pi-brand-vivid)",
  ai: "var(--pi-brand-vivid)",
  human: "var(--pi-warning-dot)",
  action: "var(--pi-success-dot)",
};

const TONE = {
  ok: "border-pi-success/30 bg-pi-success-bg text-pi-success",
  ask: "border-pi-warning-line bg-pi-warning-bg text-pi-warning",
  new: "border-pi-line-2 bg-pi-fill text-pi-ink-2",
} as const;

type Props = {
  nodes: AgentNode[];
  /** Where a run has got to, by node, while one is running. */
  state?: Record<string, NodeState>;
  onSelect: (id: string) => void;
};

const MIN = 0.4;
const MAX = 1.6;

/**
 * The workflow as an open canvas: a dotted field you can drag, zoom with the
 * buttons, ⌘/Ctrl + scroll or + / −, and fit back with 0. The layout is fixed,
 * so nodes don't move; clicking one goes to its fields. While an agent runs,
 * its nodes show where it is.
 */
const Canvas = ({ nodes, state, onSelect }: Props) => {
  const g = useMemo(() => layout(nodes), [nodes]);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 24 });
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  // Until you move the canvas yourself, it keeps the drawing centred as the panel settles.
  const touched = useRef(false);

  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));
  /** Fit the whole drawing, never larger than life. */
  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const s = clamp(Math.min(1, (el.clientWidth - 48) / g.width, (el.clientHeight - 48) / g.height));
    setView({ s, x: (el.clientWidth - g.width * s) / 2, y: 24 });
  }, [g.width, g.height]);
  /** Start at life size across the top: the first nodes read well. */
  const start = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const s = clamp(Math.min(1, (el.clientWidth - 48) / g.width));
    setView({ s, x: (el.clientWidth - g.width * s) / 2, y: 24 });
  }, [g.width]);
  useLayoutEffect(start, [start]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!touched.current) start();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [start]);

  const zoomAt = (next: number, cx: number, cy: number) => {
    touched.current = true;
    setView((v) => {
      const s = clamp(next);
      const k = s / v.s;
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };
  const zoomBy = (f: number) => {
    const el = box.current;
    if (el) zoomAt(view.s * f, el.clientWidth / 2, el.clientHeight / 2);
  };

  // Wheel: ⌘/Ctrl zooms where the pointer is; plain scroll moves the canvas.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(view.s * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else {
        touched.current = true;
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  });

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") zoomBy(1.2);
    else if (e.key === "-") zoomBy(1 / 1.2);
    else if (e.key === "0") {
      touched.current = true;
      fit();
    }
    else return;
    e.preventDefault();
  };

  const bottom = (b: Box) => ({ x: b.x, y: b.y + b.h });
  const top = (b: Box) => ({ x: b.x, y: b.y });

  return (
    <div
      ref={box}
      tabIndex={0}
      role="application"
      aria-label="Workflow canvas. Drag to move, plus and minus to zoom, 0 to fit."
      data-testid="agent-canvas"
      onKeyDown={onKey}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false };
        moved.current = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.px;
        const dy = e.clientY - d.py;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          moved.current = true;
          touched.current = true;
        }
        setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
      }}
      onPointerUp={() => {
        drag.current = null;
        // The click that ends a drag has already been decided by now.
        window.setTimeout(() => {
          moved.current = false;
        }, 0);
      }}
      className="relative h-full min-h-[420px] w-full cursor-grab touch-none select-none overflow-hidden bg-pi-page outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-border"
      style={{
        backgroundImage: "radial-gradient(circle, var(--pi-line-strong) 1px, transparent 1.2px)",
        backgroundSize: `${22 * view.s}px ${22 * view.s}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, width: g.width, height: g.height }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={g.width} height={g.height} aria-hidden>
          <defs>
            <marker id="cv-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="context-stroke" />
            </marker>
          </defs>
          {g.edges.map((e) => {
            const a = bottom(g.pos[e.from]);
            const b = top(g.pos[e.to]);
            const k = Math.max(20, (b.y - a.y) / 2);
            const live = state?.[e.from.split(":")[0]] === "done";
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={`M${a.x} ${a.y} C${a.x} ${a.y + k}, ${b.x} ${b.y - k}, ${b.x} ${b.y}`}
                fill="none"
                strokeWidth={1.6}
                markerEnd="url(#cv-arrow)"
                style={{ stroke: live ? "hsl(var(--primary))" : "var(--pi-line-strong)" }}
              />
            );
          })}
        </svg>

        {nodes.map((n, i) => {
          const b = g.pos[n.id];
          const Icon = NODE_ICON[n.type];
          const st = state?.[n.id];
          return (
            <button
              key={n.id}
              type="button"
              data-testid={`node-${n.id}`}
              data-state={st}
              onClick={() => {
                if (!moved.current) onSelect(n.id);
              }}
              onPointerDown={(e) => {
                moved.current = false;
                e.stopPropagation();
              }}
              title={`${NODE_TYPES[n.type].label}: ${NODE_TYPES[n.type].help}`}
              className={cn(
                "absolute flex items-center gap-3 rounded-xl border bg-background px-3 text-left shadow-pi-1 transition-shadow hover:shadow-pi-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pi-brand",
                st === "active" ? "border-pi-brand ring-2 ring-pi-brand-tint" : st === "waiting" ? "border-pi-warning-line ring-2 ring-pi-warning-bg" : "border-pi-line-2",
                st === undefined && state && "opacity-70"
              )}
              style={{ left: b.x - b.w / 2, top: b.y, width: b.w, height: b.h, borderLeftWidth: 3, borderLeftColor: FAMILY[n.type] }}
            >
              {i > 0 && <span aria-hidden className="absolute -top-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-pi-line-strong bg-background" />}
              {i < nodes.length - 1 && <span aria-hidden className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-pi-line-strong bg-background" />}
              <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-lg", NODE_TINT[n.type])}>
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[12px] leading-4 text-pi-faint">
                  <span className="truncate">
                    {i + 1} · {NODE_TYPES[n.type].label}
                  </span>
                  {st === "waiting" && <span className="flex-none rounded-full bg-pi-warning-bg px-1.5 text-[12px] font-medium text-pi-warning">Needs you</span>}
                </span>
                <span className="block truncate text-[14px] font-semibold leading-5 text-pi-ink">{n.title}</span>
                <span className="block truncate text-[12px] leading-4 text-pi-body">{n.sub}</span>
              </span>
              {st === "done" && <Check className="h-4 w-4 flex-none text-pi-success" aria-label="Done" />}
              {st === "active" && <Loader className="h-4 w-4 flex-none animate-spin text-pi-brand motion-reduce:animate-none" aria-label="Working" />}
            </button>
          );
        })}

        {g.branches.map((b) => {
          const p = g.pos[b.id];
          return (
            <div
              key={b.id}
              data-testid="canvas-branch"
              className={cn("absolute flex flex-col justify-center rounded-lg border px-3", TONE[b.tone])}
              style={{ left: p.x - p.w / 2, top: p.y, width: p.w, height: p.h }}
            >
              <span className="text-[13px] font-semibold leading-4">{b.label}</span>
              <span className="text-[12px] leading-4 opacity-90">{b.note}</span>
            </div>
          );
        })}
      </div>

      <div
        className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-lg border border-pi-line-2 bg-background p-0.5 shadow-pi-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomBy(1 / 1.2)} className="grid h-8 w-8 place-items-center rounded-md text-pi-ink-2 hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border">
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-11 text-center text-[12px] tabular-nums text-pi-body" data-testid="canvas-zoom">
          {Math.round(view.s * 100)}%
        </span>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1.2)} className="grid h-8 w-8 place-items-center rounded-md text-pi-ink-2 hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border">
          <Plus className="h-4 w-4" />
        </button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-pi-line-2" />
        <button type="button" aria-label="Fit to screen" title="Fit to screen (0)" data-testid="canvas-fit" onClick={() => {
            touched.current = true;
            fit();
          }} className="grid h-8 w-8 place-items-center rounded-md text-pi-ink-2 hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 right-3 text-[12px] text-pi-faint max-sm:hidden">Drag to move · ⌘ scroll to zoom</p>
    </div>
  );
};

export default Canvas;
