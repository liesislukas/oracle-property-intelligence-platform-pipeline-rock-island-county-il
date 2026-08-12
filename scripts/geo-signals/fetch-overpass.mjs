// Fetch and archive the four OpenStreetMap datasets through the Overpass API.
//
//   node scripts/geo-signals/fetch-overpass.mjs      (working directory: repo root)
//
// Politeness is binding, and it is measured, not guessed. Running eight Overpass queries at
// 5-second spacing on 2026-08-12 produced three 504s and two 429s out of ten requests, with HTML
// error bodies, and the same query that 504'd succeeded on retry at 25-second spacing. So:
// sequential only, >= 15 s between any two requests, 4 attempts with 30/60/120 s backoff, retry on
// 429, 504 and on a 200 whose body is not JSON, and a hard exit rather than a recorded zero.
// A zero that was actually a timeout is a fabricated count.
//
// User-Agent is the bare token `ateam-county-discovery/1.0`. Measured: empty UA -> 406,
// Mozilla/5.0 -> 406, curl/8.7.1 -> 504, the bare token -> 200, and the same token with a
// parenthesised contact URL -> 406. Do not add a URL. Do not add a suffix.
//
// Expected wall clock on a clean run: 3-5 minutes. That is the politeness spacing, not a hang.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  DATASETS,
  FETCH_BBOX,
  DISCOVERY_BBOX,
  UA,
  OVERPASS_ENDPOINT,
  overpassBbox,
} from "./sources.mjs";

const RAW_DIR = "data/raw/geo-signals";
const LOG = `${RAW_DIR}/fetch-log.json`;
const SPACING_MS = 15_000;
const BACKOFF_MS = [30_000, 60_000, 120_000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

let lastRequestAt = 0;
async function space() {
  const wait = lastRequestAt + SPACING_MS - Date.now();
  if (wait > 0) {
    console.log(`  …waiting ${Math.ceil(wait / 1000)}s (politeness spacing)`);
    await sleep(wait);
  }
}

async function overpass(query, what) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await space();
    lastRequestAt = Date.now();
    let res;
    let body;
    try {
      res = await fetch(OVERPASS_ENDPOINT, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }),
      });
      body = await res.text();
      lastRequestAt = Date.now();
    } catch (err) {
      lastRequestAt = Date.now();
      console.warn(`  attempt ${attempt}/4 ${what}: network error ${err.message}`);
      if (attempt === 4) fail(`${what}: network error after 4 attempts — ${err.message}`);
      await sleep(BACKOFF_MS[attempt - 1]);
      continue;
    }
    if (res.status !== 200) {
      console.warn(`  attempt ${attempt}/4 ${what}: HTTP ${res.status}`);
      if (attempt === 4)
        fail(`${what}: HTTP ${res.status} after 4 attempts — ${body.slice(0, 200)}`);
      await sleep(BACKOFF_MS[attempt - 1]);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      console.warn(`  attempt ${attempt}/4 ${what}: HTTP 200 with a non-JSON body (overload page)`);
      if (attempt === 4)
        fail(`${what}: HTTP 200 non-JSON body after 4 attempts — ${body.slice(0, 200)}`);
      await sleep(BACKOFF_MS[attempt - 1]);
      continue;
    }
    return { parsed, status: res.status, bytes: body.length };
  }
  return fail(`${what}: unreachable`);
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

const fetchBB = overpassBbox(FETCH_BBOX);
const discoveryBB = overpassBbox(DISCOVERY_BBOX);

for (const d of DATASETS.filter((x) => x.transport === "overpass")) {
  console.log(`\n${d.id}`);

  const countQuery = d.countQuery.replace("{BB}", discoveryBB);
  const { parsed: cRes } = await overpass(countQuery, `${d.id} discovery-bbox count`);
  const tags = cRes.elements && cRes.elements[0] ? cRes.elements[0].tags : null;
  if (!tags || tags.total === undefined) fail(`${d.id}: count query returned no total`);
  const countDiscovery = Number(tags.total);
  if (!Number.isInteger(countDiscovery)) fail(`${d.id}: discovery count is not an integer`);
  console.log(
    `  discovery bbox   ${countDiscovery} (nodes ${tags.nodes}, ways ${tags.ways}, relations ${tags.relations})`,
  );

  const dataQuery = d.dataQuery.replace("{BB}", fetchBB);
  const started = Date.now();
  const { parsed, status, bytes } = await overpass(dataQuery, `${d.id} fetch-bbox data`);
  const retrievedAt = new Date().toISOString();
  const elapsed = Number(((Date.now() - started) / 1000).toFixed(3));

  const count = Array.isArray(parsed.elements) ? parsed.elements.length : 0;
  if (count < d.floor || count > d.ceiling)
    fail(`${d.id}: fetch-bbox count ${count} outside band ${d.floor}..${d.ceiling} — nothing written`);
  if (!parsed.osm3s || !parsed.osm3s.copyright) fail(`${d.id}: response carries no osm3s.copyright`);
  console.log(`  fetch bbox       ${count} (band ${d.floor}..${d.ceiling}) in ${elapsed}s, ${bytes} bytes`);
  console.log(`  copyright        ${parsed.osm3s.copyright}`);

  await writeFile(`${RAW_DIR}/${d.id}.raw.json`, `${JSON.stringify(parsed, null, 2)}\n`);

  const entry = {
    id: d.id,
    endpoint: d.endpoint,
    query: dataQuery,
    http_status: status,
    elapsed_s: elapsed,
    pages: 1,
    count_fetch_bbox: count,
    count_discovery_bbox: countDiscovery,
    retrieved_at: retrievedAt,
    bytes,
    osm3s_copyright: parsed.osm3s.copyright,
  };
  const i = log.findIndex((e) => e.id === d.id);
  if (i >= 0) log[i] = entry;
  else log.push(entry);
  await writeFile(LOG, `${JSON.stringify(log, null, 2)}\n`);
}

console.log(`\nfetch-log.json now carries ${log.length} dataset entr${log.length === 1 ? "y" : "ies"}`);
