// Load the clipped geo-signal features into the pipeline database with provenance and the
// data-quality qualifiers as typed, queryable columns.
//
//   node scripts/geo-signals/load-db.mjs      (working directory: repo root)
//
// Idempotent: each source is deleted and re-inserted, so running twice produces the same counts.
// The run exits 1 if a loaded row count disagrees with the fetch log or the clip log — a load that
// silently dropped rows is not a load.
//
// DATABASE_URL comes from the environment, falling back to elephant-pipeline/.env. It carries a
// password: never hardcode it, never print it.

import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { DATASETS, FETCH_BBOX, DISCOVERY_BBOX, COUNTY_SLUG } from "./sources.mjs";

const RAW_DIR = "data/raw/geo-signals";
const ELEPHANT = "/Users/lukas/Developer/ateam/elephant-pipeline";
const BATCH = 500;

function fail(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

async function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  let env;
  try {
    env = await readFile(`${ELEPHANT}/.env`, "utf8");
  } catch {
    fail("DATABASE_URL is unset and elephant-pipeline/.env is unreadable");
  }
  const line = env.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) fail("DATABASE_URL is unset and not present in elephant-pipeline/.env");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

// A plain arithmetic centroid — not a centre of mass. Point: itself. LineString: the midpoint of
// the coordinate array by index. Polygon: the mean of the outer-ring vertices.
function centroid(geometry) {
  const g = geometry;
  if (g.type === "Point") return g.coordinates;
  if (g.type === "LineString") return g.coordinates[Math.floor(g.coordinates.length / 2)];
  if (g.type === "MultiLineString") {
    const line = g.coordinates[0];
    return line[Math.floor(line.length / 2)];
  }
  const ring =
    g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
  if (ring) {
    let lon = 0;
    let lat = 0;
    for (const c of ring) {
      lon += c[0];
      lat += c[1];
    }
    return [lon / ring.length, lat / ring.length];
  }
  if (g.type === "MultiPoint") return g.coordinates[0];
  return null;
}

function epochMsToDate(v) {
  const ms = Number(v);
  if (v === null || v === undefined || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function osmVoltageKv(raw) {
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) return null;
  return Number(raw) / 1000;
}

const log = JSON.parse(await readFile(`${RAW_DIR}/fetch-log.json`, "utf8"));
const clipLog = JSON.parse(await readFile(`${RAW_DIR}/clip-log.json`, "utf8"));
const sql = postgres(await connectionString(), { onnotice: () => {} });

await sql.unsafe(await readFile("scripts/geo-signals/schema.sql", "utf8"));
console.log("schema applied");

for (const d of DATASETS) {
  const fetchEntry = log.find((e) => e.id === d.id);
  const clipEntry = clipLog.find((e) => e.id === d.id);
  if (!fetchEntry) fail(`${d.id}: no fetch-log entry`);
  if (!clipEntry) fail(`${d.id}: no clip-log entry`);

  const fc = JSON.parse(await readFile(clipEntry.clipped_artifact_path, "utf8"));

  await sql`DELETE FROM geo_signal_feature WHERE source_id = ${d.id}`;
  await sql`DELETE FROM geo_signal_source WHERE id = ${d.id}`;

  await sql`INSERT INTO geo_signal_source ${sql({
    id: d.id,
    county_slug: COUNTY_SLUG,
    label: d.label,
    publisher: d.publisher,
    endpoint: d.endpoint,
    query: fetchEntry.query,
    geometry_type: d.geometryType,
    licence: fetchEntry.osm3s_copyright || d.licence,
    licence_source: d.licenceSource,
    licence_url: d.licenceUrl,
    attribution: d.attribution,
    crowd_sourced: d.crowdSourced,
    completeness_known: d.completenessKnown,
    retrieved_at: fetchEntry.retrieved_at,
    http_status: fetchEntry.http_status,
    elapsed_s: fetchEntry.elapsed_s,
    fetch_bbox_wsen: FETCH_BBOX.join(","),
    discovery_bbox_wsen: DISCOVERY_BBOX.join(","),
    count_fetch_bbox: fetchEntry.count_fetch_bbox,
    count_discovery_bbox: fetchEntry.count_discovery_bbox,
    count_clipped: clipEntry.count_clipped,
    raw_archive_path: `${RAW_DIR}/${d.id}.raw.json`,
    clipped_artifact_path: clipEntry.clipped_artifact_path,
    caveats: sql.json(d.caveats),
  })}`;

  const rows = [];
  for (const f of fc.features) {
    const props = { ...f.properties };
    const inCounty = props.__in_county === true;
    const uid =
      d.transport === "overpass" ? props.__osm_id : String(props.OBJECTID);
    if (!uid) fail(`${d.id}: a feature carries no identifier`);
    for (const k of Object.keys(props)) if (k.startsWith("__")) delete props[k];

    const c = centroid(f.geometry);
    if (!c) fail(`${d.id}: feature ${uid} has geometry type ${f.geometry.type} with no centroid rule`);

    const isHifldLines = d.id === "hifld-transmission-lines";
    const voltageRaw = isHifldLines && Number.isFinite(Number(props.VOLTAGE)) ? Number(props.VOLTAGE) : null;
    let voltageKv = null;
    if (isHifldLines) voltageKv = voltageRaw !== null && voltageRaw > 0 ? voltageRaw : null;
    else if (d.transport === "overpass") voltageKv = osmVoltageKv(props.voltage);

    rows.push({
      source_id: d.id,
      feature_uid: uid,
      kind: d.kind,
      geometry: sql.json(f.geometry),
      centroid_lon: c[0],
      centroid_lat: c[1],
      props: sql.json(props),
      in_county: inCounty,
      source_licence: fetchEntry.osm3s_copyright || d.licence,
      retrieved_at: fetchEntry.retrieved_at,
      crowd_sourced: d.crowdSourced,
      inferred: isHifldLines ? (props.INFERRED ?? null) : null,
      sourcedate: isHifldLines ? epochMsToDate(props.SOURCEDATE) : null,
      voltage_raw: voltageRaw,
      voltage_kv: voltageKv,
      volt_class: isHifldLines ? (props.VOLT_CLASS ?? null) : null,
      owner: isHifldLines ? (props.OWNER ?? null) : null,
      status: isHifldLines ? (props.STATUS ?? null) : null,
    });
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    await sql`INSERT INTO geo_signal_feature ${sql(rows.slice(i, i + BATCH))}`;
  }
  console.log(`${d.id}: ${rows.length} rows loaded (${rows.filter((r) => r.in_county).length} in county)`);
}

const verify = await sql`
  SELECT s.id, s.count_fetch_bbox, s.count_clipped,
         count(f.*)                                AS loaded,
         count(f.*) FILTER (WHERE f.in_county)     AS in_county_rows
  FROM geo_signal_source s
  LEFT JOIN geo_signal_feature f ON f.source_id = s.id
  GROUP BY s.id, s.count_fetch_bbox, s.count_clipped
  ORDER BY s.id`;

console.log("");
console.log("id                          fetch_bbox  clipped   loaded  in_county");
let bad = false;
for (const r of verify) {
  const ok = Number(r.loaded) === r.count_fetch_bbox && Number(r.in_county_rows) === r.count_clipped;
  if (!ok) bad = true;
  console.log(
    `${String(r.id).padEnd(26)} ${String(r.count_fetch_bbox).padStart(10)} ${String(r.count_clipped).padStart(8)} ${String(r.loaded).padStart(8)} ${String(r.in_county_rows).padStart(10)}  ${ok ? "ok" : "MISMATCH"}`,
  );
}
await sql.end();
if (bad) fail("loaded row counts disagree with the fetch/clip logs");
console.log("\nall seven sources loaded, counts agree with the fetch and clip logs");
