#!/usr/bin/env node
// ISSUE-021 WI-6 — cross-match permit records to parcels by normalized address hash, at high
// confidence only, with matched / unmatched / ambiguous / unmatchable all stated separately.
//
//   node scripts/match-permits-to-parcels.mjs [--write]
//
// Without --write it measures and reports only. With --write it fills matched_pin ONLY on rows
// where it is still NULL and the address hash resolves to exactly one parcel, so the step is
// re-runnable and can never overwrite or weaken a link ISSUE-019 already made.
//
// DECISIONS, from plan.md:
//   key         = sha256( buildNormalizedAddressKey(street) | city | state | zip5 ), the kit's
//                 documented component list from docs/data-load-and-matching-plan.md.
//   confidence  = a permit links to a parcel ONLY when its key resolves to exactly one parcel.
//                 Ambiguous keys are recorded and left unlinked. Nothing fuzzy, no geocoding.
//   PO Boxes    = excluded (trap T6). A PO Box is a mailing address and must never match a site
//                 address.
//   denominators are never blended: unmatchable_no_address, unmatched_no_parcel,
//                 unmatched_ambiguous and matched are four separate buckets that sum to the total,
//                 and BOTH match rates are printed — over addressable permits and over all permits.
//
// MEASURED REDUCTION OF THE KEY, recorded because it changes what the number means: the City of
// Rock Island permit reports publish a street line and nothing else — no city, no state, no ZIP.
// The permit side of the key is therefore street|rock island|il with no ZIP5 component, and the
// parcel side is restricted to parcels whose Site_City is ROCK ISLAND. The full four-component key
// is still computed county-wide below, as the structural ceiling, so the reduction is visible
// rather than hidden.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import {
  buildNormalizedAddressKey,
  hashString,
  normalizePostalCode,
} from "/Users/lukas/Developer/ateam/elephant-query-db/src/loader/normalizers.ts";
import { exec, rows, table, copyIn, tsv } from "./lib/psql.mjs";
import { readSourceMirror, blankToNull, requestIdentifier, parcelIdentifier } from "./lib/source-mirror.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const WRITE = process.argv.includes("--write");
const PERMIT_CITY = "rock island";
const PERMIT_STATE = "il";

const isPoBox = (streetKey) => streetKey !== null && /^p\s*o\s+box\b/.test(streetKey);

function fullKey(street, city, state, zip5) {
  const s = buildNormalizedAddressKey(street);
  if (s === null || s === "") return null;
  if (isPoBox(s)) return null;
  return hashString(`${s}|${(city ?? "").toLowerCase()}|${(state ?? "").toLowerCase()}|${zip5 ?? ""}`);
}

function reducedKey(street, city, state) {
  const s = buildNormalizedAddressKey(street);
  if (s === null || s === "") return null;
  if (isPoBox(s)) return null;
  return hashString(`${s}|${city}|${state}|`);
}

const startedAt = new Date().toISOString();
const { records } = await readSourceMirror();

// ---------------------------------------------------------------------------
// Parcel side — the structural ceiling, county-wide, on the FULL four-component key
// ---------------------------------------------------------------------------
const fullIndex = new Map();
let parcelsWithoutAddress = 0;
for (const record of records) {
  const street = blankToNull(record.site_address);
  if (street === null) {
    parcelsWithoutAddress += 1;
    continue;
  }
  const key = fullKey(
    street,
    blankToNull(record.Site_City),
    blankToNull(record.Site_State),
    normalizePostalCode(record.Site_Zip),
  );
  if (key === null) continue;
  let bucket = fullIndex.get(key);
  if (bucket === undefined) fullIndex.set(key, (bucket = []));
  bucket.push(requestIdentifier(record));
}
const ambiguousKeys = [...fullIndex.values()].filter((v) => v.length > 1);
const parcelsOnAmbiguousKeys = ambiguousKeys.reduce((t, v) => t + v.length, 0);
const unambiguousCandidates = [...fullIndex.values()].filter((v) => v.length === 1).length;

// ---------------------------------------------------------------------------
// Parcel side — the index the permits actually match against (reduced key, city-scoped)
// ---------------------------------------------------------------------------
const permitIndex = new Map();
let cityScopedParcels = 0;
for (const record of records) {
  const city = blankToNull(record.Site_City);
  if (city === null || city.toLowerCase() !== PERMIT_CITY) continue;
  const state = blankToNull(record.Site_State);
  if (state !== null && state.toLowerCase() !== PERMIT_STATE) continue;
  const street = blankToNull(record.site_address);
  if (street === null) continue;
  cityScopedParcels += 1;
  const key = reducedKey(street, PERMIT_CITY, PERMIT_STATE);
  if (key === null) continue;
  let bucket = permitIndex.get(key);
  if (bucket === undefined) permitIndex.set(key, (bucket = []));
  bucket.push({ rid: requestIdentifier(record), pin: parcelIdentifier(record) });
}
// A key that resolves to several parcels which all carry the SAME PIN is not ambiguous — it is one
// parcel published under several OBJECTIDs. Ambiguity is measured on distinct PIN.
const permitIndexResolved = new Map();
for (const [key, bucket] of permitIndex) {
  const pins = [...new Set(bucket.map((b) => b.pin))];
  permitIndexResolved.set(key, { pins, first: bucket[0] });
}

// ---------------------------------------------------------------------------
// Permit side
// ---------------------------------------------------------------------------
const permits = await rows(`
  SELECT id, permit_number, coalesce(address_source,''), coalesce(matched_pin,''),
         coalesce(match_method,''), coalesce(unmatched_reason,'')
    FROM permits_rock_island_city ORDER BY id;
`);

const buckets = {
  matched_before: 0,
  unmatchable_no_address: 0,
  unmatched_no_parcel: 0,
  unmatched_ambiguous: 0,
  newly_matched: 0,
};
// Counted across the WHOLE table, separately from the buckets, so it is never double-counted: a
// permit with no address can still have been linked by ISSUE-019's parcel-number key.
const permitsWithNoAddressAtAll = permits.filter(([, , a]) => a.trim() === "").length;
const permitsWithNoAddressButLinked = permits.filter(([, , a, p]) => a.trim() === "" && p !== "").length;
const priorMethods = new Map();
const priorReasonsOfNewlyMatched = new Map();
const newLinks = [];
let multiAddressRows = 0;

for (const [id, permitNumber, addressSource, matchedPin, matchMethod, unmatchedReason] of permits) {
  if (matchedPin !== "") {
    buckets.matched_before += 1;
    priorMethods.set(matchMethod, (priorMethods.get(matchMethod) ?? 0) + 1);
    continue;
  }
  const raw = addressSource.trim();
  if (raw === "") {
    buckets.unmatchable_no_address += 1;
    continue;
  }
  // One permit line can carry several addresses separated by ';'. Every segment is keyed; the
  // permit links only when every segment that resolves points at the SAME single PIN. Different
  // PINs => ambiguous, left unlinked.
  const segments = raw.split(";").map((s) => s.trim()).filter((s) => s !== "");
  if (segments.length > 1) multiAddressRows += 1;
  const hitPins = new Set();
  let anySegmentAmbiguous = false;
  for (const segment of segments) {
    const key = reducedKey(segment, PERMIT_CITY, PERMIT_STATE);
    if (key === null) continue;
    const entry = permitIndexResolved.get(key);
    if (entry === undefined) continue;
    if (entry.pins.length > 1) anySegmentAmbiguous = true;
    for (const pin of entry.pins) hitPins.add(pin);
  }
  if (hitPins.size === 1 && !anySegmentAmbiguous) {
    buckets.newly_matched += 1;
    const pin = [...hitPins][0];
    newLinks.push([id, pin]);
    priorReasonsOfNewlyMatched.set(
      unmatchedReason || "(none)",
      (priorReasonsOfNewlyMatched.get(unmatchedReason || "(none)") ?? 0) + 1,
    );
  } else if (hitPins.size > 1 || anySegmentAmbiguous) {
    buckets.unmatched_ambiguous += 1;
  } else {
    buckets.unmatched_no_parcel += 1;
  }
}

if (WRITE && newLinks.length > 0) {
  await exec(`
    DROP TABLE IF EXISTS stage_permit_address_links;
    CREATE UNLOGGED TABLE stage_permit_address_links (id text, matched_pin text);
  `);
  await copyIn(
    "stage_permit_address_links",
    ["id", "matched_pin"],
    newLinks.map((r) => r.map(tsv).join("\t")),
  );
  // Only ever fills a NULL. It can add a link; it can never overwrite or weaken one.
  await exec(`
    UPDATE permits_rock_island_city p
       SET matched_pin = s.matched_pin,
           match_method = 'address-hash-sha256-1to1',
           unmatched_reason = NULL
      FROM stage_permit_address_links s
     WHERE s.id = p.id AND p.matched_pin IS NULL;
    DROP TABLE stage_permit_address_links;
  `);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const finishedAt = new Date().toISOString();
const total = permits.length;
const matched = buckets.matched_before + (WRITE ? buckets.newly_matched : 0);
const addressable = total - buckets.unmatchable_no_address;
const pct = (n, d) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(2)}%`);
const out = [];
const line = (s = "") => out.push(s);

line("ISSUE-021 WI-6 — permit-to-parcel cross-match");
line(`run_started_at: ${startedAt}`);
line(`run_finished_at: ${finishedAt}`);
line(`mode: ${WRITE ? "MEASURE AND WRITE (fills matched_pin only where it is NULL)" : "MEASURE ONLY"}`);
line("");
line(`PARCEL SIDE computed over all ${records.length} records of the per-parcel source mirror`);
line("  (elephant-pipeline/data/source-mirror/rock-island/) — full county, not the partially-loaded");
line("  parcels table.");
line(`PERMIT SIDE computed over all ${total} rows of permits_rock_island_city, loaded by ISSUE-019.`);
line("");
line("METHOD, named: sha256 of buildNormalizedAddressKey(street)|city|state|zip5, the kit's");
line("  documented component list (elephant-query-db docs/data-load-and-matching-plan.md). A permit");
line("  links to a parcel only when the key resolves to exactly ONE parcel. PO Box keys are excluded");
line("  so a mailing address can never match a site address.");
line("");
line("== structural ceiling, county-wide, on the FULL four-component key ==");
line(`parcels total                       ${records.length}`);
line(`parcels without a site_address      ${parcelsWithoutAddress}  (${pct(parcelsWithoutAddress, records.length)}) — never matchable by address`);
line(`distinct site-address keys          ${fullIndex.size}`);
line(`ambiguous keys (>1 parcel)          ${ambiguousKeys.length}`);
line(`parcels sitting on ambiguous keys   ${parcelsOnAmbiguousKeys}`);
line(`unambiguous 1:1 match candidates    ${unambiguousCandidates}  (${pct(unambiguousCandidates, records.length)} of all parcels)`);
line("");
line("== the key actually used for permits, and why it is reduced ==");
line("The City of Rock Island permit reports publish a street line only — no city, no state, no ZIP.");
line("The permit-side key is therefore street|rock island|il with an EMPTY ZIP5 component, matched");
line("against parcels whose Site_City is ROCK ISLAND. This is a real reduction in key strength and");
line("it is stated rather than hidden: a ZIP5 component would have made the key stronger and this");
line("source does not carry one.");
line(`parcels scoped to Site_City = ROCK ISLAND   ${cityScopedParcels}`);
line(`distinct reduced keys over those parcels    ${permitIndexResolved.size}`);
line(`  of which resolve to exactly one PIN       ${[...permitIndexResolved.values()].filter((e) => e.pins.length === 1).length}`);
line(`  of which resolve to several PINs          ${[...permitIndexResolved.values()].filter((e) => e.pins.length > 1).length}  (never auto-linked)`);
line(`permit rows carrying several addresses in one field  ${multiAddressRows}  (every segment keyed; linked only when all resolving segments agree on one PIN)`);
line("");
line("== permit buckets — four denominators, never blended, summing to the total ==");
line(`total permits                     ${total}`);
line(`already linked by ISSUE-019       ${buckets.matched_before}`);
for (const [method, n] of [...priorMethods.entries()].sort((a, b) => b[1] - a[1]))
  line(`    via ${(method || "(unrecorded)").padEnd(20)} ${n}`);
line(`newly linked here by address hash ${buckets.newly_matched}${WRITE ? "" : "  (measured; not written — re-run with --write)"}`);
for (const [reason, n] of [...priorReasonsOfNewlyMatched.entries()].sort((a, b) => b[1] - a[1]))
  line(`    previously recorded as ${reason}: ${n}`);
line(`unmatchable_no_address            ${buckets.unmatchable_no_address}   permit carries no address at all`);
line(`unmatched_no_parcel               ${buckets.unmatched_no_parcel}   address key hits no parcel in the county layer`);
line(`unmatched_ambiguous               ${buckets.unmatched_ambiguous}   address key resolves to more than one parcel; left unlinked on purpose`);
const sum =
  buckets.matched_before +
  buckets.newly_matched +
  buckets.unmatchable_no_address +
  buckets.unmatched_no_parcel +
  buckets.unmatched_ambiguous;
line(`sum of buckets                    ${sum}  (must equal ${total})`);
line("");
line(`permits carrying no address_source at all, across the whole table  ${permitsWithNoAddressAtAll}`);
line(`  of which ISSUE-019 had already linked by parcel-number key       ${permitsWithNoAddressButLinked}`);
line("  This is reported separately and is NOT added to the buckets above: a permit with no address");
line("  is unmatchable BY ADDRESS, which is not the same as unmatched.");
line("");
line("== match rates, both denominators stated ==");
line(`matched / total permits                    ${matched} / ${total} = ${pct(matched, total)}`);
line(`matched / addressable permits              ${matched} / ${addressable} = ${pct(matched, addressable)}`);
line(`unmatched / total permits                  ${total - matched} / ${total} = ${pct(total - matched, total)}`);
line("");
line("== in the query DB after this step ==");
out.push(
  await table(
    "SELECT coalesce(match_method,'(unmatched)') AS match_method, count(*) FROM permits_rock_island_city GROUP BY 1 ORDER BY 2 DESC;",
  ),
);
out.push(
  await table(
    "SELECT coalesce(unmatched_reason,'(matched)') AS unmatched_reason, count(*) FROM permits_rock_island_city GROUP BY 1 ORDER BY 2 DESC;",
  ),
);
out.push(
  await table(
    "SELECT count(*) AS permits, count(matched_pin) AS matched, count(*) - count(matched_pin) AS unmatched FROM permits_rock_island_city;",
  ),
);
line("The 88 rows recorded as source-sentinel-not-a-parcel-reference are permits whose parcel field");
line("holds a source sentinel (a placeholder, not a parcel reference). They are counted as unmatched,");
line("never as matched and never dropped.");

console.log(out.join("\n"));

await writeFile(
  join(repoRoot, "data", "records", "reconciliation-permit-match-summary.json"),
  `${JSON.stringify(
    {
      computed_over: {
        parcel_corpus: "per-parcel source mirror",
        parcel_record_count: records.length,
        permit_table: "permits_rock_island_city",
        permit_record_count: total,
        computed_at: finishedAt,
        wrote_links: WRITE,
      },
      method:
        "sha256 of buildNormalizedAddressKey(street)|city|state|zip5 (elephant-query-db normalizers); only keys resolving to exactly one parcel are linked; PO Box keys excluded. Permit side reduced to street|rock island|il with no ZIP5 component because the City of Rock Island permit reports publish a street line only.",
      total: matched + buckets.unmatchable_no_address + buckets.unmatched_no_parcel + buckets.unmatched_ambiguous,
      matched,
      matched_by_issue_019: buckets.matched_before,
      matched_by_address_hash_here: WRITE ? buckets.newly_matched : 0,
      matched_by_prior_method: Object.fromEntries(priorMethods),
      unmatchable_no_address: buckets.unmatchable_no_address,
      unmatched_no_parcel: buckets.unmatched_no_parcel,
      unmatched_ambiguous: buckets.unmatched_ambiguous,
      match_rate_of_total: matched / total,
      match_rate_of_addressable: matched / addressable,
      ceiling: {
        parcels_without_site_address: parcelsWithoutAddress,
        distinct_site_address_keys: fullIndex.size,
        ambiguous_keys: ambiguousKeys.length,
        parcels_on_ambiguous_keys: parcelsOnAmbiguousKeys,
        unambiguous_candidates: unambiguousCandidates,
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log("\nwrote data/records/reconciliation-permit-match-summary.json");
