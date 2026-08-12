// Fetch and verify the Rock Island County boundary polygon from US Census TIGERweb.
//
//   node scripts/geo-signals/fetch-boundary.mjs      (working directory: repo root)
//
// Writes the verbatim GeoJSON response to data/raw/geo-signals/county-boundary-tiger.geojson.
// Five hard assertions run before anything is written; any failure exits 1 writing nothing.
//
// Why TIGERweb and not the county GIS "Boundaries" service: that service is 15 *municipal*
// polygons and excludes unincorporated county, so clipping against it would silently delete
// every rural feature. TIGER publishes the county boundary itself, as one polygon.

import { mkdir, writeFile } from "node:fs/promises";

const ENDPOINT =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query";
const UA = "ateam-county-discovery/1.0";
const OUT = "data/raw/geo-signals/county-boundary-tiger.geojson";

function fail(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

// Planar shoelace area in km^2, equirectangular at latitude 41.47.
function ringAreaKm2(ring, lat0 = 41.47) {
  const R = 6371000;
  const k = Math.cos((lat0 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    const x1 = ((lon1 * Math.PI) / 180) * R * k;
    const y1 = ((lat1 * Math.PI) / 180) * R;
    const x2 = ((lon2 * Math.PI) / 180) * R * k;
    const y2 = ((lat2 * Math.PI) / 180) * R;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2) / 1e6;
}

const params = new URLSearchParams({
  where: "GEOID='17161'",
  outFields: "*",
  returnGeometry: "true",
  outSR: "4326",
  f: "geojson",
});

const started = Date.now();
const res = await fetch(`${ENDPOINT}?${params}`, { headers: { "User-Agent": UA } });
if (res.status !== 200) fail(`HTTP ${res.status} from TIGERweb`);
const body = await res.text();
let gj;
try {
  gj = JSON.parse(body);
} catch {
  fail(`non-JSON body from TIGERweb: ${body.slice(0, 200)}`);
}
const elapsed = ((Date.now() - started) / 1000).toFixed(3);

// 1
if (!Array.isArray(gj.features) || gj.features.length !== 1)
  fail(`expected 1 feature, got ${gj.features ? gj.features.length : "none"}`);
const f = gj.features[0];
// 2
if (f.properties.GEOID !== "17161") fail(`GEOID is ${f.properties.GEOID}, expected 17161`);
if (f.properties.NAME !== "Rock Island County")
  fail(`NAME is ${f.properties.NAME}, expected "Rock Island County"`);
// 3
if (f.geometry.type !== "Polygon") fail(`geometry type is ${f.geometry.type}, expected Polygon`);
// 4
const ring = f.geometry.coordinates[0];
if (!(ring.length > 1000)) fail(`outer ring has ${ring.length} vertices, expected > 1000`);
// 5
const polygonKm2 = ringAreaKm2(ring);
// TIGERweb returns AREALAND / AREAWATER as strings; coerce before adding.
const attributeKm2 = (Number(f.properties.AREALAND) + Number(f.properties.AREAWATER)) / 1e6;
const deltaPct = Math.abs(polygonKm2 - attributeKm2) / attributeKm2 * 100;
if (!(deltaPct < 1))
  fail(
    `area disagreement ${deltaPct.toFixed(2)}% — polygon ${polygonKm2.toFixed(2)} km2 vs attribute ${attributeKm2.toFixed(2)} km2`,
  );

let w = Infinity;
let s = Infinity;
let e = -Infinity;
let n = -Infinity;
for (const [lon, lat] of ring) {
  if (lon < w) w = lon;
  if (lon > e) e = lon;
  if (lat < s) s = lat;
  if (lat > n) n = lat;
}

await mkdir("data/raw/geo-signals", { recursive: true });
await writeFile(OUT, `${JSON.stringify(gj, null, 2)}\n`);

console.log(`county boundary written to ${OUT}`);
console.log(`  http_status      200 in ${elapsed}s, ${body.length} bytes`);
console.log(`  GEOID/NAME       ${f.properties.GEOID} ${f.properties.NAME}`);
console.log(`  vertices         ${ring.length}`);
console.log(`  polygon area     ${polygonKm2.toFixed(2)} km2`);
console.log(`  attribute area   ${attributeKm2.toFixed(2)} km2  (AREALAND + AREAWATER)`);
console.log(`  delta            ${deltaPct.toFixed(2)}%`);
console.log(`  ring envelope    ${w.toFixed(4)}, ${s.toFixed(4)}, ${e.toFixed(4)}, ${n.toFixed(4)} (W,S,E,N)`);
console.log(`  retrieved_at     ${new Date().toISOString()}`);
