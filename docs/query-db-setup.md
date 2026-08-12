# Query DB setup — how ISSUE-021 reaches the schema

The query DB is the local Postgres 16 that ISSUE-017's `docker-compose.yml` brings up, carrying the
`elephant-xyz/elephant-query-db` schema.

| | |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:elephant@localhost:5432/elephant` |
| Container | `elephant-pipeline-postgres-1` (`postgres:16`) |
| Loader repo clone | `/Users/lukas/Developer/ateam/elephant-query-db` — a clone, never edited |
| Node | v25.9.0 |

## The schema was already applied — verified, not re-applied

`elephant-query-db`'s `package.json` has no `migrate` script, only `generate:migrations`. The apply
path is `psql -f` over `migrations/*.sql` in filename order, and **ISSUE-030 already ran it** and
recorded a `pipeline_schema_migrations` ledger. ISSUE-021 therefore checks the ledger and verifies
the schema rather than re-applying it blindly:

```
$ docker exec elephant-pipeline-postgres-1 psql -U postgres -d elephant \
    -c "SELECT * FROM pipeline_schema_migrations ORDER BY 1;"

0000_vengeful_ezekiel_stane.sql   | 2026-08-12 18:12:32.944495+00
0001_wooden_carlie_cooper.sql     | 2026-08-12 18:12:33.204879+00
0002_lonely_steel_serpent.sql     | 2026-08-12 18:12:33.49681+00
0003_permit_fetch_requests.sql    | 2026-08-12 18:12:33.74619+00
0004_bulk_merge_perf_indexes.sql  | 2026-08-12 18:12:33.998046+00
0005_parcels_folio_unique_key.sql | 2026-08-12 18:12:34.242368+00
0006_oracle_dataset_coverage.sql  | 2026-08-12 18:12:34.486628+00
```

All seven migrations are present, including `0004_bulk_merge_perf_indexes.sql`, which the kit skill
calls mandatory rather than an optimisation, and `0005_parcels_folio_unique_key.sql`, which is what
`parcels_jurisdiction_key_request_identifier_unique` comes from.

Verification, and its result — the seven tables this issue reads or writes are all present and the
folio unique constraint exists:

```
$ docker exec elephant-pipeline-postgres-1 psql -U postgres -d elephant -c "\dt"
$ docker exec elephant-pipeline-postgres-1 psql -U postgres -d elephant -c "\d parcels"
```

Full output: `docs/evidence/issue-021/21-01-schema-tables.txt`.

## `psql` is reached through the container

This machine has no `psql` on `PATH`, so every statement runs through
`docker exec -i elephant-pipeline-postgres-1 psql`. That is the only reason `scripts/lib/psql.mjs`
exists; set `PSQL_BIN` to a local `psql` binary and it uses `DATABASE_URL` directly instead. Nothing
about the SQL changes.

## Dependencies in the clone

```
$ cd /Users/lukas/Developer/ateam/elephant-query-db && npm ci
```

`git status` in the clone is clean afterwards — the repo is read, never edited. ISSUE-021 imports
four normalizers from it directly (`normalizeName`, `normalizePostalCode`,
`buildNormalizedAddressKey`, `hashString`) using Node 25's native TypeScript type stripping, so the
kit functions are used verbatim rather than re-implemented.

## What ISSUE-021 did NOT run, and why

`npm run load:bulk` was **not** run for any track.

- **Appraisal track.** ISSUE-018's per-parcel ingest is a durable Restate workflow that was already
  loading these exact artifacts into `parcels` under `source_system=rock_island_appraiser` and was
  still running throughout ISSUE-021. Starting a second writer against the same `source_system`
  would be a concurrent double-load, and the kit skill's rule is a single-writer `Loader` per
  county. ISSUE-021 verifies the load with the kit's own `validate-appraisal-folio.ts` instead, and
  reconciles over the full 65,955-record source mirror so no metric depends on how far that load has
  progressed.
- **Permit track.** ISSUE-019 had already loaded 25,354 permit records into
  `permits_rock_island_city`, the table that carries the permit-to-parcel link columns. A
  `--tracks permits` load would have written the same records a second time into
  `property_improvements`.
- **Geo track.** ISSUE-020 had already loaded all seven clipped signal sources into
  `geo_signal_source` / `geo_signal_feature`.

`scripts/clear-appraisal-source.ts` was **not** run either: nothing needed clearing, and running it
would have deleted the rows ISSUE-018 was still writing.
