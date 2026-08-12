// Clip all seven geo-signal datasets to the Rock Island County polygon.
//
//   node scripts/geo-signals/clip.mjs      (working directory: repo root)
//
// A bounding-box count is not a county count. The fetch rectangle crosses the Mississippi into
// Scott, Muscatine and Cedar counties, Iowa; the clip against the TIGER county polygon is what
// turns a number into a county number.
//
// One clip rule for all seven datasets, no branching:
//     keep-flag  =  booleanIntersects(feature, countyPolygon)
// Points, lines and polygons take the same path. Nothing is deleted — every fetched feature is
// written out with properties.__in_county set true or false, because a site's nearest substation
// genuinely does not stop at the county line and because "both counts" has to stay countable.
//
// The clip's proof is by NAME, not by count: Illinois plants in, Iowa plants out, cross-checked
// against the layer's own County/State attributes. Ordinary source drift cannot mask a broken clip.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { booleanIntersects, feature as turfFeature } from "@turf/turf";
import { DATASETS, COUNTY_SLUG } from "./sources.mjs";

const RAW_DIR = "data/raw/geo-signals";
const OUT_DIR = path.resolve(
  "/Users/lukas/Developer/ateam/elephant-pipeline/data/artifacts/geo-signals",
  COUNTY_SLUG,
);
const CLIP_LOG = `${RAW_DIR}/clip-log.json`;

function fail(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

const r6 = (n) => Math.round(n * 1e6) / 1e6;

// Convert one Overpass element to a GeoJSON feature. An absent tag stays absent; nothing is
// invented, defaulted or normalised here.
function osmToFeature(el) {
  let geometry = null;
  if (el.type === "node" && el.lon !== undefined) {
    geometry = { type: "Point", coordinates: [r6(el.lon), r6(el.lat)] };
  } else if (Array.isArray(el.geometry) && el.geometry.length > 1) {
    geometry = {
      type: "LineString",
      coordinates: el.geometry.map((p) => [r6(p.lon), r6(p.lat)]),
    };
  } else if (el.center) {
    geometry = { type: "Point", coordinates: [r6(el.center.lon), r6(el.center.lat)] };
  }
  if (geometry === null) return null;
  const uid = `${el.type}/${el.id}`;
  return {
    type: "Feature",
    id: uid,
    geometry,
    properties: {
      ...(el.tags || {}),
      __osm_id: uid,
      __osm_type: el.type,
      __osm_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    },
  };
}

const boundary = JSON.parse(
  await readFile(`${RAW_DIR}/county-boundary-tiger.geojson`, "utf8"),
);
const county = boundary.features[0];
if (!county || county.geometry.type !== "Polygon") fail("county boundary is not a single Polygon");
const countyPoly = turfFeature(county.geometry);

await mkdir(OUT_DIR, { recursive: true });

const clipLog = [];

for (const d of DATASETS) {
  const raw = JSON.parse(await readFile(`${RAW_DIR}/${d.id}.raw.json`, "utf8"));
  let features;
  if (d.transport === "overpass") {
    const converted = raw.elements.map(osmToFeature);
    const skipped = converted.filter((f) => f === null).length;
    if (skipped > 0) fail(`${d.id}: ${skipped} OSM element(s) carried no usable geometry`);
    features = converted;
  } else {
    features = raw.features;
  }

  let kept = 0;
  for (const f of features) {
    const inCounty = booleanIntersects(f, countyPoly);
    f.properties.__in_county = inCounty;
    if (inCounty) kept += 1;
  }

  const out = {
    type: "FeatureCollection",
    features,
  };
  const artifactPath = path.join(OUT_DIR, `${d.id}.clipped.geojson`);
  await writeFile(artifactPath, `${JSON.stringify(out, null, 2)}\n`);

  clipLog.push({
    id: d.id,
    count_fetch_bbox: features.length,
    count_clipped: kept,
    count_dropped: features.length - kept,
    clipped_artifact_path: artifactPath,
  });
}

// Assertion 1 — every dataset kept something, and never more than it fetched.
for (const r of clipLog) {
  if (!(r.count_clipped > 0))
    fail(`${r.id}: clipped count is ${r.count_clipped} — a dataset with nothing in the county`);
  if (!(r.count_clipped <= r.count_fetch_bbox))
    fail(`${r.id}: clipped ${r.count_clipped} exceeds fetched ${r.count_fetch_bbox}`);
}

// Assertion 2 — the clip actually ran somewhere.
if (!clipLog.some((r) => r.count_clipped < r.count_fetch_bbox))
  fail("no dataset lost a single feature to the clip — the clip did not run");

// Assertion 3 — the clip's proof, by name.
const plants = JSON.parse(
  await readFile(path.join(OUT_DIR, "hifld-power-plants.clipped.geojson"), "utf8"),
);
const byName = new Map(plants.features.map((f) => [f.properties.Plant_Name, f]));
const MUST_BE_IN = ["Quad Cities Generating Station", "Cordova Energy", "Moline"];
const MUST_BE_OUT = [
  "Davenport Water Pollution Control Plant",
  "Muscatine Plant #1",
  "Wilton",
  "Durant",
  "AgriReNew",
  "Eastern Iowa Solar",
];
for (const name of MUST_BE_IN) {
  const f = byName.get(name);
  if (!f) fail(`clip proof: "${name}" is absent from the fetch entirely`);
  if (f.properties.__in_county !== true) fail(`clip proof: "${name}" was clipped OUT of the county`);
}
for (const name of MUST_BE_OUT) {
  const f = byName.get(name);
  if (!f) fail(`clip proof: "${name}" is absent from the fetch entirely`);
  if (f.properties.__in_county !== false) fail(`clip proof: "${name}" was kept IN the county`);
}
// Independent cross-check: the layer's own attributes must agree with the geometry.
for (const f of plants.features) {
  if (f.properties.__in_county !== true) continue;
  if (f.properties.County !== "Rock Island" || f.properties.State !== "Illinois")
    fail(
      `clip proof: "${f.properties.Plant_Name}" kept by the polygon but reads ${f.properties.County} / ${f.properties.State}`,
    );
}

await writeFile(CLIP_LOG, `${JSON.stringify(clipLog, null, 2)}\n`);

const pad = (s, n) => String(s).padEnd(n);
const padl = (s, n) => String(s).padStart(n);
console.log(`${pad("id", 26)} ${padl("fetch bbox", 11)} ${padl("clipped", 8)} ${padl("dropped", 8)}`);
console.log("-".repeat(56));
for (const r of clipLog)
  console.log(
    `${pad(r.id, 26)} ${padl(r.count_fetch_bbox, 11)} ${padl(r.count_clipped, 8)} ${padl(r.count_dropped, 8)}`,
  );
console.log("");
console.log("clip proof — HIFLD power plants, by name:");
for (const f of plants.features.slice().sort((a, b) => Number(b.properties.__in_county) - Number(a.properties.__in_county)))
  console.log(
    `  ${f.properties.__in_county ? "IN " : "OUT"}  ${pad(f.properties.Plant_Name, 42)} ${f.properties.County}, ${f.properties.State}`,
  );
console.log(`\nartifacts written to ${OUT_DIR}`);
