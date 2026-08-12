# Open lexicon gaps — Rock Island County (IL) property ingest

Recorded by ISSUE-018 on 2026-08-12, per `validate-county-transform` step 5. The skill points at
`../elephant-query-db/docs/open-lexicon-gaps.md`; that sibling checkout does not exist here, so this
file is the recorded substitute.

Every gap below is class (c): the source publishes the value, the extractor reads it, and the
lexicon has nowhere to put it. Nothing is dropped from the delivery — each value stays verbatim in
`data/source-mirror/rock-island/<OBJECTID>.json` and in each parcel's `capture.zip`.

Expanding the lexicon is a separate, deliberate follow-up (the skill's line 44); nothing here was
worked around by inventing a field.

| # | Field(s) | Class | What is missing |
|---|---|---|---|
| 1 | `owner1_name`, `taxbill_name` for individuals | `person` | `first_name`/`last_name` are required, non-null, and must match `^[A-Z][a-z]*…`. Counties that publish one ALL-CAPS combined owner string, often naming two people, cannot be represented without re-casing and name-splitting — both inference. A single free-text `owner_name` member, as `company.name` already is, would close this. |
| 2 | ownership edge | County data group | `createCountyDataGroup` in `@elephant-xyz/cli@1.58.1` has no branch that populates `person_has_property` or `company_has_property`, although the County schema declares both. An owner entity can currently only be linked through `*_has_mailing_address`. |
| 3 | `RICO_PARCE`, `alternate_parcel_number` | `parcel` | no member for a legacy/alternate parcel identifier. |
| 4 | `class` (assessor class code) | `property` | `additionalProperties: false` and no raw-code member, so an unmapped county code cannot ride along beside `property_usage_type`. |
| 5 | `tax_code` | `tax_jurisdiction` | carries `jurisdiction_name`, not the county's taxing-code string. |
| 6 | `assessed_last` | `tax` | no assessment-date member. |
| 7 | `Taxbill_last`, `Taxbill_first` | `company` | only `name` exists. |
| 8 | `MODLNAME`, `GarSQFT` | `structure` | the class exists but this source has no per-structure breakdown, so nothing may be written without fabricating a structure. |
| 9 | `net_sale_price` | `sales_history` | one price member only (`purchase_price_amount`). |
| 10 | Illinois counties | `address.county_name` | the enum lists Florida and Texas counties only; `Rock Island` has no member. |
| 11 | multi-part polygons and interior rings | `geometry` | `polygon` is one flat ring of points. |
| 12 | `Shape__Area`, `Shape__Length`, `OBJECTID_1_1` | — | Esri internal metrics; arguably out of lexicon scope, listed for completeness. |
