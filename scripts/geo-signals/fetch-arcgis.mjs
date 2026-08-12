// Fetch and archive the three ArcGIS datasets — HIFLD transmission lines, HIFLD power plants,
// USGS NHD waterbodies — over the county-envelope bbox, plus a count-only figure over the
// discovery bbox.
//
//   node scripts/geo-signals/fetch-arcgis.mjs      (working directory: repo root)
//
// The archive is verbatim: no field is renamed, cleaned, defaulted or dropped. A count outside
// its measured band aborts the run and writes nothing — a truncated response is never archived.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DATASETS, FETCH_BBOX, DISCOVERY_BBOX, UA, arcgisEnvelope } from "./sources.mjs";

const RAW_DIR = "data/raw/geo-signals";
const LOG = `${RAW_DIR}/fetch-log.json`;
const PAGE_SIZE = 2000;
const MAX_PAGES = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

async function getJson(url, what) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let res;
    let body;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA } });
      body = await res.text();
    } catch (err) {
      console.warn(`  attempt ${attempt}/3 ${what}: network error ${err.message}`);
      if (attempt === 3) fail(`${what}: network error after 3 attempts — ${err.message}`);
      await sleep(10_000);
      continue;
    }
    if (res.status !== 200) {
      console.warn(`  attempt ${attempt}/3 ${what}: HTTP ${res.status}`);
      if (attempt === 3) fail(`${what}: HTTP ${res.status} after 3 attempts — ${body.slice(0, 200)}`);
      await sleep(10_000);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      console.warn(`  attempt ${attempt}/3 ${what}: non-JSON body`);
      if (attempt === 3) fail(`${what}: non-JSON body after 3 attempts — ${body.slice(0, 200)}`);
      await sleep(10_000);
      continue;
    }
    if (parsed.error) {
      console.warn(`  attempt ${attempt}/3 ${what}: ArcGIS error ${JSON.stringify(parsed.error).slice(0, 200)}`);
      if (attempt === 3) fail(`${what}: ArcGIS error after 3 attempts — ${JSON.stringify(parsed.error).slice(0, 200)}`);
      await sleep(10_000);
      continue;
    }
    return { parsed, status: res.status, bytes: body.length };
  }
  return fail(`${what}: unreachable`);
}

function dataUrl(endpoint, bbox, offset) {
  const p = new URLSearchParams({
    geometry: arcgisEnvelope(bbox),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    orderByFields: "OBJECTID",
    f: "geojson",
  });
  return `${endpoint}/query?${p}`;
}

function countUrl(endpoint, bbox) {
  const p = new URLSearchParams({
    geometry: arcgisEnvelope(bbox),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
    returnCountOnly: "true",
    f: "json",
  });
  return `${endpoint}/query?${p}`;
}

async function readLog() {
  try {
    return JSON.parse(await readFile(LOG, "utf8"));
  } catch {
    return [];
  }
}

await mkdir(RAW_DIR, { recursive: true });
const log = await readLog();

for (const d of DATASETS.filter((x) => x.transport === "arcgis")) {
  console.log(`\n${d.id}`);

  const cUrl = countUrl(d.endpoint, DISCOVERY_BBOX);
  const { parsed: cRes } = await getJson(cUrl, `${d.id} discovery-bbox count`);
  const countDiscovery = cRes.count;
  if (!Number.isInteger(countDiscovery)) fail(`${d.id}: discovery count is not an integer`);
  console.log(`  discovery bbox   ${countDiscovery}`);

  const started = Date.now();
  let retrievedAt = null;
  let status = null;
  let bytes = 0;
  let pages = 0;
  const features = [];
  let template = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = dataUrl(d.endpoint, FETCH_BBOX, page * PAGE_SIZE);
    const { parsed, status: st, bytes: by } = await getJson(url, `${d.id} page ${page}`);
    if (retrievedAt === null) retrievedAt = new Date().toISOString();
    status = st;
    bytes += by;
    pages += 1;
    if (template === null) template = { ...parsed, features: [] };
    const got = Array.isArray(parsed.features) ? parsed.features : [];
    features.push(...got);
    console.log(`  page ${page}          ${got.length} features, ${by} bytes${parsed.exceededTransferLimit ? " (exceededTransferLimit)" : ""}`);
    if (got.length < PAGE_SIZE && parsed.exceededTransferLimit !== true) break;
    if (page === MAX_PAGES - 1) fail(`${d.id}: exceeded ${MAX_PAGES} pages — refusing to truncate silently`);
  }

  const elapsed = Number(((Date.now() - started) / 1000).toFixed(3));
  const count = features.length;
  if (count < d.floor || count > d.ceiling)
    fail(`${d.id}: fetch-bbox count ${count} outside band ${d.floor}..${d.ceiling} — nothing written`);
  console.log(`  fetch bbox       ${count} (band ${d.floor}..${d.ceiling}) in ${elapsed}s over ${pages} page(s)`);

  const out = { ...template, features };
  delete out.exceededTransferLimit;
  await writeFile(`${RAW_DIR}/${d.id}.raw.json`, `${JSON.stringify(out, null, 2)}\n`);

  const entry = {
    id: d.id,
    endpoint: d.endpoint,
    query: dataUrl(d.endpoint, FETCH_BBOX, 0),
    http_status: status,
    elapsed_s: elapsed,
    pages,
    count_fetch_bbox: count,
    count_discovery_bbox: countDiscovery,
    retrieved_at: retrievedAt,
    bytes,
  };
  const i = log.findIndex((e) => e.id === d.id);
  if (i >= 0) log[i] = entry;
  else log.push(entry);
  await writeFile(LOG, `${JSON.stringify(log, null, 2)}\n`);
}

console.log(`\nfetch-log.json now carries ${log.length} dataset entr${log.length === 1 ? "y" : "ies"}`);
