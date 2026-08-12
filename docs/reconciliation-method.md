# Entity reconciliation and provenance — method

ISSUE-021. The written companion to `data/manifests/reconciliation.json`, which is what `/sources`
and `/runs` render. Every number in this document states what it was computed over and when.

## What it was computed over

All reconciliation figures were computed over **all 65,955 records of the per-parcel source mirror**
at `elephant-pipeline/data/source-mirror/rock-island/`, which `scripts/reconcile-before-load.mjs`
verified equal to the live FeatureServer count (`returnCountOnly` → 65,955) on 2026-08-12.

It was **not** computed over the query DB's `parcels` table. ISSUE-018's per-parcel ingest is a
durable Restate workflow that was still running while this stage executed, climbing at roughly
1.5 parcels/s toward 65,955 over about eleven hours. That table held a moving partial subset —
2,379 rows, then 2,479, then 2,545, then 3,228 across a single session — and no county metric could
honestly be taken from it. Where a figure *is* taken from `parcels` (the provenance coverage), the
row count and the timestamp are stated beside it and it is never presented as a county total.

## The parcel key, and the trap it avoids

| | |
|---|---|
| `request_identifier` | `OBJECTID` as a decimal string — unique on all 65,955 records by construction |
| `parcel_identifier` | `PIN`, stored **verbatim** |

`PIN` is the county's parcel identifier but it is **not unique**: 29 PIN values repeat across 171
records, so keying on `PIN` would have silently collapsed **142 parcels** into their duplicates. The
duplicates are mostly placeholders — `USA` ×87, `CITY` ×10, `RAILROAD` ×9, `STATE` ×8,
`LEVEE ROW` ×7, `UNKNOWN` ×3 — plus 23 genuinely repeated numeric PINs such as `1623403001` ×3.

The digits-only `normalizeParcelIdentifier` output is **never** used as a key anywhere in this
stage. That is the same mistake that collapsed roughly 31,242 letter-suffixed Lee County parcels.
The kit's own validator confirms the result: `total_parcels == distinct_folios` and
`orphaned_properties == 0` (`docs/evidence/issue-021/21-02-folio-validation.txt`).

## Owner entity reconciliation

**Canonical name rule.** The canonical owner name is `owner1_name`, falling back to `taxbill_name`
**only** where `owner1_name` is blank — measured, exactly **3 records**. 189 records carry neither
name; they produce no entity and no placeholder owner was invented for them.

**Grouping key.** `normalizeName(canonical name)` from `elephant-query-db/src/loader/normalizers.ts`,
imported rather than re-implemented: uppercase, every run of non-alphanumeric characters becomes one
space, whitespace collapsed, trimmed. Nothing else.

**What is deliberately not done.**

- Legal-entity suffixes (`TRUST`, `ESTATE`, `LLC`, `INC`) are **not** stripped before grouping.
  Stripping them would merge `SMITH JOHN` into `SMITH JOHN TRUST`, which are different legal
  entities. The consequence — a person and their trust counted as two entities — is a stated gap,
  and a stated gap beats a silent merge.
- There is **no** fuzzy, phonetic or similarity matching anywhere in this stage. Matching is exact
  on the normalized name.
- `taxbill_name` is **never** a merge key. It is the tax-bill recipient and is measurably a
  *different legal entity*, not a spelling variant. It is preserved on every parcel record and
  displayed beside `owner1_name`, never merged on.

**Measured `taxbill_name` divergence** (full county):

| `owner1_name` | `taxbill_name` | parcels |
|---|---|---|
| `IDNR` | `IDNR / DIVISION OF REALTY` | 184 |
| `WOLLER FRED W III TRUST` | `WOLLER FRED W III` | 117 |
| `CITY OF EAST MOLINE` | `CITY OF EAST MOL / CTY CLRK` | 116 |
| `DEERE & CO` | `DEERE & CO/TAX DEPT` | 84 |
| `CEDEROTH PROPERTIES INC` | `CEDEROTH KRISTIAN L` | 52 |
| `RI HOUSING AUTHORITY` | `CHS RI LP / RI HOUSING AUTH` | 30 |
| `OCHYLSKI INVEST PRTNRSHIP` | `GROWTH INV PARTNERSHIP` | 27 |

**Result**, over all 65,955:

| Metric | Value |
|---|---|
| Input parcel records | 65,955 |
| Owner-bearing records | 65,766 |
| Records with no owner name at all | 189 |
| Canonical from `owner1_name` / `taxbill_name` fallback | 65,763 / 3 |
| Distinct raw owner name strings | 50,042 |
| **Distinct canonical owner entities** | **49,914** |
| **Duplicate groups collapsed** | **128** |
| Owner entities holding more than one parcel | 6,031 |
| Parcels held by multi-parcel owners | 21,883 |
| Parcel records where the two name fields disagree | 15,619 (23.75%) |
| Owner entities carrying at least one disagreement | 12,257 |
| Companies / people (a classification tag, never a merge key) | 6,461 / 43,453 |
| Tags: TRUST / ESTATE / LLC / INC / GOVERNMENT / CHURCH | 3,278 / 114 / 2,062 / 440 / 130 / 138 |

Idempotent by construction: both tables merge with `ON CONFLICT DO UPDATE` and rows that no longer
belong are deleted rather than left stale. Three consecutive runs produced identical counts.

## Owner mailing location

Parsed from `taxbill_csz`, **not** `owner1_csz` — the latter is blank on 14,150 of 65,955 records
(21.45%) against 202 (0.31%) for `taxbill_csz`.

Regex, over `trim → uppercase → collapse whitespace`:

```
/^(.+?)\s+([A-Z]{2})\s+(\d{5})(?:-?(\d{4}))?$/
```

The optional **non-hyphenated** four-digit tail is what handles this county's 9-digit run-on ZIP+4:
64,388 of 65,743 parsed values (97.94%) are written as `CORDOVA IL 612420006` rather than
`61242-0006`.

The kit helper `extractPostalCodeFromAddress` is **deliberately not used**. Its first branch is
Florida-specific (`/\b(?:FL|FLORIDA)\s+(\d{5})/i`) and its fallback requires a 5-digit ZIP at end of
string, so it returns `null` on ~98% of this county's values. Measured:
`extractPostalCodeFromAddress("CORDOVA IL 612420006")` → `null`;
`normalizePostalCode("612420006")` → `61242`.

| Outcome | Records | Meaning |
|---|---|---|
| `parsed` | 65,743 (99.68%) | city, state, ZIP5 and any +4 extracted |
| `blank` | 202 (0.31%) | source field empty (`""` or `" "`, never `NULL`) |
| `unparsed` | 10 (0.02%) | source present but malformed — city/state/ZIP left `NULL` |

Absent, empty and unparseable are three different facts and are never folded together. **Every
unparsed value, verbatim:** `CARBON CLIFF IL 61239333` (×2), `CARBON CLIFF IL 6123997`,
`COAL VALLEY IL 6124039`, `GENESEO IL 61254.`, `HAMPTON IL 61256434`, `HAMPTON IL 61256498`,
`MIDVALE UT 84047+`, `ROCK ISLAND IL 612010`, `00000`. None was repaired or guessed.

Cross-checked against the source's own pre-split fields: agreement with `Taxbill_CS` is
65,743/65,743 = **100.00%**, and with `Taxbill_Zip` 65,743/65,743 = **100.00%**. Not one
disagreement.

53 distinct mailing states. **5,349 of 65,743 parsed records (8.14%)** have an out-of-state owner
mailing address — Iowa 3,069, California 294, Texas 278, Florida 268. Iowa dominates because the
Quad Cities straddle the Mississippi.

`owner_city` and `owner_state` are queryable per parcel through the view `parcel_owner_location`.

## Permit-to-parcel cross-match

**Method, named:** sha256 of `buildNormalizedAddressKey(street) | city | state | zip5` — the
component list documented in `elephant-query-db/docs/data-load-and-matching-plan.md`, using that
repo's own normalizers rather than a re-implementation. A permit links to a parcel **only** when its
key resolves to exactly one parcel. A key resolving to several is recorded as ambiguous and left
unlinked. Nothing fuzzy, no geocoding, no unit-level disambiguation. PO Box keys are excluded so a
mailing address can never match a site address.

**Key reduction, stated:** the City of Rock Island permit reports publish a street line only — no
city, no state, no ZIP. The permit side of the key therefore carries an **empty ZIP5 component** and
is matched against parcels whose `Site_City` is `ROCK ISLAND`. A ZIP5 component would have made the
key stronger and this source does not carry one.

| Bucket | Permits |
|---|---|
| Total | 25,354 |
| **Matched** | **24,949 (98.40%)** |
| — by legacy parcel key (ISSUE-019) | 24,688 |
| — by PIN exact (ISSUE-019) | 139 |
| — by normalized address (ISSUE-019) | 102 |
| — by sha256 address hash, 1:1 (this stage) | 20 |
| **Unmatched** | **405 (1.60%)** |
| — legacy key not in the current parcel layer | 280 |
| — source sentinel, not a parcel reference | 88 |
| — address ambiguous or absent | 37 |

10 permits carry no `address_source` at all; all 10 were already linked by parcel-number key, so
they are reported separately and never folded into the unmatched count. 178 permit rows carry
several addresses in one field (`5 AVE & 8 ST; 801 6 AVE`); every segment is keyed independently and
the permit links only when all resolving segments agree on one PIN.

**Structural ceiling on address matching**, measured over all 65,955 parcels:

| | |
|---|---|
| Parcels with no `site_address` — never matchable by address | 7,316 (11.09%) |
| Distinct site-address keys | 58,111 |
| Ambiguous keys (>1 parcel) / parcels on them | 361 / 889 |
| Unambiguous 1:1 candidates | 57,750 (87.56%) |

## Provenance

The `elephant-query-db` schema has **no** column for a source URL and no retrieval-timestamp column
distinct from `loaded_at`, which is DB-insert time and not collection time. `source_http_request`
(jsonb) is the column designed to hold it, and it is what this stage uses. No schema change was
made; no kit table was altered.

Each parcel's `source_http_request` holds the exact endpoint that served that one record, plus the
collection timestamp, the licence sentence and the AGOL item id:

```json
{"method":"GET",
 "url":"https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0/query",
 "multiValueQueryString":{"where":["OBJECTID=1"],"outFields":["*"],"f":["geojson"],"outSR":["4326"]},
 "retrieved_at":"2026-08-12T18:31:58.555Z",
 "licence":"For use by the general public",
 "agol_item_id":"9cae8a64ab0e4cea99758f741ca43b3c",
 "source_layer_url":"…/Parcels/FeatureServer/0"}
```

The retrieval timestamp comes from the ingest manifest, **never** from `now()`, which would
fabricate a collection time. The backfill only ever fills a `NULL`, so it is safe to re-run while
ISSUE-018's ingest is still landing rows. The same provenance object is carried on all 49,914
reconciled owner entities, so a reconciled entity cites its source exactly as a raw record does.
`source_payload` is preserved in full on every row and is never dropped.

Answering "where did this record come from" in SQL:

```sql
SELECT request_identifier,
       source_http_request->>'url'          AS endpoint,
       source_http_request->>'retrieved_at' AS retrieved_at,
       source_http_request->>'licence'      AS licence
  FROM parcels
 WHERE jurisdiction_key = 'rock_island_appraiser';
```

## What this stage owns, and what it reused

Reconciliation is driven by the kit stage `query-db-loading-matching` and by
`elephant-xyz/elephant-query-db`: its schema, its `normalizeName` / `normalizePostalCode` /
`buildNormalizedAddressKey` / `hashString` normalizers, its `validate-appraisal-folio.ts` validator,
and its documented address-key component list. None of it was re-implemented.

**Built fresh, stated honestly:** owner entity reconciliation. The kit's loader dedupes by
`(source_system, source_record_key)` — exact-key dedupe, not entity resolution — and
`elephant-query-db` carries no entity-resolution logic anywhere in `src/` or `scripts/`. Owner
canonicalisation is therefore an extension this issue owns, written as two additive, namespaced
tables (`owner_entities`, `owner_entity_parcels`) plus one view (`parcel_owner_location`) that never
modify a kit table. Definition committed at `sql/owner_entities.sql`.

## Reproducing it

```bash
node scripts/reconcile-before-load.mjs          # reconcile artifact vs live source count first
node scripts/reconcile-owners.mjs               # owner entities (idempotent)
node scripts/parse-mailing-location.mjs         # mailing city/state/ZIP with failure accounting
node scripts/match-permits-to-parcels.mjs --write  # address-hash cross-match, high confidence only
node scripts/emit-reconciliation-manifest.mjs   # provenance backfill + manifest + bounded export
node scripts/validate-manifests.mjs
```

Evidence: `docs/evidence/issue-021/`.
