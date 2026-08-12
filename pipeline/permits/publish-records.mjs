// WI-10 support — publish the browsable permit record set the explorer's /data page reads.
//
//   node permits/publish-records.mjs
//
// This is NOT a stage manifest. Stage manifests live in data/manifests/ and are synced by
// scripts/sync-manifests.mjs; this is a record set, and it lives beside future record sets at
// data/records/<dataset>.json so another dataset (property, ownership) can be added next to it
// without touching this one.
//
// Bounding, and why it is stated rather than hidden: 25,354 records will not be shipped into a
// browser bundle. The file carries the 2,000 most recent; the page renders the 250 most recent and
// says so on the page itself. Every count in `totals` is over ALL records, never over the sample.

import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { dirs, files, repoRoot, toJson } from "./paths.mjs";

// The plan sized the published sample at 2,000 records on the estimate of ~300 bytes each (~600 KB).
// Measured, the real records average 613 bytes and 2,000 of them weigh 1.2 MB — all but 250 of it
// dead weight, because the page renders 250. The published sample is therefore exactly what the
// page renders. The visible contract (250 rows, the total stated beside them) is unchanged.
const RENDERED = 250;
const FILE_SAMPLE = RENDERED;

const CANONICAL = path.join(repoRoot, "data", "records", "permits.json");
const APP_COPY = path.join(repoRoot, "app", "data", "records", "permits.json");

/** "MM/DD/YYYY" -> "YYYY-MM-DD" for sorting. Absent dates sort last. */
function sortKey(printed) {
  if (typeof printed !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(printed)) return "0000-00-00";
  const [mm, dd, yyyy] = printed.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const coverage = JSON.parse(await readFile(files.coverage, "utf8"));
  const linkage = JSON.parse(await readFile(files.linkage, "utf8"));

  const all = [];
  const names = (await readdir(dirs.extracted)).filter((f) => f.endsWith(".json")).sort();
  for (const name of names) {
    const artifact = JSON.parse(await readFile(path.join(dirs.extracted, name), "utf8"));
    for (const record of artifact.records) {
      all.push({
        id: record.id,
        permit_number: record.permit_number,
        permit_date: record.permit_date ?? null,
        permit_type_source: record.permit_type_source ?? null,
        purpose: record.purpose ?? null,
        address_source: record.address_source ?? null,
        total_cost: record.total_cost ?? null,
        matched_pin: record.matched_pin ?? null,
        match_method: record.match_method ?? null,
        unmatched_reason: record.unmatched_reason ?? null,
        // Per-record provenance. Every one of these renders on the row.
        report_month: record.report_month,
        report_url: record.report_url,
        report_document_id: record.report_document_id,
        report_layout: record.report_layout,
      });
    }
  }

  all.sort((a, b) => {
    const byDate = sortKey(b.permit_date).localeCompare(sortKey(a.permit_date));
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });
  const sample = all.slice(0, FILE_SAMPLE);

  const total = all.length;
  const dataset = {
    dataset: "permits",
    label: "Permit records — City of Rock Island",
    county_slug: coverage.county_slug,
    jurisdiction: "rock-island",
    generated_at: new Date().toISOString(),
    source_note: `Extracted from ${coverage.report_count} City of Rock Island monthly PDF permit reports at https://rigov.org/1276/Permit-Reports, covering ${coverage.period_start} to ${coverage.period_end}. The other fifteen permit jurisdictions in Rock Island County are documented on the Sources page; none of them was harvested, and a parcel with no permits found here is not a parcel with no permits.`,
    totals: {
      records: total,
      reports: coverage.report_count,
      months: coverage.report_count,
      period_start: coverage.period_start,
      period_end: coverage.period_end,
    },
    rendered_row_count: RENDERED,
    records_note: `Showing the ${RENDERED} most recent of ${total.toLocaleString("en-US")} extracted permit records, newest permit date first. The full set is loaded in the pipeline database and committed under data/artifacts/permits/ — it is not shipped to the browser. Every count on this page is over all ${total.toLocaleString("en-US")} records, not over the ${RENDERED} rows shown.`,
    linkage: {
      matched: linkage.matched,
      total: linkage.total_permit_records,
      match_rate_pct: linkage.match_rate_pct,
      by_method: linkage.by_method,
      unmatched: linkage.unmatched,
      method_statement: linkage.method_statement,
      limits_statement: linkage.limits_statement,
    },
    records: sample,
  };

  const bytes = toJson(dataset);
  await mkdir(path.dirname(CANONICAL), { recursive: true });
  await mkdir(path.dirname(APP_COPY), { recursive: true });
  await writeFile(CANONICAL, bytes);
  await copyFile(CANONICAL, APP_COPY);

  console.log(
    `records: wrote data/records/permits.json and app/data/records/permits.json (${Buffer.byteLength(bytes)} B) — ${sample.length} of ${total} records, newest ${sample[0].permit_date}`,
  );
}

await main();
