/**
 * ISSUE-018 WI-1 — mirror the Rock Island County parcel layer once, then stage the two seed CSVs.
 *
 *   node scripts/mirror-rock-island.mjs
 *
 * One 33-page live pull of all 82 fields (plus geometry) becomes a per-parcel JSON mirror under
 * data/source-mirror/rock-island/<OBJECTID>.json, which scripts/serve-mirror.mjs then serves over
 * loopback. That is the `multi-request-flow-over-local-mirror` seam: the ingest run itself makes
 * ZERO external requests and the county sees 33 requests, not 65,955.
 *
 * The script never mutates, cleans, cases, pads, defaults or drops a source value. The only
 * transformation applied anywhere is `.trim()` on the seed's string columns, and the deliberate
 * rename of GeoJSON `properties` to `attributes` in the mirror file so the file matches the
 * Esri-JSON shape the extraction scripts read.
 *
 * Pipeline key is OBJECTID (deviation D2): PIN is measurably non-unique and keying on it would
 * silently collapse real parcels.
 */

import { mkdir, writeFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_DIR =
  process.env.ISSUE_EVIDENCE_DIR ??
  "/Users/lukas/Developer/ateam/.agents/docs/issues/todo/ISSUE-018-property-records-ingest-full-run/evidence";

const LAYER =
  "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0";
const AGOL_ITEM_ID = "9cae8a64ab0e4cea99758f741ca43b3c";
/** The ArcGIS Online item's licenseInfo. The FeatureServer itself publishes none. */
const LICENCE = "For use by the general public";
const PAGE = 2000;
const EXPECTED = 65955;
const TOLERANCE = 200;

const MIRROR_DIR = path.join(REPO_ROOT, "data", "source-mirror", "rock-island");
const SEED_FULL = path.join(REPO_ROOT, "data", "seeds", "rock-island.csv");
const SEED_PILOT = path.join(REPO_ROOT, "data", "seeds", "rock-island-pilot.csv");

const txt = (v) => String(v ?? "").trim();

async function getJson(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(`ArcGIS error: ${JSON.stringify(j.error).slice(0, 300)}`);
    return j;
  } catch (err) {
    if (attempt >= 4) throw err;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return getJson(url, attempt + 1);
  }
}

function countUrl() {
  const p = new URLSearchParams({ where: "1=1", returnCountOnly: "true", f: "json" });
  return `${LAYER}/query?${p}`;
}

function pageUrl(offset) {
  const p = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "6",
    orderByFields: "OBJECTID ASC",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    f: "geojson",
  });
  return `${LAYER}/query?${p}`;
}

/** RFC 4180: every field quoted, embedded quotes doubled. */
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const SEED_HEADER = [
  "parcel_id",
  "source_identifier",
  "situs_address",
  "parcel_number",
  "alternate_parcel_number",
  "usage_class",
  "zoning_code",
  "municipality",
];

function seedRow(a) {
  return [
    String(a.OBJECTID),
    String(a.OBJECTID),
    txt(a.site_address),
    txt(a.PIN),
    txt(a.RICO_PARCE),
    txt(a.class),
    txt(a.Zoning),
    txt(a.municipality),
  ]
    .map(q)
    .join(",");
}

const started = Date.now();
const retrievedAt = new Date().toISOString();

console.log(`[mirror] live count check …`);
const preCount = (await getJson(countUrl())).count;
console.log(`[mirror] returnCountOnly (pre-pull) = ${preCount}`);

await mkdir(MIRROR_DIR, { recursive: true });
await mkdir(path.dirname(SEED_FULL), { recursive: true });

/** @type {Map<number, object>} attributes by OBJECTID, in pull order */
const attrsById = new Map();
let pages = 0;
let offset = 0;
for (;;) {
  const page = await getJson(pageUrl(offset));
  const feats = page.features ?? [];
  pages += 1;
  const writes = [];
  for (const f of feats) {
    const a = f.properties ?? {};
    const oid = a.OBJECTID;
    if (!Number.isFinite(oid)) {
      console.error(`FATAL: feature without a finite OBJECTID at offset ${offset}`);
      process.exit(1);
    }
    if (attrsById.has(oid)) {
      console.error(`FATAL: duplicate OBJECTID ${oid} — the pull is not distinct`);
      process.exit(1);
    }
    attrsById.set(oid, a);
    const doc = {
      attributes: a,
      geometry: f.geometry ?? null,
      meta: {
        layerUrl: LAYER,
        agolItemId: AGOL_ITEM_ID,
        licence: LICENCE,
        sourceSpatialReference: "EPSG:4326",
        retrievedAt,
        pageOffset: offset,
      },
    };
    writes.push(writeFile(path.join(MIRROR_DIR, `${oid}.json`), JSON.stringify(doc)));
  }
  await Promise.all(writes);
  console.log(`[mirror] offset ${offset}: ${feats.length} features (total ${attrsById.size})`);
  if (feats.length < PAGE) break;
  offset += PAGE;
}

const total = attrsById.size;
if (Math.abs(total - EXPECTED) > TOLERANCE) {
  console.error(`FATAL: pulled ${total} features, expected ${EXPECTED} ± ${TOLERANCE}`);
  process.exit(1);
}

console.log(`[mirror] live count check (post-pull) …`);
const postCount = (await getJson(countUrl())).count;
if (postCount !== preCount)
  console.log(`[mirror] COUNT DRIFT during pull: pre ${preCount} → post ${postCount}`);
const liveFeatureCount = postCount;

// ---- seeds -----------------------------------------------------------------
const ordered = [...attrsById.keys()].sort((x, y) => x - y).map((k) => attrsById.get(k));

await writeFile(
  SEED_FULL,
  `${SEED_HEADER.join(",")}\n${ordered.map(seedRow).join("\n")}\n`,
);

// ---- PIN uniqueness report (deviation D2 evidence) --------------------------
const pinCounts = new Map();
for (const a of ordered) {
  const p = txt(a.PIN);
  pinCounts.set(p, (pinCounts.get(p) ?? 0) + 1);
}
const duplicates = [...pinCounts.entries()]
  .filter(([, n]) => n > 1)
  .map(([pin, count]) => ({ pin, count }))
  .sort((a, b) => b.count - a.count || a.pin.localeCompare(b.pin));
const nonNumeric = [...pinCounts.entries()].filter(([p]) => !/^[0-9]{10}$/.test(p));
const pinReport = {
  recordCount: total,
  distinctPin: pinCounts.size,
  duplicatePinValues: duplicates.length,
  recordsWithDuplicatePin: duplicates.reduce((s, d) => s + d.count, 0),
  nonNumericPinRecords: nonNumeric.reduce((s, [, n]) => s + n, 0),
  duplicates,
  nonNumericValues: nonNumeric.map(([pin, count]) => ({ pin, count })),
};
await mkdir(EVIDENCE_DIR, { recursive: true });
await writeFile(
  path.join(EVIDENCE_DIR, "pin-uniqueness-report.json"),
  `${JSON.stringify(pinReport, null, 2)}\n`,
);

// ---- deterministic 25-parcel pilot ------------------------------------------
const zoning = (a) => txt(a.Zoning);
const dupPins = new Set(duplicates.map((d) => d.pin));
const PREDICATES = [
  ["usage_class starts 0010", (a) => txt(a.class).startsWith("0010")],
  ["usage_class starts 0020", (a) => txt(a.class).startsWith("0020")],
  ["usage_class starts 0030", (a) => txt(a.class).startsWith("0030")],
  ["usage_class starts 0040", (a) => txt(a.class).startsWith("0040")],
  ["usage_class starts 0050", (a) => txt(a.class).startsWith("0050")],
  ["usage_class starts 0060", (a) => txt(a.class).startsWith("0060")],
  ["usage_class starts 0080", (a) => txt(a.class).startsWith("0080")],
  ["usage_class starts 0090", (a) => txt(a.class).startsWith("0090")],
  ["zoning_code = AG1", (a) => zoning(a) === "AG1"],
  ["zoning_code = R1", (a) => zoning(a) === "R1"],
  ["zoning_code = B1", (a) => zoning(a) === "B1"],
  ["zoning_code = I1", (a) => zoning(a) === "I1"],
  ["zoning_code = PUD", (a) => zoning(a) === "PUD"],
  ["zoning_code = MOL (municipality-coded)", (a) => zoning(a) === "MOL"],
  ["zoning_code blank", (a) => zoning(a) === ""],
  ["zoning_code ends !", (a) => zoning(a).endsWith("!")],
  ["zoning_code ends ?", (a) => zoning(a).endsWith("?")],
  ["situs_address blank", (a) => txt(a.site_address) === ""],
  ["PIN not ^[0-9]{10}$", (a) => !/^[0-9]{10}$/.test(txt(a.PIN))],
  ["PIN duplicated across the seed", (a) => dupPins.has(txt(a.PIN))],
  ["date_last_sale null", (a) => a.date_last_sale == null],
  [
    "date_last_sale > 2020-01-01",
    (a) => a.date_last_sale != null && Number(a.date_last_sale) > Date.parse("2020-01-01"),
  ],
  ["YRBuilt blank", (a) => txt(a.YRBuilt) === ""],
  ["EAV = 0", (a) => Number(a.EAV) === 0],
  ["GIS_acres_num > 100", (a) => Number(a.GIS_acres_num) > 100],
];

const chosen = [];
const chosenIds = new Set();
const log = [];
for (const [label, pred] of PREDICATES) {
  const hit = ordered.find((a) => !chosenIds.has(a.OBJECTID) && pred(a));
  if (hit) {
    chosen.push(hit);
    chosenIds.add(hit.OBJECTID);
    log.push(`${String(chosen.length).padStart(2)}  OBJECTID ${hit.OBJECTID}  PIN ${txt(hit.PIN)}  class ${txt(hit.class)}  Zoning "${zoning(hit)}"  <- ${label}`);
  } else {
    log.push(`--  (no match)  <- ${label}   [SKIPPED, backfilled below]`);
  }
}
for (const a of ordered) {
  if (chosen.length >= 25) break;
  if (chosenIds.has(a.OBJECTID)) continue;
  chosen.push(a);
  chosenIds.add(a.OBJECTID);
  log.push(`${String(chosen.length).padStart(2)}  OBJECTID ${a.OBJECTID}  PIN ${txt(a.PIN)}  class ${txt(a.class)}  Zoning "${zoning(a)}"  <- BACKFILL (next unused by parcel_id)`);
}
chosen.sort((x, y) => x.OBJECTID - y.OBJECTID);
await writeFile(
  SEED_PILOT,
  `${SEED_HEADER.join(",")}\n${chosen.map(seedRow).join("\n")}\n`,
);
await writeFile(
  path.join(EVIDENCE_DIR, "pilot-selection.txt"),
  `ISSUE-018 WI-1 step 8 — deterministic pilot selection (25 parcels, validate-county-transform line 24)\ngenerated: ${new Date().toISOString()}\n\n${log.join("\n")}\n`,
);

const elapsed = (Date.now() - started) / 1000;
const mirrorFiles = (await readdir(MIRROR_DIR)).length;
const summary = [
  `ISSUE-018 WI-1 — mirror run`,
  `retrievedAt:          ${retrievedAt}`,
  `layer:                ${LAYER}`,
  `live count pre-pull:  ${preCount}`,
  `live count post-pull: ${postCount}  (liveFeatureCount = ${liveFeatureCount})`,
  `features pulled:      ${total}`,
  `pages:                ${pages}`,
  `elapsed seconds:      ${elapsed.toFixed(3)}`,
  `mirror files:         ${mirrorFiles}`,
  `seed rows:            ${ordered.length}`,
  `pilot rows:           ${chosen.length}`,
  `distinct PIN:         ${pinReport.distinctPin}`,
  `duplicate PIN values: ${pinReport.duplicatePinValues} over ${pinReport.recordsWithDuplicatePin} records`,
  `non-numeric PIN:      ${pinReport.nonNumericPinRecords} records`,
  "",
].join("\n");
await writeFile(path.join(EVIDENCE_DIR, "mirror-run.txt"), summary);
console.log(summary);
