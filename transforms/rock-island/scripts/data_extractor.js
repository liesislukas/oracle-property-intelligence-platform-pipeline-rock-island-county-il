/**
 * Rock Island County — County data-group extractor.
 *
 * Execution contract (@elephant-xyz/cli@1.58.1, dist/commands/transform/*):
 *   - run as a plain Node process, NO arguments, cwd = the CLI's temp WORKDIR;
 *   - the prepared multi-request-flow output is at ./input.json (normalizeInputsForScripts
 *     renames the single response JSON);
 *   - entity + relationship JSON files are written into ./data/;
 *   - ./address.json and ./parcel.json are additionally written at WORKDIR root because
 *     handleDataGroupTransform reads source_http_request / request_identifier from address.json
 *     there (index.js lines 473-482) and copies parcel.json into data/ afterwards;
 *   - success is exit code 0. A non-zero exit aborts the whole transform.
 *
 * There is no injected API — no writeJson, no writeRelationship, no readCapture. Those belong to
 * a CLI generation this version does not ship (deviation D3).
 *
 * The seven measured source traps are handled here; see ../README.md for the full table.
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { classifyOwner } from "./ownerMapping.js";

// --- trap helpers -----------------------------------------------------------------------------
/** T2: blanks in this source are "" or " ", never NULL. Trim, then treat empty as absent. */
const txt = (v) => String(v ?? "").trim();
const present = (v) => txt(v) !== "";
const num = (v) => (txt(v) !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
/** T3: dates are epoch milliseconds. */
const epochDay = (v) => (v == null ? null : new Date(Number(v)).toISOString().slice(0, 10));

const DATA = "data";
const write = async (name, obj) => {
  await writeFile(path.join(DATA, name), JSON.stringify(obj, null, 2));
};

/** Municipality codes carried in the `Zoning` column (T6) — a municipality, not a zoning class. */
const MUNICIPALITY_ZONING_CODES = new Set([
  "MOL", "RI", "EM", "SIL", "MIL", "CV", "HAM", "PB", "CCL", "AND", "COR", "OAK", "REY",
]);

async function readInput() {
  for (const candidate of ["input.json", path.join("input", "input.json")]) {
    try {
      return JSON.parse(await readFile(candidate, "utf8"));
    } catch {
      /* try the next one */
    }
  }
  // Last resort: the single response JSON inside input/
  const files = await readdir("input");
  const first = files.find((f) => f.endsWith(".json"));
  if (!first) throw new Error("no prepared flow output found in WORKDIR or ./input");
  return JSON.parse(await readFile(path.join("input", first), "utf8"));
}

const flow = await readInput();
const entry = flow.ParcelDetail ?? Object.values(flow)[0];
if (!entry) throw new Error("prepared flow output has no ParcelDetail key");
const raw = entry.response;
const resp = typeof raw === "string" ? JSON.parse(raw) : raw;
const a = resp.attributes ?? {};
const g = resp.geometry ?? null;
const meta = resp.meta ?? {};

const requestIdentifier = String(a.OBJECTID);

/**
 * Per-record provenance points at the COUNTY endpoint that serves this record, not at the local
 * mirror the run reads. The mirror is a one-pull copy of exactly this query (see README).
 */
const sourceHttpRequest = {
  method: "GET",
  url: `${meta.layerUrl ?? "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0"}/query`,
  multiValueQueryString: {
    where: [`OBJECTID=${requestIdentifier}`],
    outFields: ["*"],
    returnGeometry: ["true"],
    outSR: ["4326"],
    f: ["geojson"],
  },
};
const stamp = { source_http_request: sourceHttpRequest, request_identifier: requestIdentifier };

await mkdir(DATA, { recursive: true });

// --- property ---------------------------------------------------------------------------------
// parcel_identifier = PIN, VERBATIM (board contract). PIN is not unique county-wide (T1) — the
// pipeline key is OBJECTID, which is request_identifier above.
const pin = present(a.PIN) ? txt(a.PIN) : present(a.RICO_PARCE) ? txt(a.RICO_PARCE) : requestIdentifier;

const zoningRaw = txt(a.Zoning);
const zoningBase = zoningRaw.replace(/[!?]$/, "");
const zoningIsMunicipalityCode = MUNICIPALITY_ZONING_CODES.has(zoningBase);

const yearBuilt = /^[0-9]{4}$/.test(txt(a.YRBuilt)) ? Number(txt(a.YRBuilt)) : null;

const property = {
  ...stamp,
  parcel_identifier: pin,
  property_legal_description_text: present(a.legal) ? txt(a.legal) : null,
  // The class-code -> label table lives on the TCP-blocked assessor portal, so every `class` value
  // is unmapped. Skip-and-warn, never abort, and never invent a label: `LandParcel` is the
  // neutral parcel-level enum member and `Unknown` is the lexicon's own "not established" usage.
  property_type: "LandParcel",
  property_usage_type: "Unknown",
  // T6: written verbatim, suffixes included. `R1!` stays `R1!`.
  zoning: zoningRaw === "" ? null : zoningRaw,
  property_structure_built_year: yearBuilt,
};
// TOTSQFT is a string in the source; the deprecated `total_area` is its only lexicon home and it
// requires two consecutive digits.
if (/\d{2,}/.test(txt(a.TOTSQFT))) property.total_area = txt(a.TOTSQFT);
await write("property.json", property);

// --- address (situs) --------------------------------------------------------------------------
// Branch "Address with unnormalized format": the source publishes one situs string, and building a
// structured address would mean parsing it. `county_name` is omitted deliberately — its enum has
// no Illinois county (lexicon gap, see README).
const unnormalized = [txt(a.site_address), txt(a.site_csz)].filter((s) => s !== "").join(", ");
const address = {
  ...stamp,
  unnormalized_address: unnormalized === "" ? null : unnormalized,
  city_name: /^[A-Z\s\-']+$/.test(txt(a.Site_City)) ? txt(a.Site_City) : null,
  state_code: /^[A-Z]{2}$/.test(txt(a.Site_State)) ? txt(a.Site_State) : null,
  postal_code: /^\d{5}$/.test(txt(a.Site_Zip)) ? txt(a.Site_Zip) : null,
  municipality_name: present(a.municipality) ? txt(a.municipality) : null,
  township: present(a.township) ? txt(a.township) : null,
  latitude: num(a.Y_latitude),
  longitude: num(a.X_longitude),
};
await write("address.json", address);
await writeFile("address.json", JSON.stringify(address, null, 2));

// --- parcel (WORKDIR root only; the CLI copies it into data/) ----------------------------------
await writeFile(
  "parcel.json",
  JSON.stringify({ ...stamp, parcel_identifier: pin }, null, 2),
);

// --- geometry ---------------------------------------------------------------------------------
// The lexicon's polygon is one flat ring of {latitude, longitude} points. Multi-part parcels and
// interior rings have no home there; the complete GeoJSON geometry is preserved in the mirror.
function firstRing(geom) {
  if (!geom) return null;
  if (geom.type === "Polygon") return geom.coordinates?.[0] ?? null;
  if (geom.type === "MultiPolygon") {
    let best = null;
    for (const poly of geom.coordinates ?? []) {
      const ring = poly?.[0];
      if (ring && (!best || ring.length > best.length)) best = ring;
    }
    return best;
  }
  return null;
}
const ring = firstRing(g);
const geometry = {
  ...stamp,
  latitude: num(a.Y_latitude),
  longitude: num(a.X_longitude),
};
if (ring && ring.length >= 3) {
  geometry.polygon = ring
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => ({ longitude: p[0], latitude: p[1] }));
  if (geometry.polygon.length < 3) delete geometry.polygon;
}
await write("geometry.json", geometry);
// parcel_has_geometry — the edge that carries "location and coordinate data".
await write("relationship_parcel_geometry.json", {
  from: { "/": "./parcel.json" },
  to: { "/": "./geometry.json" },
});

// --- tax --------------------------------------------------------------------------------------
const farmLand = num(a.farm_land) ?? 0;
const farmBuilding = num(a.farm_building) ?? 0;
const nonFarmLand = num(a.non_farm_land) ?? 0;
const nonFarmBuilding = num(a.non_farm_building) ?? 0;
const tax = {
  ...stamp,
  tax_year: /^[0-9]{4}$/.test(txt(a.taxbill_year)) ? Number(txt(a.taxbill_year)) : null,
  property_building_amount: farmBuilding + nonFarmBuilding,
  property_land_amount: farmLand + nonFarmLand,
  monthly_tax_amount: null, // the layer publishes no billed amount
  period_start_date: null, // and no tax period
  period_end_date: null,
};
if (num(a.EAV) !== null) tax.property_assessed_value_amount = num(a.EAV);
if (num(a.EMV) !== null) tax.property_market_value_amount = num(a.EMV);
if (farmLand + farmBuilding > 0) tax.agricultural_valuation_amount = farmLand + farmBuilding;
await write("tax.json", tax);

// --- lot --------------------------------------------------------------------------------------
// T4: GIS_acres_num, never gross_acres (which is 0 on 72.5% of parcels).
await write("lot.json", {
  ...stamp,
  lot_type: null,
  lot_length_feet: null,
  lot_width_feet: null,
  lot_area_sqft: null,
  lot_size_acre: num(a.GIS_acres_num),
  landscaping_features: null,
  view: null,
  fencing_type: null,
  fence_height: null,
  fence_length: null,
  driveway_material: null,
  driveway_condition: null,
  lot_condition_issues: null,
});

// --- sales history ----------------------------------------------------------------------------
// T5: omitted entirely when date_last_sale is null (30% of parcels) — unknown tenure, never
// "long-held", and never a placeholder date.
if (a.date_last_sale != null) {
  const sales = { ...stamp, ownership_transfer_date: epochDay(a.date_last_sale) };
  const price = num(a.gross_sale_price);
  if (price !== null) sales.purchase_price_amount = price;
  await write("sales_history.json", sales);
}

// --- taxing districts -------------------------------------------------------------------------
// The layer names ~24 taxing bodies per parcel. `tax_jurisdiction` is their lexicon home, reached
// by tax_has_tax_jurisdiction. `jurisdiction_type` is set ONLY where the source field name maps
// exactly onto a member of the schema's enum; everything else is left null rather than guessed.
const DISTRICT_FIELDS = [
  ["county", "County"],
  ["Jurisdiction", "County"],
  ["municipality", "Municipal"],
  ["fire_district", "Fire District"],
  ["library_district", "Library District"],
  ["library", "Library District"],
  ["community_college", "Community College District"],
  ["grade_school", "School District"],
  ["high_school", "School District"],
  ["non_high_school", "School District"],
  ["unit_school", "School District"],
  ["hospital_district", "Hospital District"],
  ["mass_transit", "Transit Authority"],
  ["airport", null],
  ["cemetery", null],
  ["conservation", null],
  ["drainage", null],
  ["forest_preserve", null],
  ["road_district", null],
  ["multi_township_district", null],
  ["park_district", null],
  ["sanitary_district", null],
  ["special_district", null],
  ["street_light_district", null],
  ["misc_district", null],
  ["tif_district", null],
];
for (const [field, type] of DISTRICT_FIELDS) {
  if (!present(a[field])) continue;
  const base = `tax_jurisdiction_${field.toLowerCase()}`;
  await write(`${base}.json`, {
    ...stamp,
    jurisdiction_name: txt(a[field]),
    jurisdiction_type: type,
  });
  await write(`relationship_tax_${base}.json`, {
    from: { "/": "./tax.json" },
    to: { "/": `./${base}.json` },
  });
}

// --- owner ------------------------------------------------------------------------------------
// T7: owner1_name is the owner of record and is canonical; taxbill_name is who the bill is
// addressed to and differs on ~2/3 of records. 192 parcels carry no owner name and get no owner
// entity rather than a placeholder.
const ownerClass = classifyOwner(a.owner1_name);

/** ZIP+4 arrives concatenated and unhyphenated ("612420006"). Splitting it is lossless. */
function zipParts(v) {
  const z = txt(v);
  if (/^\d{5}$/.test(z)) return { postal_code: z, plus_four_postal_code: null };
  if (/^\d{9}$/.test(z)) return { postal_code: z.slice(0, 5), plus_four_postal_code: z.slice(5) };
  return { postal_code: null, plus_four_postal_code: null };
}

/** A mailing address in the lexicon is an `address` entity in its unnormalized form. */
function mailingAddress(lines, city, state, zip) {
  const unnormalized = lines.map(txt).filter((s) => s !== "").join(", ");
  if (unnormalized === "") return null;
  const { postal_code, plus_four_postal_code } = zipParts(zip);
  return {
    ...stamp,
    unnormalized_address: unnormalized,
    city_name: /^[A-Z\s\-']+$/.test(txt(city)) ? txt(city) : null,
    state_code: /^[A-Z]{2}$/.test(txt(state)) ? txt(state) : null,
    postal_code,
    plus_four_postal_code,
  };
}

async function emitCompany(stemSuffix, name, mail) {
  const companyFile = `company${stemSuffix}.json`;
  await write(companyFile, { ...stamp, name: txt(name) });
  if (!mail) return;
  const mailFile = `mailing_address${stemSuffix}.json`;
  await write(mailFile, mail);
  await write(`relationship_company${stemSuffix}_mailing_address.json`, {
    from: { "/": `./${companyFile}` },
    to: { "/": `./${mailFile}` },
  });
}

const ownerMail = mailingAddress(
  [a.owner1_address1, a.owner1_address2, a.owner1_csz],
  a.Owner_City,
  a.Owner_State,
  a.Owner_zip,
);
const taxbillMail = mailingAddress(
  // Taxbill_CS is "CITY ST" in one string, not a city name, so it is not mapped to city_name;
  // it survives verbatim inside taxbill_csz, which is one of the lines above.
  [a.taxbill_addr, a.taxbill_addr1, a.taxbill_addr2, a.taxbill_csz],
  null,
  null,
  a.Taxbill_Zip,
);
if (ownerClass === "company") {
  // Stated fallback: when the owner of record carries no address of its own, the address the
  // county mails this parcel's tax bill to is used, verbatim. It is never invented, and the
  // fallback is recorded in ../README.md rather than applied silently.
  await emitCompany("", a.owner1_name, ownerMail ?? taxbillMail);
}
// taxbill_name is never dropped (T7). It is the party the bill is addressed to, which diverges
// from the owner of record on 23.7% of records (measured over all 65,955). When it is a company it gets its own entity with
// its own mailing address — the relationship asserts only "this company has this mailing
// address", never that it owns the parcel.
if (
  classifyOwner(a.taxbill_name) === "company" &&
  (txt(a.taxbill_name) !== txt(a.owner1_name) || ownerClass !== "company")
) {
  await emitCompany("_taxbill", a.taxbill_name, taxbillMail);
} else if (ownerClass === "company" && txt(a.taxbill_name) === txt(a.owner1_name) && ownerMail && taxbillMail) {
  // Same party, two addresses on file: keep both, linked to the one company entity.
  await write("mailing_address_taxbill.json", taxbillMail);
  await write("relationship_company_taxbill_mailing_address.json", {
    from: { "/": "./company.json" },
    to: { "/": "./mailing_address_taxbill.json" },
  });
}

// Skip-and-warn diagnostics on stdout — never an exception, which would abort all 65,955 parcels.
const countyText = `${txt(a.Jurisdiction)} ${txt(a.county)}`.toUpperCase();
if (!countyText.includes("ROCK ISLAND")) console.warn(`warn: county mismatch for ${requestIdentifier}: "${countyText.trim()}"`);
console.log(
  JSON.stringify({
    request_identifier: requestIdentifier,
    parcel_identifier: pin,
    usage_type_unmapped: true,
    class_code: txt(a.class),
    zoning_is_municipality_code: zoningIsMunicipalityCode,
    owner_entity_class: ownerClass,
    owner_name_differs_from_taxbill_name: txt(a.owner1_name) !== txt(a.taxbill_name),
    sales_history: a.date_last_sale != null,
  }),
);
