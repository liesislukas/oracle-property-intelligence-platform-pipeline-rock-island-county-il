/**
 * ISSUE-018 WI-4 — extraction-completeness diff, per `validate-county-transform`.
 *
 *   node scripts/field-inventory-diff.mjs <transformed-dir> <objectid> [<objectid> …]
 *
 * The skill's step 3 says "enumerate every label/value pair, table and media URL present on the
 * page(s)". Our capture is a JSON document, not an HTML page, so the raw inventory is stated as:
 * every one of the 82 `attributes` keys whose value is non-empty after trim (T2). That
 * substitution is recorded in the report, not assumed silently.
 *
 * A raw field counts as EXTRACTED when its value is reachable in the transformed output — either
 * verbatim, or through one of the declared derivations below (epoch-ms dates, assessed-value sums,
 * the acreage field, the geometry ring). Everything else is listed as missing and classified
 * (a) extractor bug / (b) capture gap / (c) lexicon has no home, by hand, in the report.
 */

import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIRROR = path.join(REPO_ROOT, "data", "source-mirror", "rock-island");

const txt = (v) => String(v ?? "").trim();
const [dirArg, ...ids] = process.argv.slice(2);
if (!dirArg || ids.length === 0) {
  console.error("usage: node scripts/field-inventory-diff.mjs <transformed-dir> <objectid> …");
  process.exit(2);
}

/** Every scalar leaf in an object tree, as trimmed strings. */
function leaves(node, out = new Set()) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    for (const v of node) leaves(v, out);
    return out;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node)) leaves(v, out);
    return out;
  }
  out.add(txt(node));
  return out;
}

const results = [];
for (const id of ids) {
  const mirror = JSON.parse(await readFile(path.join(MIRROR, `${id}.json`), "utf8"));
  const a = mirror.attributes;
  const outDir = path.join(dirArg, id, "data");
  let files;
  try {
    files = await readdir(outDir);
  } catch {
    results.push({ parcel_id: id, error: `no transformed output at ${outDir}` });
    continue;
  }
  const values = new Set();
  const docs = {};
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    const doc = JSON.parse(await readFile(path.join(outDir, f), "utf8"));
    docs[f] = doc;
    leaves(doc, values);
  }

  const property = docs["property.json"] ?? {};
  const tax = docs["tax.json"] ?? {};
  const lot = docs["lot.json"] ?? {};
  const sales = docs["sales_history.json"] ?? {};
  const geometry = docs["geometry.json"] ?? {};

  const epochDay = (v) => (v == null ? null : new Date(Number(v)).toISOString().slice(0, 10));
  const mailingDocs = Object.entries(docs)
    .filter(([f]) => f.startsWith("mailing_address"))
    .map(([, d]) => txt(d.unnormalized_address));
  const inAnyMailing = (v) => txt(v) !== "" && mailingDocs.some((s) => s.includes(txt(v)));
  /** Declared derivations: a raw field is extracted although its literal value is not in output. */
  const DERIVED = {
    date_last_sale: () => sales.ownership_transfer_date === epochDay(a.date_last_sale),
    GIS_acres_num: () => Number(lot.lot_size_acre) === Number(a.GIS_acres_num),
    farm_land: () => tax.property_land_amount === Number(a.farm_land ?? 0) + Number(a.non_farm_land ?? 0),
    non_farm_land: () => tax.property_land_amount === Number(a.farm_land ?? 0) + Number(a.non_farm_land ?? 0),
    farm_building: () => tax.property_building_amount === Number(a.farm_building ?? 0) + Number(a.non_farm_building ?? 0),
    non_farm_building: () => tax.property_building_amount === Number(a.farm_building ?? 0) + Number(a.non_farm_building ?? 0),
    X_longitude: () => Number(geometry.longitude) === Number(a.X_longitude),
    Y_latitude: () => Number(geometry.latitude) === Number(a.Y_latitude),
    OBJECTID: () => txt(property.request_identifier) === txt(a.OBJECTID),
    site_address: () => txt(docs["address.json"]?.unnormalized_address).includes(txt(a.site_address)),
    site_csz: () => txt(docs["address.json"]?.unnormalized_address).includes(txt(a.site_csz)),
    // A mailing address is carried as one unnormalized string, so its parts are extracted when
    // they appear inside it verbatim.
    taxbill_addr: () => inAnyMailing(a.taxbill_addr),
    taxbill_addr1: () => inAnyMailing(a.taxbill_addr1),
    taxbill_addr2: () => inAnyMailing(a.taxbill_addr2),
    taxbill_csz: () => inAnyMailing(a.taxbill_csz),
    Taxbill_CS: () => inAnyMailing(a.Taxbill_CS),
    Taxbill_Zip: () => inAnyMailing(a.Taxbill_Zip),
    owner1_address1: () => inAnyMailing(a.owner1_address1),
    owner1_address2: () => inAnyMailing(a.owner1_address2),
    owner1_csz: () => inAnyMailing(a.owner1_csz),
    Owner_zip: () => inAnyMailing(a.Owner_zip),
    Owner_City: () => inAnyMailing(a.Owner_City),
    Owner_State: () => inAnyMailing(a.Owner_State),
    // `class` is unmapped by design: the code->label table is on the TCP-blocked assessor portal.
    // property_usage_type is written as the lexicon's own "Unknown"; the raw code is not carried
    // into the transformed output because property has additionalProperties:false.
  };

  const rawPresentKeys = Object.keys(a).filter((k) => txt(a[k]) !== "");
  const missing = [];
  for (const k of rawPresentKeys) {
    const v = txt(a[k]);
    if (values.has(v)) continue;
    if (DERIVED[k]) {
      let ok = false;
      try {
        ok = Boolean(DERIVED[k]());
      } catch {
        ok = false;
      }
      if (ok) continue;
    }
    missing.push(k);
  }
  results.push({
    parcel_id: id,
    parcel_identifier: property.parcel_identifier ?? null,
    usage_class: txt(a.class),
    rawPresent: rawPresentKeys.length,
    extracted: rawPresentKeys.length - missing.length,
    coveragePct: Number(
      (((rawPresentKeys.length - missing.length) / rawPresentKeys.length) * 100).toFixed(2),
    ),
    missing,
  });
}

console.log(JSON.stringify(results, null, 2));
