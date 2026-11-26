import React, { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Boxes,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  ScrollText,
  ShoppingBag,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ComboBox } from "@/components/common/combo-box";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyBlock,
  HEADER_CLASS,
  Pager,
  SearchBox,
  TABLE_CLASS,
  UnderlineTabs,
} from "@/components/inbox/v2/banking/table-parts";
import { Field, PageDialog, Req, T } from "@/components/inbox/v2/ui";
import { cn } from "@/lib/utils";
import {
  MODULES,
  RULE_OPTIONS,
  addPolicy,
  addRule,
  deletePolicy,
  deleteRule,
  editPolicy,
  editRule,
  toggleRule,
  usePolicies,
  useRules,
  type Policy,
  type PolicyModule,
  type Rule,
} from "@/hooks/pages/neo/use-policies";

/**
 * Settings (19 Nov 2026): the home of what is set once for the company. For
 * now one card, Accounting policy. It opens the modules (GST, Banking,
 * Purchase, Sales, Inventory); a module opens its policies, which can be
 * read, added, edited and deleted, and its rules: the "when this, do that"
 * cases Neo applies by itself. Rules live inside the module, beside the
 * policies they come from, instead of as a card of their own.
 *
 * DEV: /api/companies/:id/accounting-policies and .../policy-rules.
 */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ICON: Record<PolicyModule, React.ComponentType<{ className?: string }>> = {
  GST: Percent,
  Banking: Banknote,
  Purchase: ShoppingBag,
  Sales: ShoppingCart,
  Inventory: Boxes,
};

type View = { k: "home" } | { k: "modules" } | { k: "module"; m: PolicyModule };

/* ------------------------------------------------------------------ pieces */

const Crumbs = ({ items }: { items: { label: string; go?: () => void }[] }) => (
  <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-secondary-foreground">
    {items.map((c, i) => (
      <React.Fragment key={c.label}>
        {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        {c.go ? (
          <button type="button" onClick={c.go} className="font-medium text-primary hover:underline">
            {c.label}
          </button>
        ) : (
          <span aria-current="page" className="text-foreground">
            {c.label}
          </span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

/** The product's table head (Banking and Purchases registers): grey, 40px, 12px medium. */
const Th = ({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) => (
  <TableHead className={cn("h-10 bg-accent px-3 py-0", T.head, right && "text-right", className)}>{children}</TableHead>
);
const TD = "px-3 py-3 align-top";

const Confirm = ({
  title,
  body,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <PageDialog open title={title} onClose={onCancel} className="max-w-[460px]">
    <div data-testid="confirm-delete">
      <p className={T.value}>{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button isDestructive onClick={onConfirm} data-testid="confirm-yes">
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  </PageDialog>
);

/**
 * A right-hand sheet, 480px: the title and a line under it, the fields on the
 * section ground, and the actions on the right. Policies and rules share it.
 */
const SideSheet = ({
  open,
  onClose,
  title,
  sub,
  onSubmit,
  footer,
  testId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  onSubmit?: () => void;
  footer: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) => (
  <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
    <SheetContent side="right" className="flex w-full flex-col gap-0 border-neutral-gray p-0 sm:max-w-[480px]" data-testid={testId}>
      <SheetHeader className="space-y-0.5 border-b border-neutral-gray px-6 py-4 text-left">
        <SheetTitle className="truncate text-base font-semibold text-foreground">{title}</SheetTitle>
        <SheetDescription className={T.sub}>{sub}</SheetDescription>
      </SheetHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-background px-6 py-5">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-neutral-gray bg-background px-6 py-3">{footer}</div>
      </form>
    </SheetContent>
  </Sheet>
);

const Meta = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className={T.label}>{label}</dt>
    <dd className="mt-1 text-sm text-foreground">{children}</dd>
  </div>
);

type SheetState = { id?: string; mode: "view" | "edit" };

/**
 * One sheet for a policy, in three states that look the same: adding (no
 * policy yet), reading, and editing. Reading shows the same fields, unlocked
 * by Edit; Cancel goes back to reading, not out. Saving a new policy lands on
 * it, read.
 */
const PolicySheet = ({
  module,
  state,
  policy,
  setState,
  onDelete,
}: {
  module: PolicyModule;
  state: SheetState;
  policy?: Policy;
  setState: (s: SheetState | null) => void;
  onDelete: (p: Policy) => void;
}) => {
  const [name, setName] = useState(policy?.name ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [tried, setTried] = useState(false);
  const view = state.mode === "view" && !!policy;
  const missing = !name.trim();
  const reset = () => {
    setName(policy?.name ?? "");
    setDescription(policy?.description ?? "");
    setTried(false);
  };
  const save = () => {
    setTried(true);
    if (missing) return;
    if (policy) {
      editPolicy(policy.id, { name, description });
      setState({ id: policy.id, mode: "view" });
    } else {
      setState({ id: addPolicy(module, { name, description }), mode: "view" });
    }
  };
  return (
    <SideSheet
      open
      testId="policy-sheet"
      onClose={() => setState(null)}
      title={policy ? policy.name : "Add policy"}
      sub={policy ? `${module} policy` : `Added to ${module}`}
      onSubmit={view ? undefined : save}
      footer={
        view ? (
          <React.Fragment key="view">
            <Button type="button" variant="outline" onClick={() => onDelete(policy!)} data-testid="policy-read-delete">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button type="button" onClick={() => setState({ id: policy!.id, mode: "edit" })} data-testid="policy-read-edit">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </React.Fragment>
        ) : (
          <React.Fragment key="edit">
            <Button
              type="button"
              variant="outline"
              data-testid="policy-cancel"
              onClick={() => {
                if (policy) {
                  reset();
                  setState({ id: policy.id, mode: "view" });
                } else setState(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" data-testid="policy-save">Save policy</Button>
          </React.Fragment>
        )
      }
    >
      <Field label={<><Req />Policy name</>} htmlFor="policy-name">
        <Input id="policy-name" autoFocus={!view} value={name} disabled={view} onChange={(e) => setName(e.target.value)} placeholder="For example, Payment terms" aria-invalid={tried && missing} data-testid="policy-name" />
        {tried && missing && <p role="alert" data-testid="policy-error" className="text-xs text-destructive-foreground">Enter a name for the policy.</p>}
      </Field>
      <Field label="Policy description" htmlFor="policy-desc">
        <Textarea id="policy-desc" value={description} disabled={view} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the rule in a sentence or two." data-testid="policy-desc" className="min-h-[140px]" />
      </Field>
      {policy ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-neutral-gray pt-5">
          <Meta label="Created by">{policy.createdBy}</Meta>
          <Meta label="Created on">{fmt(policy.createdAt)}</Meta>
          <Meta label="Last updated by">{policy.updatedBy}</Meta>
          <Meta label="Last updated on">{fmt(policy.updatedAt)}</Meta>
        </dl>
      ) : (
        <p className={T.sub}>This policy is added to <strong className="font-medium text-foreground">{module}</strong>.</p>
      )}
    </SideSheet>
  );
};

/** One sheet for a rule, adding or editing, in the same shell. */
const RuleSheet = ({ module, rule, onClose }: { module: PolicyModule; rule?: Rule; onClose: () => void }) => {
  const o = RULE_OPTIONS[module];
  const [when, setWhen] = useState(rule?.when ?? o.when[0]);
  const [whenValue, setWhenValue] = useState(rule?.whenValue ?? "");
  const [then, setThen] = useState(rule?.then ?? o.then[0]);
  const [thenValue, setThenValue] = useState(rule?.thenValue ?? "");
  const [tried, setTried] = useState(false);
  const opts = (xs: string[]) => xs.map((x) => ({ label: x, value: x }));
  const needsThen = !/^(Ask|Tell|Do not|Treat|Post as)/.test(then);
  const bad = !whenValue.trim() || (needsThen && !thenValue.trim());
  return (
    <SideSheet
      open
      testId="rule-sheet"
      onClose={onClose}
      title={rule ? "Edit rule" : "Add rule"}
      sub={`${module} rule`}
      onSubmit={() => {
        setTried(true);
        if (bad) return;
        const body = { when, whenValue: whenValue.trim(), then, thenValue: needsThen ? thenValue.trim() : "—" };
        if (rule) editRule(rule.id, body);
        else addRule(module, body);
        onClose();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" data-testid="rule-save">Save rule</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <h3 className={T.section}>When</h3>
        <ComboBox title="When" options={opts(o.when)} selectedValue={when} onChange={(v) => setWhen(String(v))} hasSearch={false} isMultiSelect={false} hideClearButton />
        <Input value={whenValue} onChange={(e) => setWhenValue(e.target.value)} aria-label="When value" aria-invalid={tried && !whenValue.trim()} placeholder="Value" data-testid="rule-when-value" />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className={T.section}>Then Neo will</h3>
        <ComboBox title="Then" options={opts(o.then)} selectedValue={then} onChange={(v) => setThen(String(v))} hasSearch={false} isMultiSelect={false} hideClearButton />
        {needsThen && <Input value={thenValue} onChange={(e) => setThenValue(e.target.value)} aria-label="Then value" aria-invalid={tried && !thenValue.trim()} placeholder="Value" data-testid="rule-then-value" />}
      </div>
      {tried && bad && <p role="alert" data-testid="rule-error" className="text-xs text-destructive-foreground">Fill in both values to save the rule.</p>}
      <p className={cn(T.value, "rounded-md bg-accent px-3 py-2")} data-testid="rule-preview">
        When <strong className="font-medium text-foreground">{when.toLowerCase()} {whenValue || "…"}</strong>, Neo will <strong className="font-medium text-foreground">{then.toLowerCase()}{needsThen ? ` ${thenValue || "…"}` : ""}</strong>.
      </p>
    </SideSheet>
  );
};

/* ------------------------------------------------------------------- views */

const CARD =
  "flex rounded-lg border border-neutral-gray bg-background text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const Home = ({ open }: { open: () => void }) => {
  const policies = usePolicies();
  const rules = useRules();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="settings-home">
      <button type="button" onClick={open} data-testid="card-accounting-policy" className={cn(CARD, "flex-col gap-3 p-5")}>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-primary">
          <ScrollText className="h-5 w-5" aria-hidden />
        </span>
        <span>
          <span className="block text-base font-semibold text-foreground">Accounting policy</span>
          <span className={cn(T.value, "mt-0.5 block")}>The policies and rules Neo follows, for each part of your books.</span>
        </span>
        <span className={T.sub}>
          {plural(policies.length, "policy", "policies")} · {plural(rules.length, "rule")} · {MODULES.length} modules
        </span>
      </button>
    </div>
  );
};

const Modules = ({ open }: { open: (m: PolicyModule) => void }) => {
  const policies = usePolicies();
  const rules = useRules();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="settings-modules">
      {MODULES.map((m) => {
        const Icon = ICON[m];
        const np = policies.filter((p) => p.module === m).length;
        const nr = rules.filter((r) => r.module === m).length;
        return (
          <button key={m} type="button" onClick={() => open(m)} data-testid={`module-${m}`} className={cn(CARD, "items-center gap-3 p-4")}>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-accent text-foreground"><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{m}</span>
              <span className={T.sub}>{plural(np, "policy", "policies")} · {plural(nr, "rule")}</span>
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-secondary-foreground" aria-hidden />
          </button>
        );
      })}
    </div>
  );
};

const Empty = ({ title, body, cta, onAdd }: { title: string; body: string; cta: string; onAdd: () => void }) => (
  <div className="flex flex-col items-center rounded-lg border border-dashed border-neutral-gray px-6 py-14 text-center" data-testid="settings-empty">
    <ScrollText className="h-8 w-8 text-secondary-foreground" aria-hidden />
    <p className="mt-3 text-base font-semibold text-foreground">{title}</p>
    <p className={cn(T.value, "mt-1")}>{body}</p>
    <Button className="mt-4" onClick={onAdd}><Plus className="h-4 w-4" /> {cta}</Button>
  </div>
);

/** The row menu, as the Banking tables have it: a sticky last column with a ⋯ button. */
const RowMenu = ({ label, items }: { label: string; items: { label: string; icon: React.ReactNode; onSelect: () => void; danger?: boolean; testId: string }[] }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} className="text-secondary-foreground" data-testid="row-menu" onClick={(e) => e.stopPropagation()}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
      {items.map((i) => (
        <DropdownMenuItem key={i.label} data-testid={i.testId} className={i.danger ? "text-danger-action focus:text-danger-action" : undefined} onSelect={i.onSelect}>
          <span className="mr-2">{i.icon}</span>
          {i.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
const ACTION_CELL = "sticky right-0 z-[1] h-[45px] w-12 border-l border-neutral-gray bg-background px-3 py-0 align-middle";

const ModuleView = ({ module }: { module: PolicyModule }) => {
  const policies = usePolicies();
  const rules = useRules();
  const [tab, setTab] = useState<"policies" | "rules">("policies");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [rForm, setRForm] = useState<{ rule?: Rule } | null>(null);
  const [del, setDel] = useState<{ kind: "policy"; p: Policy } | { kind: "rule"; r: Rule } | null>(null);

  const mineP = useMemo(() => policies.filter((p) => p.module === module), [policies, module]);
  const mineR = useMemo(() => rules.filter((r) => r.module === module), [rules, module]);
  const s = q.trim().toLowerCase();
  const shownP = mineP.filter((p) => !s || `${p.name} ${p.description}`.toLowerCase().includes(s));
  const shownR = mineR.filter((r) => !s || `${r.when} ${r.whenValue} ${r.then} ${r.thenValue}`.toLowerCase().includes(s));
  const total = tab === "policies" ? mineP.length : mineR.length;
  const shown = tab === "policies" ? shownP.length : shownR.length;
  const pageP = shownP.slice(page * size, (page + 1) * size);
  const pageR = shownR.slice(page * size, (page + 1) * size);

  return (
    <div className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col" data-testid="module-view">
      <UnderlineTabs
        value={tab}
        onChange={(t) => { setTab(t as "policies" | "rules"); setQ(""); setPage(0); }}
        tabs={[
          { id: "policies", label: "Policies", count: mineP.length },
          { id: "rules", label: "Rules", count: mineR.length },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3 px-6 py-4">
        <p className={cn(T.value, "min-w-0 flex-1")}>
          {tab === "policies"
            ? "What your company does. Neo follows these when it works on this module."
            : "When something looks a certain way, Neo does it for you. Turn a rule off to pause it."}
        </p>
        {total > 0 && <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder={`Search ${tab}`} label={`Search ${tab}`} />}
        <Button onClick={() => (tab === "policies" ? setSheet({ mode: "edit" }) : setRForm({}))} data-testid="settings-add">
          <Plus className="h-4 w-4" /> {tab === "policies" ? "Add policy" : "Add rule"}
        </Button>
      </div>

      {total === 0 ? (
        <div className="px-6 pb-6">
          {tab === "policies" ? (
            <Empty title="No policies yet" body="Add your first policy for this module." cta="Add policy" onAdd={() => setSheet({ mode: "edit" })} />
          ) : (
            <Empty title="No rules yet" body="Add a rule and Neo applies it by itself." cta="Add rule" onAdd={() => setRForm({})} />
          )}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto overscroll-none border-t border-neutral-gray">
            {tab === "policies" ? (
              <Table className={cn(TABLE_CLASS, "min-w-[820px]")} data-testid="policy-table">
                <TableHeader className={HEADER_CLASS}>
                  <TableRow>
                    <Th>Policy</Th><Th className="w-[180px]">Created by</Th><Th className="w-[180px]">Last updated by</Th><Th right className="sticky right-0 w-12 border-l border-neutral-gray"><span className="sr-only">Actions</span></Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageP.map((p) => (
                    <TableRow key={p.id} data-testid="policy-row" className="cursor-pointer" onClick={() => setSheet({ id: p.id, mode: "view" })}>
                      <TableCell className={cn(TD, "max-w-[420px]")}>
                        <button type="button" className="text-left text-sm font-medium text-foreground hover:underline" aria-label={`Read ${p.name}`}>{p.name}</button>
                        <p className={cn(T.cell, "mt-0.5 line-clamp-2 text-secondary-foreground")}>{p.description}</p>
                      </TableCell>
                      <TableCell className={cn(TD, T.cell, "whitespace-nowrap")}>{p.createdBy}<p className="text-secondary-foreground">{fmt(p.createdAt)}</p></TableCell>
                      <TableCell className={cn(TD, T.cell, "whitespace-nowrap")}>{p.updatedBy}<p className="text-secondary-foreground">{fmt(p.updatedAt)}</p></TableCell>
                      <TableCell className={cn(ACTION_CELL, "align-top pt-2")}>
                        <RowMenu
                          label={p.name}
                          items={[
                            { label: "Read", icon: <ScrollText className="h-4 w-4" />, onSelect: () => setSheet({ id: p.id, mode: "view" }), testId: "policy-read-item" },
                            { label: "Edit", icon: <Pencil className="h-4 w-4" />, onSelect: () => setSheet({ id: p.id, mode: "edit" }), testId: "policy-edit" },
                            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: () => setDel({ kind: "policy", p }), danger: true, testId: "policy-delete" },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table className={cn(TABLE_CLASS, "min-w-[820px]")} data-testid="rule-table">
                <TableHeader className={HEADER_CLASS}>
                  <TableRow>
                    <Th>When</Th><Th>Then Neo will</Th><Th className="w-[180px]">Last updated</Th><Th className="w-[70px]">On</Th><Th right className="sticky right-0 w-12 border-l border-neutral-gray"><span className="sr-only">Actions</span></Th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageR.map((r) => (
                    <TableRow key={r.id} data-testid="rule-row" className={cn(!r.active && "text-secondary-foreground")}>
                      <TableCell className={cn(TD, T.cell)}><span className="text-secondary-foreground">{r.when}</span> <span className="font-medium">{r.whenValue}</span></TableCell>
                      <TableCell className={cn(TD, T.cell)}><span className="text-secondary-foreground">{r.then}</span> {r.thenValue !== "—" && <span className="font-medium">{r.thenValue}</span>}</TableCell>
                      <TableCell className={cn(TD, T.cell, "whitespace-nowrap")}>{r.updatedBy}<p className="text-secondary-foreground">{fmt(r.updatedAt)}</p></TableCell>
                      <TableCell className={TD}><Switch checked={r.active} onCheckedChange={() => toggleRule(r.id)} aria-label={`Rule ${r.when} ${r.whenValue} on`} data-testid="rule-toggle" /></TableCell>
                      <TableCell className={cn(ACTION_CELL, "align-top pt-2")}>
                        <RowMenu
                          label={`${r.when} ${r.whenValue}`}
                          items={[
                            { label: "Edit", icon: <Pencil className="h-4 w-4" />, onSelect: () => setRForm({ rule: r }), testId: "rule-edit" },
                            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: () => setDel({ kind: "rule", r }), danger: true, testId: "rule-delete" },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {shown === 0 && <EmptyBlock title={`No ${tab} match “${q}”.`} />}
          </div>
          <Pager page={page} pageSize={size} total={shown} onPageChange={setPage} onPageSizeChange={setSize} />
        </>
      )}

      {sheet && (
        <PolicySheet
          key={`${sheet.id ?? "new"}`}
          module={module}
          state={sheet}
          policy={policies.find((p) => p.id === sheet.id)}
          setState={setSheet}
          onDelete={(p) => { setSheet(null); setDel({ kind: "policy", p }); }}
        />
      )}
      {rForm && <RuleSheet key={rForm.rule?.id ?? "new"} module={module} rule={rForm.rule} onClose={() => setRForm(null)} />}

      {del && (
        <Confirm
          title={del.kind === "policy" ? "Delete this policy?" : "Delete this rule?"}
          body={del.kind === "policy" ? `“${del.p.name}” will be removed from ${module}. This can't be undone.` : `Neo will stop applying “${del.r.when} ${del.r.whenValue}”. This can't be undone.`}
          onCancel={() => setDel(null)}
          onConfirm={() => {
            if (del.kind === "policy") deletePolicy(del.p.id);
            else deleteRule(del.r.id);
            setDel(null);
          }}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------- page */

const Settings = ({ companyName }: { companyName?: string }) => {
  const [view, setView] = useState<View>({ k: "home" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="flex-1 bg-background" />;

  const crumbs =
    view.k === "home"
      ? [{ label: "Settings" }]
      : view.k === "modules"
        ? [{ label: "Settings", go: () => setView({ k: "home" }) }, { label: "Accounting policy" }]
        : [
            { label: "Settings", go: () => setView({ k: "home" }) },
            { label: "Accounting policy", go: () => setView({ k: "modules" }) },
            { label: view.m },
          ];
  const title = view.k === "home" ? "Settings" : view.k === "modules" ? "Accounting policy" : `${view.m} policy`;
  const sub =
    view.k === "home"
      ? companyName || "Nandhini Deluxe"
      : view.k === "modules"
        ? "Choose a module to see its policies and rules."
        : companyName || "Nandhini Deluxe";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto bg-background p-6" data-testid="settings-page">
      <header className="flex flex-col gap-1.5">
        {view.k !== "home" && <Crumbs items={crumbs} />}
        <h1 className="text-[22px] font-semibold text-foreground">{title}</h1>
        <p className="text-[13px] text-secondary-foreground">{sub}</p>
      </header>
      {view.k === "home" && <Home open={() => setView({ k: "modules" })} />}
      {view.k === "modules" && <Modules open={(m) => setView({ k: "module", m })} />}
      {view.k === "module" && <ModuleView key={view.m} module={view.m} />}
    </div>
  );
};

export default Settings;
