import { formatCount, getPermitDataset } from "@/lib/permits";

import { PermitLinkageSummary } from "./PermitLinkageSummary";
import { PermitRecordsTable } from "./PermitRecordsTable";

// One dataset panel on the Data Browser page. Each loaded dataset gets one of these — permits here,
// property and ownership beside it when their stages have run. A panel owns its own heading,
// provenance note, linkage summary and table, so adding the next dataset is adding a panel, never
// editing this one.
export function PermitRecordsPanel() {
  const dataset = getPermitDataset();

  return (
    <section
      data-testid="dataset-permits"
      className="mt-10 rounded-md border border-black/10 p-6 dark:border-white/15"
    >
      <h2 className="text-lg font-semibold">{dataset.label}</h2>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-black/50 dark:text-white/50">Records loaded</dt>
          <dd
            data-testid="dataset-permits-total"
            className="text-black/80 dark:text-white/80"
          >
            {formatCount(dataset.totals.records)}
          </dd>
        </div>
        <div>
          <dt className="text-black/50 dark:text-white/50">Source reports</dt>
          <dd className="text-black/80 dark:text-white/80">
            {formatCount(dataset.totals.reports)} monthly PDF reports
          </dd>
        </div>
        <div>
          <dt className="text-black/50 dark:text-white/50">Period covered</dt>
          <dd className="text-black/80 dark:text-white/80">
            {dataset.totals.period_start} to {dataset.totals.period_end}
          </dd>
        </div>
        <div>
          <dt className="text-black/50 dark:text-white/50">Jurisdiction</dt>
          <dd className="text-black/80 dark:text-white/80">
            City of Rock Island only — 1 of the county&rsquo;s 16 permit jurisdictions
          </dd>
        </div>
      </dl>

      <p
        data-testid="dataset-permits-source-note"
        className="mt-4 text-sm text-black/70 dark:text-white/70"
      >
        {dataset.source_note}
      </p>

      <PermitLinkageSummary />

      <div className="mt-10">
        <PermitRecordsTable />
      </div>
    </section>
  );
}
