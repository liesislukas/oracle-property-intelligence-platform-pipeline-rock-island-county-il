// WI-2 — Harvest the monthly permit report inventory from the City of Rock Island index page.
//
//   npm run harvest:inventory
//
// Writes permit-lists/inventory.json: every monthly report the city publishes, with its year,
// month, document id and absolute URL. The download step (WI-3) is then a pure function of a
// checked-in list.
//
// The index is tabbed by year. The year lives in a `data-tabname` span; the panel it belongs to is
// matched by its `data-sequence` / `_<N>` id suffix. Only anchors whose visible label is exactly a
// month name are kept — that is what excludes the `Site Policies` footer anchor which leaks into
// the last (2017) panel.

import { writeFile } from "node:fs/promises";

import {
  COUNTY_SLUG,
  INDEX_URL,
  JOB_ID,
  JURISDICTION,
  ORIGIN,
  USER_AGENT,
  ensureDirs,
  files,
  toJson,
} from "./paths.mjs";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_INDEX = new Map(MONTHS.map((m, i) => [m.toLowerCase(), i + 1]));

function unescapeHtml(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function cleanLabel(html) {
  return unescapeHtml(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const startedAt = new Date();
  const response = await fetch(INDEX_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (response.status !== 200) {
    throw new Error(`index page returned HTTP ${response.status}`);
  }
  const html = await response.text();

  // 1. sequence -> year
  const seqToYear = new Map();
  for (const m of html.matchAll(
    /data-sequence="(\d+)"\s+data-tabname="(\d{4})"/g,
  )) {
    seqToYear.set(m[1], Number(m[2]));
  }
  if (seqToYear.size === 0) {
    throw new Error("no year tabs found on the index page — the page layout changed");
  }

  // 2. split into panels, resolve each panel's year
  const fragments = html.split('<div class="tabbedWidget cpTabPanel');
  const reports = [];
  for (const fragment of fragments.slice(1)) {
    const idMatch = fragment.match(/id="tab[0-9a-fA-F-]+_(\d+)"/);
    if (!idMatch) continue;
    const year = seqToYear.get(idMatch[1]);
    if (year === undefined) continue;

    const seenInPanel = new Set();
    for (const anchor of fragment.matchAll(
      /<a\b[^>]*href="(\/DocumentCenter\/View\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
    )) {
      const href = anchor[1];
      const label = cleanLabel(anchor[2]);

      // 4. month-name anchors only. This drops the `Site Policies` footer anchor.
      const monthNumber = MONTH_INDEX.get(label.toLowerCase());
      if (monthNumber === undefined) continue;

      // 5. de-duplicate the image link + text link pair
      const key = `${href}|${label}`;
      if (seenInPanel.has(key)) continue;
      seenInPanel.add(key);

      const documentId = href.match(/\/DocumentCenter\/View\/(\d+)/)[1];
      reports.push({
        index_month: `${year}-${String(monthNumber).padStart(2, "0")}`,
        index_year: year,
        index_month_name: MONTHS[monthNumber - 1],
        document_id: documentId,
        url: `${ORIGIN}${href.replace(/&amp;/g, "&")}`,
      });
    }
  }

  reports.sort((a, b) => a.index_month.localeCompare(b.index_month));

  const monthsByDocument = new Map();
  for (const report of reports) {
    if (!monthsByDocument.has(report.document_id)) {
      monthsByDocument.set(report.document_id, new Set());
    }
    monthsByDocument.get(report.document_id).add(report.index_month);
  }
  const duplicateDocumentIds = [...monthsByDocument.entries()]
    .filter(([, months]) => months.size > 1)
    .map(([id]) => id)
    .sort();

  const inventory = {
    county_slug: COUNTY_SLUG,
    jurisdiction: JURISDICTION,
    job_id: JOB_ID,
    source_index_url: INDEX_URL,
    harvested_at: startedAt.toISOString(),
    index_entry_count: reports.length,
    distinct_document_count: monthsByDocument.size,
    duplicate_document_ids: duplicateDocumentIds,
    reports,
  };

  await ensureDirs("permitLists");
  await writeFile(files.inventory, toJson(inventory));

  const years = reports.map((r) => r.index_year);
  console.log(
    `inventory: ${reports.length} entries, ${monthsByDocument.size} distinct documents, years ${Math.min(
      ...years,
    )}..${Math.max(...years)}`,
  );
  if (duplicateDocumentIds.length > 0) {
    console.log(
      `duplicate document ids (one document linked under more than one month): ${duplicateDocumentIds.join(", ")}`,
    );
  }
}

await main();
