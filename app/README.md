# Rock Island pipeline explorer

The deployed UI for the Oracle property intelligence pipeline, Rock Island County, IL.
Next.js App Router + TypeScript + Tailwind v4. Deployed on Vercel as
`oracle-rock-island-explorer`.

## Stage manifests

Pipeline stages publish JSON manifests that this app reads. They live at:

```
app/data/manifests/<stage>.json
```

They sit inside `app/` because a Vercel deploy uploads only the directory it is given
(`--cwd app`); nothing above that directory exists in the build container, so a static import
reaching outside `app/` would fail at build time.

Canonical stage manifests are written by the pipeline at the repo root
(`data/manifests/<stage>.json`) and copied here byte-identical by
`node scripts/sync-manifests.mjs`, which runs before every deploy.

Every manifest has the same shape:

```json
{
  "stage": "runs",
  "status": "awaiting-data",
  "county_slug": "rock-island",
  "generated_at": null,
  "source_note": null,
  "records": []
}
```

`status` is either `awaiting-data` or `ready` — nothing else. A section whose manifest is
`awaiting-data` renders an explicit "Awaiting data" state. It never renders an invented number.

## Deploy

Run from the repo root, after every push to the branch:

```
vercel deploy --prod --yes --cwd app \
  --build-env NEXT_PUBLIC_GIT_REPO="oracle-property-intelligence-platform-pipeline-rock-island-county-il" \
  --build-env NEXT_PUBLIC_GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)" \
  --build-env NEXT_PUBLIC_GIT_COMMIT_SHA="$(git rev-parse --short=7 HEAD)"
```

Push-to-deploy is deliberately not wired; the CLI deploy above is the redeploy contract.
