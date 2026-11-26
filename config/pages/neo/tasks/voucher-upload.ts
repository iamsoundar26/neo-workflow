import { receiveNeoUpload, type NeoUploadSpec } from "@/components/inbox/v2/store";
import type { NeoAttachment, NeoCard, NeoTask, NeoTaskApi } from "@/types/pages/neo";
import { getSalesBatch, salesUpload } from "@/hooks/pages/inbox/use-sales-upload";
import { ARVoucherImportBatchStatus } from "@/types/pages/inbox/sales-upload";
import { getState } from "@/components/inbox/v2/store";
import { has } from "@/utils/pages/neo";

/**
 * Upload a bill or invoice in chat (19 Nov 2026). Neo reads the file, saves it
 * to Voucher Desk (the Inbox) and says so in one line, with a short summary
 * and a quiet chip. Nothing is asked and nothing opens by itself: the chip is
 * how a person looks at it, in the side panel, filtered to this upload.
 *
 * DEV: POST /api/inbox/documents, then the reply carries the upload's batch id.
 */

const SAMPLE_ONE: NeoUploadSpec[] = [
  { name: "INV-1024.pdf", route: "AP", party: "ABC Traders", invoiceNo: "INV-1024", amount: 12500 },
];
const SAMPLE_THREE: NeoUploadSpec[] = [
  { name: "INV-1031.pdf", route: "AP", party: "Sri Lakshmi Packaging", invoiceNo: "INV-1031", amount: 18400 },
  { name: "INV-1032.pdf", route: "AP", party: "Metro Hardware", invoiceNo: "INV-1032", amount: 7250 },
  { name: "SI-0457.pdf", route: "AR", party: "Kumar Enterprises", invoiceNo: "SI-0457", amount: 31000 },
];

const READABLE = /\.(pdf|png|jpe?g|heic|webp)$/i;
const SHEET = /\.(xlsx?|csv)$/i;
const TYPE = { AP: "Purchase bill", AR: "Sales invoice", JV: "Journal" } as const;

/** A spreadsheet of sales invoices, not a bank statement or a payout file. */
const SALES_SHEET = /sales|invoice|register|bulk|import/i;
const NOT_SALES = /bank|statement|recon\w*|payout|settle\w*|zomato|swiggy/i;
const salesSheet = (a: NeoAttachment) => SHEET.test(a.name) && SALES_SHEET.test(a.name) && !NOT_SALES.test(a.name);
const SAMPLE_SHEET = { name: "Sales_Register_Oct2026.xlsx", size: 52 * 1024 };

const specOf = (a: NeoAttachment): NeoUploadSpec => ({
  name: a.name,
  size: a.size,
  route: /^(si|sales|sale)\b|sales/i.test(a.name) ? "AR" : "AP",
});

/**
 * A spreadsheet of sales invoices: Neo reads it, maps the columns and builds
 * the Sales module's own preview, then offers it behind the Voucher Desk chip.
 * Creating the invoices stays a click in that preview.
 */
const sheetFlow = async (api: NeoTaskApi, file: { name: string; size: number }) => {
  const company = api.context.company || getState().company;
  const reading = await api.step("Reading your file");
  const id = salesUpload.createBatch(company, file, null);
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 120 && !done(); i++) await api.wait(300);
  };
  await until(() => getSalesBatch(id)?.batch.status !== ARVoucherImportBatchStatus.PROCESSING);
  const read = getSalesBatch(id);
  if (!read || read.batch.status === ARVoucherImportBatchStatus.FAILED) {
    reading("Couldn't read the file");
    api.show({
      kind: "voucher-desk",
      batchId: "failed",
      state: "failed",
      files: [],
      error: `I couldn't read ${file.name}, so nothing was added to Voucher Desk.`,
    });
    return "Upload failed";
  }
  reading(`Read ${read.batch.totalRows} rows`);
  const checking = await api.step("Matching the columns and checking each invoice");
  salesUpload.startPreview(id);
  await until(() => getSalesBatch(id)?.batch.status === ARVoucherImportBatchStatus.NEEDS_REVIEW);
  const done = getSalesBatch(id);
  if (done?.batch.status !== ARVoucherImportBatchStatus.NEEDS_REVIEW) {
    checking("Couldn't finish checking");
    return "Upload failed";
  }
  checking("Checked every row");
  const rows = done.rows.length;
  const attention = done.batch.warningRows + done.batch.errorRows;
  // Filing a spreadsheet is not creating invoices: that is a click in the preview.
  await api.say("I've processed your file and added it to Voucher Desk.");
  api.show({
    kind: "voucher-desk",
    batchId: id,
    state: "ready",
    files: [{ id, name: file.name, type: "Sales invoices", party: "", amount: 0 }],
    sales: { importBatchId: id, rows, attention },
  });
  return "Added to Voucher Desk";
};

const voucherUpload: NeoTask = {
  id: "voucher-upload",
  title: "Add a bill or invoice to Voucher Desk",
  match: (p, _ctx, attachments = []) => {
    if (has(p, /\b(bank|recon\w*|3-way|three-way|statement)\b/i)) return 0;
    if (attachments.some(salesSheet)) return 90;
    if (attachments.some((a) => SHEET.test(a.name))) return 0;
    if (has(p, /\b(upload|add|process|import)\b.*\bsales\b.*\b(csv|excel|sheet|register|invoices?)\b/i)) return 88;
    if (attachments.length > 0) return 85;
    return has(p, /\b(upload|add|process|read|scan)\b.*\b(bills?|invoices?)\b/i) ? 80 : 0;
  },
  run: async (api) => {
    let specs: NeoUploadSpec[];
    let sheet: { name: string; size: number } | null = null;
    const sheetIn = api.attachments.find(salesSheet);
    if (sheetIn) sheet = { name: sheetIn.name, size: sheetIn.size ?? 0 };
    else if (!api.attachments.length && has(api.prompt, /\bsales\b/i)) sheet = SAMPLE_SHEET;
    if (sheet) return sheetFlow(api, sheet);
    if (api.attachments.length) {
      const bad = api.attachments.find((a) => !READABLE.test(a.name));
      if (bad) {
        // A failed upload never gets a Voucher Desk reference.
        api.show({
          kind: "voucher-desk",
          batchId: "failed",
          state: "failed",
          files: [],
          error: `I couldn't read ${bad.name}, so nothing was added to Voucher Desk. Upload a PDF or an image of the bill.`,
        } as NeoCard);
        return "Upload failed";
      }
      specs = api.attachments.map(specOf);
    } else {
      const pick = await api.ask("No file attached. Which should I use?", [
        { id: "one", label: "One bill", hint: "INV-1024.pdf" },
        { id: "three", label: "Three files", hint: "2 purchase bills, 1 sales invoice" },
        { id: "sheet", label: "Sales spreadsheet", hint: "Many invoices in one file" },
      ]);
      if (pick === "sheet") return sheetFlow(api, SAMPLE_SHEET);
      specs = pick === "three" ? SAMPLE_THREE : SAMPLE_ONE;
    }

    const many = specs.length > 1;
    const reading = await api.step(many ? `Reading ${specs.length} files` : "Reading your document");
    await api.wait(1400);
    const batchId = Date.now().toString(36);
    const made = receiveNeoUpload(batchId, specs);
    reading(many ? `Read ${made.length} files` : "Read your document");

    // Filing a document is not an entry: nothing here is created or sent to Tally.
    await api.say(
      many
        ? `I've processed your ${made.length} files and added them to Voucher Desk.`
        : `I've processed your ${made[0].route === "AR" ? "invoice" : "bill"} and added it to Voucher Desk.`
    );
    api.show({
      kind: "voucher-desk",
      batchId,
      state: "ready",
      files: made.map((x) => ({
        id: x.id,
        name: x.file.name,
        type: TYPE[x.route],
        party: x.form.party,
        amount: x.amount,
      })),
    });
    return "Added to Voucher Desk";
  },
};

export default voucherUpload;
