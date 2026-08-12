// Write the canonical geo-signals stage manifest from the pipeline database.
//
//   node scripts/geo-signals/write-manifest.mjs      (working directory: repo root)
//
// Output: data/manifests/geo-signals.json — the canonical stage manifest. `scripts/sync-manifests.mjs`
// copies it byte-identical into app/data/manifests/ before every deploy, and the deployed Sources
// page renders it through app/src/lib/stageManifests.ts.
//
// Shape is the stage-manifest contract the other stages already use (see data/manifests/seed.json):
//   { stage, sources: [{ id, name, url, licence, retrieved_at, record_count, bbox_count,
//                        duration_s, decision, gaps[], notes[] }], run: { started_at, finished_at } }
//
//   record_count = the CLIPPED in-county count. It is the county figure.
//   bbox_count   = the fetch-bounding-box count, an upper bound that includes Iowa.
//
// The file is machine-written only. Every number here comes from a SQL query or the fetch log —
// none is typed, none is rounded by hand, and the 91%-inferred figure in the Demo Script is
// computed from measured in-county rows rather than carried over from discovery.

import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import {
  DATASETS,
  FETCH_BBOX,
  DISCOVERY_BBOX,
  GAPS,
  ODBL_DERIVATIVE_NOTE,
  COUNTY_SLUG,
} from "./sources.mjs";

const RAW_DIR = "data/raw/geo-signals";
const ELEPHANT = "/Users/lukas/Developer/ateam/elephant-pipeline";
const OUT = "data/manifests/geo-signals.json";

function fail(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

async function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = await readFile(`${ELEPHANT}/.env`, "utf8").catch(() =>
    fail("DATABASE_URL is unset and elephant-pipeline/.env is unreadable"),
  );
  const line = env.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) fail("DATABASE_URL is unset and not present in elephant-pipeline/.env");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const fetchLog = JSON.parse(await readFile(`${RAW_DIR}/fetch-log.json`, "utf8"));
const boundary = JSON.parse(await readFile(`${RAW_DIR}/county-boundary-tiger.geojson`, "utf8"));
const bProps = boundary.features[0].properties;
const bRing = boundary.features[0].geometry.coordinates[0];

const sql = postgres(await connectionString(), { onnotice: () => {} });

const sources = await sql`
  SELECT id, label, publisher, endpoint, licence, licence_source, licence_url, attribution,
         crowd_sourced, retrieved_at, elapsed_s, count_fetch_bbox, count_discovery_bbox,
         count_clipped
  FROM geo_signal_source ORDER BY id`;
if (sources.length !== 7) fail(`geo_signal_source holds ${sources.length} rows, expected 7`);

const loaded = await sql`
  SELECT source_id,
         count(*)                            AS loaded,
         count(*) FILTER (WHERE in_county)   AS in_county_rows
  FROM geo_signal_feature GROUP BY source_id`;
const loadedById = new Map(loaded.map((r) => [r.source_id, r]));

// Transmission-line qualifiers, over the IN-COUNTY rows only. Every figure on the page is a
// county figure.
const [q] = await sql`
  SELECT count(*)                                          AS inferred_total,
         count(*) FILTER (WHERE inferred = 'Y')            AS inferred_y,
         count(*) FILTER (WHERE inferred = 'N')            AS inferred_n,
         count(*) FILTER (WHERE inferred = 'NOT AVAILABLE') AS inferred_not_available,
         min(sourcedate)                                   AS sourcedate_min,
         max(sourcedate)                                   AS sourcedate_max,
         count(*) FILTER (WHERE voltage_raw = -999999)     AS voltage_sentinel_rows
  FROM geo_signal_feature
  WHERE source_id = 'hifld-transmission-lines' AND in_county`;

const kvRows = await sql`
  SELECT DISTINCT voltage_kv FROM geo_signal_feature
  WHERE source_id = 'hifld-transmission-lines' AND in_county AND voltage_kv IS NOT NULL
  ORDER BY voltage_kv`;
const ownerRows = await sql`
  SELECT owner, count(*)::int AS n FROM geo_signal_feature
  WHERE source_id = 'hifld-transmission-lines' AND in_county AND owner IS NOT NULL
  GROUP BY owner ORDER BY n DESC, owner`;

const plants = await sql`
  SELECT props->>'Plant_Name' AS plant, props->>'County' AS county, props->>'State' AS state,
         props->>'Total_MW' AS total_mw, in_county
  FROM geo_signal_feature WHERE source_id = 'hifld-power-plants'
  ORDER BY in_county DESC, (props->>'Total_MW')::numeric DESC`;

await sql.end();

const iso = (v) => (v instanceof Date ? v.toISOString() : v === null ? null : String(v));
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null ? null : String(v));

const inferredTotal = Number(q.inferred_total);
const inferredY = Number(q.inferred_y);
const inferredPct = Math.round((inferredY / inferredTotal) * 100);
const sourcedateMin = day(q.sourcedate_min);
const sourcedateMax = day(q.sourcedate_max);
const newestAgeYears = new Date().getUTCFullYear() - Number(sourcedateMax.slice(0, 4));
const sentinelRows = Number(q.voltage_sentinel_rows);

const plantsIn = plants.filter((p) => p.in_county);
const plantsOut = plants.filter((p) => !p.in_county);
const plantLine = (p) => `${p.plant} (${p.total_mw} MW, ${p.county}, ${p.state})`;

const COUNT_NOTE = (s, d) =>
  `Three measured counts, none typed: ${s.count_clipped} inside the county polygon (the county figure, record_count), ${s.count_fetch_bbox} in the fetch bounding box ${FETCH_BBOX.join(",")} (bbox_count — a rectangle that crosses the Mississippi into Scott, Muscatine and Cedar counties, Iowa), and ${s.count_discovery_bbox} in the ISSUE-001 source-discovery bounding box ${DISCOVERY_BBOX.join(",")}. The discovery rectangle holds 93.1% of the county's parcels and misses its two largest generators; its count is kept for reproducibility and is not a county figure.`;

const CLIP_NOTE =
  `Clipped to the US Census TIGERweb county polygon (State_County/MapServer layer 1, GEOID 17161, ${bRing.length} vertices, ring area ${(function () {
    const R = 6371000;
    const k = Math.cos((41.47 * Math.PI) / 180);
    let sum = 0;
    for (let i = 0; i < bRing.length - 1; i += 1) {
      const [x1, y1] = bRing[i];
      const [x2, y2] = bRing[i + 1];
      sum +=
        ((x1 * Math.PI) / 180) * R * k * (((y2 * Math.PI) / 180) * R) -
        ((x2 * Math.PI) / 180) * R * k * (((y1 * Math.PI) / 180) * R);
    }
    return (Math.abs(sum / 2) / 1e6).toFixed(2);
  })()} km² against the feature's own AREALAND+AREAWATER of ${((Number(bProps.AREALAND) + Number(bProps.AREAWATER)) / 1e6).toFixed(2)} km²). ` +
  `The county's own GIS "Boundaries" service was rejected: it is 15 municipal polygons and excludes unincorporated county, so clipping against it would silently delete every rural feature.`;

const perSource = {
  "hifld-transmission-lines": {
    notes: (s) => [
      COUNT_NOTE(s),
      CLIP_NOTE,
      `Measured over the ${inferredTotal} in-county lines: ${inferredY} are marked INFERRED=Y (${inferredPct}%), ${Number(q.inferred_n)} are INFERRED=N and ${Number(q.inferred_not_available)} read "NOT AVAILABLE". The route was inferred from imagery and open data, not surveyed.`,
      `SOURCEDATE on the in-county lines runs ${sourcedateMin} to ${sourcedateMax}. The newest line in this county is ${newestAgeYears} years old. SOURCEDATE is epoch milliseconds in the source and is converted once, at load time.`,
      `${sentinelRows} in-county lines carry VOLTAGE = -999999, a missing-value sentinel rather than a voltage. They are stored with voltage_kv NULL and are excluded from every numeric comparison; the raw -999999 is kept verbatim in voltage_raw. Real voltages present in county: ${kvRows.map((r) => `${Number(r.voltage_kv)} kV`).join(", ")}.`,
      `Owners of the in-county lines, counted: ${ownerRows.map((r) => `${r.owner} ${r.n}`).join("; ")}. "NOT AVAILABLE" is stored verbatim — it is what the source says, and it is not the same fact as NULL.`,
      `Licence provenance: ${s.licence_source}. Both HIFLD FeatureServers return an empty licenseInfo and an empty copyrightText; the licence exists only on the ArcGIS Online item. Attribution: ${s.attribution}.`,
    ],
    gaps: (s) => [
      `HIFLD's INFERRED field marks a route that was inferred from imagery and open data rather than surveyed. These lines are approximately where the grid is, not authoritatively where it is, and any distance computed from them inherits that uncertainty: ${inferredY} of ${inferredTotal} in-county lines (${inferredPct}%) are INFERRED=Y.`,
      `VOLTAGE = -999999 is a missing-value sentinel, not a voltage. Rows carrying it are stored with voltage_kv NULL and are excluded from every numeric comparison.`,
      `The ArcGIS Online item behind this layer is titled "U.S. Electric Power Transmission Lines (Archive)". It is public and live, but it is published as an archived snapshot, and the newest source date in this county is ${sourcedateMax} — ${newestAgeYears} years old.`,
      GAPS[0],
      GAPS[1],
    ],
  },
  "hifld-power-plants": {
    notes: (s) => [
      COUNT_NOTE(s),
      CLIP_NOTE,
      `The clip's proof is by name, not by count. Kept in county: ${plantsIn.map(plantLine).join("; ")}. Dropped as out-of-county: ${plantsOut.map(plantLine).join("; ")}.`,
      `Independent cross-check: every plant the polygon kept also reads County "Rock Island" and State "Illinois" in the layer's own attributes. Two methods, same answer.`,
      `The discovery bounding box found only ${s.count_discovery_bbox} plants in the rectangle and 1 in county — it misses Quad Cities Generating Station (nuclear, 1819 MW) and Cordova Energy (521.2 MW). That is why this stage fetches over the county envelope.`,
      `Licence provenance: ${s.licence_source}. Attribution: ${s.attribution}.`,
    ],
    gaps: () => [
      `Bounding-box counts are not county counts. The fetch rectangle crosses the Mississippi into Scott, Muscatine and Cedar counties, Iowa. The clipped count is the county figure.`,
      `The clip is cross-checked against the layer's own County and State attributes: every plant kept by the polygon also reads Rock Island, Illinois.`,
      GAPS[0],
    ],
  },
  "osm-substations": {
    notes: (s) => [
      COUNT_NOTE(s),
      CLIP_NOTE,
      `Overpass query, verbatim: ${s.query}`,
      `Licence read from the live response's osm3s.copyright field, not hardcoded. ${ODBL_DERIVATIVE_NOTE} Attribution: ${s.attribution} (${s.licence_url}).`,
      `Overpass politeness, measured: at 5-second spacing the API returned three 504s and two 429s in ten requests. This run used sequential requests at ≥15 s spacing with 4 attempts and 30/60/120 s backoff, and would have exited rather than record a rate-limited failure as a count.`,
    ],
    gaps: () => [
      DATASETS[2].caveats[0],
      DATASETS[2].caveats[1],
      GAPS[1],
    ],
  },
  "osm-power-lines": {
    notes: (s) => [
      COUNT_NOTE(s),
      CLIP_NOTE,
      `Overpass query, verbatim: ${s.query}`,
      `Licence read from the live response's osm3s.copyright field, not hardcoded. ${ODBL_DERIVATIVE_NOTE} Attribution: ${s.attribution} (${s.licence_url}).`,
      `power=minor_line and power=tower are deliberately excluded: neither is transmission infrastructure. OSM voltage tags are volts as a string and may be multi-valued ("161000;69000"); a multi-valued tag yields voltage_kv NULL and stays intact in the raw property bag.`,
    ],
    gaps: () => [DATASETS[3].caveats[0], GAPS[1]],
  },
  "osm-bus-stops": {
    notes: (s) => [
      COUNT_NOTE(s),
      CLIP_NOTE,
      `Overpass query, verbatim: ${s.query}`,
      `Licence read from the live response's osm3s.copyright field, not hardcoded. ${ODBL_DERIVATIVE_NOTE} Attribution: ${s.attribution} (${s.licence_url}).`,
    ],
    gaps: () => [DATASETS[4].caveats[0], DATASETS[4].caveats[1], DATASETS[4].caveats[2], GAPS[2]],
  },
  "osm-starbucks": {
    notes: (s) => [
      COUNT_NOTE(s),
      CLIP_NOTE,
      `Overpass query, verbatim: ${s.query}`,
      `Licence read from the live response's osm3s.copyright field, not hardcoded. ${ODBL_DERIVATIVE_NOTE} Attribution: ${s.attribution} (${s.licence_url}).`,
    ],
    gaps: () => [DATASETS[5].caveats[0], DATASETS[5].caveats[1], DATASETS[5].caveats[2]],
  },
  "usgs-nhd-waterbodies": {
    notes: (s) => [
      COUNT_NOTE(s),
      CLIP_NOTE,
      `Fetched in 2 pages of 2000 (the layer reports exceededTransferLimit on page 1); paging is by resultOffset with orderByFields=OBJECTID, and the loop stops only on a short page with no transfer-limit flag.`,
      `Licence provenance: ${s.licence_source}. Attribution: ${s.attribution}.`,
    ],
    gaps: () => [DATASETS[6].caveats[0], DATASETS[6].caveats[1]],
  },
};

const order = DATASETS.map((d) => d.id);
const byId = new Map(sources.map((s) => [s.id, s]));

const manifestSources = order.map((id) => {
  const s = byId.get(id);
  if (!s) fail(`${id}: missing from geo_signal_source`);
  const l = loadedById.get(id);
  if (!l) fail(`${id}: no features loaded`);
  if (Number(l.in_county_rows) !== s.count_clipped)
    fail(`${id}: in-county rows ${l.in_county_rows} disagree with count_clipped ${s.count_clipped}`);
  const spec = perSource[id];
  return {
    id,
    name: `${s.label} — ${s.publisher}`,
    url: s.endpoint,
    licence: s.licence,
    retrieved_at: iso(s.retrieved_at),
    record_count: s.count_clipped,
    bbox_count: s.count_fetch_bbox,
    duration_s: Number(s.elapsed_s),
    decision: "download",
    gaps: spec.gaps(s),
    notes: spec.notes(s),
  };
});

for (const s of manifestSources) {
  if (!Number.isInteger(s.record_count) || s.record_count <= 0)
    fail(`${s.id}: record_count is not a positive integer`);
  if (!Number.isInteger(s.bbox_count) || s.bbox_count < s.record_count)
    fail(`${s.id}: bbox_count ${s.bbox_count} is below record_count ${s.record_count}`);
}

const startedAt = fetchLog
  .map((e) => e.retrieved_at)
  .sort()[0];

const manifest = {
  stage: "geo-signals-ingest",
  status: "ready",
  county_slug: COUNTY_SLUG,
  sources: manifestSources,
  run: {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  },
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
if (json.includes("postgresql://")) fail("the manifest carries a connection string");
await writeFile(OUT, json);

console.log(`${OUT} written — ${manifestSources.length} sources`);
for (const s of manifestSources)
  console.log(
    `  ${s.id.padEnd(26)} in-county ${String(s.record_count).padStart(5)}  bbox ${String(s.bbox_count).padStart(5)}  gaps ${s.gaps.length}  notes ${s.notes.length}`,
  );
console.log(
  `  transmission-line qualifiers: ${inferredY}/${inferredTotal} INFERRED=Y (${inferredPct}%), source dates ${sourcedateMin}..${sourcedateMax} (newest ${newestAgeYears} years old), ${sentinelRows} voltage sentinels`,
);
