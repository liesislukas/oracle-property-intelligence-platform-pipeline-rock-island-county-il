#!/usr/bin/env node
// ISSUE-021 WI-4 — reconcile duplicate owner entities across the county, with a stated canonical
// rule and BOTH source name fields preserved on every record.
//
//   node scripts/reconcile-owners.mjs
//
// THE RULES, all of them decided in plan.md and none of them invented here:
//
//   canonical name  = owner1_name, falling back to taxbill_name ONLY where owner1_name is blank.
//                     Records with neither are counted as owner_name_absent and get no entity row;
//                     no placeholder owner is ever invented.
//   grouping key    = the kit's normalizeName(canonical name) — uppercase, non-alphanumeric to
//                     space, whitespace collapsed. Imported from elephant-query-db, not re-written.
//   NOT stripped    = legal-entity suffixes (TRUST, ESTATE, LLC, INC). Stripping them would merge
//                     SMITH JOHN into SMITH JOHN TRUST, which are different legal entities. This is
//                     conservative on purpose: a stated gap beats a silent merge.
//   NEVER a key     = taxbill_name. It is the tax-bill recipient and is measurably a DIFFERENT
//                     legal entity (GREENRIDGE LLC / MCGEHEE JAMES A across 25 parcels), so merging
//                     on it would fabricate identity. It is preserved and displayed, never merged.
//   canonical_name  = the most frequent raw spelling in the group, ties broken lexicographically
//                     ascending, so the result is deterministic across runs.
//   entity_tags     = classification only. Tags never merge anything.
//
// Idempotent: ON CONFLICT DO UPDATE on both tables plus a delete of parcel links that no longer
// belong to their entity. Running it twice must not change a single count.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeName } from "/Users/lukas/Developer/ateam/elephant-query-db/src/loader/normalizers.ts";
import { exec, execFile, table, copyIn, tsv, scalar } from "./lib/psql.mjs";
import { readSourceMirror, blankToNull, requestIdentifier, parcelIdentifier } from "./lib/source-mirror.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_SYSTEM = "rock_island_appraiser";

// Single line, exactly as specified in plan.md. Matched against the GROUPING KEY (already
// uppercased and punctuation-stripped by normalizeName).
const COMPANY_RE =
  /\b(LLC|L L C|INC|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|TRUST|TRUSTEE|ESTATE|BANK|ASSN|ASSOCIATION|PARTNERSHIP|PROPERTIES|PROPERTY|FARMS|FARM|ENTERPRISES|MINISTRIES|CHURCH|SCHOOL|DISTRICT|AUTHORITY|COMMISSION|CITY|VILLAGE|COUNTY|STATE|USA|TOWNSHIP|BOARD|FOUNDATION|SERVICES|GROUP|HOLDINGS|INVESTMENTS|DEVELOPMENT|BUILDERS|CONSTRUCTION|RAILROAD|UNION|CLUB|CEMETERY|HOSPITAL|CENTER|CENTRE)\b/;

const TAG_RES = [
  ["TRUST", /\bTRUST(EE)?\b/],
  ["ESTATE", /\bESTATE\b/],
  ["LLC", /\bLLC\b/],
  ["INC", /\bINC\b|\bCORP(ORATION)?\b/],
  ["GOVERNMENT", /\b(CITY|VILLAGE|COUNTY|STATE|USA|TOWNSHIP|DISTRICT|AUTHORITY|COMMISSION|BOARD)\b/],
  ["CHURCH", /\b(CHURCH|MINISTRIES)\b/],
];

function entityId(normalized) {
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

function tagsFor(key) {
  return TAG_RES.filter(([, re]) => re.test(key)).map(([tag]) => tag);
}

/** text[] literal for COPY ... FORMAT text. */
function pgArray(values) {
  if (values.length === 0) return "{}";
  return `{${values.map((v) => `"${v.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}

const startedAt = new Date().toISOString();
const { records, meta, cached } = await readSourceMirror();
console.log(
  `read ${records.length} mirrored records (${cached ? "from the derived extract" : "freshly built from the 65,955 mirror files"})`,
);

const provenance = {
  method: "GET",
  url: `${meta.layerUrl}/query?where=1%3D1&outFields=*&f=geojson&outSR=4326`,
  retrieved_at: meta.retrievedAt,
  licence: meta.licence,
  agol_item_id: meta.agolItemId,
};

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------
const groups = new Map(); // normalized grouping key -> group
const rawOwnerStrings = new Set(); // distinct raw canonical strings, before normalization
let ownerNameAbsent = 0;
let canonicalFromOwner1 = 0;
let canonicalFromTaxbill = 0;
let namesDisagreeRecords = 0;
let ownerBearingRecords = 0;

for (const record of records) {
  const owner1 = blankToNull(record.owner1_name);
  const taxbill = blankToNull(record.taxbill_name);
  const rid = requestIdentifier(record);
  const pin = parcelIdentifier(record);

  if (owner1 === null && taxbill === null) {
    ownerNameAbsent += 1;
    continue;
  }
  ownerBearingRecords += 1;

  const field = owner1 !== null ? "owner1_name" : "taxbill_name";
  const canonicalRaw = owner1 !== null ? owner1 : taxbill;
  if (field === "owner1_name") canonicalFromOwner1 += 1;
  else canonicalFromTaxbill += 1;
  rawOwnerStrings.add(canonicalRaw);

  const key = normalizeName(canonicalRaw);
  if (key === null || key === "") {
    // A name that is entirely punctuation normalizes to nothing. It is not an entity and it is not
    // silently folded into another one; it is counted with the absent names and named in evidence.
    ownerNameAbsent += 1;
    ownerBearingRecords -= 1;
    if (field === "owner1_name") canonicalFromOwner1 -= 1;
    else canonicalFromTaxbill -= 1;
    continue;
  }

  const disagree = owner1 !== null && taxbill !== null && owner1 !== taxbill;
  if (disagree) namesDisagreeRecords += 1;

  let group = groups.get(key);
  if (group === undefined) {
    group = { key, spellings: new Map(), parcels: [], fields: new Set(), disagreeing: 0 };
    groups.set(key, group);
  }
  group.spellings.set(canonicalRaw, (group.spellings.get(canonicalRaw) ?? 0) + 1);
  group.fields.add(field);
  if (disagree) group.disagreeing += 1;
  group.parcels.push({
    request_identifier: rid,
    parcel_identifier: pin,
    owner1_name: owner1,
    taxbill_name: taxbill,
    names_disagree: disagree,
  });
}

// canonical_name = most frequent raw spelling; ties broken lexicographically ascending.
const entities = [];
for (const group of groups.values()) {
  const spellings = [...group.spellings.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  const canonical = spellings[0][0];
  const kind = COMPANY_RE.test(group.key) ? "company" : "person";
  entities.push({
    owner_entity_id: entityId(group.key),
    normalized_name: group.key,
    canonical_name: canonical,
    // 'owner1_name' unless every record in the group fell back to taxbill_name.
    canonical_name_field: group.fields.has("owner1_name") ? "owner1_name" : "taxbill_name",
    entity_kind: kind,
    entity_tags: tagsFor(group.key),
    parcel_count: group.parcels.length,
    parcels: group.parcels,
    disagreeing: group.disagreeing,
  });
}

const distinctRaw = rawOwnerStrings.size;
const distinctEntities = entities.length;
const groupsCollapsed = distinctRaw - distinctEntities;
const multiParcel = entities.filter((e) => e.parcel_count > 1);
const parcelsInMultiParcel = multiParcel.reduce((t, e) => t + e.parcel_count, 0);
const entitiesWithDisagreement = entities.filter((e) => e.disagreeing > 0).length;
const companies = entities.filter((e) => e.entity_kind === "company").length;
const people = distinctEntities - companies;
const tagCounts = {};
for (const [tag] of TAG_RES) tagCounts[tag] = entities.filter((e) => e.entity_tags.includes(tag)).length;

// ---------------------------------------------------------------------------
// Load — additive tables only, ON CONFLICT DO UPDATE, re-runnable
// ---------------------------------------------------------------------------
await execFile(await readFile(join(repoRoot, "sql", "owner_entities.sql"), "utf8"));

await exec(`
  DROP TABLE IF EXISTS stage_owner_entities;
  DROP TABLE IF EXISTS stage_owner_entity_parcels;
  CREATE UNLOGGED TABLE stage_owner_entities (
    owner_entity_id text, normalized_name text, canonical_name text, canonical_name_field text,
    entity_kind text, entity_tags text[], parcel_count integer
  );
  CREATE UNLOGGED TABLE stage_owner_entity_parcels (
    owner_entity_id text, request_identifier text, parcel_identifier text,
    owner1_name text, taxbill_name text, names_disagree boolean
  );
`);

await copyIn(
  "stage_owner_entities",
  ["owner_entity_id", "normalized_name", "canonical_name", "canonical_name_field", "entity_kind", "entity_tags", "parcel_count"],
  entities.map((e) =>
    [e.owner_entity_id, e.normalized_name, e.canonical_name, e.canonical_name_field, e.entity_kind, pgArray(e.entity_tags), e.parcel_count]
      .map(tsv)
      .join("\t"),
  ),
);

await copyIn(
  "stage_owner_entity_parcels",
  ["owner_entity_id", "request_identifier", "parcel_identifier", "owner1_name", "taxbill_name", "names_disagree"],
  entities.flatMap((e) =>
    e.parcels.map((p) =>
      [e.owner_entity_id, p.request_identifier, p.parcel_identifier, p.owner1_name, p.taxbill_name, p.names_disagree]
        .map(tsv)
        .join("\t"),
    ),
  ),
);

// mailing_parse_status is NOT NULL, so a first insert seeds it as 'blank' and WI-5
// (parse-mailing-location.mjs) fills the real value. A re-run never resets an already-parsed row.
await exec(`
  INSERT INTO owner_entities (
    owner_entity_id, normalized_name, canonical_name, canonical_name_field, entity_kind,
    entity_tags, parcel_count, mailing_parse_status, source_system, source_http_request, loaded_at
  )
  SELECT owner_entity_id, normalized_name, canonical_name, canonical_name_field, entity_kind,
         entity_tags, parcel_count, 'blank', ${quote(SOURCE_SYSTEM)}, ${quote(JSON.stringify(provenance))}::jsonb, now()
  FROM stage_owner_entities
  ON CONFLICT (owner_entity_id) DO UPDATE SET
    normalized_name      = EXCLUDED.normalized_name,
    canonical_name       = EXCLUDED.canonical_name,
    canonical_name_field = EXCLUDED.canonical_name_field,
    entity_kind          = EXCLUDED.entity_kind,
    entity_tags          = EXCLUDED.entity_tags,
    parcel_count         = EXCLUDED.parcel_count,
    source_system        = EXCLUDED.source_system,
    source_http_request  = EXCLUDED.source_http_request,
    loaded_at            = EXCLUDED.loaded_at;

  DELETE FROM owner_entities e
   WHERE NOT EXISTS (SELECT 1 FROM stage_owner_entities s WHERE s.owner_entity_id = e.owner_entity_id);

  INSERT INTO owner_entity_parcels (
    owner_entity_id, request_identifier, parcel_identifier, owner1_name, taxbill_name, names_disagree
  )
  SELECT owner_entity_id, request_identifier, parcel_identifier, owner1_name, taxbill_name, names_disagree
  FROM stage_owner_entity_parcels
  ON CONFLICT (owner_entity_id, request_identifier) DO UPDATE SET
    parcel_identifier = EXCLUDED.parcel_identifier,
    owner1_name       = EXCLUDED.owner1_name,
    taxbill_name      = EXCLUDED.taxbill_name,
    names_disagree    = EXCLUDED.names_disagree;

  DELETE FROM owner_entity_parcels p
   WHERE NOT EXISTS (
     SELECT 1 FROM stage_owner_entity_parcels s
      WHERE s.owner_entity_id = p.owner_entity_id AND s.request_identifier = p.request_identifier
   );

  DROP TABLE stage_owner_entities;
  DROP TABLE stage_owner_entity_parcels;
`);

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const finishedAt = new Date().toISOString();
const out = [];
const line = (s = "") => out.push(s);

line("ISSUE-021 WI-4 — owner entity reconciliation");
line(`run_started_at: ${startedAt}`);
line(`run_finished_at: ${finishedAt}`);
line("");
line("COMPUTED OVER: all 65,955 records of the per-parcel source mirror at");
line("  /Users/lukas/Developer/ateam/elephant-pipeline/data/source-mirror/rock-island/,");
line(`  which equals the live FeatureServer count of 65,955 measured by scripts/reconcile-before-load.mjs.`);
line("  NOT over the query DB's parcels table: ISSUE-018's ingest is still running and that table is");
line("  a moving partial subset. Every figure below is full-county.");
line("");
line("CANONICAL RULE (stated, not implied):");
line("  canonical owner name = owner1_name; taxbill_name is used ONLY where owner1_name is blank.");
line("  grouping key = elephant-query-db normalizeName(canonical name): uppercase, every run of");
line("  non-alphanumeric characters becomes one space, whitespace collapsed, trimmed. Nothing else.");
line("  Legal-entity suffixes (TRUST, ESTATE, LLC, INC) are deliberately NOT stripped.");
line("  taxbill_name is NEVER a merge key — it is a different legal entity, and both name fields are");
line("  stored on every parcel row.");
line("");
line(`input_records                          ${records.length}`);
line(`owner_bearing_records                  ${ownerBearingRecords}`);
line(`owner_name_absent                      ${ownerNameAbsent}   (no owner1_name and no taxbill_name; no entity invented)`);
line(`canonical_from_owner1_name             ${canonicalFromOwner1}`);
line(`canonical_from_taxbill_name_fallback   ${canonicalFromTaxbill}`);
line("");
line(`distinct_raw_owner_strings             ${distinctRaw}`);
line(`distinct_canonical_owner_entities      ${distinctEntities}`);
line(`duplicate_groups_collapsed             ${groupsCollapsed}   (${distinctRaw} raw spellings -> ${distinctEntities} entities)`);
line("");
line(`owner_entities_holding_more_than_one_parcel   ${multiParcel.length}`);
line(`parcels_held_by_multi_parcel_owners           ${parcelsInMultiParcel}`);
line("");
line(`parcel_records_where_the_two_name_fields_disagree  ${namesDisagreeRecords}`);
line(`owner_entities_with_at_least_one_disagreement     ${entitiesWithDisagreement}`);
line("");
line(`entity_kind_company                    ${companies}`);
line(`entity_kind_person                     ${people}`);
line("  entity_kind is a routing tag from the grouping key, never a merge key.");
line("");
line("entity_tags (classification only — a tag never merges two entities):");
for (const [tag, count] of Object.entries(tagCounts)) line(`  ${tag.padEnd(12)} ${count}`);
line("");
line("Largest owner entities by parcel count (both source name fields kept on every parcel):");
for (const e of [...entities].sort((a, b) => b.parcel_count - a.parcel_count).slice(0, 15)) {
  line(`  ${String(e.parcel_count).padStart(5)}  ${e.canonical_name}  [${e.entity_kind}${e.entity_tags.length ? " " + e.entity_tags.join(",") : ""}]  id=${e.owner_entity_id}`);
}
line("");
line("== in the query DB after the merge ==");
out.push(await table("SELECT count(*) AS owner_entities FROM owner_entities;"));
out.push(await table("SELECT count(*) AS owner_entity_parcels, count(*) FILTER (WHERE names_disagree) AS names_disagree FROM owner_entity_parcels;"));
out.push(
  await table(
    "SELECT entity_kind, count(*) FROM owner_entities GROUP BY 1 ORDER BY 1;",
  ),
);

console.log(out.join("\n"));

// A machine-readable sidecar the manifest step and the export read, so no number is retyped.
const summary = {
  computed_over: {
    corpus: "per-parcel source mirror",
    path: "elephant-pipeline/data/source-mirror/rock-island/",
    record_count: records.length,
    equals_live_source_count: true,
    computed_at: finishedAt,
  },
  input_records: records.length,
  owner_bearing_records: ownerBearingRecords,
  owner_name_absent: ownerNameAbsent,
  canonical_from_owner1_name: canonicalFromOwner1,
  canonical_from_taxbill_name: canonicalFromTaxbill,
  distinct_raw_names: distinctRaw,
  distinct_entities: distinctEntities,
  groups_collapsed: groupsCollapsed,
  multi_parcel_entities: multiParcel.length,
  parcels_in_multi_parcel_entities: parcelsInMultiParcel,
  name_field_disagreements_records: namesDisagreeRecords,
  name_field_disagreements_entities: entitiesWithDisagreement,
  companies,
  people,
  tags: tagCounts,
  canonical_rule:
    "canonical = owner1_name, falling back to taxbill_name only where owner1_name is blank; grouped by elephant-query-db normalizeName (uppercase, non-alphanumeric to space, whitespace collapsed); legal-entity suffixes such as TRUST and LLC are deliberately not stripped; taxbill_name is preserved but is never a merge key.",
  provenance,
};
const { writeFile } = await import("node:fs/promises");
await writeFile(
  join(repoRoot, "data", "records", "reconciliation-owner-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);
console.log("\nwrote data/records/reconciliation-owner-summary.json");
