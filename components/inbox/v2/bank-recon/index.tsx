import React, { useEffect, useMemo, useState } from "react";
import { Check, FileText, Upload } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ComboBox } from "@/components/common/combo-box";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  BANK_DEFAULTS,
  BANK_LEDGERS,
  STATEMENT_INFO,
  inr,
  money,
  shortDate,
  type BankSettings,
} from "@/config/pages/neo/mock-bank-recon";
import {
  approveLines,
  balancesOf,
  countsOf,
  differenceOf,
  getBankRun,
  getSavedBankSettings,
  reopenLine,
  saveBankSettings,
  skipLine,
  startBankRun,
  syncRun,
  tallyTotal,
  useBankRun,
  type BankLineState,
} from "@/hooks/pages/neo/use-bank-recon";
import BankVoucherPanel from "@/components/neo/common/bank-voucher-panel";
import { STATUS_WORD } from "@/components/neo/common/bank-recon-cards";

/**
 * Bank reconciliation, as a page (13 Nov 2026) — the test module beside the
 * Neo chat version. Same engine and the same saved run, but the journey is a
 * workspace you can see whole: four steps across the top (Upload, Settings,
 * Review, Sync), the result as three tabs, and every voucher edit in the side
 * panel. Matched, reconciled and synced stay three different words.
 *
 * DEV: the same /api/bank-recon/runs endpoints as the chat flow.
 */

type Step = "upload" | "settings" | "review" | "sync";
const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "settings", label: "Settings" },
  { id: "review", label: "Review" },
  { id: "sync", label: "Sync" },
];

type Tab = "exact" | "potential" | "none";
const TABS: { id: Tab; word: string; hint: string }[] = [
  { id: "exact", word: "Matched", hint: "Same amount, date and reference" },
  { id: "potential", word: "Check these", hint: "Close, but not certain" },
  { id: "none", word: "New entries needed", hint: "Nothing in Tally yet" },
];

const rupees = (n: number) => `₹${inr(n)}`;

const Stepper = ({ step, reached }: { step: Step; reached: number }) => (
  <ol className="flex items-center gap-2" aria-label="Progress">
    {STEPS.map((s, i) => {
      const done = i < reached;
      const current = s.id === step;
      return (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full border text-[12px] font-semibold",
              done && "border-pi-brand bg-pi-brand text-white",
              current && !done && "border-pi-brand text-pi-brand",
              !done && !current && "border-pi-line-2 text-pi-body"
            )}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span
            className={cn(
              "text-[14px]",
              current ? "font-semibold text-pi-ink" : "text-pi-body"
            )}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-8 bg-pi-line-2" />}
        </li>
      );
    })}
  </ol>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[12px] font-semibold uppercase tracking-wide text-pi-body">
    {children}
  </span>
);

/* ------------------------------------------------------------------ upload */

const UploadStep = ({ onRead }: { onRead: () => void }) => {
  const [file, setFile] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const pick = (name: string) => {
    setFile(name);
    setReading(true);
    window.setTimeout(() => {
      setReading(false);
    }, 900);
  };
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <div>
        <h2 className="text-[20px] font-semibold text-pi-ink">
          Upload the bank statement
        </h2>
        <p className="mt-1 text-[14px] text-pi-body">
          PDF or Excel, from net banking. Neo reads it and shows you what it
          found before anything is matched.
        </p>
      </div>
      {!file ? (
        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-pi-line-2 bg-pi-fill px-6 py-12 text-center hover:border-pi-brand"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]?.name || STATEMENT_INFO.file.name);
          }}
        >
          <Upload className="h-6 w-6 text-pi-body" />
          <span className="text-[14px] font-medium text-pi-ink">
            Drop the statement here, or choose a file
          </span>
          <span className="text-[13px] text-pi-body">PDF, XLS or XLSX</span>
          <input
            type="file"
            accept=".pdf,.xls,.xlsx"
            className="sr-only"
            data-testid="bank-file"
            onChange={(e) => pick(e.target.files?.[0]?.name || STATEMENT_INFO.file.name)}
          />
        </label>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-pi-line-2 bg-background p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-pi-body" />
            <span className="flex-1 truncate text-[14px] font-medium text-pi-ink">
              {file}
            </span>
            <button
              type="button"
              className="text-[13px] text-pi-brand underline underline-offset-2"
              onClick={() => setFile(null)}
            >
              Change
            </button>
          </div>
          {reading ? (
            <p className="text-[14px] text-pi-body">Reading the statement…</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {[
                  ["Bank", STATEMENT_INFO.bank],
                  ["Period", STATEMENT_INFO.period],
                  ["Transactions", "15 (8 in, 7 out)"],
                  ["Opening balance", rupees(STATEMENT_INFO.opening)],
                  ["Closing balance", rupees(544802)],
                  ["Missing days", "None"],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <Label>{k}</Label>
                    <dd className="text-[14px] text-pi-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-center justify-between border-t border-pi-line-2 pt-3">
                <span className="text-[14px] font-medium text-pi-ink">
                  Does this look right?
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setFile(null)}>
                    No, upload another
                  </Button>
                  <Button onClick={onRead} data-testid="bank-yes">
                    Yes, continue
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {!file && (
        <button
          type="button"
          className="self-start text-[14px] text-pi-brand underline underline-offset-2"
          onClick={() => pick(STATEMENT_INFO.file.name)}
          data-testid="bank-sample"
        >
          Use the sample statement
        </button>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- settings */

const SettingsStep = ({
  initial,
  saved,
  onRun,
}: {
  initial: BankSettings;
  saved: boolean;
  onRun: (s: BankSettings) => void;
}) => {
  const [s, setS] = useState(initial);
  const num = (key: "tolerance" | "dateWindow" | "materiality") => (
    <Input
      type="number"
      min={0}
      value={s[key]}
      onChange={(e) => setS({ ...s, [key]: Math.max(0, Number(e.target.value) || 0) })}
      className="h-9"
    />
  );
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <div>
        <h2 className="text-[20px] font-semibold text-pi-ink">
          How should Neo match?
        </h2>
        <p className="mt-1 text-[14px] text-pi-body">
          {saved
            ? "Your saved settings. Change them for this run if you need to."
            : "Set once. Neo saves these and uses them on every later run."}
        </p>
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-pi-line-2 bg-background p-4">
        <div className="flex flex-col gap-1.5">
          <Label>Tally bank ledger</Label>
          <ComboBox
            title="Select Ledger"
            selectedValue={s.ledger}
            onChange={(v) => setS({ ...s, ledger: String(v) })}
            options={BANK_LEDGERS.map((l) => ({ value: l, label: l }))}
            hasSearch={false}
            isMultiSelect={false}
            hideClearButton
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Amount may differ by (₹)</Label>
            {num("tolerance")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date may differ by (days)</Label>
            {num("dateWindow")}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Always review from (₹)</Label>
            {num("materiality")}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-pi-line-2 pt-4">
          <div>
            <div className="text-[14px] font-medium text-pi-ink">
              Suggest group matches
            </div>
            <div className="text-[13px] text-pi-body">
              One bank line against several vouchers. Always reviewed by you.
            </div>
          </div>
          <Switch checked={s.group} onCheckedChange={(g) => setS({ ...s, group: g })} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onRun(s)} data-testid="bank-run">
          Save and compare with Tally
        </Button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ review */

const Status = ({ l }: { l: BankLineState }) => (
  <span
    className={cn(
      "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[12px] font-medium",
      l.status === "reconciled" || l.status === "synced"
        ? "border-pi-brand-border bg-pi-brand-soft text-pi-brand"
        : "border-pi-line-2 bg-pi-fill text-pi-ink"
    )}
  >
    {(l.status === "reconciled" || l.status === "synced") && (
      <Check className="h-3 w-3" />
    )}
    {STATUS_WORD[l.status]}
  </span>
);

const ReviewStep = ({
  onOpen,
  onNext,
}: {
  onOpen: (id: string) => void;
  onNext: () => void;
}) => {
  const run = useBankRun();
  const [tab, setTab] = useState<Tab>("exact");
  const [note, setNote] = useState("");
  if (!run) return null;
  const c = countsOf(run);
  const b = balancesOf(run);
  const rows = run.lines.filter((l) => l.group === tab);
  const open = rows.filter((l) => l.status === "open");
  const count = (t: Tab) => run.lines.filter((l) => l.group === t).length;

  const approveAll = () => {
    const refused = approveLines(open.map((l) => l.line.id));
    setNote(
      refused.length
        ? `${refused.length} line${refused.length > 1 ? "s" : ""} not approved: the amounts differ. Open them to fix.`
        : ""
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Reconciled", `${c.reconciled} of ${c.total}`],
          ["Bank balance", rupees(b.bank)],
          ["Tally balance", rupees(b.book)],
          ["Only in Tally", `${run.inTallyOnly.length} vouchers`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-pi-line-2 bg-background px-4 py-3">
            <Label>{k}</Label>
            <div className="mt-1 text-[18px] font-semibold text-pi-ink">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-end justify-between gap-3 border-b border-pi-line-2">
        <div role="tablist" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[14px]",
                tab === t.id
                  ? "border-pi-brand font-semibold text-pi-ink"
                  : "border-transparent text-pi-body hover:text-pi-ink"
              )}
            >
              {t.word} <span className="ml-1 text-pi-body">{count(t.id)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pb-2">
          <span className="text-[13px] text-pi-body">
            {TABS.find((t) => t.id === tab)?.hint}
          </span>
          {open.length > 0 && (
            <Button size="sm" onClick={approveAll} data-testid="bank-approve-all">
              Approve {open.length}
            </Button>
          )}
        </div>
      </div>
      {note && <p className="text-[13px] text-pi-body">{note}</p>}

      <div className="overflow-hidden rounded-xl border border-pi-line-2 bg-background">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-pi-fill text-[12px] uppercase tracking-wide text-pi-body">
            <tr>
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Bank statement</th>
              <th className="px-4 py-2 text-right font-semibold">Bank</th>
              <th className="px-4 py-2 font-semibold">In Tally</th>
              <th className="px-4 py-2 text-right font-semibold">Difference</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const diff = differenceOf(l);
              return (
                <tr
                  key={l.line.id}
                  className="cursor-pointer border-t border-pi-line-2 hover:bg-pi-fill"
                  onClick={() => onOpen(l.line.id)}
                  data-testid={`bank-row-${l.line.id}`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5">{shortDate(l.line.date)}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-pi-ink">{l.line.text}</div>
                    {l.group !== "exact" && (
                      <div className="text-[13px] text-pi-body">{l.why}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {money(l.line.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    {l.vouchers.length ? (
                      <>
                        <div>{l.vouchers.map((v) => v.no).join(", ")}</div>
                        <div className="text-[13px] tabular-nums text-pi-body">
                          {money(tallyTotal(l))}
                        </div>
                      </>
                    ) : (
                      <span className="text-pi-body">New voucher</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-right tabular-nums",
                      diff !== 0 && "font-semibold text-pi-ink"
                    )}
                  >
                    {diff === 0 ? "—" : money(diff)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Status l={l} />
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-2.5 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {l.status === "open" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => skipLine(l.line.id)}
                        >
                          Skip
                        </Button>
                        <Button size="sm" onClick={() => onOpen(l.line.id)}>
                          Review
                        </Button>
                      </div>
                    ) : l.status !== "synced" ? (
                      <Button size="sm" variant="outline" onClick={() => reopenLine(l.line.id)}>
                        Reopen
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[13px] text-pi-body">
          Progress is saved. Lines you have not approved are never sent to Tally.
        </span>
        <Button onClick={onNext} disabled={c.reconciled === 0} data-testid="bank-to-sync">
          Continue to sync
        </Button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- sync */

const SyncStep = ({ onBack }: { onBack: () => void }) => {
  const run = useBankRun();
  if (!run) return null;
  const c = countsOf(run);
  const b = balancesOf(run);
  const done = !!run.syncedAt;
  const pending = c.total - c.reconciled;
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <div>
        <h2 className="text-[20px] font-semibold text-pi-ink">
          {done ? "Synced to Tally" : "Send the approved changes to Tally"}
        </h2>
        <p className="mt-1 text-[14px] text-pi-body">
          {done
            ? "Saved in your reconciliation history."
            : "Only lines you approved are sent. The rest stay as they are."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-pi-line-2 bg-background p-4">
        {[
          ["Reconciled", `${c.reconciled}`],
          ["New vouchers", `${c.created}`],
          ["Not reviewed or skipped", `${pending}`],
          ["Bank balance", rupees(b.bank)],
          ["Tally balance after sync", rupees(b.book)],
          ["Difference", rupees(Math.abs(b.bank - b.book))],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <Label>{k}</Label>
            <span className="text-[16px] font-semibold text-pi-ink">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back to review
        </Button>
        {!done && (
          <Button onClick={() => syncRun()} disabled={c.reconciled === 0} data-testid="bank-sync">
            Sync {c.reconciled} to Tally
          </Button>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------- page */

const BankReconTest = () => {
  const run = useBankRun();
  const [step, setStep] = useState<Step>("upload");
  const [panel, setPanel] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const saved = useMemo(() => (mounted ? getSavedBankSettings() : null), [mounted]);

  useEffect(() => {
    setMounted(true);
    // Pick up a run left half-done.
    const r = getBankRun();
    if (r) setStep(r.syncedAt ? "sync" : "review");
  }, []);

  const reached = STEPS.findIndex((s) => s.id === step);
  const line = run?.lines.find((l) => l.line.id === panel);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto bg-background p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-pi-ink">
            Bank reconciliation
          </h1>
          <p className="text-[13px] text-pi-body">
            Test module · {run?.ledger ?? BANK_DEFAULTS.ledger}
          </p>
        </div>
        <Stepper step={step} reached={reached} />
      </div>

      {step === "upload" && <UploadStep onRead={() => setStep("settings")} />}
      {step === "settings" && (
        <SettingsStep
          initial={saved ?? BANK_DEFAULTS}
          saved={!!saved}
          onRun={(s) => {
            saveBankSettings(s);
            startBankRun(s);
            setStep("review");
          }}
        />
      )}
      {step === "review" && (
        <ReviewStep onOpen={setPanel} onNext={() => setStep("sync")} />
      )}
      {step === "sync" && <SyncStep onBack={() => setStep("review")} />}

      <Sheet open={!!line} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent side="right" className="w-full overflow-auto sm:max-w-[520px]">
          <SheetHeader>
            <SheetTitle>
              {line ? `${shortDate(line.line.date)} · ${line.line.text}` : "Voucher"}
            </SheetTitle>
            <SheetDescription>
              {line ? money(line.line.amount) : ""}
            </SheetDescription>
          </SheetHeader>
          {line && (
            <BankVoucherPanel lineId={line.line.id} onClose={() => setPanel(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BankReconTest;
