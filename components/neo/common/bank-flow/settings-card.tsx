import React, { useState } from "react";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  MATCH_DEFAULTS,
  previewOf,
  saveMatchSettings,
  setChosenMatchSettings,
  summaryOf,
  type MatchSettings,
} from "@/config/pages/neo/match-settings";
import type { NeoCard } from "@/types/pages/neo";
import { SHELL } from "./shared";

/**
 * The match settings (PM brief, 23 Nov 2026), asked after the statement is
 * read. The default view says in plain words what will happen, in three
 * groups; Edit settings opens the same card. Save and start keeps the settings
 * in the Accounting Policy; Use for this statement only does not. On later runs
 * it is one line: "Using your saved match settings · Review".
 */
type Card = Extract<NeoCard, { kind: "match-settings" }>;

export const BTN =
  "flex h-9 items-center gap-1.5 rounded-sm px-3.5 text-body-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border";
export const PRIMARY = cn(BTN, "border border-pi-btn-primary-edge bg-pi-btn-fill text-primary-foreground hover:bg-primary-hover");
export const PLAIN = cn(BTN, "border border-pi-line-2 bg-background text-pi-ink shadow-contact hover:bg-pi-fill");
export const GROUP = "text-[11px] font-semibold uppercase tracking-wide text-pi-faint";

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-1.5">
    <dt className="w-28 flex-none text-[13px] text-secondary-foreground">{k}</dt>
    <dd className="flex min-w-0 flex-1 items-start justify-between gap-3 text-[13px] text-foreground">{children}</dd>
  </div>
);

const Radio = ({ on, onPick, children, tag }: { on: boolean; onPick: () => void; children: React.ReactNode; tag?: string }) => (
  <button type="button" role="radio" aria-checked={on} onClick={onPick} className="flex items-start gap-2 py-1 text-left text-[13px] text-foreground">
    <span className={cn("mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full border", on ? "border-pi-brand" : "border-pi-line-2")}>
      {on && <span className="h-2 w-2 rounded-full bg-pi-brand" />}
    </span>
    <span>
      {children}
      {tag && <span className="ml-1 text-pi-faint">({tag})</span>}
    </span>
  </button>
);

const Tick = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label className="flex cursor-pointer items-center gap-2 py-1 text-[13px] text-foreground">
    <Checkbox checked={on} onCheckedChange={(v) => onChange(v === true)} />
    <span className="flex flex-wrap items-center gap-1.5">{children}</span>
  </label>
);

const Num = ({ v, set, w = "w-16", step }: { v: number; set: (n: number) => void; w?: string; step?: string }) => (
  <input
    type="number"
    min={0}
    step={step}
    value={v}
    onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
    className={cn("h-7 flex-none rounded-md border border-input bg-background px-2 text-[13px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border", w)}
  />
);

const Done = ({ children, ok = true }: { children: React.ReactNode; ok?: boolean }) => (
  <div className={cn(SHELL, "flex max-w-[600px] items-center gap-2.5 px-4 py-3 text-[13px]")} data-testid="match-settings-settled">
    {ok && <Check className="h-4 w-4 flex-none text-pi-success" aria-hidden />}
    <span>{children}</span>
  </div>
);

/** The full set of match settings as one editable form; shared by the recon card's side sheet and the Accounting policy page. */
export const MatchSettingsForm = ({ s, setS }: { s: MatchSettings; setS: React.Dispatch<React.SetStateAction<MatchSettings>> }) => {
  const up = <K extends keyof MatchSettings>(k: K, v: MatchSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  return (
    <div data-testid="match-settings-edit">
      <p className={GROUP}>Auto-match <span className="font-normal normal-case tracking-normal">(matched without suggestions)</span></p>
      <p className="mt-1 text-[13px] text-secondary-foreground">Amount and date must be the same, plus:</p>
      <div role="radiogroup" className="mt-0.5 flex flex-wrap gap-x-5">
        <Radio on={s.autoRule === "either"} onPick={() => up("autoRule", "either")}>Reference or narration matches</Radio>
        <Radio on={s.autoRule === "reference"} onPick={() => up("autoRule", "reference")}>Reference must match</Radio>
      </div>

      <p className={cn(GROUP, "mt-4")}>Suggest for review</p>
      <div className="mt-1">
        <Tick on={s.amountOn} onChange={(v) => up("amountOn", v)}>
          Amount within ₹<Num v={s.amountAbs} set={(n) => up("amountAbs", n)} /> or <Num v={s.amountPct} set={(n) => up("amountPct", n)} step="0.1" /> %
        </Tick>
        <Tick on={s.dateOn} onChange={(v) => up("dateOn", v)}>
          Date within <Num v={s.dateDays} set={(n) => up("dateDays", n)} w="w-14" /> days
        </Tick>
        <Tick on={s.refOn} onChange={(v) => up("refOn", v)}>Reference number matches</Tick>
        <Tick on={s.partyOn} onChange={(v) => up("partyOn", v)}>Party name in narration</Tick>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 text-[13px]" role="radiogroup" aria-label="Suggest when">
          <span className="text-secondary-foreground">Suggest when</span>
          <Radio on={s.suggestWhen === "1"} onPick={() => up("suggestWhen", "1")}>any 1</Radio>
          <Radio on={s.suggestWhen === "2"} onPick={() => up("suggestWhen", "2")}>2</Radio>
          <Radio on={s.suggestWhen === "all"} onPick={() => up("suggestWhen", "all")}>all of these fit</Radio>
        </div>
        <Tick on={s.group} onChange={(v) => up("group", v)}>
          One payment for several invoices, up to <Num v={s.groupMax} set={(n) => up("groupMax", n)} w="w-14" />
        </Tick>
      </div>

      <p className={cn(GROUP, "mt-4")}>When date differs</p>
      <Radio on={s.dateDiffers === "keep"} onPick={() => up("dateDiffers", "keep")} tag="recommended">Keep voucher date, set Bank Date</Radio>
      <Radio on={s.dateDiffers === "change"} onPick={() => up("dateDiffers", "change")}>Change voucher date to bank date</Radio>
      {s.dateDiffers === "change" && (
        <p className="ml-6 text-[12px] text-pi-faint">Not possible for a locked period; those vouchers keep their date.</p>
      )}

      <p className={cn(GROUP, "mt-4")}>When amount differs</p>
      <Radio on={s.amountDiffers === "fix"} onPick={() => up("amountDiffers", "fix")} tag="recommended">Suggest a fix line in the voucher</Radio>
      <Radio on={s.amountDiffers === "manual"} onPick={() => up("amountDiffers", "manual")}>Don't suggest, I'll review each one</Radio>
      <Tick on={s.roundOn} onChange={(v) => up("roundOn", v)}>
        Under ₹<Num v={s.roundUnder} set={(n) => up("roundUnder", n)} w="w-14" />: add to Round Off automatically
      </Tick>

      <p className={cn(GROUP, "mt-4")}>Update Tally <span className="font-normal normal-case tracking-normal">(only empty fields are filled)</span></p>
      <div className="mt-1 flex flex-wrap gap-x-6">
        <Tick on={s.fillBankDate} onChange={(v) => up("fillBankDate", v)}>Bank Date</Tick>
        <Tick on={s.fillNarration} onChange={(v) => up("fillNarration", v)}>Narration</Tick>
        <Tick on={s.fillInstrument} onChange={(v) => up("fillInstrument", v)}>Cheque / UTR number and date</Tick>
        <Tick on={s.fillTxnType} onChange={(v) => up("fillTxnType", v)}>Transaction type</Tick>
      </div>

    </div>
  );
};

const MatchSettingsCard = ({ card, live, onAnswer }: { card: Card; live: boolean; onAnswer?: (v: string) => void }) => {
  const [s, setS] = useState<MatchSettings>(MATCH_DEFAULTS);
  const [mode, setMode] = useState<"line" | "view" | "edit">(card.saved ? "line" : "view");
  const [seed] = useState(() => card.initial);
  React.useEffect(() => {
    if (seed) setS({ ...MATCH_DEFAULTS, ...seed });
  }, [seed]);
  const up = <K extends keyof MatchSettings>(k: K, v: MatchSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const sum = summaryOf(s);
  const prev = previewOf(s);

  if (!live || !onAnswer)
    return <Done>{card.saved ? "Using your saved match settings." : "Match settings confirmed."}</Done>;

  const go = (save: boolean) => {
    if (save) saveMatchSettings(s);
    setChosenMatchSettings(s, !save);
    onAnswer(save ? "save" : "once");
  };

  if (mode === "line")
    return (
      <section className={cn(SHELL, "flex max-w-[600px] flex-wrap items-center gap-3 px-4 py-3")} data-testid="match-settings">
        <span className="min-w-0 flex-1 text-[13px] text-foreground">
          Using your saved match settings ·{" "}
          <button type="button" className="font-medium text-pi-brand hover:underline" onClick={() => setMode("view")} data-testid="match-review">
            Review
          </button>
        </span>
        <button type="button" className={PRIMARY} onClick={() => go(false)} data-testid="match-start">
          Start matching
        </button>
      </section>
    );

  const viewCard = (
      <section className={cn(SHELL, "max-w-[600px] px-4 py-4")} data-testid="match-settings">
        <p className={GROUP}>Matching</p>
        <dl className="mt-1">
          <Row k="Auto-match">{sum.auto}</Row>
          <Row k="Suggest">{sum.suggest}</Row>
          <Row k="Group">
            <span>One payment for several invoices</span>
            <Switch checked={s.group} onCheckedChange={(v) => up("group", v)} aria-label="Group several invoices" />
          </Row>
        </dl>
        <p className={cn(GROUP, "mt-3")}>When things don't match exactly</p>
        <dl className="mt-1">
          <Row k="Date differs">{sum.dateDiffers}</Row>
          <Row k="Amount differs">{sum.amountDiffers}</Row>
        </dl>
        <p className={cn(GROUP, "mt-3")}>Update Tally</p>
        <dl className="mt-1">
          <Row k="Fill if empty">
            <span>{sum.fill}</span>
            <Switch
              checked={s.fillBankDate || s.fillNarration}
              onCheckedChange={(v) => setS((x) => ({ ...x, fillBankDate: v, fillNarration: v }))}
              aria-label="Fill empty fields in Tally"
            />
          </Row>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={PRIMARY} onClick={() => go(true)} data-testid="match-start">
            Looks good, start matching
          </button>
          <button type="button" className="text-[13px] font-medium text-pi-brand hover:underline" onClick={() => setMode("edit")} data-testid="match-edit">
            Edit settings
          </button>
        </div>
        <p className="mt-2 text-[12px] text-pi-faint">Saved to Accounting Policy. You can change these anytime.</p>
      </section>
  );

  const editBody = (
    <div>
      <MatchSettingsForm s={s} setS={setS} />
      <p className="mt-4 rounded-lg bg-accent px-3 py-2 text-[13px] text-foreground" data-testid="match-preview">
        <span className="text-secondary-foreground">Preview: </span>
        <span className="tabular-nums">{prev.auto}</span> auto-matched · <span className="tabular-nums">{prev.review}</span> to review · <span className="tabular-nums">{prev.fresh}</span> new entries
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={PRIMARY} onClick={() => go(true)} data-testid="match-save">Save and start</button>
        <button type="button" className={PLAIN} onClick={() => go(false)} data-testid="match-once">Use for this statement only</button>
      </div>
    </div>
  );

  return (
    <>
      {viewCard}
      <Sheet open={mode === "edit"} onOpenChange={(o) => !o && setMode("view")}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle>Match settings</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{editBody}</div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default MatchSettingsCard;
