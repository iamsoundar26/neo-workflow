import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MatchSettingsForm } from "@/components/neo/common/bank-flow/settings-card";
import { MATCH_DEFAULTS, type MatchSettings } from "@/config/pages/neo/match-settings";
import { NODE_TYPES, vkey, type AgentNode, type Field, type Values } from "@/config/pages/neo/agent-nodes";
import { cn } from "@/lib/utils";
import { NODE_ICON, NODE_TINT } from "./node-style";
import { SavedChip } from "./saved";

type Change = (set: Values) => void;

const SELECT =
  "h-9 w-full max-w-[320px] rounded-md border border-input bg-background px-2.5 text-[14px] text-pi-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border";

const Control = ({ node, f, values, onChange }: { node: AgentNode; f: Field; values: Values; onChange: Change }) => {
  const k = vkey(node.id, f.key);
  const v = values[k];
  switch (f.kind) {
    case "select":
      return (
        <select aria-label={f.label} className={SELECT} value={String(v ?? f.def)} onChange={(e) => onChange({ [k]: e.target.value })}>
          {f.options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      );
    case "toggle":
      return (
        <label className="flex items-center gap-3 text-[14px] text-pi-ink">
          <Switch checked={Boolean(v)} onCheckedChange={(c) => onChange({ [k]: c })} aria-label={f.label} />
          {f.hint && <span className="text-[13px] text-pi-body">{f.hint}</span>}
        </label>
      );
    case "checks": {
      const on = (v as string[] | undefined) ?? f.def;
      return (
        <div className="flex flex-col gap-2">
          {f.options.map((o) => (
            <label key={o.k} className="flex cursor-pointer items-center gap-2 text-[14px] text-pi-ink">
              <Checkbox checked={on.includes(o.k)} onCheckedChange={(c) => onChange({ [k]: c === true ? [...on, o.k] : on.filter((x) => x !== o.k) })} />
              {o.l}
            </label>
          ))}
        </div>
      );
    }
    case "text":
      return (
        <Textarea aria-label={f.label} rows={3} value={String(v ?? "")} placeholder={f.placeholder} onChange={(e) => onChange({ [k]: e.target.value })} className="max-w-[460px] text-[14px]" />
      );
    case "match":
      return null;
  }
};

type Props = {
  nodes: AgentNode[];
  values: Values;
  onChange: Change;
  /** When each node last changed. */
  touched?: Record<string, number>;
};

/**
 * Configuration: every node's fields, one after another in a single scrolling
 * list, each node under its own heading. Type scale: node heading 14, field
 * label and control 14, hints 13, the node's type line 12.
 */
const ConfigList = ({ nodes, values, onChange, touched }: Props) => (
  <div className="flex flex-col gap-4" data-testid="panel-config">
    {nodes.map((node, ni) => {
      const Icon = NODE_ICON[node.type];
      const matchField = node.fields.find((f) => f.kind === "match");
      const match = { ...MATCH_DEFAULTS, ...((matchField ? values[vkey(node.id, matchField.key)] : undefined) as MatchSettings | undefined) };
      return (
        <section key={node.id} id={`cfg-${node.id}`} aria-labelledby={`cfg-h-${node.id}`} className="scroll-mt-4 rounded-xl border border-[var(--palette-blue-100)] bg-background" data-testid={`cfg-${node.id}`}>
          <header className="flex items-center gap-3 border-b border-[var(--palette-blue-100)] px-5 py-3">
            <span className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg", NODE_TINT[node.type])}>
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 id={`cfg-h-${node.id}`} className="text-[14px] font-semibold leading-5 text-pi-ink">
                {ni + 1}. {node.title}
              </h3>
              <p className="text-[12px] leading-4 text-pi-body">
                {NODE_TYPES[node.type].label} · {NODE_TYPES[node.type].help}
              </p>
            </div>
            <SavedChip at={touched?.[node.id]} />
          </header>
          {matchField ? (
            <div className="px-5 py-4">
              <MatchSettingsForm s={match} setS={(fn) => onChange({ [vkey(node.id, matchField.key)]: typeof fn === "function" ? fn(match) : fn })} />
              <p className="mt-4 text-[12px] text-pi-faint">Same rules as Accounting policy. Changes save as you go.</p>
            </div>
          ) : (
            <ul>
              {node.fields.map((f) => (
                <li key={f.key} className="grid grid-cols-1 gap-2 border-t border-[var(--palette-blue-100)] px-5 py-3.5 first:border-t-0 sm:grid-cols-[200px_1fr] sm:gap-6">
                  <span className="text-[14px] font-medium leading-5 text-pi-ink">{f.label}</span>
                  <Control node={node} f={f} values={values} onChange={onChange} />
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    })}
  </div>
);

export default ConfigList;
