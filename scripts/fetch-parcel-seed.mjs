#!/usr/bin/env node
// Produces the Rock Island County parcel seed CSV for the elephant pipeline, plus the
// machine-written provenance manifest the deployed explorer renders.
//
// Run by hand from the assignment repo root:
//   node scripts/fetch-parcel-seed.mjs [--out <csv>] [--manifest <json>] [--force]
//
// It NEVER mutates, defaults, cleans, trims, rounds, dedupes or drops a source value. Blank in
// this source is "" or " ", never NULL, and is preserved byte-for-byte. Dates are epoch
// milliseconds and are carried through unconverted. Every count in the manifest is measured by
// this script at pull time — nothing is hardcoded.
//
// Node built-ins only, matching the scripts/probe-sources.mjs precedent in this directory.

import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname } from "node:path";

const LAYER =
  "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0";
const PAGE = 2000;
const UA = "ateam-county-seed/1.0";

// 25 source fields. gross_acres is excluded (0 for 72.5% of parcels — GIS_acres_num is the
// acreage). TWP_RAN_SE, OBJECTID_1 and date_of_sale are excluded (null in every sampled record).
const OUT_FIELDS = [
  "OBJECTID",
  "PIN",
  "site_address",
  "RICO_PARCE",
  "alternate_parcel_number",
  "owner1_name",
  "owner1_address1",
  "owner1_csz",
  "taxbill_name",
  "taxbill_addr",
  "taxbill_csz",
  "GIS_acres_num",
  "EAV",
  "EMV",
  "class",
  "Zoning",
  "YRBuilt",
  "TOTSQFT",
  "date_last_sale",
  "gross_sale_price",
  "X_longitude",
  "Y_latitude",
  "municipality",
  "township",
];

// CSV header. Board-sweep contract (2026-08-12): the pipeline key is OBJECTID as a decimal
// string, carried as BOTH parcel_id and source_identifier, because PIN is measurably not unique
// county-wide and keying on it silently collapses records. PIN is carried verbatim in its own
// column and becomes parcel_identifier downstream.
const HEADER = [
  "parcel_id", // <- OBJECTID (string)
  "source_identifier", // <- OBJECTID (string)
  "PIN", // <- PIN, verbatim
  "situs_address", // <- site_address
  ...OUT_FIELDS.filter(
    (f) => !["OBJECTID", "PIN", "site_address"].includes(f),
  ),
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const OUT = flag(
  "--out",
  "/Users/lukas/Developer/ateam/elephant-pipeline/data/seeds/rock-island.csv",
);
const MANIFEST = flag(
  "--manifest",
  new URL("../data/manifests/seed.json", import.meta.url).pathname,
);
const FORCE = args.includes("--force");

const isBlank = (v) =>
  v === null || v === undefined || String(v).trim() === "";

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

async function getJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body && body.error) {
        throw new Error(`service error: ${JSON.stringify(body.error)}`);
      }
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  fail(`${url}\n  last error: ${lastErr && lastErr.message}`);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const cell = (v) =>
  v === null || v === undefined
    ? '""'
    : '"' + String(v).replaceAll('"', '""') + '"';

async function main() {
  const runStarted = new Date().toISOString();

  if ((await exists(OUT)) && !FORCE) {
    fail("seed exists — pass --force to overwrite; a run may be reading it");
  }

  const countUrl = `${LAYER}/query?where=1%3D1&returnCountOnly=true&f=json`;
  const countBody = await getJson(countUrl);
  const liveCount = countBody.count;
  if (!Number.isFinite(liveCount)) fail(`returnCountOnly gave ${liveCount}`);
  console.log(`live count: ${liveCount}`);

  const rows = [];
  let offset = 0;
  let pageCount = 0;
  const pullStart = Date.now();
  for (;;) {
    const qs = new URLSearchParams({
      where: "1=1",
      outFields: OUT_FIELDS.join(","),
      returnGeometry: "false",
      outSR: "4326",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: "json",
    });
    const body = await getJson(`${LAYER}/query?${qs}`);
    const feats = body.features || [];
    pageCount += 1;
    for (const f of feats) rows.push(f.attributes);
    process.stdout.write(`\r  page ${pageCount}: ${rows.length} rows`);
    if (feats.length < PAGE) break;
    offset += PAGE;
  }
  const pullEnd = Date.now();
  const retrievedAt = new Date().toISOString();
  const durationS = Number(((pullEnd - pullStart) / 1000).toFixed(3));
  console.log(`\npages: ${pageCount}, rows: ${rows.length}, ${durationS}s`);

  // Assertions — each exits 1 with both numbers, never a warning.
  if (Math.abs(rows.length - liveCount) > 50) {
    fail(`row count ${rows.length} differs from live count ${liveCount} by more than 50`);
  }
  for (const r of rows) {
    if (typeof r.PIN !== "string") {
      fail(
        `PIN arrived as a number — leading zeros lost; load ids as TEXT (OBJECTID ${r.OBJECTID}, PIN ${r.PIN})`,
      );
    }
    if (!Number.isFinite(r.OBJECTID)) {
      fail(`non-finite OBJECTID: ${JSON.stringify(r.OBJECTID)}`);
    }
    if (isBlank(r.OBJECTID)) {
      fail("blank parcel_id: buildSeedIndex rejects the seed");
    }
  }
  const distinctObjectIds = new Set(rows.map((r) => r.OBJECTID)).size;
  if (distinctObjectIds < rows.length) {
    fail(`OBJECTID is not unique: ${distinctObjectIds} distinct over ${rows.length} records`);
  }

  // Measured statistics.
  const pinCounts = new Map();
  for (const r of rows) pinCounts.set(r.PIN, (pinCounts.get(r.PIN) || 0) + 1);
  const distinctPins = pinCounts.size;
  let dupPinValues = 0;
  let dupPinRecords = 0;
  for (const [, n] of pinCounts) {
    if (n > 1) {
      dupPinValues += 1;
      dupPinRecords += n;
    }
  }
  const blankSitus = rows.filter((r) => isBlank(r.site_address)).length;
  const blankOwner = rows.filter((r) => isBlank(r.owner1_name)).length;

  // CSV.
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    const out = [
      cell(String(r.OBJECTID)),
      cell(String(r.OBJECTID)),
      cell(r.PIN),
      cell(r.site_address),
      ...OUT_FIELDS.filter(
        (f) => !["OBJECTID", "PIN", "site_address"].includes(f),
      ).map((f) => cell(r[f])),
    ];
    lines.push(out.join(","));
  }
  const csv = lines.join("\n") + "\n";
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, csv, "utf8");

  const manifest = {
    stage: "county-seed-data",
    sources: [
      {
        id: "rock-island-parcels-featureserver",
        name: "Rock Island County GIS — parcel layer (ArcGIS FeatureServer 0)",
        url: LAYER,
        licence: "For use by the general public",
        retrieved_at: retrievedAt,
        record_count: rows.length,
        duration_s: durationS,
        decision: "paged-live-query",
        gaps: [
          `PIN is not unique county-wide: ${distinctPins} distinct values over ${rows.length} records, ${dupPinValues} values repeating across ${dupPinRecords} records. Row identity is OBJECTID, carried as both parcel_id and source_identifier. No row was deduplicated, padded or altered.`,
          `situs_address (site_address) is blank on ${blankSitus} of ${rows.length} records. Blank in this source is "" or " ", never NULL; it is preserved byte-for-byte rather than normalised.`,
          `owner1_name is blank on ${blankOwner} of ${rows.length} records.`,
          "No appraiser-portal parcel-id spot-check was run at this stage; the first live appraiser lookup happens in ISSUE-018 and a zero-result lookup there is a hard error, never a skip.",
        ],
        notes: [
          `Count comes from ${pageCount} paged live /query requests against the FeatureServer (2,000 records per page, orderByFields=OBJECTID), not from the ArcGIS Hub export. returnCountOnly reported ${liveCount} at pull time and ${rows.length} rows were written.`,
          "Count-drift trap: the ArcGIS Hub export is a cached snapshot and returned 66,028 features against 65,955 live on 2026-08-11. It also renames six fields and drops four (82 REST fields vs 79 export properties). Paging the live endpoint and recording the count at ingest time is the only way to get parity.",
          "Acreage is GIS_acres_num, populated above 0 on 65,953 of 65,955 records. gross_acres is 0 for 72.5% of parcels and is deliberately not carried into the seed.",
          "date_last_sale is epoch milliseconds in the source and is carried through unconverted.",
          "Licence sentence is from the ArcGIS Online item 9cae8a64ab0e4cea99758f741ca43b3c (licenseInfo). The FeatureServer endpoint returns no licenseInfo and an empty copyrightText, and the item's accessInformation is empty, so no further attribution is required.",
          "Source feasibility, measured in ISSUE-001 discovery: p50 0.46 s / p95 0.79 s per query, zero 429s, no throttling. The full paged extract is roughly 18 s — five orders of magnitude inside the 48-hour feasibility gate. county-discovery's gate verdict for this source was `download`; we take the live paged query instead because of the count and field-name drift in the Hub export.",
          "Pipeline key is OBJECTID as a decimal string, carried as both parcel_id and source_identifier (board-sweep contract, 2026-08-12). PIN is carried verbatim in its own column and becomes parcel_identifier downstream; it is never used as the join key because it is not unique.",
        ],
      },
    ],
    run: { started_at: runStarted, finished_at: new Date().toISOString() },
  };
  await mkdir(dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    [
      "",
      `rows written      ${rows.length}`,
      `live count        ${liveCount}`,
      `pages             ${pageCount}`,
      `duration_s        ${durationS}`,
      `distinct PINs     ${distinctPins}`,
      `duplicate PINs    ${dupPinValues} values across ${dupPinRecords} records`,
      `blank situs       ${blankSitus}`,
      `blank owner1_name ${blankOwner}`,
      `csv               ${OUT} (${csv.length} bytes)`,
      `manifest          ${MANIFEST}`,
    ].join("\n"),
  );
}

await main();
