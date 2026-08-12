// WI-4 — Extract permit records from both monthly report layouts, with per-record provenance.
//
//   npm run extract:permits
//
// Writes extracted/<YYYY-MM>.json: one record per permit block, every record carrying the report
// URL, document id, sha256, month, layout, page and extraction timestamp.
//
// Both layouts are parsed by x-band from the text-item transforms pdfjs exposes. A document whose
// header row matches neither layout is recorded as `unknown-layout` with zero records — never
// guessed at, never OCR'd.
//
// The reports print one block per parcel, so a permit spanning several parcels prints several
// blocks. Every block is kept as its own record; records are NOT de-duplicated by permit number.

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  COUNTY_SLUG,
  JOB_ID,
  JURISDICTION,
  dirs,
  ensureDirs,
  toJson,
} from "./paths.mjs";

const LEGACY_BANDS = {
  permit_number: [16, 56],
  permit_date: [56, 110],
  party_name: [110, 270],
  party_role: [270, 330],
  purpose: [330, 530],
  tax_map: [530, 596],
  address: [596, 700],
  total_cost: [700, 792],
};

const ENERGOV_BANDS = {
  permit_number: [40, 105],
  address: [105, 175],
  permit_type: [175, 220],
  permit_issue_date: [220, 262],
  purpose: [262, 440],
  permit_application_date: [440, 492],
  total_cost: [492, 528],
  parcel_number: [528, 612],
};

const LEGACY_PERMIT_RE = /^[A-Z]{1,4}\d{5,9}$/;
const ENERGOV_PERMIT_RE = /^[A-Z]{3,12}-?\d{4}-?\d{4,6}$/;
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const COST_RE = /^\$[\d,]+\.\d{2}$/;

const band = (row, [lo, hi]) =>
  row
    .filter((item) => item.x >= lo && item.x < hi)
    .map((item) => item.s)
    .join(" ")
    .trim();

/** Every page's text items grouped into rows, top-to-bottom, each row left-to-right. */
async function readRows(file) {
  const data = new Uint8Array(await readFile(file));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const buckets = new Map();
    for (const item of content.items) {
      const s = typeof item.str === "string" ? item.str.trim() : "";
      if (s === "") continue;
      const x = item.transform[4];
      const y = item.transform[5];
      const key = Math.round(y / 2);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ x, y, s });
    }
    // PDF origin is bottom-left, so descending y is top-to-bottom.
    const rows = [...buckets.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x));
    pages.push(rows);
  }
  await pdf.cleanup();
  return pages;
}

function detectLayout(pages) {
  for (const rows of pages) {
    for (const row of rows) {
      const text = row.map((i) => i.s).join(" ");
      if (text.includes("TAX_MAP") && text.includes("PURPOSE")) return "legacy-tabular";
    }
  }
  for (const rows of pages) {
    for (const row of rows) {
      const text = row.map((i) => i.s).join(" ");
      if (text.includes("Permit Number") && text.includes("Parcel Number")) {
        return "energov-tabular";
      }
    }
  }
  return "unknown-layout";
}

function appendAddress(record, value) {
  if (!value) return;
  const parts = record.address_source ? record.address_source.split("; ") : [];
  if (parts.includes(value)) return;
  parts.push(value);
  record.address_source = parts.join("; ");
}

function parseLegacy(pages) {
  const records = [];
  let section = null;
  let current = null;

  pages.forEach((rows, pageIndex) => {
    for (const row of rows) {
      const text = row.map((i) => i.s).join(" ");
      if ((text.includes("TAX_MAP") && text.includes("PURPOSE")) || text.startsWith("Permit #")) {
        continue;
      }
      if (row.length === 1 && row[0].x < 16) {
        section = row[0].s;
        continue;
      }

      const permitNumber = band(row, LEGACY_BANDS.permit_number);
      if (LEGACY_PERMIT_RE.test(permitNumber)) {
        current = {
          permit_number: permitNumber,
          permit_date: null,
          permit_type_source: section,
          purpose: null,
          parties: [],
          tax_map: null,
          parcel_number_source: null,
          address_source: null,
          total_cost: null,
          source_page: pageIndex + 1,
        };
        records.push(current);
      }
      if (!current) continue;

      const date = band(row, LEGACY_BANDS.permit_date);
      if (current.permit_date === null && DATE_RE.test(date)) current.permit_date = date;

      const partyName = band(row, LEGACY_BANDS.party_name);
      if (partyName !== "") {
        const role = band(row, LEGACY_BANDS.party_role);
        // A party whose role band is empty is stored with role null. Never defaulted to "Owner".
        current.parties.push({ name: partyName, role: role === "" ? null : role });
      }

      const purpose = band(row, LEGACY_BANDS.purpose);
      if (purpose !== "") {
        current.purpose = current.purpose ? `${current.purpose} ${purpose}` : purpose;
      }

      const taxMap = band(row, LEGACY_BANDS.tax_map);
      if (current.tax_map === null && taxMap !== "") current.tax_map = taxMap;

      appendAddress(current, band(row, LEGACY_BANDS.address));

      const cost = band(row, LEGACY_BANDS.total_cost);
      if (current.total_cost === null && COST_RE.test(cost)) current.total_cost = cost;
    }
  });

  return records;
}

function parseEnergov(pages) {
  const records = [];
  let current = null;

  pages.forEach((rows, pageIndex) => {
    for (const row of rows) {
      const text = row.map((i) => i.s).join(" ");
      if (text.includes("Permit Number") && text.includes("Parcel Number")) continue;

      const permitNumber = band(row, ENERGOV_BANDS.permit_number);
      if (ENERGOV_PERMIT_RE.test(permitNumber)) {
        current = {
          permit_number: permitNumber,
          permit_date: null,
          permit_type_source: null,
          purpose: null,
          // The EnerGov report prints no owner or contractor. An empty array is the honest
          // representation of a column the source does not carry.
          parties: [],
          tax_map: null,
          parcel_number_source: null,
          address_source: null,
          total_cost: null,
          permit_application_date: null,
          source_page: pageIndex + 1,
        };
        records.push(current);
      }
      if (!current) continue;

      const issueDate = band(row, ENERGOV_BANDS.permit_issue_date);
      if (current.permit_date === null && DATE_RE.test(issueDate)) current.permit_date = issueDate;

      const applicationDate = band(row, ENERGOV_BANDS.permit_application_date);
      if (current.permit_application_date === null && DATE_RE.test(applicationDate)) {
        current.permit_application_date = applicationDate;
      }

      const type = band(row, ENERGOV_BANDS.permit_type);
      if (current.permit_type_source === null && type !== "") current.permit_type_source = type;

      const purpose = band(row, ENERGOV_BANDS.purpose);
      if (purpose !== "") {
        current.purpose = current.purpose ? `${current.purpose} ${purpose}` : purpose;
      }

      appendAddress(current, band(row, ENERGOV_BANDS.address));

      const cost = band(row, ENERGOV_BANDS.total_cost);
      if (current.total_cost === null && COST_RE.test(cost)) current.total_cost = cost;

      const parcel = band(row, ENERGOV_BANDS.parcel_number);
      if (current.parcel_number_source === null && /^\d{6,10}$/.test(parcel)) {
        current.parcel_number_source = parcel;
      }
    }
  });

  return records;
}

/** The modal YYYY-MM of the records' own permit dates. This is what resolves the source's index
 *  defect (document 15854 linked under two different months) without a hand-written correction. */
function derivedMonth(records) {
  const tally = new Map();
  for (const record of records) {
    if (!record.permit_date || !DATE_RE.test(record.permit_date)) continue;
    const [mm, , yyyy] = record.permit_date.split("/");
    const key = `${yyyy}-${mm}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [month, count] of tally) {
    if (count > bestCount) {
      best = month;
      bestCount = count;
    }
  }
  return best;
}

async function main() {
  await ensureDirs("extracted", "status");
  const statusFiles = (await readdir(dirs.status)).filter((f) => f.endsWith(".json")).sort();

  const totals = {
    reports: 0,
    records: 0,
    legacy: 0,
    energov: 0,
    unknown: 0,
    mismatch: 0,
    skipped: 0,
  };

  for (const name of statusFiles) {
    const statusFile = path.join(dirs.status, name);
    const status = JSON.parse(await readFile(statusFile, "utf8"));
    if (status.download !== "ok") {
      totals.skipped += 1;
      continue;
    }

    const indexMonth = status.index_month;
    const outFile = path.join(dirs.extracted, `${indexMonth}.json`);

    // Idempotence: an extraction of the same bytes is the same extraction.
    try {
      const existing = JSON.parse(await readFile(outFile, "utf8"));
      if (existing.report_sha256 === status.sha256) {
        totals.reports += 1;
        totals.records += existing.record_count;
        if (existing.report_layout === "legacy-tabular") totals.legacy += 1;
        else if (existing.report_layout === "energov-tabular") totals.energov += 1;
        else totals.unknown += 1;
        if (existing.month_source === "derived") totals.mismatch += 1;
        console.log(`${indexMonth}  cached  ${existing.record_count} records`);
        continue;
      }
    } catch {
      /* not extracted yet */
    }

    const pages = await readRows(path.join(dirs.raw, `${indexMonth}.pdf`));
    const layout = detectLayout(pages);
    const extractedAt = new Date().toISOString();

    let records = [];
    if (layout === "legacy-tabular") records = parseLegacy(pages);
    else if (layout === "energov-tabular") records = parseEnergov(pages);

    const derived = derivedMonth(records);
    const reportMonth = derived ?? indexMonth;
    const monthSource = derived && derived !== indexMonth ? "derived" : "index";
    const monthMismatch = Boolean(derived && derived !== indexMonth);

    const seqByPermit = new Map();
    const withProvenance = records.map((record) => {
      const seq = seqByPermit.get(record.permit_number) ?? 0;
      seqByPermit.set(record.permit_number, seq + 1);
      return {
        id: `${status.document_id}:${record.permit_number}:${seq}`,
        ...record,
        report_url: status.url,
        report_document_id: status.document_id,
        report_sha256: status.sha256,
        report_month: reportMonth,
        report_layout: layout,
        extracted_at: extractedAt,
      };
    });

    await writeFile(
      outFile,
      toJson({
        county_slug: COUNTY_SLUG,
        jurisdiction: JURISDICTION,
        job_id: JOB_ID,
        report_month: reportMonth,
        index_month: indexMonth,
        derived_month: derived,
        month_source: monthSource,
        report_layout: layout,
        report_url: status.url,
        report_document_id: status.document_id,
        report_sha256: status.sha256,
        extracted_at: extractedAt,
        record_count: withProvenance.length,
        records: withProvenance,
      }),
    );

    status.extract = {
      status: layout === "unknown-layout" ? "unknown-layout" : "ok",
      layout,
      record_count: withProvenance.length,
      month_mismatch: monthMismatch,
      extracted_at: extractedAt,
    };
    await writeFile(statusFile, toJson(status));

    totals.reports += 1;
    totals.records += withProvenance.length;
    if (layout === "legacy-tabular") totals.legacy += 1;
    else if (layout === "energov-tabular") totals.energov += 1;
    else totals.unknown += 1;
    if (monthMismatch) totals.mismatch += 1;

    console.log(
      `${indexMonth}  ${layout}  ${withProvenance.length} records${monthMismatch ? `  month_mismatch -> ${derived}` : ""}`,
    );
  }

  console.log(
    `extract: reports=${totals.reports} records=${totals.records} layout_legacy=${totals.legacy} layout_energov=${totals.energov} unknown=${totals.unknown} month_mismatch=${totals.mismatch}`,
  );
}

await main();
