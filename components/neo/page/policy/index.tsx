import React, { useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PLAIN, PRIMARY } from "@/components/neo/common/bank-flow/settings-card";
import { NeoMenuButton } from "@/components/neo/page";
import { cn } from "@/lib/utils";

/**
 * Accounting policy (25 Nov 2026): one policy, a name and a description. It
 * opens locked, with a sample filled in; Edit unlocks the two fields, Save
 * locks them again.
 *
 * DEV: GET/PUT /api/accounting-policy
 */
type Policy = { description: string };
const KEY = "neo.accounting-policy.v1";

/** Shown until the user saves their own. */
const SAMPLE: Policy = {
  description: [
    "Books are kept on an accrual basis, in INR, for the financial year 1 April to 31 March.",
    "Bank statements are matched to vouchers by amount and date first. Small differences, up to ₹10 or 0.5%, go to review instead of being matched automatically.",
    "Payments to vendors are booked against the vendor's open bills, oldest first.",
    "Bank charges, interest and round-off post to their own ledgers without asking.",
    "Anything Neo is unsure about is left for a person to approve. Neo never posts to a locked period.",
  ].join("\n"),
};

const load = (): Policy | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { description: String(JSON.parse(raw).description ?? SAMPLE.description) } : null;
  } catch {
    return null;
  }
};

const NeoPolicy = () => {
  const [saved, setSaved] = useState<Policy>(SAMPLE);
  const [draft, setDraft] = useState<Policy>(SAMPLE);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const p = load();
    if (p) {
      setSaved(p);
      setDraft(p);
    }
  }, []);
  useEffect(() => {
    if (!justSaved) return;
    const t = window.setTimeout(() => setJustSaved(false), 2500);
    return () => window.clearTimeout(t);
  }, [justSaved]);
  useEffect(() => {
    if (editing) areaRef.current?.focus();
  }, [editing]);

  const dirty = draft.description !== saved.description;
  const save = () => {
    const next = { description: draft.description.trim() };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private window: kept for this session only */
    }
    setSaved(next);
    setDraft(next);
    setEditing(false);
    setJustSaved(true);
  };
  const cancel = () => {
    setDraft(saved);
    setEditing(false);
  };

  // Locked fields read as text in a quiet box, not as disabled controls.
  const locked = "cursor-default border-pi-line bg-pi-fill/60 text-foreground focus-visible:ring-0 read-only:opacity-100";

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background" data-testid="neo-policy">
      <header className="flex h-12 flex-none items-center gap-2 border-b border-pi-line px-4">
        <NeoMenuButton className="-ml-2 lg:hidden" />
        <h1 className="text-label-1 font-semibold text-foreground">Accounting policy</h1>
        <div className="ml-auto flex items-center gap-2">
          {justSaved && !editing && (
            <span className="mr-1 inline-flex items-center gap-1.5 text-[13px] text-pi-success" role="status" data-testid="policy-status">
              <Check className="h-4 w-4" aria-hidden /> Saved
            </span>
          )}
          {!editing ? (
            <button type="button" className={cn(PLAIN, "h-8 gap-1.5 px-3")} onClick={() => setEditing(true)} data-testid="policy-edit">
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </button>
          ) : (
            <>
              <button type="button" className={cn(PLAIN, "h-8 px-3")} onClick={cancel} data-testid="policy-discard">
                Cancel
              </button>
              <button type="button" className={cn(PRIMARY, "h-8 px-3 disabled:opacity-50")} onClick={save} disabled={!dirty} data-testid="policy-save">
                Save changes
              </button>
            </>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-6 py-8">
          <p className="mb-6 max-w-[560px] text-[14px] leading-relaxed text-secondary-foreground">
            This is how your company keeps its books. Neo reads it before it works, so it follows your rules and asks you less.
          </p>

          <section aria-label="Accounting policy">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-foreground">Policy description</span>
                <Textarea
                  ref={areaRef}
                  value={draft.description}
                  readOnly={!editing}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="What this policy covers and how Neo should work by it"
                  rows={12}
                  className={cn("leading-relaxed", !editing && locked)}
                  data-testid="policy-description"
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default NeoPolicy;
