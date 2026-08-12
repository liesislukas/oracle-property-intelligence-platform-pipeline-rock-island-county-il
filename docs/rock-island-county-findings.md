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

_Filled by W2–W8._

## 2. Parcel identifier

_Filled by W2–W8._

## 3. Permit portals

_Filled by W2–W8._

## 4. Bulk data sources

_Filled by W2–W8._

## 5. Usage-type vocabulary

_Filled by W2–W8._

## 6. Additional data sources

_Filled by W2–W8._

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

_Filled by W2._
