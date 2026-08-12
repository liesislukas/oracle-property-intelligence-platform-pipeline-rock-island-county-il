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

_Filled by W2–W8._

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

_Filled by W2–W8._

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
