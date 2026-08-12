# Rock Island County (IL) — property transform

County slug `rock-island`. Source: the county GIS parcel layer, an open ArcGIS FeatureServer —
`https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0`
(AGOL item `9cae8a64ab0e4cea99758f741ca43b3c`, publisher *Rock Island County GIS*, licence
"For use by the general public"). 65,955 features, 82 fields, one row per parcel.

The county's DEVNET Wedge appraiser portal is TCP-blocked from this egress, so the orthodox
per-parcel portal lookup of `county-appraisal-onboarding` §1 is not reachable. The GIS layer
substitutes as the property source. That adaptation is named
`multi-request-flow-over-local-mirror` and is documented, not silent: one 33-page bulk pull
(`scripts/mirror-rock-island.mjs`) materialises `data/source-mirror/rock-island/<OBJECTID>.json`,
`scripts/serve-mirror.mjs` serves it on `127.0.0.1:8099`, and `flows/Rock-Island.json` points
`elephant-cli prepare --multi-request-flow-file` at that loopback endpoint. The county sees 33
requests, not 65,955, and the ingest run itself makes zero external requests.

## Which CLI path this is, and why

`@elephant-xyz/cli@1.58.1` ships **no** `--transform-version` and **no** `--transform-zip`, and
knows nothing of `captures.json` (deviation **D3**, evidence
`evidence/elephant-cli-surface.txt`). `transform --help` lists only `--output-zip`,
`--scripts-zip`, `--input-zip`, `--legacy-mode`, `--data-group`. So this is the **scripts path**,
which is what `county-appraisal-onboarding` §3 describes: `scripts/` holding `data_extractor.js`
plus the four mandatory mapping modules, zipped to `transform-scripts.zip` — the exact filename
`services/lib/parcel-steps.ts` resolves.

`transform-v2-builder`'s *rules* still bind and are honoured: skip-and-warn on unmapped codes,
never abort a whole county for one parcel, never prepend a street number to an address that has
one, minimal-change repair.

### Execution contract (read out of the installed package)

* each script is a plain Node process, **no arguments**, cwd = the CLI's temp WORKDIR;
* the prepared flow output lands at `./input.json`;
* entities and relationships are written into `./data/`;
* `ownerMapping.js`, `structureMapping.js`, `layoutMapping.js`, `utilityMapping.js` all run first,
  in parallel, and **all four must exist and exit 0**; `data_extractor.js` runs last;
* `./address.json` and `./parcel.json` are also written at WORKDIR root, because
  `handleDataGroupTransform` reads `source_http_request` / `request_identifier` from `address.json`
  there and copies `parcel.json` into `data/` afterwards;
* the CLI then auto-creates `relationship_property_<entity>.json` for each entity file it finds,
  stamps every entity with `source_http_request` + `request_identifier`, and builds the County
  data-group index file.

## Field map — source field → entity → target field

| Source field(s) | Entity (file) | Target field |
|---|---|---|
| `OBJECTID` | every entity | `request_identifier` (the pipeline key) |
| `PIN` | `property.json`, `parcel.json` | `parcel_identifier`, **verbatim** |
| `legal` | `property.json` | `property_legal_description_text` |
| `Zoning` | `property.json` | `zoning`, **verbatim incl. `!`/`?` suffix** |
| `YRBuilt` | `property.json` | `property_structure_built_year` (only when `^[0-9]{4}$`) |
| `TOTSQFT` | `property.json` | `total_area` (only when it holds 2+ digits) |
| `class` | — | **unmapped**: `property_usage_type` = `Unknown` (see below) |
| `site_address`, `site_csz` | `address.json` | `unnormalized_address` |
| `Site_City` / `Site_State` / `Site_Zip` | `address.json` | `city_name` / `state_code` / `postal_code` |
| `municipality`, `township` | `address.json` | `municipality_name`, `township` |
| `X_longitude`, `Y_latitude` | `address.json`, `geometry.json` | `longitude`, `latitude` |
| feature `geometry` | `geometry.json` | `polygon` (one flat ring of `{latitude, longitude}`) |
| `EAV` | `tax.json` | `property_assessed_value_amount` |
| `EMV` | `tax.json` | `property_market_value_amount` |
| `farm_land` + `non_farm_land` | `tax.json` | `property_land_amount` |
| `farm_building` + `non_farm_building` | `tax.json` | `property_building_amount` |
| `farm_land` + `farm_building` (when > 0) | `tax.json` | `agricultural_valuation_amount` |
| `taxbill_year` | `tax.json` | `tax_year` |
| `GIS_acres_num` | `lot.json` | `lot_size_acre` (**never `gross_acres`** — T4) |
| `date_last_sale` | `sales_history.json` | `ownership_transfer_date` (epoch ms → `YYYY-MM-DD`) |
| `gross_sale_price` | `sales_history.json` | `purchase_price_amount` |
| `owner1_name` | `company.json` | `name` (companies only — see the person gap) |
| `owner1_address1/2`, `owner1_csz`, `Owner_City/State/zip` | `mailing_address.json` | `unnormalized_address`, `city_name`, `state_code`, `postal_code`, `plus_four_postal_code` |
| `taxbill_name` | `company_taxbill.json` | `name` (companies only) |
| `taxbill_addr`, `taxbill_addr1/2`, `taxbill_csz`, `Taxbill_Zip` | `mailing_address_taxbill.json` | `unnormalized_address`, `postal_code`, `plus_four_postal_code` |
| 26 taxing-district name fields (`county`, `Jurisdiction`, `municipality`, `fire_district`, `library_district`, `library`, `community_college`, `grade_school`, `high_school`, `non_high_school`, `unit_school`, `hospital_district`, `mass_transit`, `airport`, `cemetery`, `conservation`, `drainage`, `forest_preserve`, `road_district`, `multi_township_district`, `park_district`, `sanitary_district`, `special_district`, `street_light_district`, `misc_district`, `tif_district`) | `tax_jurisdiction_<field>.json` | `jurisdiction_name`, `jurisdiction_type` |

Relationships written: `property_has_address`, `property_has_tax`, `property_has_lot`,
`property_has_sales_history` (auto-created by the CLI from the entity files),
`parcel_has_geometry`, `tax_has_tax_jurisdiction` (one per district),
`company_has_mailing_address`.

### Provenance on every record

`source_http_request` on every entity points at the **county** endpoint that serves that record —
`…/FeatureServer/0/query` with `where=OBJECTID=<id>`, `outFields=*`, `f=geojson`, `outSR=4326` —
never at the loopback mirror the run actually reads. The mirror is a byte copy of exactly that
query, and `data/source-mirror/rock-island/<OBJECTID>.json` carries `meta.retrievedAt`,
`meta.layerUrl`, `meta.licence` and `meta.pageOffset` for the pull that produced it.

## The seven measured traps and how each is handled

| # | Trap | Handling |
|---|---|---|
| T1 | `PIN` is not unique — 65,813 distinct over 65,955; 29 values repeat over 171 records; 126 records carry a non-numeric placeholder | The pipeline key is `OBJECTID`. `PIN` is carried verbatim as `parcel_identifier`. No record is collapsed. |
| T2 | Blanks are `""` or `" "`, never `NULL` | `txt()` trims first; `present()` tests the trimmed value. Nothing tests `!== null`. |
| T3 | Dates are epoch milliseconds | `epochDay()` → `YYYY-MM-DD` UTC. `null` stays absent. |
| T4 | `gross_acres` is 0 on 72.5% of parcels | `GIS_acres_num` only. `gross_acres` is never carried. |
| T5 | `date_last_sale` null on ~30% | No `sales_history` entity at all for those parcels — unknown tenure, never a placeholder date and never "long-held". |
| T6 | `Zoning` is a municipality code on 77.4% | Written verbatim, suffixes included. `zoning_is_municipality_code` is computed for the manifest against the fixed 13-code list, with a trailing `!`/`?` stripped for the test only. |
| T7 | `owner1_name` ≠ `taxbill_name` on 15,624 of 65,955 records (23.7%, measured over the whole layer — the discovery note's "~2/3" was not reproducible) | `owner1_name` is canonical. `taxbill_name` is never dropped: when it is a company it gets its own entity and its own mailing address, and the relationship asserts only "this company has this mailing address", never ownership. |

## Owner rule

`ownerMapping.js` exports `classifyOwner(name)` → `company` | `person` | `null`. Uppercase-trim,
then **company** when a whole word matches `LLC, INC, CORP, CO, COMPANY, LTD, LP, LLP, TRUST, TR,
ESTATE, BANK, CHURCH, ASSN, ASSOCIATION, PARTNERSHIP, FOUNDATION, MINISTRIES, SCHOOL, DISTRICT,
DEPT, AUTHORITY, COMMISSION, USA, STATE, CITY, VILLAGE, COUNTY, TOWNSHIP, RAILROAD`, or the name
starts `CITY OF`, `VILLAGE OF`, `COUNTY OF`, `STATE OF`, `UNITED STATES`; else **person**.
192 parcels carry no owner name at all and get no owner entity rather than a placeholder.

**Stated fallback:** when a company owner of record carries no address of its own
(`owner1_address*` blank), the address the county mails that parcel's tax bill to is used as its
mailing address, verbatim. It is never invented, and it is recorded here rather than applied
silently.

## Repair log — intended stem → accepted stem

Everything below was forced by the shipped lexicon, and each was the smallest change that made
validation pass. No entity was dropped to make validation pass.

| Intended | Accepted | Why |
|---|---|---|
| `property.source_payload` holding all 82 raw attributes | **removed** | the `property` schema is `additionalProperties: false`; there is no `source_payload` member. The 82 raw attributes stay verbatim in the mirror and in `capture.zip`. |
| `property_usage_type: "unmapped"` | `"Unknown"` | the schema's enum has no `unmapped`; `Unknown` is its own member for exactly this case. |
| `property_type` from the `class` code | `"LandParcel"` | the code→label table lives on the TCP-blocked portal. `LandParcel` is the neutral parcel-level enum member and is not an inference about any structure. |
| `person` entity for individual owners | **not emitted** | `person` requires Title-Cased, parsed `first_name`/`last_name`; this source publishes one ALL-CAPS combined string, often naming two people. Re-casing and splitting are inference, and `Do not clean, correct, re-case, pad or de-duplicate any source value` is binding. Recorded as a class-(c) lexicon gap. |
| `person_has_property` / `company_has_property` | **not expressible** | `createCountyDataGroup` in 1.58.1 has no branch that populates either edge, so an owner entity can only be linked through `company_has_mailing_address`. Recorded as a class-(c) gap. |
| `mailing_address` as its own class | an `address` entity | the lexicon has no `mailing_address` class; `company_to_address` is the relationship schema behind `company_has_mailing_address`. |
| `address.county_name` = `Rock Island` | **omitted** | the enum lists Florida and Texas counties only. Illinois has no member, and inventing one is not an option. The county is carried instead as a `tax_jurisdiction` entity (`ROCK ISLAND COUNTY`, type `County`). |
| structure / layout / utility entities | **not emitted** | the layer has no per-structure, per-room or per-service detail. The three mapping modules exist and exit 0, as the CLI requires. |
