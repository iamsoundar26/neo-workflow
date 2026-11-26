import React from "react";
import { Check, CircleAlert, Upload } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { NeoCard } from "@/types/pages/neo";

/**
 * Tally rows that can't be read (US-03), as one short decision in the chat.
 * Two ways on: upload a corrected export, which Neo checks again and, when it
 * reads, goes straight on to match; or run with the rows that can be read,
 * which keeps "Partial · N Tally rows excluded" on the result.
 *
 * The upload button is a label around the file input, so the picker opens on
 * the tap itself. The answer is "upload:<file name>", "partial" or "cancel".
 *
 * DEV: POST /api/recon/runs/:id/sources/:sourceId/replace (multipart), which
 * returns the new version's accepted and rejected rows.
 */
type Fix = Extract<NeoCard, { kind: "source-fix" }>;

const shell =
  "rounded-xl border border-pi-line-2 bg-background px-4 py-3.5 shadow-contact";
const BTN =
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm px-3.5 text-body-3 font-semibold transition-colors focus-within:ring-2 focus-within:ring-border";
const PRIMARY = cn(
  BTN,
  "border border-pi-btn-primary-edge bg-pi-btn-fill text-primary-foreground hover:bg-primary-hover"
);
const PLAIN = cn(
  BTN,
  "border border-pi-line-2 bg-background text-pi-ink shadow-contact hover:bg-pi-fill"
);

const plural = (n: number) => `${n} Tally row${n === 1 ? "" : "s"}`;

/** The card once it has been answered: one line, no buttons. */
const Settled = ({ card }: { card: Fix }) => {
  const n = card.rows.length;
  const line =
    card.state === "partial"
      ? { ok: true, text: `Partial · ${plural(n)} excluded` }
      : card.state === "fixed"
        ? { ok: true, text: `${card.attempt} reads cleanly. Matching started.` }
        : card.state === "retried"
          ? {
              ok: false,
              text: `${card.attempt} still has ${plural(n)} to fix.`,
            }
          : card.state === "checking"
            ? { ok: null, text: `Checking ${card.attempt}…` }
            : { ok: false, text: `${plural(n)} need fixing.` };
  return (
    <div className={cn(shell, "flex items-center gap-2.5 py-3")}>
      {line.ok === null ? (
        <Spinner className="h-4 w-4 flex-none" />
      ) : line.ok ? (
        <Check className="h-4 w-4 flex-none text-pi-brand" />
      ) : (
        <CircleAlert className="h-4 w-4 flex-none text-pi-body" />
      )}
      <span className="text-body-3 text-pi-ink">{line.text}</span>
      <span className="ml-auto truncate text-body-4 text-pi-body">
        {card.account}
      </span>
    </div>
  );
};

const SourceFixCard = ({
  card,
  live,
  onAnswer,
}: {
  card: Fix;
  live: boolean;
  onAnswer?: (value: string) => void;
}) => {
  if (!live || !onAnswer || card.state === "checking") return <Settled card={card} />;
  const n = card.rows.length;
  const failed = card.state === "failed";
  const pick = (name: string) => onAnswer(`upload:${name}`);
  return (
    <div className={shell} data-testid="source-fix">
      <div className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 h-4 w-4 flex-none text-pi-body" />
        <div className="min-w-0">
          <p className="text-body-2 font-semibold text-pi-ink">
            {failed
              ? `${card.attempt} still has ${plural(n)} to fix`
              : `${plural(n)} need fixing`}
          </p>
          <p className="text-body-4 text-pi-body">
            {card.account} · {card.file}
          </p>
        </div>
      </div>
      <ul className="mt-2.5 flex flex-col gap-1.5 pl-[26px]">
        {card.rows.map((r) => (
          <li key={r.line} className="text-body-3 text-pi-ink">
            <span className="font-medium">
              Line {r.line}
              {r.ref ? ` · ${r.ref}` : ""}
            </span>
            <span className="text-pi-body"> — {r.issue}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3.5 flex flex-wrap items-center gap-2 pl-[26px]">
        <label className={PRIMARY}>
          <Upload className="h-3.5 w-3.5" />
          {failed ? "Upload corrected export again" : "Upload corrected export"}
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            className="sr-only"
            data-testid="source-fix-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) pick(f.name);
            }}
          />
        </label>
        <button
          type="button"
          className={PLAIN}
          onClick={() => onAnswer("partial")}
        >
          Run with available rows
        </button>
      </div>
      <p className="mt-2.5 pl-[26px] text-body-4 text-pi-body">
        Running with available rows leaves out {plural(n)} and marks the result
        Partial.{" "}
        <button
          type="button"
          className="text-pi-brand underline underline-offset-2"
          onClick={() => onAnswer("upload:SAMPLE")}
        >
          Use the sample corrected export
        </button>
        {" · "}
        <button
          type="button"
          className="text-pi-brand underline underline-offset-2"
          onClick={() => onAnswer("cancel")}
        >
          Cancel the run
        </button>
      </p>
    </div>
  );
};

export default SourceFixCard;
