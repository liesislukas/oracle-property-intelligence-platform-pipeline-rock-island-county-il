// Reader for the PERMIT RECORD SET at `app/data/records/permits.json`, written by
// `pipeline/permits/publish-records.mjs`.
//
// This is a record set, not a manifest. It is deliberately separate from the two manifest readers:
// `app/src/lib/manifests.ts` reads the eight SECTION manifests, and `app/src/lib/stageManifests.ts`
// reads the six STAGE manifests. Record sets are per-dataset and live at
// `app/data/records/<dataset>.json`, so a second dataset (property, ownership) is added by adding a
// file and a reader beside this one — never by widening this one.
//
// Provenance honesty is mechanical here too: the file carries only the rows the page renders, and
// `totals` is always over every extracted record. `records_note` states that difference and is
// rendered verbatim, so the rendered row count can never be mistaken for the record count.

import permits from "../../data/records/permits.json";

export type PermitMatchMethod = "pin-exact" | "legacy-key-exact" | "address-normalized";

export type PermitRecord = {
  id: string;
  permit_number: string;
  permit_date: string | null;
  permit_type_source: string | null;
  purpose: string | null;
  address_source: string | null;
  /** The valuation exactly as the report printed it. `null` means the report printed none —
   *  which is a different fact from a printed `$0.00`. */
  total_cost: string | null;
  matched_pin: string | null;
  match_method: PermitMatchMethod | string | null;
  unmatched_reason: string | null;
  // Per-record provenance. Every field here renders on the row.
  report_month: string;
  report_url: string;
  report_document_id: string;
  report_layout: string;
};

export type PermitLinkage = {
  matched: number;
  total: number;
  match_rate_pct: number;
  by_method: Record<string, number>;
  unmatched: Record<string, number>;
  method_statement: string;
  limits_statement: string;
};

export type PermitDataset = {
  dataset: string;
  label: string;
  county_slug: string;
  jurisdiction: string;
  generated_at: string;
  source_note: string;
  totals: {
    records: number;
    reports: number;
    months: number;
    period_start: string;
    period_end: string;
  };
  rendered_row_count: number;
  records_note: string;
  linkage: PermitLinkage;
  records: PermitRecord[];
};

const DATASET = permits as PermitDataset;

export function getPermitDataset(): PermitDataset {
  return DATASET;
}

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

export function formatCount(n: number): string {
  return COUNT_FORMAT.format(n);
}

/** Labels for the three match tiers. An unrecognised method is returned verbatim rather than
 *  relabelled — coercing a recorded value into a friendlier one would be a fabrication. */
const METHOD_LABELS: Record<string, string> = {
  "pin-exact": "10-digit PIN printed by the report (exact)",
  "legacy-key-exact": "Legacy TAX_MAP key against parcel RICO_PARCE (exact)",
  "address-normalized": "Normalised site address (fallback)",
};

export function formatMatchMethod(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

const UNMATCHED_LABELS: Record<string, string> = {
  "source-sentinel-not-a-parcel-reference": "Source sentinel, not a parcel reference",
  "legacy-key-not-in-current-parcel-layer": "Legacy key not in the current parcel layer",
  "printed-pin-not-in-current-parcel-layer": "Printed PIN not in the current parcel layer",
  "address-ambiguous-or-absent": "Address ambiguous or absent",
  "no-parcel-key-printed": "No parcel key printed",
};

export function formatUnmatchedReason(reason: string): string {
  return UNMATCHED_LABELS[reason] ?? reason;
}
