// WI-5 — Link permit records to parcels on the identifier the source printed, and report the rate
// honestly.
//
//   npm run link:parcels
//
// Three tiers, first hit wins:
//   1. pin-exact         the EnerGov reports print the 10-digit county PIN (leading zero dropped)
//   2. legacy-key-exact  the legacy reports print a TAX_MAP key = the parcel layer's RICO_PARCE
//   3. address-normalized  fallback only
//
// Source sentinels (000000, 000000001, RIGHT-OF-WAY) are classified as sentinels, NOT counted as
// match failures — they are not parcel references at all.
//
// A permit that did not match is not a permit without a parcel. Every unmatched record carries a
// stated reason. No PIN is ever invented and no unmatched record is written as "".

import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { COUNTY_SLUG, JOB_ID, dirs, files, toJson } from "./paths.mjs";

const PARCEL_LAYER_URL =
  "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0";

// The committed parcel seed (ISSUE-017): the same layer, already paged live at 65,955 records and
// checked in with PIN, RICO_PARCE and situs_address. Reusing it avoids 33 redundant requests
// against the county's server. If it is absent the script pages the live layer instead.
const SEED_CSV =
  process.env.PARCEL_SEED_CSV ??
  "/Users/lukas/Developer/ateam/elephant-pipeline/data/seeds/rock-island.csv";

const SENTINELS = new Set(["000000", "000000001", "RIGHT-OF-WAY"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function parcelsFromSeed() {
  const rows = parseCsv(await readFile(SEED_CSV, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const iPin = header.indexOf("PIN");
  const iLegacy = header.indexOf("RICO_PARCE");
  const iAddress = header.indexOf("situs_address");
  if (iPin < 0 || iLegacy < 0) {
    throw new Error(`parcel seed ${SEED_CSV} is missing PIN or RICO_PARCE`);
  }
  return rows
    .slice(1)
    .filter((r) => r.length > iPin)
    .map((r) => ({
      PIN: (r[iPin] ?? "").trim(),
      RICO_PARCE: (r[iLegacy] ?? "").trim(),
      site_address: (r[iAddress] ?? "").trim(),
    }));
}

async function parcelsFromLayer() {
  const out = [];
  for (let offset = 0; ; offset += 2000) {
    const url =
      `${PARCEL_LAYER_URL}/query?where=1%3D1&outFields=PIN%2CRICO_PARCE%2Csite_address` +
      `&returnGeometry=false&orderByFields=OBJECTID&resultRecordCount=2000&resultOffset=${offset}&f=json`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.status !== 200) throw new Error(`parcel layer HTTP ${response.status}`);
    const body = await response.json();
    const features = body.features ?? [];
    for (const f of features) {
      out.push({
        PIN: String(f.attributes.PIN ?? "").trim(),
        RICO_PARCE: String(f.attributes.RICO_PARCE ?? "").trim(),
        site_address: String(f.attributes.site_address ?? "").trim(),
      });
    }
    console.log(`  parcel page offset=${offset} features=${features.length} total=${out.length}`);
    if (features.length === 0 || body.exceededTransferLimit !== true) break;
  }
  return out;
}

function normaliseAddress(raw) {
  if (!raw) return "";
  let s = raw.toUpperCase().replace(/&/g, " AND ");
  s = s.replace(/[^A-Z0-9 /]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+(ROCK ISLAND,?\s+IL\s+\d{5}|IL\s+\d{5})$/, "").trim();
  return s;
}

async function loadParcelIndex() {
  if (await exists(files.parcelKeyIndex)) {
    const cached = JSON.parse(await readFile(files.parcelKeyIndex, "utf8"));
    console.log(
      `parcel key index: ${cached.parcel_feature_count} parcels (cached, source ${cached.parcel_key_source})`,
    );
    return cached;
  }

  const fromSeed = await exists(SEED_CSV);
  console.log(
    fromSeed
      ? `building parcel key index from the committed parcel seed ${SEED_CSV}`
      : `building parcel key index by paging ${PARCEL_LAYER_URL}`,
  );
  const parcels = fromSeed ? await parcelsFromSeed() : await parcelsFromLayer();

  const byPin = {};
  const byLegacy = {};
  const addressCounts = new Map();
  let legacyCollisions = 0;
  for (const parcel of parcels) {
    if (parcel.PIN) byPin[parcel.PIN] = parcel.PIN;
    const legacy = parcel.RICO_PARCE.toUpperCase();
    if (legacy && parcel.PIN) {
      if (byLegacy[legacy] !== undefined && byLegacy[legacy] !== parcel.PIN) legacyCollisions += 1;
      else byLegacy[legacy] = parcel.PIN;
    }
    const address = normaliseAddress(parcel.site_address);
    if (address && parcel.PIN) {
      if (!addressCounts.has(address)) addressCounts.set(address, new Set());
      addressCounts.get(address).add(parcel.PIN);
    }
  }
  // An address that resolves to more than one parcel is not a match.
  const byAddress = {};
  let ambiguousAddresses = 0;
  for (const [address, pins] of addressCounts) {
    if (pins.size === 1) byAddress[address] = [...pins][0];
    else ambiguousAddresses += 1;
  }

  const index = {
    county_slug: COUNTY_SLUG,
    job_id: JOB_ID,
    built_at: new Date().toISOString(),
    parcel_layer_url: PARCEL_LAYER_URL,
    parcel_key_source: fromSeed ? SEED_CSV : PARCEL_LAYER_URL,
    parcel_feature_count: parcels.length,
    distinct_pins: Object.keys(byPin).length,
    distinct_legacy_keys: Object.keys(byLegacy).length,
    legacy_key_collisions: legacyCollisions,
    ambiguous_addresses_dropped: ambiguousAddresses,
    byPin,
    byLegacy,
    byAddress,
  };
  await writeFile(files.parcelKeyIndex, toJson(index));
  console.log(
    `parcel key index: ${parcels.length} parcels, ${index.distinct_pins} pins, ${index.distinct_legacy_keys} legacy keys, ${ambiguousAddresses} ambiguous addresses dropped`,
  );
  return index;
}

function classify(record, index) {
  const pinPrinted = (record.parcel_number_source ?? "").replace(/\D/g, "");
  if (pinPrinted !== "") {
    const padded = pinPrinted.padStart(10, "0");
    if (index.byPin[padded]) {
      return { matched_pin: index.byPin[padded], match_method: "pin-exact", unmatched_reason: null };
    }
  }

  const taxMap = (record.tax_map ?? "").trim().toUpperCase();
  if (taxMap !== "" && (SENTINELS.has(taxMap) || /^0+$/.test(taxMap))) {
    return {
      matched_pin: null,
      match_method: null,
      unmatched_reason: "source-sentinel-not-a-parcel-reference",
    };
  }

  if (taxMap !== "" && index.byLegacy[taxMap]) {
    return {
      matched_pin: index.byLegacy[taxMap],
      match_method: "legacy-key-exact",
      unmatched_reason: null,
    };
  }

  const address = normaliseAddress(record.address_source);
  if (address !== "" && index.byAddress[address]) {
    return {
      matched_pin: index.byAddress[address],
      match_method: "address-normalized",
      unmatched_reason: null,
    };
  }

  if (taxMap !== "") {
    return {
      matched_pin: null,
      match_method: null,
      unmatched_reason: "legacy-key-not-in-current-parcel-layer",
    };
  }
  if (pinPrinted !== "") {
    return {
      matched_pin: null,
      match_method: null,
      unmatched_reason: "printed-pin-not-in-current-parcel-layer",
    };
  }
  if ((record.address_source ?? "").trim() !== "") {
    return { matched_pin: null, match_method: null, unmatched_reason: "address-ambiguous-or-absent" };
  }
  return { matched_pin: null, match_method: null, unmatched_reason: "no-parcel-key-printed" };
}

async function main() {
  const index = await loadParcelIndex();

  const byMethod = { "pin-exact": 0, "legacy-key-exact": 0, "address-normalized": 0 };
  const unmatched = {
    "source-sentinel-not-a-parcel-reference": 0,
    "legacy-key-not-in-current-parcel-layer": 0,
    "address-ambiguous-or-absent": 0,
    "no-parcel-key-printed": 0,
  };
  let total = 0;
  let matched = 0;

  const names = (await readdir(dirs.extracted)).filter((f) => f.endsWith(".json")).sort();
  for (const name of names) {
    const file = path.join(dirs.extracted, name);
    const artifact = JSON.parse(await readFile(file, "utf8"));
    for (const record of artifact.records) {
      const result = classify(record, index);
      record.matched_pin = result.matched_pin;
      record.match_method = result.match_method;
      record.unmatched_reason = result.unmatched_reason;
      total += 1;
      if (result.match_method) {
        matched += 1;
        byMethod[result.match_method] += 1;
      } else {
        unmatched[result.unmatched_reason] = (unmatched[result.unmatched_reason] ?? 0) + 1;
      }
    }
    artifact.linked_at = new Date().toISOString();
    await writeFile(file, toJson(artifact));
  }

  const rate = total === 0 ? 0 : Number(((matched / total) * 100).toFixed(2));
  const linkage = {
    county_slug: COUNTY_SLUG,
    job_id: JOB_ID,
    linked_at: new Date().toISOString(),
    parcel_layer_url: PARCEL_LAYER_URL,
    parcel_key_source: index.parcel_key_source,
    parcel_feature_count: index.parcel_feature_count,
    total_permit_records: total,
    matched,
    match_rate_pct: rate,
    by_method: byMethod,
    unmatched,
    method_statement:
      "Permits are joined to parcels on the identifier the source printed, in three tiers. Tier 1: the EnerGov reports (2026-04 onward) print the 10-digit county PIN, matched exactly after left-padding a dropped leading zero. Tier 2: the legacy reports (2017-01 to 2026-03) print a TAX_MAP number, matched exactly against the parcel layer's RICO_PARCE legacy identifier. Tier 3: remaining records are matched on a normalised site address. Address matching is the fallback, not the method, and the parcel layer's site_address is itself only 88.91% populated.",
    limits_statement:
      "A permit that did not match is not a permit without a parcel. Unmatched records fall into stated categories, including source sentinel values such as 000000 and RIGHT-OF-WAY that are not parcel references at all, and legacy keys for parcels that appear to have since been split or retired. Matching is to the parcel layer as it stands today, not as it stood when the permit was issued.",
  };
  await writeFile(files.linkage, toJson(linkage));

  const unmatchedTotal = Object.values(unmatched).reduce((a, b) => a + b, 0);
  console.log(
    `linkage: total=${total} matched=${matched} (${rate}%) pin=${byMethod["pin-exact"]} legacy=${byMethod["legacy-key-exact"]} address=${byMethod["address-normalized"]} unmatched=${unmatchedTotal}`,
  );
  for (const [reason, count] of Object.entries(unmatched)) {
    console.log(`  unmatched ${reason}: ${count}`);
  }
}

await main();
