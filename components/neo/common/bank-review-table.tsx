import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import LineDetail from "./bank-review/detail";
import TxnTable from "./bank-flow/txn-table";
import { useSheetFocus, type Scope } from "@/hooks/pages/neo/use-bank-review";

/**
 * The Review Table (18 Nov 2026), as Bank reconciliation 2 shows it: every
 * bank line of the reference sheet, each starting from the sheet's own status.
 * Tabs by match status; a line opens as Transaction Details with the action
 * the sheet names for it.
 *
 * The Bank reconciliation agent shows the same table inside its own panel
 * (bank-flow/panel.tsx), where every line starts unreconciled.
 *
 * DEV: PATCH /api/bank-recon/runs/:id/lines/:lineId.
 */
const BankReviewTable = ({ scope = "flow" }: { scope?: Scope }) => {
    const [open, setOpen] = useState<string | null>(null);
  // A group tile in the chat opens the table on that group.
  const focus = useSheetFocus();
  useEffect(() => {
    if (focus.n === 0) return;
    setOpen(null);
  }, [focus.n]);
  return (
    <>
      {open && <LineDetail key={open} id={open} scope={scope} onClose={() => setOpen(null)} />}
      {/* Kept mounted behind an open line, so its filters and page stay as they were. */}
      <div className={cn("h-full min-h-0 flex-col bg-background", open ? "hidden" : "flex")}>
        <TxnTable scope={scope} focus={focus.n ? focus.tab : undefined} nonce={focus.n} onOpen={setOpen} />
      </div>
    </>
  );
};

export default BankReviewTable;
