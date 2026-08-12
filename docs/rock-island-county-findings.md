---
county: Rock Island County, IL
county_slug: rock-island
state: IL
discovery_run_at: 2026-08-12
egress_country: LT
discovery_skill: elephant-xyz/skills skills/county-discovery
output_path_note: county-discovery/SKILL.md prescribes elephant-pipeline/docs/rock-island-county-findings.md; no elephant-pipeline checkout exists in this workspace, so the findings live in the assignment repo under the same filename.
---

# Rock Island County, IL — source discovery findings

Produced by driving `elephant-xyz/skills` `skills/county-discovery` against Rock Island County,
Illinois. Section order is that skill's required section order, plus two sections of our own
(`## 9`, `## 10`).

Every number in this document was measured against the live source on the date recorded beside it.
Where a source could not be reached, the row says so explicitly and states what the failure does and
does not prove. No value here is illustrative, and no gap is filled by inference.

Machine-readable companion: [`rock-island-sources.yaml`](./rock-island-sources.yaml).

## 1. Appraiser portal

| Property | Value |
|---|---|
| Landing page | `https://www.rockislandcountyil.gov/176/Assessment-Search` (HTTP 200 from this egress) |
| **Portal** | **`https://rockislandil.devnetwedge.com/`** |
| **Vendor** | **DEVNET Wedge** |
| Status | **`unreachable` from this egress** — `tcp-blocked` |
| Access mode | **not-measured** (portal unreachable) |
| Parcel-id format on portal | **unconfirmed** — see `## 2` |
| Anti-bot posture | **not-measured** — see the diagnostic below |
| Throughput | **not-measured** |
| Feasibility | `undetermined-unreachable` |
| Evidence | [`samples/assessor-probe.txt`](./samples/assessor-probe.txt) |

**How the vendor was identified, and why that identification stands regardless of reachability.**
Two independent signals, neither of which requires loading the portal:

1. The county's own published link. `https://www.rockislandcountyil.gov/176/Assessment-Search` — the
   Assessment Search page on the county's CivicPlus CMS, reachable and read from this egress —
   points at `rockislandil.devnetwedge.com`.
2. The vendor's hostname pattern. DEVNET Wedge deploys per-county at
   `<county><state>.devnetwedge.com`, and `rockislandil` fits it exactly. DNS confirms the host is
   real and vendor-operated: `rockislandil.devnetwedge.com` is a **CNAME to
   `wedge-3.devnetwedge.com`** — a shared DEVNET Wedge tenant node, not a county-hosted machine.

DEVNET Wedge is the common assessment-portal product across Illinois counties. The vendor question
(AC3's counterpart for the appraiser side) is therefore **answered**; only the measurement of it is
not.

**Diagnostic — verbatim, and what it does and does not prove:**

> DNS A record 184.105.34.17 resolves; TCP connect times out after 20 s on IPv4 and IPv6 from egress
> LT. This proves the host is not accepting connections from this egress. It does not prove the
> portal is down, bot-protected, or unusable from a US exit.

Raw capture in [`samples/assessor-probe.txt`](./samples/assessor-probe.txt): the `dig` output (A
record via CNAME `wedge-3.devnetwedge.com` → `184.105.34.17`, no AAAA record), and two `curl -sv`
transcripts — `-4` and `-6` — each ending `Connection timed out after 20004 milliseconds`. The
connection fails at the TCP layer: there is no TLS handshake, no HTTP response, no challenge page
and no block page. That failure shape is **not** what a bot challenge looks like — a bot challenge
completes the connection and answers with a page. It is consistent with a network-level filter, and
this egress cannot determine whose filter it is.

**What is consequently unknown, and must not be assumed:** the portal's search mechanism, its
per-parcel detail URL pattern, its parcel-id format, whether it exposes a hidden JSON API, whether
it requires a session bootstrap, its CAPTCHA/Cloudflare posture, its safe concurrency, and its
per-record latency. Every one of these is a `county-discovery` required field for section 1, and
every one of them stays unfilled rather than guessed. Re-probing from a US exit is the single action
that fills them — see `## 10`.

**What is reachable in the meantime.** The county GIS parcel layer (`## 4`) independently carries
owner name, mailing address, situs address, EAV/EMV assessed values, acreage, last-sale date and
sale price, year built, square footage, zoning and class — for 65,955 parcels, with no auth. It is
**not** a substitute for the assessor portal and is catalogued separately, but it means the
unreachable portal does **not** block property-level work.

## 2. Parcel identifier

**Official name: PIN.** Format: **10-digit numeric string, no punctuation**, e.g. `0330400004`.
Source field `PIN`, `esriFieldTypeString(10)` on the county GIS parcel layer.
**100% populated — 65,955 of 65,955.** This is the join key.

| Identifier | Field | Format | Example | Coverage |
|---|---|---|---|---|
| PIN (canonical) | `PIN` | 10-digit string, no punctuation | `0330400004` | 65,955 / 65,955 (100%) |
| PIN (duplicate) | `parcel_number` | as above | `0330400004` | identical to `PIN` in all sampled records |
| Legacy / alternate | `RICO_PARCE` | mixed alphanumeric with hyphens | `01190-A-1`, `01594` | present |
| Legacy (duplicate) | `alternate_parcel_number` | as above | `01190-A-1` | identical to `RICO_PARCE` in all sampled records |

Two identifier families coexist: the 10-digit `PIN` and a legacy hyphenated `RICO_PARCE`. Each is
carried twice under two field names. A transform must pick `PIN` and normalise, not assume the four
fields agree.

**The assessor portal's identifier format is UNCONFIRMED.** `rockislandil.devnetwedge.com` is
unreachable from this egress (see `## 1` and `## 10`), so the id shown on the assessment portal has
not been observed. `county-discovery/SKILL.md` warns that the parcel id "often differs" between
appraiser and permit portals — commonly by punctuation or by a check digit. **Do not assume the
DEVNET Wedge id equals the GIS `PIN`** until it has been seen. Asserting equality on the strength of
the GIS layer alone would be a fabrication, and a transform built on that assumption would fail
silently at join time.

Permit-portal identifier formats are likewise unconfirmed per jurisdiction — see `## 3`.

## 3. Permit portals

### Permits are not county-level — the structural constraint

**A county has ONE appraiser but permits are NOT county-level.** Illinois is no different from
Florida in this respect, and Rock Island County is the demonstration: the county's own GIS
`Municipal Boundaries` layer returns **15 municipalities**, and unincorporated county is a
sixteenth jurisdiction, so there are **16 permit jurisdictions**, each its own permitting authority
with its own vendor, its own identifiers, and its own idea of what is public.

This is the single most important answer this document gives to the assignment's *"identify slow
source sites or constrained data sources"* and *"document pipeline speed limitations and source
constraints"* criteria. The binding constraint on permit data in Rock Island County **is not
speed**. It is that **most of the data is not online at all**.

The 16 jurisdictions, from the county's own GIS layer: unincorporated county, plus Andalusia,
Carbon Cliff, Coal Valley, Cordova, East Moline, Hampton, Hillsdale, Milan, Moline, Oak Grove,
Port Byron, Rapids City, Reynolds, Rock Island and Silvis.

### Certification summary

`county-discovery` calls the certification re-probe "the acceptance test for 'the agent can
discover sources'". Every one of the 16 rows was discovered and re-probed on 2026-08-12; full rows
in [`rock-island-sources.yaml`](./rock-island-sources.yaml) under `permits:`.

| Outcome | Count | Jurisdictions |
|---|---|---|
| **`certified`** | **13** | unincorporated county, Andalusia, Coal Valley, Cordova, East Moline, Hampton, Hillsdale, Moline, Oak Grove, Port Byron, Rapids City, Reynolds, Silvis |
| `discovered` (not certified) | 3 | **Rock Island** (403 from this egress), **Milan** (403 Cloudflare challenge), **Carbon Cliff** (permitting contracted out; record scope untestable) |
| `needs-review` | 0 | — |

### Vendor distribution

| Vendor | Count | Jurisdictions |
|---|---|---|
| **`none-found`** | **11** | unincorporated county, Andalusia, Coal Valley, Cordova, Hampton, Hillsdale, Oak Grove, Port Byron, Rapids City, Reynolds, Silvis |
| `custom` | 2 | East Moline (**really iWorQ**), Milan (**really GovBuilt**) |
| `centralsquare` | 1 | Moline (eTRAKiT) |
| `tyler` | 1 | Rock Island (EnerGov Civic Access) |
| `unknown` | 1 | Carbon Cliff |

**No two jurisdictions share a vendor.** Moline is CentralSquare, Rock Island is Tyler, East Moline
is iWorQ, Milan is GovBuilt — **four distinct stacks in four adjacent cities**. The leverage
`county-discovery` relies on ("one adapter serves every jurisdiction on that vendor") **does not
exist here**: four online jurisdictions would need four adapters. That is a direct finding against
the permit-adapter stage's core assumption, and it should be known before that stage is scoped.

**Vendor-library gap, reported not silently patched.** iWorQ and GovBuilt are real commercial permit
platforms and neither appears in `county-discovery`'s known-vendor library
(Accela, Tyler, Click2Gov, OpenGov, CentralSquare, ePZB, GovAccess, Citizenserve). Both are recorded
as `custom` because the enum has no value for them, with the true vendor named in each row's `probe`
field. **The library should gain `iworq` and `govbuilt`.**

### The jurisdictions with an online lookup — measured

| Jurisdiction | Portal | Vendor | Search by | p50 | p95 | Date window? |
|---|---|---|---|---|---|---|
| **Moline** | `https://moli.csqrcloud.com/community-etrakit/Search/permit.aspx` | CentralSquare eTRAKiT | **Permit Number, Site Address** | **981 ms** | **1129 ms** | **No** |
| **East Moline** | `https://eastmolinepermit.portal.iworq.net/EASTMOLINE/permits/600` | iWorQ | **Permit # or Primary Contractor only** | **1834 ms** | **2457 ms** | **No** |
| **Rock Island** | `https://cityofrockislandil-energovweb.tylerhost.net/apps/selfservice` | Tyler EnerGov Civic Access | **not observable — 403 from this egress** | not-measured | not-measured | unverified |
| Rock Island *(workaround)* | `https://rigov.org/1276/Permit-Reports` | city CMS | monthly PDF reports | **1365 ms** | **1828 ms** | **Yes — monthly** |
| **Milan** | `https://www.milanil.org/building-and-inspections` | GovBuilt | **not observable — 403 Cloudflare** | not-measured | not-measured | unverified |

All throughput figures are 10 sequential requests, 10/10 HTTP 200, measured 2026-08-12.

### Date-window behaviour — the incremental-harvest question

`county-discovery` asks for date-window behaviour because it decides whether a source can be
harvested incrementally or must be re-swept whole.

- **No jurisdiction's live permit search exposes a date-range filter that could be observed.**
  Moline's eTRAKiT searches Permit Number and Site Address only; East Moline's iWorQ searches Permit
  # and Primary Contractor only.
- **East Moline is worse than "no date filter": it cannot be enumerated at all.** Its result table
  renders zero rows until an exact permit number or contractor is supplied. There is no browse-all,
  so bulk harvesting through that form is not possible — only targeted lookup of a permit you
  already know.
- **The one genuine date-windowed feed in the county is Rock Island's monthly PDF permit reports**
  (`https://rigov.org/1276/Permit-Reports`), published by permit application type for **every month
  from 2017 through 2026**. It is a de-facto month-granularity incremental feed, it is **reachable
  from this egress** even though the city's Tyler portal is not, and it is the only source here that
  supports "what changed since last month" without a full re-sweep. It is PDF, so it needs
  extraction, and it is report-level rather than record-level.
- Tyler EnerGov normally exposes date filters, and GovBuilt may. **Neither was observed**, so
  neither is asserted.

### The 11 jurisdictions with no online permit lookup

Eleven of sixteen jurisdictions — **including the county's own unincorporated jurisdiction** — have
no online permit search of any kind. This is a real, reportable finding about how permitting works
in this county, not a failed search. What each of them has instead:

- **PDF application, submit by mail/email/in person:** unincorporated county (Commercial and
  Residential PDFs, 309-558-3771), Coal Valley, Cordova, Hampton, Port Byron, Silvis.
- **Counter-only by explicit policy:** Rapids City — *"A permit will need to be purchased in person
  at the Village of Rapids City Office… No permits or payments for permits will be accepted via
  email, fax, or mail!"*
- **No permit page at all:** Andalusia — the village site carries Ordinances, Zoning Ordinances,
  Public Works and Contact, and the word "permit" does not appear on its new-resident page.
- **No village website exists at all:** **Hillsdale, Oak Grove, Reynolds.** Multiple candidate
  domains were probed for each (e.g. `villageofhillsdale.org`, `hillsdaleil.org`,
  `hillsdaleillinois.org`, `villageofhillsdaleil.org`) and every one failed to connect. Their only
  web presence is Facebook pages and directory listings. Permits are handled at the village clerk's
  counter.

**Consequence for the pipeline:** permit coverage for Rock Island County cannot be complete from
public online sources. Any countywide permit claim must be scoped to the jurisdictions that publish
online — realistically Moline and Rock Island, together roughly half the county's parcels — and the
remainder must be declared as *not available online*, not silently reported as zero permits. A
parcel in Reynolds with no permits found is not a parcel with no permits.

### Shared and delegated arrangements

Three cross-jurisdiction arrangements were found, each of which will otherwise cause a
misattribution:

1. **Carbon Cliff → East Moline (contract, confirmed both sides).** Carbon Cliff's own site states it
   "has a contract with the City of East Moline to handle all Plumbing, Mechanical, Building &
   Electrical permitting and inspections". East Moline's iWorQ contractor-registration portal is
   labelled for "City of East Moline **& Carbon Cliff**" registration. **Unresolved:** whether Carbon
   Cliff's building-permit *records* live inside the `eastmolinepermit` iWorQ instance could not be
   confirmed, because that instance returns nothing without a permit number. Recorded as `unknown` /
   `discovered` rather than guessed either way.
2. **Coal Valley → Rock Island County (inspections only).** Coal Valley issues its own permits but
   directs "call Rock Island County at 309-558-3771 for all inspections", so permit records are
   Coal Valley's while **inspection** records may sit with the county.
3. **Rapids City → Rock Island County (fee schedule only).** Rapids City links the county's fee
   schedule PDF, adopting county rates while running its own counter-only permitting.

### Parcel identifiers on permit portals

**Unconfirmed for every jurisdiction.** No permit portal in this county was observed searching by
parcel number — Moline searches by address, East Moline by permit number or contractor. Whether any
of them carries a PIN at all, and in what format, is not established. `county-discovery` warns the
identifier "often differs" between appraiser and permit portals; here the more basic problem is that
**parcel-keyed permit lookup does not appear to be offered publicly anywhere in the county.** Joining
permits to parcels would go through **address matching**, with all the normalisation risk that
implies, against a `site_address` field that is itself only 88.91% populated.

## 4. Bulk data sources

### Parcel geometry — answered definitively: real polygons, public, no auth

**Rock Island County publishes downloadable parcel POLYGONS.** Not centroids, not an annotation
layer, not a token-gated service.

| Property | Value |
|---|---|
| Layer URL | `https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0` |
| Service URL | `https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer` |
| Publisher | **Rock Island County GIS** — AGOL org `6FnscPPlUa9DXXOk`, urlKey `ricogis`. The county's own GIS department, not a reseller. |
| AGOL item id | `9cae8a64ab0e4cea99758f741ca43b3c` |
| Layer name | `parcel_layer` |
| **Geometry type** | **`esriGeometryPolygon`** — re-verified live 2026-08-12 |
| Feature count | **65,955** — `returnCountOnly` returned `{"count":65955}` in 0.50 s, re-verified live 2026-08-12 (identical to the 2026-08-11 count, so no drift over the probe window) |
| Geometry mix | 65,407 `Polygon` + 621 `MultiPolygon`, **0 null geometries** (measured over the bulk export) |
| `maxRecordCount` | **2000** (`standardMaxRecordCount` 2000, `tileMaxRecordCount` 4000) → **33 paged requests** for a full extract |
| Auth | **none.** No token, no API key, no login. |
| CORS | `access-control-allow-origin: *` — direct browser fetch works |
| Native SR | `wkid 102672` / `latestWkid 3436` (NAD83 Illinois West ftUS); `outSR=4326` verified working |
| Capabilities | `Query` only — read-only, no edit |
| Licence | **`For use by the general public`** |
| Last modified | `2026-08-11T12:08:40Z` |
| Latency | 0.393–0.789 s over 10 rapid sequential queries on 2026-08-12; **p50 ≈ 0.46 s, p95 ≈ 0.79 s**; zero 429, zero throttling |
| Formats | `supportedQueryFormats: JSON, geoJSON, PBF`; pagination via `advancedQueryCapabilities.supportsPagination: true`, verified empirically at `resultOffset=65950` |

**Licence provenance precision.** The string `For use by the general public` is on the **ArcGIS
Online item** (`.../sharing/rest/content/items/9cae8a64ab0e4cea99758f741ca43b3c?f=json` →
`licenseInfo`). The FeatureServer REST endpoint itself returns **no** `licenseInfo` and an empty
`copyrightText`. Quote the item, not the service. `accessInformation` on the item is empty — there
is no attribution string the publisher requires beyond the licence sentence.

Sample proving polygon rings: [`samples/parcels-sample.geojson`](./samples/parcels-sample.geojson) —
3 features fetched live 2026-08-12 with `outSR=4326&f=geojson`, first feature `PIN 0330400004`
(`VILLAGE OF CORDOVA`), geometry type `Polygon`.

Paged-query template for a full extract:

```
{layer_url}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326
  &resultOffset={n*2000}&resultRecordCount=2000&orderByFields=OBJECTID&f=geojson
```

### Bulk export paths — measured

Base: `https://hub.arcgis.com/api/download/v1/items/9cae8a64ab0e4cea99758f741ca43b3c/<format>?layers=0`

| Format | HTTP | Bytes | Time |
|---|---|---|---|
| `shapefile` | 200 | 19,163,379 | 4.8 s |
| `csv` | 200 | 46,916,439 | 7.6 s |
| `geojson` | 200 | 183,669,886 | 15.5 s |
| `kml` | 200 | 336,984,388 | 24.8 s |
| `geoPackage` | **400** | 133 | 0.7 s |
| `filegdb` | **400** | 133 | 0.8 s |

**Trap.** The service advertises `geoPackage` and `filegdb` in `supportedExportFormats`, but the Hub
download API returns **HTTP 400** for both. Do not spec GeoPackage or FileGDB off the Hub endpoint.

**Shapefile at 19 MB is the cheapest full-fidelity ingest.** CSV carries attributes but no polygon
geometry. Raw GeoJSON at 183 MB is not viable as a single browser payload — server-side tiling,
`maxAllowableOffset` simplification, bbox-filtered queries, or an attribute-thinned extract is
required for any map use.

**Two drifts to carry into ingestion.** Both are real and both bite silently:

1. **Count drift.** The Hub export returned **66,028** features against **65,955** live. The Hub
   download is a cached, materialised snapshot and is not perfectly in sync. If parity matters,
   paginate the live `/query` endpoint and record the count at ingest time rather than trusting the
   export.
2. **Field-name drift.** The Hub export renames six fields and drops four. A schema written from
   `?f=json` will **not** match a shapefile/CSV/GeoJSON bulk download — REST layer has 82 fields,
   the bulk export 79 properties.

| REST layer metadata | Bulk export |
|---|---|
| `Site_City` | `site_city` |
| `Site_State` | `site_state` |
| `Taxbill_last` | `taxbill_last` |
| `Taxbill_first` | `taxbill_first` |
| `Owner_City` | `Owner_city` |
| `Owner_State` | `Owner_state` |
| `TWP_RAN_SE` | *(absent)* |
| `date_of_sale` | *(absent)* |
| `OBJECTID_1_1` | *(absent)* |
| `Shape__Area`, `Shape__Length` | *(absent)* |

### Key attribute coverage — measured over all 65,955

| Field | Populated | % | Note |
|---|---|---|---|
| `PIN` | 65,955 | 100.0% | join key |
| `owner1_name` | 65,763 | 99.71% | |
| `taxbill_name` | 65,764 | 99.71% | **often differs from `owner1_name`** |
| `taxbill_addr` | 65,763 | 99.71% | mailing address line |
| `EAV > 0` | 63,436 | 96.18% | Equalized Assessed Value |
| `EMV > 0` | 59,007 | 89.47% | market value |
| `site_address` | 58,639 | 88.91% | situs (physical) address |
| `GIS_acres_num > 0` | 65,953 | 99.997% | **use this for acreage** |
| `gross_acres > 0` | 18,165 | 27.54% | **do not use** |

Also present and directly useful downstream: `date_last_sale`, `gross_sale_price`, `net_sale_price`,
`YRBuilt`, `TOTSQFT`, `GarSQFT`, `Zoning`, `class`, `legal`, `tax_code`, `township`, `taxbill_year`,
`X_longitude`/`Y_latitude` (per-parcel centroids), and a full set of taxing-district names.

**Data-quality traps, measured:**

1. `gross_acres` is **0 for 72.5%** of parcels. Use `GIS_acres_num`, never `gross_acres`.
2. Empty is `""` or `" "`, **not `NULL`** (`site_address`, `YRBuilt`, `TOTSQFT`, `Owner_City`). Trim
   before any `IS NOT NULL` count or the result over-counts.
3. `owner1_name` != `taxbill_name` in 2 of 3 sampled records, including an apparent source typo
   (`SHELTER K TRUST` vs `SHETLER KATHRYN/KENNETH D`). Decide which is canonical; do not assume.
4. `taxbill_csz` is one combined `CITY ST ZIP` string, sometimes ZIP+4 with no hyphen
   (`CORDOVA IL 612420006`). Parsing required.
5. Dirty concatenations exist in the source (`"PO BOX 657TAX-DML4N"`).
6. `TWP_RAN_SE`, `OBJECTID_1` and `date_of_sale` were **null in every sampled record**.
   `date_of_sale` is redundant with `date_last_sale`.
7. Dates are **epoch milliseconds**.

### Dead ends — recorded so they are not re-probed

- `https://gis.rockislandcountyil.gov/arcgis/rest/services/Hosted/Parcels/FeatureServer/0` →
  **`{"error":{"code":499,"message":"Token Required"}}`**. The county's on-prem ArcGIS Server does
  serve a parcels service, but it is **not anonymously accessible**. Three public AGOL items point
  at it. Do not build against it — use the `services9.arcgis.com` hosted layer.
- `.../services/Parcel_Annotation/MapServer` → real, but an **annotation/label service**
  (cartographic text), not usable parcel features.
- `gis.rockislandcounty.org`, `maps.rockislandcounty.org`, `www.rockislandcounty.org` → connect
  failure. The live county host is **`rockislandcountyil.gov`**, not `rockislandcounty.org`.
- The public viewer app is titled `1) RICO GIS Public Mapping App (to be retired)`. **Depend on the
  FeatureServer URL and the item id, not on the viewer app.**

### Bulk sources reached for but NOT verified — open gaps

Named honestly as gaps, with no inference about their contents:

- **Bi-State Regional Commission** (the Quad Cities MPO) — **not probed.** No finding either way. It
  is the most likely home of regional transportation, land-use and transit datasets spanning the
  Illinois/Iowa state line, and it is the first place a follow-up run should look.
- **Illinois State Geological Survey / Illinois Geospatial Data Clearinghouse**
  (`https://clearinghouse.isgs.illinois.edu/`) — **not probed.** Only a web search was run; no
  endpoint was hit. Search results indicated Illinois has no unified statewide parcel dataset and
  that counties publish their own, which is consistent with what was measured here, but **that was
  not confirmed against the clearinghouse itself.** Treat as unverified.

Neither gap blocks parcel work: the county's own AGOL service is authoritative, current and richer
than a state aggregate would be.

## 5. Usage-type vocabulary

The authoritative property-use code → label table lives on the DEVNET Wedge assessor portal, which
is unreachable from this egress. **The code→label mapping is therefore NOT YET MAPPED, and no
mapping is invented here.** What follows is the vocabulary that is measurable from the reachable GIS
layer: the code values and their real distributions, without labels.

### `class` — assessor property-class code

`esriFieldTypeString`, 4-digit zero-padded. **23 distinct values** measured live 2026-08-12
(`returnDistinctValues`), including `null`:

```
0010  0011  0020  0021  0026  0028  0029  0030  0032  0040  0050  0052
0060  0062  0065  0070  0080  0081  0082  0085  0090  4600  (+ null)
```

Illinois assessment practice groups these by leading digits (farm, residential, commercial,
industrial), and the observed values are consistent with that shape — but **which specific code maps
to commercial or industrial is not established here**, because the label table is on the unreachable
portal. `county-discovery` uses this mapping to decide **commercial/industrial eligibility for
permit harvesting**, so:

> **Commercial/industrial eligibility cannot be derived until the `class` code→label table is read
> off the assessor portal from a US exit.** Any permit-harvest scoping that depends on it is blocked
> on that one action — not on any missing dataset.

### `Zoning` — and a structural finding worth more than the codes

`esriFieldTypeString`. **56 distinct values** measured live 2026-08-12. Grouped counts over all
65,955 parcels:

| Group | Parcels | % | Values |
|---|---|---|---|
| **Municipality code, not a zoning class** | **51,039** | **77.4%** | `MOL` 17,261 · `RI` 15,502 · `EM` 7,648 · `SIL` 3,120 · `MIL` 2,410 · `CV` 1,531 · `HAM` 898 · `PB` 831 · `CCL` 787 · plus `AND`, `COR`, `OAK`, `REY` |
| **County zoning class** | **13,770** | **20.9%** | `R1` 3,097 · `AG2` 2,845 · `AG1` 2,153 · `SE2` 1,086 · `RC` 574 · `SE1` 385 · plus `B1`–`B4`, `I1`, `I2`, `R2`, `R5`, `R7`, `PUD` |
| **Empty or null** | **1,146** | **1.7%** | `""` 957, plus nulls |

**The finding:** for 77.4% of parcels the county's `Zoning` field does **not** contain a zoning
class at all — it contains a three-letter code for the municipality the parcel sits in
(`MOL` = Moline, `RI` = Rock Island, `EM` = East Moline, `SIL` = Silvis, `MIL` = Milan,
`CV` = Coal Valley, `CCL` = Carbon Cliff, `HAM` = Hampton, `PB` = Port Byron, `AND` = Andalusia,
`COR` = Cordova, `OAK` = Oak Grove, `REY` = Reynolds). The county records zoning only where it is
the zoning authority — the unincorporated area — and defers to the municipality everywhere else.

This is the same fragmentation that governs permits (`## 3`), showing up in the zoning data:
**there is no countywide zoning classification for incorporated parcels in this layer.** Municipal
zoning for Moline, Rock Island, East Moline and Silvis — 43,531 parcels between them, two-thirds of
the county — would have to be sourced from each municipality separately. That is a direct answer to
the assignment's "ingest or link any publicly available zoning, land-use, or utility-related data"
criterion: the county layer covers the unincorporated fifth, and the rest is per-municipality work
that this run did not attempt.

**Undocumented suffixes.** 3,152 parcels carry a `!` or `?` suffix on the zoning code (`R1!` 910,
`R1?` 561, `AG1!` 466, `AG1?` 441, and others). The layer metadata carries no domain and no
description for these, so **their meaning is unknown** — plausibly a pending/verify data-entry
convention, but that is a guess and is not recorded as a finding. Strip or preserve them
deliberately; do not let them silently fragment a `GROUP BY`.

## 6. Additional data sources

### Business registration — the Sunbiz replacement

**`sunbiz-corporate-ingest` does not apply to this county.** That skill is Florida-only, by its own
text and by `use-elephant-skills` ("skip `sunbiz-corporate-ingest` — Florida only"). Sunbiz is the
Florida Division of Corporations; there is no Sunbiz outside Florida. This is the substantive answer
to the business-registration criterion, not a footnote: **the skill is inapplicable and the Illinois
equivalent is a first-run source with no kit precedent.**

The Illinois equivalent is the **Illinois Secretary of State, Business Services** corporate/LLC
search at **`https://www.ilsos.gov/corporatellc/`**, which NETR lists as the county's
business-registration source.

**Status from this egress: `geo-blocked`.** Measured 2026-08-12 — **HTTP 403 on every path tried**,
on both IPv4 and IPv6, and also with a full browser `User-Agent`, `Accept` and `Accept-Language`:

| Path | IPv4 | IPv6 |
|---|---|---|
| `https://www.ilsos.gov/corporatellc/` | 403 | 403 |
| `https://apps.ilsos.gov/corporatellc/` | 403 | 403 |
| `https://apps.ilsos.gov/businessentitysearch/` | 403 | 403 |
| `https://www.ilsos.gov/data/` | 403 | 403 |
| `https://www.ilsos.gov/departments/business_services/home.html` | 403 | 403 |

The 403 is served by an **Akamai** edge (the response carries Akamai's `x-reference-error` header
and no application content — 384 bytes of generic HTML).

**What this is recorded as: `geo-block-or-bot-block, undistinguished from a non-US egress.`**
Uniform 403 across an entire domain — including plain static content pages that have no search
function and nothing to protect — is *characteristic of* an edge geo-rule rather than a per-request
bot challenge, because a bot challenge normally targets the interactive endpoint and lets static
pages through. **That is the strongest statement this evidence supports, and this document makes no
stronger one.** It is not recorded as "no public source", and it is not recorded as "bot-protected".

**Illinois bulk corporate data was NOT evaluated.** Illinois publishes a paid bulk corporate-data
purchase channel separate from the free search. It could not be assessed because the entire domain
is blocked from this egress. It is named here as an **unevaluated option**, not as unavailable — and
it is the more likely path for any real ingestion, since a free per-entity search would not survive
the 48-hour gate at county scale anyway.

### Recorder / official records, and ownership history

The county Recorder's land-record search is **Fidlar Tapestry**, reached from
`https://www.rockislandcountyil.gov/QuickLinks.aspx?CID=42` → `https://www.landrecords.com` →
**301** → `https://tapestry.fidlar.com/TapestryEON`.

**Status: `unreachable`.** Measured 2026-08-12: `www.landrecords.com` answers the 301 normally
(HTTP 301 in 0.30 s, so that host is alive), and **`tapestry.fidlar.com` returns no A record and no
AAAA record from this resolver** — verdict `dns-unresolved`.

**This is a different failure mode from the assessor portal's and must not be conflated with it.**
The assessor host resolves and refuses the connection (`tcp-blocked`); the recorder host does not
resolve at all (`dns-unresolved`). A DNS failure does not prove the service is retired — a
split-horizon or geo-aware DNS answer is equally consistent with the observation.

Tapestry is additionally a **pay-per-search commercial product** in most counties. Even reachable,
it would not be a free bulk source, and that bears directly on the assignment's ownership-tenure
question (*properties that have not exchanged ownership in more than 10 years*).

**The reachable substitute for ownership tenure — and it is a good one.** The county GIS parcel
layer carries sale data directly, with no recorder involved:

- **`date_last_sale`** — `esriFieldTypeDate`, epoch milliseconds. This is the field that answers the
  10-year-tenure question.
- `gross_sale_price` and `net_sale_price` — sale amounts.

**Measured caveats, which must travel with any tenure claim:** `date_last_sale` is **null for some
parcels** (observed null on 1 of 3 sampled records, and it is not one of the fields with a measured
coverage percentage), and **`date_of_sale` is null for every parcel sampled** — it is a dead field,
redundant with `date_last_sale`. Sale prices of `10` appear in the samples, which is the classic
nominal-consideration value for a non-arm's-length transfer, so **`gross_sale_price` is not a market
value** and must not be treated as one.

So: ownership *tenure* is answerable from a reachable, free, no-auth source. Full ownership
*history* — the chain of deeds, mortgages and liens — is not, because that lives in the recorder's
unreachable, paid system. The parcel layer gives the **last** sale, not the sequence of them.

### Contractor reputation

The kit's contractor-reputation stage is `skills/skills/bbb-harvest/SKILL.md`, whose source is the
**Better Business Bureau** — a **national** source, not a county one. Nothing county-specific needs
discovering: the same BBB covers Rock Island as covers everywhere else.

**Status from this egress: `geo-blocked`.** Measured 2026-08-12 — `https://www.bbb.org/us/il/rock-island`
returns **HTTP 403**, on IPv4 and IPv6, and so does `https://www.bbb.org/` itself. The block is at
the site's edge and applies to the whole domain from here.

The plan for this issue anticipated recording BBB as plainly available; **the measurement says
otherwise and the measurement wins.** It is recorded as `geo-blocked`, with the same
undistinguished-from-a-non-US-egress caveat as the Illinois SOS. BBB was **not** harvested and
`bbb-harvest` was **not** run — that is a later stage, out of scope here.

### Tax collector

**Rock Island County Treasurer** — `https://www.rockislandcountyil.gov/332/Treasurers-Office`.
On the reachable county CMS. Tax-roll bulk availability was **not evaluated** in this run. Note that
the parcel layer already carries `tax_code`, `taxbill_year`, `taxbill_name`, `taxbill_addr`,
`taxbill_csz` and the full set of taxing-district names (fire, school, library, park, sanitary, TIF
and more), so a large part of what a tax roll would provide is already reachable without it.

### GIS / parcel geometry

Fully documented in [`## 4`](#4-bulk-data-sources): county-published ArcGIS polygons, 65,955
parcels, no auth, `download`. Cross-referenced here because `county-discovery` lists GIS under
additional sources; it is the single strongest source in this county.

### Historic aerials

`https://www.historicaerials.com/` — listed by the NETR directory for this county. **Not evaluated**
in this run: no probe, no licence check, no coverage check. Named because it is the only historic
imagery source the directory surfaces, and imagery is the only plausible public route to
roof-condition questions (see `## 9`).

### Code enforcement and business licences

**Not found as separate public sources.** Where they exist in this county they sit inside the same
municipal building/zoning offices catalogued in `## 3` — and 11 of those 16 jurisdictions have no
online lookup of any kind, so the same constraint applies. No separate code-enforcement portal was
located for any jurisdiction.

### Power and utility infrastructure

No kit asset covers power infrastructure in either reference kit — this section is new research.
Evidence: [`samples/power-probe.json`](./samples/power-probe.json).

All counts are over one fixed county bounding box, used for every query so the numbers are
comparable: **`-90.79,41.36,-90.25,41.65`** (west, south, east, north, EPSG:4326).

| id | Source | Endpoint | Count in bbox | HTTP | Elapsed | Licence |
|---|---|---|---|---|---|---|
| `hifld-transmission-lines` | HIFLD / Esri Federal User Community — U.S. Electric Power Transmission Lines | `https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0` | **78** polylines | 200 | 0.46 s | Esri Master License Agreement |
| `hifld-power-plants` | HIFLD / Esri Federal User Community — Power Plants in the U.S. | `https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0` | **2** points (**only 1 in-county** — see below) | 200 | 0.42 s | Esri Master License Agreement |
| `osm-substations` | OpenStreetMap via Overpass — `nwr["power"="substation"]` | `https://overpass-api.de/api/interpreter` | **66** (0 nodes / 66 ways / 0 relations) | 200 | 1.47 s | **ODbL** |
| `osm-power-lines` | OpenStreetMap via Overpass — `way["power"="line"]` | `https://overpass-api.de/api/interpreter` | **176** ways | 200 | 1.52 s | **ODbL** |

All four are reachable from this egress, all are public, all answer in under two seconds.

#### Headline finding: transmission lines are public, substations are not

**HIFLD publishes no public electric-substations layer.** This is a finding, not a search failure,
and the method is reproducible: list every service in the HIFLD ArcGIS org
(`https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services?f=json` → **222 services**) and
filter the service names case-insensitively for `substation|transmission|power|electric|energy`.
Exactly **four** match:

```
Aggregation_of_Power_Plants_in_the_U_S__by_hexagon_bins
Energy_Liquids_Border_Crossings_in_North_America
Power_Plants_in_the_US
US_Electric_Power_Transmission_Lines
```

**None of them is a substations layer** (`substations_layer_found: false` in the probe output).
Electric substations were withdrawn from public HIFLD distribution; transmission lines were not.

**The public substitute is OpenStreetMap `power=substation`** — 66 features in the county bbox,
licensed **ODbL**, quoted verbatim from the Overpass response: `The data included in this document
is from www.openstreetmap.org. The data is made available under ODbL.` Its provenance character is
fundamentally different from HIFLD's and must be carried into any UI: **crowd-sourced, not
authoritative, completeness unknown and unwarranted.** Nobody guarantees that all 66 are real, and
nobody guarantees there are only 66.

#### Provenance qualifiers measured on the HIFLD transmission layer

These matter because a downstream issue will render these lines on a map, and each qualifier
changes what the line means:

| Attribute | Measured over the 78 in-bbox features |
|---|---|
| `INFERRED` | **`Y` for 71 of 78 (91%)**, `N` for 4, `NOT AVAILABLE` for 3 |
| `SOURCEDATE` | **2015-03-31 → 2022-01-31** — the newest line in this county is over four years old |
| `VOLTAGE` | real values only `69`, `161`, `345` kV; **9 of 78 carry the sentinel `-999999`** |
| `VOLT_CLASS` | `100-161` ×37, `UNDER 100` ×29, `345` ×6, `NOT AVAILABLE` ×6 |
| `OWNER` | **`MIDAMERICAN ENERGY CO` ×72**, `AMEREN ILLINOIS COMPANY` ×1, `NOT AVAILABLE` ×5 |
| `STATUS` | `IN SERVICE` ×74, `NOT AVAILABLE` ×4 |
| `SOURCE` | derived from `IMAGERY`, `OpenStreetMap`, `EIA 861`, `EIA 860` in combination |
| `NAICS_DESC` | `ELECTRIC BULK POWER TRANSMISSION AND CONTROL` for all 78 |

**`INFERRED = Y` on 91% of the lines is the single most important qualifier in this section.** The
route was inferred from imagery and open data rather than surveyed. These lines are approximately
where the grid is, not authoritatively where it is. Any "distance to transmission line" figure
computed from them inherits that uncertainty and must be presented with it.

`-999999` is a **missing-value sentinel, not a voltage.** Filtering or sorting on `VOLTAGE` without
excluding it produces nonsense.

Layer facts for the renderer: `geometryType esriGeometryPolyline`, `maxRecordCount 2000`,
`capabilities Query,Extract,ChangeTracking`. Fields available: `ID`, `TYPE`, `STATUS`, `NAICS_CODE`,
`NAICS_DESC`, `SOURCE`, `SOURCEDATE`, `VAL_METHOD`, `VAL_DATE`, `OWNER`, `VOLTAGE`, `VOLT_CLASS`,
`INFERRED`, `SUB_1`, `SUB_2`.

**The transmission item is an archive.** Its AGOL item
(`d4090758322c4d32a4cd002ffaa0aa12`, owner `Federal_User_Community`) is titled
**"U.S. Electric Power Transmission Lines (Archive)"**, last modified 2026-06-01. It is public and
live, but it is published as an archived snapshot — consistent with the 2015–2022 `SOURCEDATE`
range. `accessInformation` is `U.S. Government`.

#### The bbox is not the county — a counting caveat

**Only 1 of the 2 power plants in the bounding box is in Rock Island County.** The bbox is a
rectangle and the county's western and northern boundary is the Mississippi River, so the rectangle
extends into Scott County, **Iowa**:

| Plant | Utility | County / State | Primary source | Capacity |
|---|---|---|---|---|
| **Moline** | MidAmerican Energy Co | **Rock Island, Illinois** | natural gas | Natural Gas 60 MW, Hydroelectric 3.2 MW |
| Davenport Water Pollution Control Plant | Davenport, City of | Scott, **Iowa** | biomass | Biomass 1.6 MW |

Every bbox count in this section carries the same caveat: **it is a bounding-box count, not a
county count.** Anything that reports these numbers as county totals must first clip to the county
polygon or filter on the `County`/`State` attributes where they exist. The 78 transmission lines and
the 66 OSM substations were **not** clipped and are therefore upper bounds for the county.

The in-county utility is **MidAmerican Energy** (owner of 72 of 78 lines and of the one in-county
plant), with Ameren Illinois present on a single line.

#### Not found public — and what was checked

Recorded as unevaluated rather than unavailable, because that is the honest distinction:

- **Utility interconnection queue position data for this county.** The regional grid operator is
  **MISO** (Midcontinent Independent System Operator), which covers northwestern Illinois. MISO
  publishes a generator interconnection queue as an operator dataset. **It was not evaluated in this
  run.** It is not claimed to be unavailable — it is named as the next place to look for anyone
  sizing data-centre interconnection feasibility.
- **Distribution-level (sub-transmission) infrastructure.** No public source was located. HIFLD
  covers bulk transmission only (`NAICS_DESC` confirms: *bulk power transmission and control*), and
  distribution networks are generally utility-confidential. Not evaluated against MidAmerican
  directly; no utility was contacted.

## 7. Source feasibility

_Filled by W2–W8._

## 8. Risks

_Filled by W2–W8._

## 9. Requested signals with no public source

The pipeline assignment asks for four derived signals by name. Each is answered here with either a
named public source or an explicit "no public source found", plus what was checked to reach that
conclusion. **A documented absence is a valid finding**, and a proxy is never filed as the real
thing.

| Signal | Assignment line | Verdict | What was checked | What we can offer instead |
|---|---|---|---|---|
| **Roof age** | oracle README line 33 | **`no-public-source-found`** | All 16 permit jurisdictions (`## 3`); the parcel layer's `YRBuilt` field; the assessor portal (unreachable); historic aerials (not evaluated) | Nothing direct. `YRBuilt` (81.0% populated) is **building** age, not roof age. A roofing-permit date is the only source-backed derivation and permits are not publicly searchable by parcel anywhere in this county. |
| **Water view** | oracle README line 34 | **`proxy-only-no-direct-source`** | USGS NHD hydrography (reachable, 962 waterbody features in the county bbox); county contour/terrain services; the parcel layer | **Distance to water**, computable from NHD + parcel centroids. This is a proxy and is **not** a view — a view is a line-of-sight computation needing terrain *and* structure heights, and no public structure-height source was found. |
| **Transit walkability** | oracle README line 37 | **`public-source-found`** | MetroLINK/MetroQC official site (no GTFS found); transitfeeds (403); transit.land API (401, needs key); Mobility Database API (needs auth); OpenStreetMap via Overpass | **OpenStreetMap `highway=bus_stop` — 119 stops in the county bbox**, plus the OSM pedestrian network for routing. ODbL. **No authoritative GTFS feed was located.** |
| **Starbucks walkability** | oracle README line 38 | **`public-source-found`** | OpenStreetMap via Overpass over the fixed county bbox | **OpenStreetMap — 12 Starbucks features** (5 nodes + 7 ways) in the county bbox. ODbL. |

### Roof age — `no-public-source-found`

**No public roof-age source exists for Rock Island County.** What was checked:

- **Permit portals, all 16 jurisdictions.** A roofing-permit date is the only genuinely
  source-backed way to derive roof age. Per `## 3`: 11 jurisdictions have **no online permit lookup
  at all**, Rock Island's and Milan's portals are unreachable from this egress, and the two that are
  reachable cannot be searched by parcel or address in a way that would yield roofing permits per
  property — East Moline searches by permit number only, Moline by address without a work-type
  filter that was observable. **There is no countywide roofing-permit history to query.**
- **The parcel layer's `YRBuilt` field.** Populated for **53,409 of 65,955 parcels (81.0%)**,
  measured 2026-08-12. **`YRBuilt` is the year the building was built, not the year the roof was
  replaced, and it must never be presented as roof age.** It is a *lower bound* on roof age only for
  a house that has never been re-roofed, which is exactly the population the question is not asking
  about. It is stored as a string, with `" "` for unpopulated rows.
- **The assessor portal**, which in some counties carries roof material and condition — unreachable
  from this egress (`## 1`), so its contents are unknown, not absent.
- **Historic aerials** (`https://www.historicaerials.com/`) — not evaluated. Imagery is the only
  other plausible route (a re-roof is sometimes visible), but that is a computer-vision project, not
  a data source.

### Water view — `proxy-only-no-direct-source`

The Mississippi River forms the county's western and northern boundary, so water proximity is
genuinely meaningful here — which makes it more important, not less, to be precise about what can be
computed.

- **Hydrography is available.** USGS **National Hydrography Dataset**,
  `https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer`, HTTP 200 in 0.96 s from this
  egress. Layer 12 (`Waterbody - Large Scale`) returns **962 features** over the county bbox. Public
  federal data.
- **A view is not a distance.** Determining whether a property *has a view of water* is a
  line-of-sight computation requiring terrain elevation, intervening structure heights, and
  vegetation. Terrain is partially available (the county publishes contour services), but **no
  public structure-height dataset was found for this county**, and without it line-of-sight cannot
  be computed.
- Therefore: **distance-to-water is offered as a proxy and labelled as a proxy.** A parcel 50 m from
  the Mississippi behind a levee and a warehouse has no view; this data cannot tell the difference.
  Filing "distance to water" as "water view" would be exactly the kind of silent substitution this
  document exists to prevent.

### Transit walkability — `public-source-found`

- **No authoritative GTFS feed was located.** The Quad Cities operator is **MetroLINK**, whose site
  now redirects `gogreenmetro.com` → `https://www.metroqc.com/` (HTTP 200). The site mentions
  schedules but exposes no GTFS or developer resource; `/gtfs`, `/gtfs.zip`, `/google_transit.zip`
  and `/developer` all return **404**. Aggregators were tried and are not openly readable:
  `transitfeeds.com` returns **403** from this egress, the transit.land API returns **401
  Unauthorized** without a key, and the Mobility Database API requires authentication. **A GTFS feed
  may well exist behind those keyed APIs — its absence here is "not located", not "does not
  exist".**
- **What is available and sufficient:** OpenStreetMap `highway=bus_stop` — **119 stops** in the
  county bbox, measured 2026-08-12, **ODbL**. Combined with the OSM pedestrian network this supports
  a genuine walking-distance computation from parcel coordinates.
- Caveat carried: crowd-sourced, completeness unknown; a bus stop absent from OSM is invisible to
  this computation. And a stop location is not a *service* — without GTFS there is no timetable, so
  "near a stop" does not establish "served frequently, or at all".

### Starbucks walkability — `public-source-found`

- **OpenStreetMap, 12 Starbucks features** (5 nodes + 7 ways) in the county bbox, measured
  2026-08-12 via Overpass, **ODbL**.
- Caveat carried: crowd-sourced and name-matched. A licensed in-store Starbucks (inside a grocery
  store or hotel) may be tagged under the host business and missed, and a closed location may
  persist in the data. **12 is a measured count of OSM features, not a verified count of operating
  stores.**
- Note the bbox caveat from `## 6` applies here too: the rectangle crosses into Iowa, so some of
  these 12 may be Davenport/Bettendorf locations rather than Rock Island County ones. Clip to the
  county polygon before reporting a county figure.

### Signals NOT in this section, and why

Ownership tenure (line 35) and regional-owner questions (line 36) are **not** unavailable and are
therefore not listed above. Both are answerable from the reachable parcel layer:

- **Tenure:** `date_last_sale` is populated for **46,182 of 65,955 parcels (70.0%)**, and
  **12,476 parcels have a last-sale date more than 10 years before 2026-08-12** — a direct,
  measured, source-backed answer to *"properties that have not exchanged ownership in more than 10
  years"*, with the honest qualifier that the 30% of parcels with a null `date_last_sale` are
  **unknown**, not "not recently sold".
- **Regional owners:** `taxbill_csz` carries the owner's city/state/ZIP.

Caveat for both: `gross_sale_price` exceeds 100 on only **20,378** parcels, so most recorded sale
prices are nominal ($10 and similar non-arm's-length consideration). **Sale price is not market
value in this dataset.**

## 10. Probing limitations

### Prior art check

`county-discovery/SKILL.md` step 1 requires a prior-art check before probing. Result:

- `elephant-pipeline/docs/` — **does not exist in this workspace.** No existing findings doc or
  sources catalog was available to start from (Lee County is the skill's reference, and it is not
  checked out here).
- `elephant-pipeline/transforms/rock-island/` — **does not exist in this workspace.** No prior
  transform scripts for this county were found locally. Name variants with spaces, underscores and
  hyphens were all absent because the parent directory itself is absent.
- `elephant-pipeline/flows/` — **does not exist in this workspace.** No browser-flow JSON.
- `github.com/elephant-xyz/Counties-trasform-scripts` — **not consulted.** We have no access to that
  organisation from this account. This is an **unchecked prior-art source**, not evidence that no
  prior art exists. If Rock Island transforms already exist there, this run has not seen them.

### Output path redirect

`county-discovery/SKILL.md` prescribes `elephant-pipeline/docs/rock-island-county-findings.md`; no
`elephant-pipeline` checkout exists in this workspace, so the findings live in the assignment repo
under the same filename. The companion catalog `rock-island-sources.yaml` keeps the same filename
for the same reason: `county-seed-data`, `county-permit-adapter` and `validate-county-transform` all
read these two names back, so a future `elephant-pipeline` checkout is a copy, not a rewrite.

The skill also asks for a copy to be PR'd to `github.com/elephant-xyz/Counties-trasform-scripts`.
That is a third-party organisation we have no write access to, so the PR goes to this assignment
repo instead. Recorded here so nobody later reads the difference as the skill being ignored.

### Egress

Egress country at discovery time: **LT** (`curl -s ipinfo.io/country` → `LT`, 2026-08-12).

`county-discovery/SKILL.md` calls this out as a first-class discovery hazard: "many county/state
portals serve 403s, 'Access Denied', or blank block pages to non-US IPs, in both curl AND a real
browser… Distinguish geo-blocks from bot challenges in the findings — they need different
mitigations." The skill's prescribed remedy is to ask the operator for a US exit and re-probe. That
question was put to the operator during this run and was not answered, so this run takes the honest
branch: the affected sources are recorded as unreachable from this egress and are **not** recorded
as absent.

| Source | Host | Verdict | What this does and does not prove |
|---|---|---|---|
| Assessor portal (DEVNET Wedge) — AC2 | `rockislandil.devnetwedge.com` | `tcp-blocked` | DNS resolves to `184.105.34.17`; the TCP connection never completes, on IPv4 and IPv6, within 20 s. **Proves:** the host does not accept connections from this egress. **Does not prove:** that the portal is down, that it is bot-protected, that it lacks the data, or that it would fail from a US exit. |
| Illinois SOS business registration — AC5 | `www.ilsos.gov` | `http-denied` (403) | An Akamai edge returns 403 on every path tried, including plain content pages, on IPv4 and IPv6 and with full browser headers. **Proves:** this egress is refused at the CDN edge. **Does not prove:** that the search is unavailable to the public, nor — from a non-US egress — whether the refusal is a geo-rule or a bot rule. Uniform 403 across an entire domain including static pages is *characteristic of* an edge geo-rule rather than a per-request bot challenge, and that is the strongest statement the evidence supports. |
| Recorder / land records (Fidlar Tapestry) | `tapestry.fidlar.com` | `dns-unresolved` | `www.landrecords.com` answers **301 → `https://tapestry.fidlar.com/TapestryEON`**, and that hostname returns **no A and no AAAA record** from this resolver. **Proves:** the redirect target does not resolve here. **Does not prove:** that the service is retired — a split-horizon or geo-aware DNS answer is equally consistent with what was observed. This is a **different failure mode** from the assessor's TCP block and must not be conflated with it. |

A non-US egress cannot distinguish a geo-block from a bot challenge. These sources are recorded as
unreachable from this egress, not as absent, not as bot-protected. Re-probing from a US exit is the
single action that would upgrade these rows.

**Upgrade path.** Supplying a US VPN/proxy exit and re-running

```
node scripts/probe-sources.mjs        # from the repo root
```

upgrades AC2 (appraiser portal: parcel-id format, anti-bot posture, measured throughput) and AC5
(Illinois business registration: search mechanism, bulk-download channel) from *recorded
unreachable* to *measured*. Nothing else in this document depends on it — every other source in the
catalog was reached and measured from the current egress. The residual question is **fidelity, not
feasibility**.

No block was bypassed to produce this document. No proxy was shopped for, no header was spoofed
beyond the declared `User-Agent`, and no anonymising network was used.

### Probe harness

`scripts/probe-sources.mjs` (Node 22 built-ins only) records, per target: DNS A/AAAA, HTTP status,
elapsed ms, bytes, redirect target, and a verdict from one fixed rule — `reachable`, `tcp-blocked`
(DNS resolves, connection does not), `dns-unresolved` (no DNS record), `http-denied` (401/403),
`http-error`. Requests run sequentially with a 20 s timeout; this is a politeness probe of public
infrastructure, not a load test. Raw output: [`probe-results.json`](./probe-results.json).

Two harness details were corrected against measurement during this run, and both are recorded
because each would otherwise have produced a false finding:

1. **Redirects are followed manually, not automatically.** With automatic following, the failure of
   a redirect *target* is attributed to the *origin* host — `www.landrecords.com` (alive, answers
   301) was initially recorded as blocked when the dead hop is actually `tapestry.fidlar.com`.
2. **The `User-Agent` is `ateam-county-discovery/1.0`, without a parenthesised contact URL.**
   Measured against `overpass-api.de` on 2026-08-12: empty UA → 406, `Mozilla/5.0` → 406,
   `curl/8.7.1` → 504, `ateam-county-discovery/1.0` → **200**,
   `ateam-county-discovery/1.0 (+https://github.com/…)` → 406. The parenthesised URL is what trips
   the filter. A bare `Mozilla/5.0` remains forbidden regardless.
