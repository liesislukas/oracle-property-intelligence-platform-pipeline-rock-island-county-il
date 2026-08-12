# oracle-pipeline-permits

Permit ingest for Rock Island County, IL (ISSUE-019).

Permits in this county are not county-level: sixteen jurisdictions each run their own permitting,
on four different vendors, and eleven of them publish nothing online at all. The only bulk-shaped
permit source in the county is the **City of Rock Island's monthly PDF permit reports** at
<https://rigov.org/1276/Permit-Reports>. This package harvests, extracts, links and loads them, and
writes the coverage record for the other fifteen jurisdictions.

## Run order

All five commands run with working directory `<repo>/pipeline`. Every script resolves its paths
from `import.meta.url`, never from `process.cwd()`.

```sh
npm install
npm run harvest:inventory   # index page -> permit-lists/inventory.json
npm run harvest:reports     # 111 PDFs, sequential, 1500 ms apart (~9-10 minutes)
npm run extract:permits     # PDFs -> extracted/<YYYY-MM>.json, one record per permit block
npm run link:parcels        # permits -> parcels on PIN / legacy key / normalised address
npm run load:permits        # extracted records -> Postgres (DATABASE_URL)
node permits/coverage.mjs         # the 16-jurisdiction coverage artifact
node permits/publish-manifest.mjs # data/manifests/permits.json (canonical stage manifest)
```

`node ../scripts/sync-manifests.mjs` then copies the canonical manifest byte-identical into
`app/data/manifests/` for the deployed build.

## Artifact tree

Layout adopted verbatim from the kit's `county-permit-adapter`
(`data/artifacts/permits/<county>/<jobId>/…`). `jobId` is the fixed literal
`rock-island-city-permits-v1`, so every path is concrete and every re-run is idempotent.

```
data/artifacts/permits/rock-island/rock-island-city-permits-v1/
  permit-lists/inventory.json   committed
  raw/<YYYY-MM>.pdf             gitignored (~11 MB of binaries; the inventory identifies each by
                                URL, byte length and SHA-256)
  extracted/<YYYY-MM>.json      committed
  status/<YYYY-MM>.json         committed
  parcel-key-index.json         gitignored when large; linkage.json is the committed evidence
  linkage.json                  committed
  coverage.json                 committed
data/manifests/permits.json     canonical stage manifest, committed
```

## The two report layouts

| Layout | Months | Shape |
|---|---|---|
| `legacy-tabular` | 2017-01 → 2026-03 (111 reports) | Landscape 792x612. Columns `Permit #`, `Permit Date`, `Owner and Contractor`, `PURPOSE`, `TAX_MAP`, `Address`, `TOTALCOST`. Records grouped under left-margin permit-type headings. Column x-origins are byte-identical across the whole range. |
| `energov-tabular` | 2026-04 onward (1 report) | Portrait 612x792. Tyler EnerGov output. Columns `Permit Number`, `Address`, `Permit Type`, `Permit Issue Date`, `Permit Description`, `Permit Application Date`, `Permit Valuation`, `Parcel Number`. `Parcel Number` is the 10-digit county PIN, printed without a leading zero. |

Both are parsed by x-band from `pdfjs-dist` text-item transforms. A document matching neither
header is recorded as `unknown-layout` and left unclaimed — never guessed at.

## Politeness

`rigov.org/robots.txt` imposes no `Crawl-delay` on a generic `User-agent: *` client and disallows
neither `/DocumentCenter` nor `/1276`. The harvest is nonetheless strictly sequential with a
1500 ms courtesy delay between requests, identifies itself in its `User-Agent`, and never
parallelises. Measured document latency: p50 2724 ms, p95 5977 ms. A full harvest is ~9.3 minutes.

Every count in `data/manifests/permits.json` is produced by these scripts from the source PDFs; no
count in this repo is hand-written.
