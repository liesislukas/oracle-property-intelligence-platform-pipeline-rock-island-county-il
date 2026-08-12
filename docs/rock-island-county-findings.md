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
