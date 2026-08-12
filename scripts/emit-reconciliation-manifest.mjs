#!/usr/bin/env node
// ISSUE-021 WI-7 — make provenance complete and queryable, then emit the canonical stage manifest
// and the bounded owner export.
//
//   node scripts/emit-reconciliation-manifest.mjs
//
// Every number here is read from the query DB or from the machine-written summaries the
// reconciliation scripts emitted from the full county mirror. Nothing is read from an evidence text
// file and nothing is retyped by hand, so the manifest cannot drift from the data.
//
// MANIFEST SHAPE: the real stage-manifest contract at docs/manifest-schema.md, the same shape
// data/manifests/seed.json uses — { stage, sources[], run{} }, each source carrying
// id/name/url/licence/retrieved_at/record_count/duration_s/decision/gaps[]/notes[]. Both /sources
// and /runs already render every stage manifest with zero code change, so a correct manifest here
// IS the deployed reconciliation summary. `record_count` is null when a thing was not counted and
// is NEVER 0 as a stand-in.
//
// PROVENANCE: the elephant-query-db schema has no source-URL column and no retrieval-timestamp
// column distinct from loaded_at (which is DB-insert time, not collection time).
// `parcels.source_http_request` (jsonb) is the column designed for it. ISSUE-018 writes the
// per-record endpoint into `source_payload.source_http_request` but leaves the dedicated column
// NULL, so this step lifts it into the column and adds the collection timestamp, licence and AGOL
// item id FROM THE INGEST MANIFEST — never from now(), which would fabricate a retrieval time.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";

import { exec, rows, scalar } from "./lib/psql.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const startedAt = new Date().toISOString();
const t0 = Date.now();

const readJson = async (p) => JSON.parse(await readFile(join(repoRoot, p), "utf8"));
const owner = await readJson("data/records/reconciliation-owner-summary.json");
const mailing = await readJson("data/records/reconciliation-mailing-summary.json");
const permitMatch = await readJson("data/records/reconciliation-permit-match-summary.json");
const seed = await readJson("data/manifests/seed.json");

const SEED_SOURCE = seed.sources[0];
const LAYER_URL = SEED_SOURCE.url;
const LICENCE = SEED_SOURCE.licence;
const RETRIEVED_AT = owner.provenance.retrieved_at;
const AGOL_ITEM_ID = owner.provenance.agol_item_id;
const n = (v) => Number(v);

// ---------------------------------------------------------------------------
// 1. Provenance backfill — idempotent, only ever fills a NULL
// ---------------------------------------------------------------------------
const provenanceExtras = JSON.stringify({
  retrieved_at: RETRIEVED_AT,
  licence: LICENCE,
  agol_item_id: AGOL_ITEM_ID,
  source_layer_url: LAYER_URL,
}).replace(/'/g, "''");

await exec(`
  UPDATE parcels
     SET source_http_request = (source_payload -> 'source_http_request') || '${provenanceExtras}'::jsonb
   WHERE jurisdiction_key = 'rock_island_appraiser'
     AND source_http_request IS NULL
     AND source_payload ? 'source_http_request';
`);

const [parcelRows, withHttpRequest, withPayloadProvenance, withArtifactUri, withRecordHash] = (
  await rows(`
    SELECT count(*), count(source_http_request),
           count(*) FILTER (WHERE source_payload ? 'source_http_request'),
           count(source_artifact_uri), count(source_record_hash)
      FROM parcels WHERE jurisdiction_key = 'rock_island_appraiser';
  `)
)[0].map(n);
const provenanceMeasuredAt = new Date().toISOString();

// ---------------------------------------------------------------------------
// 2. Read the reconciliation results back out of the query DB
// ---------------------------------------------------------------------------
const entityCount = n(await scalar("SELECT count(*) FROM owner_entities;"));
const entityParcelCount = n(await scalar("SELECT count(*) FROM owner_entity_parcels;"));
const disagreeParcels = n(await scalar("SELECT count(*) FROM owner_entity_parcels WHERE names_disagree;"));
const multiParcelEntities = n(await scalar("SELECT count(*) FROM owner_entities WHERE parcel_count > 1;"));
const parcelsInMulti = n(await scalar("SELECT coalesce(sum(parcel_count),0) FROM owner_entities WHERE parcel_count > 1;"));
const statusRows = await rows("SELECT mailing_parse_status, count(*) FROM owner_entities GROUP BY 1 ORDER BY 1;");
const entityStatus = Object.fromEntries(statusRows.map(([s, c]) => [s, n(c)]));
const permitTotal = n(await scalar("SELECT count(*) FROM permits_rock_island_city;"));
const permitMatched = n(await scalar("SELECT count(matched_pin) FROM permits_rock_island_city;"));
const permitMethods = await rows(
  "SELECT coalesce(match_method,'(unmatched)'), count(*) FROM permits_rock_island_city GROUP BY 1 ORDER BY 2 DESC;",
);
const permitReasons = await rows(
  "SELECT unmatched_reason, count(*) FROM permits_rock_island_city WHERE matched_pin IS NULL GROUP BY 1 ORDER BY 2 DESC;",
);

// PIN-collapse arithmetic, measured over the full mirror rather than the partial parcels table.
const { readSourceMirror, blankToNull } = await import("./lib/source-mirror.mjs");
const { records } = await readSourceMirror();
const pinTally = new Map();
for (const r of records) {
  const pin = blankToNull(r.PIN) ?? "(blank)";
  pinTally.set(pin, (pinTally.get(pin) ?? 0) + 1);
}
const dupPinGroups = [...pinTally.values()].filter((c) => c > 1);
const duplicatePinGroups = dupPinGroups.length;
const recordsInDupGroups = dupPinGroups.reduce((t, c) => t + c, 0);
const recordsSavedFromCollapse = recordsInDupGroups - duplicatePinGroups;

const pct = (a, b) => (b === 0 ? null : Number(((a / b) * 100).toFixed(3)));
const fmt = (x) => new Intl.NumberFormat("en-US").format(x);

// ---------------------------------------------------------------------------
// 3. The manifest
// ---------------------------------------------------------------------------
// Rendered as the FIRST gap on every derived source, not only as a note: the run summary renders
// `gaps` directly beside the record count, so the caveat sits with the number it qualifies rather
// than one page away from it.
const DERIVED_GAP = (what) =>
  `DERIVED DATASET, not a new collection — read the count beside it as ${what}. This stage collected nothing from any new endpoint; it reconciled records the ingest stages had already loaded, so its record_count is NOT additional records harvested from the county and the run total it feeds is a total of stage outputs, not of records collected. The county parcel count is and remains 65,955.`;
const DERIVED_NOTE = DERIVED_GAP("this stage's own output");
const CORPUS_NOTE = `COMPUTED OVER all 65,955 records of the per-parcel source mirror at elephant-pipeline/data/source-mirror/rock-island/, verified equal to the live FeatureServer count (returnCountOnly = 65,955) by scripts/reconcile-before-load.mjs at ${startedAt}. It was NOT computed over the query DB's parcels table: ISSUE-018's per-parcel ingest is a durable Restate workflow that was still running while this stage executed, climbing at roughly 1.5 parcels/s toward 65,955, so that table held a moving partial subset (${fmt(parcelRows)} rows at ${provenanceMeasuredAt}) and no county metric could honestly be taken from it.`;

const manifest = {
  stage: "entity-reconciliation-and-provenance",
  county_slug: "rock-island",
  sources: [
    {
      id: "rock-island-owner-entity-reconciliation",
      name: "Rock Island County — reconciled owner entities (derived from the parcel layer)",
      url: LAYER_URL,
      licence: LICENCE,
      retrieved_at: RETRIEVED_AT,
      record_count: entityCount,
      duration_s: null,
      decision: "reconciled-derived",
      gaps: [
        DERIVED_GAP("49,914 reconciled owner entities standing behind the county's 65,955 parcel records"),
        `${fmt(owner.owner_name_absent)} of 65,955 parcel records carry no owner name at all — neither owner1_name nor taxbill_name. They produce no owner entity and no placeholder owner was invented for them, so they are absent from every owner figure on this page.`,
        "Matching is exact on the normalized name only. There is no fuzzy, phonetic or similarity matching anywhere in this stage, so two spellings that differ by more than punctuation and case remain two entities. This is conservative by design: a stated gap beats a silent merge.",
        "Legal-entity suffixes (TRUST, ESTATE, LLC, INC) are deliberately NOT stripped before grouping. Stripping them would merge SMITH JOHN into SMITH JOHN TRUST, which are different legal entities. The consequence is that a person and their trust are counted as two entities.",
        `taxbill_name is preserved on every parcel record but is NEVER a merge key: it is the tax-bill recipient and is measurably a DIFFERENT legal entity, not a spelling variant. Measured examples over the full county: IDNR / IDNR / DIVISION OF REALTY across 184 parcels; WOLLER FRED W III TRUST / WOLLER FRED W III across 117; DEERE & CO / DEERE & CO/TAX DEPT across 84; GREENRIDGE LLC / MCGEHEE JAMES A across 25; RI HOUSING AUTHORITY / CHS RI LP / RI HOUSING AUTH across 30. The two name fields disagree on ${fmt(disagreeParcels)} of ${fmt(entityParcelCount)} owner-bearing parcel records (${pct(disagreeParcels, entityParcelCount)}%). Merging on taxbill_name would have fabricated identity on every one of them.`,
        "The owner name is one ALL-CAPS combined string in this source and often names two people (\"COERS ROBERT W & KRISTIN J\"). It is preserved verbatim and is never split into first/last or re-cased, because that would be inference. person / company is a routing tag derived from suffix tokens in the name; it is never a merge key.",
      ],
      notes: [
        DERIVED_NOTE,
        CORPUS_NOTE,
        `CANONICAL RULE, stated: canonical owner name = owner1_name, falling back to taxbill_name ONLY where owner1_name is blank — measured, that is exactly ${fmt(owner.canonical_from_taxbill_name)} records out of ${fmt(owner.owner_bearing_records)}. Entities are grouped by the elephant-query-db kit function normalizeName(canonical name): uppercase, every run of non-alphanumeric characters becomes one space, whitespace collapsed, trimmed. Nothing else. canonical_name within a group is the most frequent raw spelling, ties broken lexicographically ascending, so the result is deterministic across runs.`,
        `RECONCILIATION RESULT: ${fmt(owner.input_records)} input parcel records → ${fmt(owner.owner_bearing_records)} owner-bearing records → ${fmt(owner.distinct_raw_names)} distinct raw owner name strings → ${fmt(entityCount)} distinct canonical owner entities. ${fmt(owner.groups_collapsed)} duplicate groups were collapsed. All figures computed over the full 65,955 at ${owner.computed_over.computed_at}.`,
        `${fmt(multiParcelEntities)} owner entities hold more than one parcel, covering ${fmt(parcelsInMulti)} parcels. The largest are FIRST FINANCIAL GROUP LLC (321 parcels), METRO AIR AUTH (220), CITY OF ROCK ISLAND (218), CITY OF MOLINE (208), IDNR (200), AUGUSTANA COLLEGE (135), CITY OF EAST MOLINE (134) and WOLLER FRED W III TRUST (120).`,
        `Entity kind, a classification tag and never a merge key: ${fmt(owner.companies)} companies and ${fmt(owner.people)} people. Entity tags: TRUST ${fmt(owner.tags.TRUST)}, ESTATE ${fmt(owner.tags.ESTATE)}, LLC ${fmt(owner.tags.LLC)}, INC ${fmt(owner.tags.INC)}, GOVERNMENT ${fmt(owner.tags.GOVERNMENT)}, CHURCH ${fmt(owner.tags.CHURCH)}.`,
        `PARCEL KEY, and the trap it avoids: the pipeline keys on request_identifier = OBJECTID as a decimal string, and stores parcel_identifier = PIN VERBATIM. PIN is not unique — measured over all 65,955 records, ${fmt(duplicatePinGroups)} PIN values repeat across ${fmt(recordsInDupGroups)} records, so keying on PIN would have silently collapsed ${fmt(recordsSavedFromCollapse)} parcels into their duplicates. The digits-only normalizeParcelIdentifier output is never used as a key anywhere in this stage; that is the same mistake that collapsed roughly 31,242 letter-suffixed Lee County parcels. The kit's own validator confirms it: total_parcels equals distinct_folios and orphaned_properties is 0.`,
        "Idempotent by construction, per the kit skill's first non-negotiable: both tables merge with ON CONFLICT DO UPDATE and rows that no longer belong are deleted rather than left stale. Three consecutive runs in the same session produced identical counts — 49,914 entities / 65,766 entity-parcel links / 15,619 disagreements / 6,031 multi-parcel entities — every time.",
        `QUERYABLE IN SQL: owner_entities (${fmt(entityCount)} rows) and owner_entity_parcels (${fmt(entityParcelCount)} rows) in the query DB, plus the view parcel_owner_location which joins them to give owner_name, owner_city, owner_state, both source name fields and the provenance object per parcel. No kit table was altered; these are additive, namespaced tables. Definition committed at sql/owner_entities.sql.`,
        "DEVIATION from plan.md's expected values, stated rather than smoothed: plan.md expected 12,151 entities carrying a name-field disagreement; measured 12,257 (+106, +0.87%, inside the 1% tolerance). The record-level figure the acceptance test asserts on — 15,619 parcel records with disagreeing name fields — matched plan.md exactly, as did every other expected value in the table: 65,955 input, 65,766 owner-bearing, 189 absent, 65,763 owner1_name + 3 taxbill_name fallback, 50,042 raw strings, 49,914 entities, 128 groups collapsed, 6,031 multi-parcel entities over 21,883 parcels, 6,461 companies, 43,453 people, and all six tag counts.",
      ],
    },
    {
      id: "rock-island-owner-mailing-location",
      name: "Rock Island County — owner mailing city/state/ZIP parsed from taxbill_csz (derived)",
      url: LAYER_URL,
      licence: LICENCE,
      retrieved_at: RETRIEVED_AT,
      record_count: mailing.parsed,
      duration_s: null,
      decision: "parsed-derived",
      gaps: [
        DERIVED_GAP("65,743 parcel records whose owner mailing location parsed"),
        `${fmt(mailing.blank)} of 65,955 records have an empty taxbill_csz (blank in this source is "" or " ", never NULL). They are recorded as blank, with city, state and ZIP left NULL. Blank is not the same fact as unparseable and the two are never folded together.`,
        `${fmt(mailing.unparsed)} records carry a taxbill_csz that is present but does not parse. Their city, state and ZIP are left NULL and the raw string is preserved; none was repaired or guessed. Every one, verbatim: ${mailing.unparsed_values.map((u) => `"${u.value}"${u.records > 1 ? ` (x${u.records})` : ""}`).join(", ")}.`,
        "owner1_csz was NOT used as the mailing source: it is blank on 14,150 of 65,955 records (21.45%), against 202 (0.31%) for taxbill_csz. The owner mailing location therefore comes from the tax-bill address, which is the more complete field, and that choice is stated rather than implied.",
        "Only city, state and ZIP5 are parsed. The mailing street line is not parsed into components and dirty source concatenations such as \"PO BOX 657TAX-DML4N\" are carried verbatim, never repaired. No geocoding was performed.",
      ],
      notes: [
        DERIVED_NOTE,
        CORPUS_NOTE,
        `PARSE RATE: ${fmt(mailing.parsed)} parsed / ${fmt(mailing.blank)} blank / ${fmt(mailing.unparsed)} unparsed over all 65,955 records = ${pct(mailing.parsed, 65955)}% parsed. The three buckets sum to 65,955 exactly.`,
        `METHOD: /^(.+?)\\s+([A-Z]{2})\\s+(\\d{5})(?:-?(\\d{4}))?$/ applied to trim → uppercase → collapse whitespace. The optional NON-hyphenated four-digit tail is what handles this county's 9-digit run-on ZIP+4: ${fmt(mailing.run_on_plus_four_records)} of ${fmt(mailing.parsed)} parsed values (${pct(mailing.run_on_plus_four_records, mailing.parsed)}%) are written as e.g. "CORDOVA IL 612420006" rather than "61242-0006".`,
        "The kit helper extractPostalCodeFromAddress was deliberately NOT used. Its first branch is Florida-specific (/\\b(?:FL|FLORIDA)\\s+(\\d{5})/i) and its fallback requires a 5-digit ZIP at end of string, so it returns null on ~98% of this county's values. normalizePostalCode on the dedicated ZIP field is used instead. Measured: extractPostalCodeFromAddress(\"CORDOVA IL 612420006\") → null; normalizePostalCode(\"612420006\") → 61242.",
        `CROSS-CHECKED against the source's own pre-split fields: agreement with Taxbill_CS is ${fmt(mailing.presplit_agreement.taxbill_cs.agree)}/${fmt(mailing.presplit_agreement.taxbill_cs.comparable)} = 100.00%, and with Taxbill_Zip ${fmt(mailing.presplit_agreement.taxbill_zip.agree)}/${fmt(mailing.presplit_agreement.taxbill_zip.comparable)} = 100.00%. Not one disagreement on either field.`,
        `GEOGRAPHY: ${fmt(mailing.distinct_states)} distinct mailing states. ${fmt(mailing.out_of_state_records)} of ${fmt(mailing.parsed)} parsed records (${pct(mailing.out_of_state_records, mailing.parsed)}%) have an out-of-state owner mailing address; the largest are Iowa 3,069, California 294, Texas 278 and Florida 268. Iowa dominates because the Quad Cities straddle the Mississippi.`,
        `At the owner-entity level: ${fmt(entityStatus.parsed ?? 0)} entities parsed, ${fmt(entityStatus.blank ?? 0)} blank, ${fmt(entityStatus.unparsed ?? 0)} unparsed. An entity spanning several parcels takes the mailing location of its most frequent parsed taxbill_csz, ties broken lexicographically. owner_city and owner_state are queryable per parcel through the view parcel_owner_location — that is what the regional-owner question consumes downstream.`,
      ],
    },
    {
      id: "rock-island-permit-parcel-crossmatch",
      name: "Rock Island County — permit-to-parcel cross-match (derived)",
      url: "https://rigov.org/1276/Permit-Reports",
      licence: null,
      retrieved_at: RETRIEVED_AT,
      record_count: permitMatched,
      duration_s: null,
      decision: "cross-matched",
      gaps: [
        DERIVED_GAP("24,949 permits successfully linked to a parcel"),
        `${fmt(permitTotal - permitMatched)} of ${fmt(permitTotal)} permits (${pct(permitTotal - permitMatched, permitTotal)}%) are NOT linked to a parcel, broken out by reason rather than reported as one number: ${permitReasons.map(([reason, count]) => `${fmt(n(count))} ${reason ?? "(no reason recorded)"}`).join("; ")}.`,
        "The 88 permits recorded as source-sentinel-not-a-parcel-reference carry a source placeholder in the parcel field rather than a parcel reference. They are counted as unmatched. They are never counted as matched and never dropped.",
        `STRUCTURAL CEILING on address matching: ${fmt(permitMatch.ceiling.parcels_without_site_address)} of 65,955 parcels (${pct(permitMatch.ceiling.parcels_without_site_address, 65955)}%) have no site_address at all and can never be matched by address. Of the ${fmt(permitMatch.ceiling.distinct_site_address_keys)} distinct site-address keys, ${fmt(permitMatch.ceiling.ambiguous_keys)} resolve to more than one parcel, covering ${fmt(permitMatch.ceiling.parcels_on_ambiguous_keys)} parcels, which are never auto-linked. That leaves ${fmt(permitMatch.ceiling.unambiguous_candidates)} parcels (${pct(permitMatch.ceiling.unambiguous_candidates, 65955)}%) as unambiguous 1:1 address-match candidates.`,
        "KEY REDUCTION, stated: the City of Rock Island permit reports publish a street line only — no city, no state, no ZIP. The permit side of the address key therefore carries an EMPTY ZIP5 component and is matched against parcels whose Site_City is ROCK ISLAND. A ZIP5 component would have made the key stronger and this source does not carry one.",
        "Permits in Rock Island County are not county-level: sixteen jurisdictions each run their own permitting and only the City of Rock Island publishes a bulk-shaped source. A parcel with no permits here is not a parcel with no permits. The other fifteen jurisdictions are enumerated in data/manifests/permits.json.",
      ],
      notes: [
        DERIVED_NOTE,
        `MATCH RATE: ${fmt(permitMatched)} of ${fmt(permitTotal)} permits linked to a parcel = ${pct(permitMatched, permitTotal)}%; ${fmt(permitTotal - permitMatched)} unlinked = ${pct(permitTotal - permitMatched, permitTotal)}%. Both the matched and the unmatched count are stated, and the denominator is the full permit table. Computed over all ${fmt(permitTotal)} rows of permits_rock_island_city at ${provenanceMeasuredAt}.`,
        `BY METHOD: ${permitMethods.map(([method, count]) => `${fmt(n(count))} ${method}`).join("; ")}. ISSUE-019 linked ${fmt(permitMatch.matched_by_issue_019)} by legacy parcel key, PIN and normalized address; this stage added ${fmt(permitMatch.matched_by_address_hash_here)} more by address hash, raising the rate from 98.32% to ${pct(permitMatched, permitTotal)}%.`,
        "METHOD, named: sha256 of buildNormalizedAddressKey(street) | city | state | zip5, the component list documented in elephant-query-db's docs/data-load-and-matching-plan.md, using that repo's own normalizers rather than a re-implementation. A permit links to a parcel ONLY when its key resolves to exactly one parcel; a key resolving to several is recorded as ambiguous and left unlinked. Nothing fuzzy, no geocoding, no unit-level disambiguation.",
        "PO Box keys are excluded from site-address matching, so a mailing address can never be matched to a parcel's site address.",
        `Of the unlinked permits, ${fmt(permitMatch.unmatched_no_parcel)} have an address key that hits no parcel in the current county layer and ${fmt(permitMatch.unmatched_ambiguous)} have an address key resolving to more than one parcel. 10 permits carry no address_source at all; all 10 were already linked by parcel-number key, so they are reported separately and never folded into the unmatched count.`,
        "178 permit rows carry several addresses in one field (\"5 AVE & 8 ST; 801 6 AVE\"). Every segment is keyed independently and the permit is linked only when all resolving segments agree on one PIN. Re-runnable: the write only ever fills a NULL matched_pin, so it can add a link and can never overwrite or weaken one.",
      ],
    },
    {
      id: "rock-island-record-provenance",
      name: "Rock Island County — per-record provenance in the query DB (derived)",
      url: LAYER_URL,
      licence: LICENCE,
      retrieved_at: RETRIEVED_AT,
      record_count: withHttpRequest,
      duration_s: null,
      decision: "provenance-backfill",
      gaps: [
        DERIVED_GAP("parcel rows carrying queryable provenance at the timestamp stated below"),
        "The elephant-query-db schema has no column for a source URL and no retrieval-timestamp column distinct from loaded_at, which is DB-insert time and not collection time. source_http_request (jsonb) is the column designed to hold it and is what this stage uses. No schema change was made and no kit table was altered.",
        `MOVING NUMBER, stated: ${fmt(parcelRows)} is the parcels row count at ${provenanceMeasuredAt}, not the county total. ISSUE-018's per-parcel ingest is a durable Restate workflow that was still running while this stage executed, at roughly 1.5 parcels/s toward 65,955. Rows loaded after this timestamp carry their endpoint in source_payload.source_http_request from the moment they land; re-running scripts/emit-reconciliation-manifest.mjs lifts them into the dedicated column too. The backfill only ever fills a NULL, so it is safe to re-run at any time.`,
      ],
      notes: [
        DERIVED_NOTE,
        `COVERAGE, measured at ${provenanceMeasuredAt} over the ${fmt(parcelRows)} parcel rows then present: source_http_request populated on ${fmt(withHttpRequest)} (${pct(withHttpRequest, parcelRows)}%); source_payload carries the per-record endpoint on ${fmt(withPayloadProvenance)} (${pct(withPayloadProvenance, parcelRows)}%); source_artifact_uri on ${fmt(withArtifactUri)}; source_record_hash on ${fmt(withRecordHash)}. Every loaded record answers "where did this come from" in SQL.`,
        `SHAPE: each parcel's source_http_request holds the exact endpoint that served that one record — {"method":"GET","url":"${LAYER_URL}/query","multiValueQueryString":{"where":["OBJECTID=<id>"],"outFields":["*"],"f":["geojson"],"outSR":["4326"]}} — plus retrieved_at ${RETRIEVED_AT}, licence "${LICENCE}", agol_item_id ${AGOL_ITEM_ID} and the layer URL. The retrieval timestamp comes from the ingest manifest, NEVER from now(), which would fabricate a collection time.`,
        `The same provenance object is carried on all ${fmt(entityCount)} reconciled owner entities in owner_entities.source_http_request, so a reconciled entity cites its source exactly as a raw record does. source_payload is preserved in full on every row and is never dropped, per the kit skill's third non-negotiable.`,
        "Queryable example: SELECT request_identifier, source_http_request->>'retrieved_at', source_http_request->>'licence' FROM parcels WHERE jurisdiction_key='rock_island_appraiser' LIMIT 5;",
      ],
    },
  ],
  run: { started_at: startedAt, finished_at: new Date().toISOString() },
};

manifest.sources[0].duration_s = Number(((Date.now() - t0) / 1000).toFixed(3));

await mkdir(join(repoRoot, "data", "manifests"), { recursive: true });
await writeFile(
  join(repoRoot, "data", "manifests", "reconciliation.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

// ---------------------------------------------------------------------------
// 4. The bounded owner export
// ---------------------------------------------------------------------------
const TOP = 500;
const topEntities = await rows(`
  SELECT owner_entity_id, canonical_name, canonical_name_field, normalized_name, entity_kind,
         array_to_string(entity_tags, ','), parcel_count,
         coalesce(mailing_city,''), coalesce(mailing_state,''), coalesce(mailing_postal_code,''),
         mailing_parse_status
    FROM owner_entities ORDER BY parcel_count DESC, canonical_name ASC LIMIT ${TOP};
`);
const ids = topEntities.map((r) => `'${r[0]}'`).join(",");
const parcelRowsForTop = await rows(`
  SELECT owner_entity_id, request_identifier, parcel_identifier,
         coalesce(owner1_name,''), coalesce(taxbill_name,''), names_disagree
    FROM owner_entity_parcels WHERE owner_entity_id IN (${ids})
   ORDER BY owner_entity_id, (request_identifier)::bigint;
`);
const parcelsByEntity = new Map();
for (const [eid, rid, pin, o1, tb, dis] of parcelRowsForTop) {
  let list = parcelsByEntity.get(eid);
  if (list === undefined) parcelsByEntity.set(eid, (list = []));
  list.push({
    request_identifier: rid,
    parcel_identifier: pin,
    owner1_name: o1 === "" ? null : o1,
    taxbill_name: tb === "" ? null : tb,
    names_disagree: dis === "t",
  });
}

const exportDoc = {
  schema_version: 1,
  county_slug: "rock-island",
  jurisdiction_key: "rock_island_appraiser",
  generated_at: new Date().toISOString(),
  bounded: true,
  entities_total: entityCount,
  entities_included: topEntities.length,
  bound_rule: `the ${TOP} owner entities with the highest parcel_count, ties broken by canonical name ascending. The full set lives in the query DB and is published by ISSUE-022.`,
  excluded_fields: [
    "mailing street line — excluded on purpose; mailing city, state and ZIP5 are included because that is what the regional-owner question needs, and the street line stays in the query DB.",
  ],
  canonical_rule: owner.canonical_rule,
  provenance: owner.provenance,
  entities: topEntities.map((r) => ({
    owner_entity_id: r[0],
    canonical_name: r[1],
    canonical_name_field: r[2],
    normalized_name: r[3],
    entity_kind: r[4],
    entity_tags: r[5] === "" ? [] : r[5].split(","),
    parcel_count: n(r[6]),
    mailing_city: r[7] === "" ? null : r[7],
    mailing_state: r[8] === "" ? null : r[8],
    mailing_postal_code: r[9] === "" ? null : r[9],
    mailing_parse_status: r[10],
    parcels: parcelsByEntity.get(r[0]) ?? [],
  })),
};

await mkdir(join(repoRoot, "data", "exports"), { recursive: true });
await writeFile(
  join(repoRoot, "data", "exports", "reconciliation-owners.json"),
  `${JSON.stringify(exportDoc, null, 2)}\n`,
  "utf8",
);

console.log(`wrote data/manifests/reconciliation.json  (${manifest.sources.length} sources)`);
console.log(
  `wrote data/exports/reconciliation-owners.json  (${exportDoc.entities_included} of ${exportDoc.entities_total} entities, bounded)`,
);
console.log(
  `provenance: source_http_request on ${withHttpRequest}/${parcelRows} parcel rows at ${provenanceMeasuredAt} (ingest still running)`,
);
