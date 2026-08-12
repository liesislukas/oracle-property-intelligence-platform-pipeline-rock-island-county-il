# Pipeline stage manifest schema

Every pipeline stage writes exactly one JSON file under `data/manifests/`. Those files are the only
thing the deployed run summary at `/runs` reads — it never queries a database, never fetches at
runtime, and never hardcodes a count. `scripts/sync-manifests.mjs` mirrors them byte-identical into
`app/data/manifests/` before every deploy, because a Vercel deploy uploads only `app/`.

A stage that has not run commits a manifest with `"sources": []`. The page renders that as **not yet
run** — never as zero records. The two are different facts and the UI says which one it means.

## The six stage manifests

| Stage id (the filename) | File | Written by | Label rendered |
|---|---|---|---|
| `seed` | `data/manifests/seed.json` | ISSUE-017 | Stack bootstrap and parcel seed |
| `property-ingest` | `data/manifests/property-ingest.json` | ISSUE-018 | Property records ingest |
| `permits` | `data/manifests/permits.json` | ISSUE-019 | Permit records ingest |
| `geo-signals` | `data/manifests/geo-signals.json` | ISSUE-020 | Power and geo signals ingest |
| `reconciliation` | `data/manifests/reconciliation.json` | ISSUE-021 | Entity reconciliation and provenance |
| `publish` | `data/manifests/publish.json` | ISSUE-022 | IPFS publish and query table |

The **filename is the stage id**. The `stage` field inside the file is a free-form label the stage
wrote about itself — `seed.json` records `"county-seed-data"` — and the reader never branches on it.

## Normative shape

This is the shape `app/src/lib/stageManifests.ts` parses. It is the single reader; there is no
second one.

```ts
type Manifest = {
  /** Free-form label for the stage that produced this file, e.g. "county-seed-data". */
  stage: string;
  /** Optional, for human readers and this validator: "ready" | "not-run". The reader ignores it —
   *  a stage has run iff `sources` is non-empty. */
  status?: string;
  /** "rock-island" when present. */
  county_slug?: string;
  run: {
    started_at: string | null; // ISO-8601. null on a stage that has not run.
    finished_at: string | null; // ISO-8601. null on a stage that has not run.
  };
  sources: ManifestSource[]; // [] means the stage has not run.
};

type ManifestSource = {
  /** Stable id for this source. Also the `/sources` anchor: #source-<id>. */
  id: string;
  name: string;
  url: string | null;          // null => "No public URL". Never "".
  licence: string | null;      // null => "not recorded". Never "".
  retrieved_at: string | null; // ISO-8601. null => "not recorded".
  record_count: number | null; // null => "not counted". NEVER 0 as a stand-in for unknown.
  bbox_count?: number | null;  // bounding-box UPPER BOUND. Never summed into a total.
  duration_s: number | null;   // null => "not measured".
  /** Free-form. The county-discovery vocabulary — download · ingest · runtime-fetch ·
   *  not-feasible · undetermined-unreachable — plus whatever a stage actually recorded
   *  (seed.json records "paged-live-query"). Rendered verbatim when it is outside the vocabulary. */
  decision: string;
  gaps: string[];              // rendered verbatim, never paraphrased
  notes: string[];             // rendered verbatim, never paraphrased
};
```

## Worked example — `seed.json`, trimmed

```json
{
  "stage": "county-seed-data",
  "run": {
    "started_at": "2026-08-12T18:01:36.010Z",
    "finished_at": "2026-08-12T18:02:00.530Z"
  },
  "sources": [
    {
      "id": "rock-island-parcels-featureserver",
      "name": "Rock Island County GIS — parcel layer (ArcGIS FeatureServer 0)",
      "url": "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0",
      "licence": "For use by the general public",
      "retrieved_at": "2026-08-12T18:02:00.320Z",
      "record_count": 65955,
      "duration_s": 23.602,
      "decision": "paged-live-query",
      "gaps": ["…one complete sentence per gap, written by the stage…"],
      "notes": ["…one complete sentence per note, written by the stage…"]
    }
  ]
}
```

## The rules

1. **`record_count` is `null` when a source was not counted. Never `0` to mean unknown.** A zero on
   this page is read as a measurement that there are no records, and that is a different claim.
2. **`bbox_count` marks a bounding-box upper bound and is never added to a county total.** The
   fetch rectangle for this county crosses the Mississippi into Iowa; the clipped count is the
   county figure.
3. **Records carried by another dataset are counted once.** Parcel ownership fields and parcel
   centroids ride along with the parcel layer; they are shown as carried, never re-counted.
4. **`licence` and `retrieved_at` are required on every source** — provenance is not optional. Where
   a source genuinely records neither, write `null` and the UI says "not recorded".
5. **`gaps` and `notes` are rendered verbatim.** Write complete sentences; a paraphrase downstream
   would be a provenance failure, so nothing downstream paraphrases them.

Run `node scripts/validate-manifests.mjs` before committing a manifest. A missing stage file is not
an error; a malformed one is.
