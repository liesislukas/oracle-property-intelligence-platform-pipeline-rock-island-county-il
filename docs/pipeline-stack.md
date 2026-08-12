# Pipeline stack — Rock Island County, IL

Bootstrapped 2026-08-12 by driving `elephant-xyz/skills` `bootstrap-oracle-infra` and
`county-seed-data`. County slug: `rock-island` — the exact string, everywhere.

The stack is **local by design**. It is the ingestion runtime, not the delivered runtime. The
delivered runtime is the deployed pipeline explorer on Vercel; nothing in this document is ever
presented as a substitute for it.

## Stack

| Component | Version |
|---|---|
| Restate server | `restatedev/restate:1.7.2` (Docker), node name `restate-1` |
| Restate CLI | `restate-cli 1.7.3 (ad01516 aarch64-apple-darwin 2026-08-07)` |
| Postgres | `postgres:16` (Docker), database `elephant` |
| Node | `v25.9.0` |
| npm | `11.12.1` |
| `@restatedev/restate-sdk` | pinned `1.16.5` |
| `@elephant-xyz/cli` | `v1.58.1` (`git+ssh://git@github.com/elephant-xyz/elephant-cli.git#e6fa5b650955d40d2d7a00235e3b009423d91076`) |

Checkout root: `elephant-pipeline/`, alongside the assignment repo. It is a local git repo with no
remote and is never pushed — `data/` and `.env` are gitignored, so the seed CSV and the database URL
are not committed anywhere.

Ports, fixed by the skill and not remapped: 8080 Restate ingress, 9070 Restate admin + Web UI,
9080 the services process, 5432 Postgres.

**One deviation from the skill, recorded rather than left silent.** `bootstrap-oracle-infra`
prescribes a four-option `tsconfig.json` (`module`/`moduleResolution` `nodenext`, `target` `es2022`,
`strict`). With `@restatedev/restate-sdk@1.16.5` and `@types/node@26.2.0` that configuration fails
`tsc --noEmit` with four `TS2591` errors raised **inside the SDK's own `.d.ts` files**
(`dist/endpoint.d.ts`, `dist/node.d.ts`), not in any code we wrote. `"skipLibCheck": true` was added
to resolve it. It suppresses type checking of dependency declaration files only; our own sources are
still checked under `strict`.

## Registered deployment

```
$ restate deployments list
 DEPLOYMENT                         TYPE  ID                          CREATED-AT
 http://host.docker.internal:9080/  HTTP  dp_15ebajbuYcddZBtMbbRaKZz  Wed 12 Aug 2026 20:58:42 +03:00
```

**Zero pipeline services are authored yet, and that is the correct state for this stage.**
`bootstrap-oracle-infra` says so itself: *"`services/app.ts` starts as a stub endpoint binding no
services yet and listening on :9080"*. Restate accepted the zero-service deployment without
complaint, so no placeholder service was needed.

The services are authored by later issues: `CountyIngest`, `IngestChunk`, `Parcel` and
`services/lib/storage.ts` by ISSUE-030; the property ingest that drives them by ISSUE-018; the
permit services by ISSUE-019; `Publish` by ISSUE-022. Each re-registers the endpoint as it binds.

## Sibling repos

| Repo | Result |
|---|---|
| `elephant-xyz/Counties-trasform-scripts` | **Cloned successfully.** ISSUE-001 discovery recorded this repo as unreachable from this account; it is reachable now. It holds per-county transform scripts for **Florida counties only** — `alachua` through `volusia`. There is **no Rock Island, no Illinois, and no `_il`/`-il` directory of any kind**, which confirms discovery's finding that this county is a first run with no prior art. |
| `elephant-xyz/elephant-query-db` | **Cloned successfully.** Carries the query-DB schema, `migrations/`, and the loader scripts ISSUE-030 and ISSUE-021 drive. |

## Seed

| | |
|---|---|
| Output | `elephant-pipeline/data/seeds/rock-island.csv` (gitignored, never committed) |
| Rows | **65,955** plus the header line (65,956 lines) |
| Bytes | 20,338,523 |
| Pages | **33** live `/query` requests at 2,000 records per page |
| Duration | **23.602 s** wall clock for the paged pull |
| Source | `https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0` |
| Licence | `For use by the general public` — from AGOL item `9cae8a64ab0e4cea99758f741ca43b3c`, not the service |

The 25 columns, in order:

```
parcel_id, source_identifier, PIN, situs_address, RICO_PARCE, alternate_parcel_number,
owner1_name, owner1_address1, owner1_csz, taxbill_name, taxbill_addr, taxbill_csz,
GIS_acres_num, EAV, EMV, class, Zoning, YRBuilt, TOTSQFT, date_last_sale, gross_sale_price,
X_longitude, Y_latitude, municipality, township
```

Four columns are renamed from the source; every other column keeps the source's own spelling and
case, so provenance needs no mapping table:

- `parcel_id` ← `OBJECTID`, stringified
- `source_identifier` ← `OBJECTID`, stringified
- `PIN` ← `PIN`, verbatim
- `situs_address` ← `site_address`

**Why the key is `OBJECTID` and not `PIN`.** `county-seed-data` sanity check 3 assumes `parcel_id`
is unique. Measured over this pull, it is not: **65,813 distinct PIN values over 65,955 records — 29
values repeat across 171 records**, including placeholders such as `USA`, `CITY`, `RAILROAD` and
`LEVEE ROW`. That is real source behaviour, not corruption. Keying on `PIN` would silently collapse
142 real parcels — the same failure that collapsed ~31,242 Lee County parcels upstream. `OBJECTID` is
unique by construction and is the pipeline key end to end; `PIN` is carried verbatim and becomes
`parcel_identifier` downstream. No row was deduplicated, padded, renamed or dropped.

`gross_acres` is deliberately excluded — it is 0 for 72.5% of parcels. `GIS_acres_num` is the
acreage. `TWP_RAN_SE`, `OBJECTID_1` and `date_of_sale` are excluded; all three were null in every
sampled record.

The appraiser-portal parcel-id spot-check that `county-seed-data` asks for is **deferred to
ISSUE-018**, the first stage that calls an appraiser endpoint. It is recorded as a gap in the
manifest rather than skipped silently.

## Manifest

Path: `data/manifests/seed.json`, committed to the assignment repo.

It is **machine-written by `scripts/fetch-parcel-seed.mjs` and never hand-edited** — every count in
it was measured during the run that produced the CSV. A hand-typed number here would be a claim we
did not verify.

`gaps` and `notes` are **arrays of strings**; the deployed explorer renders each as a bullet list.
The measured gaps recorded by this run: duplicate PINs (above), **7,316 records with a blank situs
address**, **192 records with a blank `owner1_name`**, and the deferred appraiser spot-check. Blank
in this source is `""` or `" "`, never `NULL`, and is preserved byte-for-byte.

`scripts/sync-manifests.mjs` copies every canonical manifest from `data/manifests/` into
`app/data/manifests/` byte-identical before each deploy, because a `--cwd app` Vercel build cannot
see anything above `app/`.
