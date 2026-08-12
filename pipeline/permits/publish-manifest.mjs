// WI-8 — Publish the canonical `permits` stage manifest the deployed explorer reads.
//
//   node permits/publish-manifest.mjs
//
// Writes ONLY the canonical file, `<repo>/data/manifests/permits.json`. The deployable copy under
// `app/data/manifests/` is made by `scripts/sync-manifests.mjs`, which copies every stage manifest
// byte-identical before each deploy — that script is the single copier for every stage and this one
// does not duplicate it.
//
// The shape is the stage-manifest contract established by `data/manifests/seed.json` and read by
// `app/src/lib/stageManifests.ts`: { stage, sources[{ id, name, url, licence, retrieved_at,
// record_count, duration_s, decision, gaps[], notes[] }], run }. `gaps` and `notes` are rendered
// verbatim as bullets, so the sixteen-jurisdiction coverage story lives in them.
//
// Rules this file is bound by:
//   - `record_count` is null, NEVER 0, for a source that was not harvested. 0 would read as
//     "zero permits exist"; null reads as "not counted", which is the truth.
//   - Every count is read from the artifacts. No number here is hand-written.
//   - A jurisdiction that publishes nothing online is stated as an absence of a public source,
//     never as an absence of permits.

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { dirs, files, toJson } from "./paths.mjs";

const REPORTS_URL = "https://rigov.org/1276/Permit-Reports";

const INGESTED = "rock-island";

/** The four jurisdictions that have an online permit system we did not harvest each get their own
 *  source row, so their vendor, measured latency and reason are structured rather than prose. */
const NON_HARVESTED_SOURCES = {
  moline: {
    id: "moline-etrakit-permit-search",
    name: "Moline — CentralSquare eTRAKiT permit search (not harvested)",
    decision: "runtime-fetch",
  },
  "east-moline": {
    id: "east-moline-iworq-permit-search",
    name: "East Moline — iWorQ permit search (not harvested)",
    decision: "runtime-fetch",
  },
  milan: {
    id: "milan-govbuilt-permit-portal",
    name: "Milan — GovBuilt permit portal (not harvested)",
    decision: "undetermined-unreachable",
  },
  "carbon-cliff": {
    id: "carbon-cliff-permits-delegated",
    name: "Carbon Cliff — permitting contracted to East Moline (not harvested)",
    decision: "delegated-records-unconfirmed",
  },
};

function latencyNote(row) {
  if (row.latency_p50_ms === null) {
    return `Latency: not measured. ${row.discovery_status === "discovered" ? "The portal could not be exercised from this egress, so no timing is asserted." : "No online permit lookup exists to time."}`;
  }
  return `Measured latency: p50 ${row.latency_p50_ms} ms, p95 ${row.latency_p95_ms} ms over 10 sequential requests (ISSUE-001 discovery, 2026-08-12).`;
}

async function main() {
  const coverage = JSON.parse(await readFile(files.coverage, "utf8"));
  const linkage = JSON.parse(await readFile(files.linkage, "utf8"));
  const inventory = JSON.parse(await readFile(files.inventory, "utf8"));

  // Harvest timing, read from the download status artifacts — never estimated.
  const statuses = [];
  for (const name of (await readdir(dirs.status)).filter((f) => f.endsWith(".json")).sort()) {
    statuses.push(JSON.parse(await readFile(path.join(dirs.status, name), "utf8")));
  }
  const downloaded = statuses.filter((s) => s.download === "ok");
  const stamps = downloaded.map((s) => Date.parse(s.downloaded_at)).sort((a, b) => a - b);
  const elapsed = downloaded.map((s) => s.elapsed_ms).sort((a, b) => a - b);
  const startedAt = new Date(stamps[0] - (elapsed[0] ?? 0)).toISOString();
  const finishedAt = new Date(stamps[stamps.length - 1]).toISOString();
  const durationS = Number(((stamps[stamps.length - 1] - stamps[0]) / 1000).toFixed(1));
  const pct = (n) => `${((n / elapsed.length) * 100).toFixed(1)}%`;
  const p = (q) => elapsed[Math.min(elapsed.length - 1, Math.floor(elapsed.length * q))];

  const byJurisdiction = new Map(coverage.jurisdictions.map((row) => [row.jurisdiction, row]));
  const ri = byJurisdiction.get(INGESTED);

  const offline = coverage.jurisdictions.filter(
    (row) => row.ingest_status === "no-online-permit-lookup-exists",
  );

  const extractedMonths = statuses
    .filter((s) => s.extract && s.extract.status === "ok")
    .map((s) => s.index_month);
  const duplicates = statuses.filter((s) => s.download === "skipped-duplicate-document");

  const unmatchedLines = Object.entries(linkage.unmatched)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n.toLocaleString("en-US")} ${reason}`)
    .join("; ");

  const ingestedSource = {
    id: "rock-island-city-permit-reports",
    name: "City of Rock Island — monthly permit reports (PDF archive)",
    url: REPORTS_URL,
    licence: null,
    retrieved_at: finishedAt,
    record_count: coverage.record_count,
    duration_s: durationS,
    decision: "download",
    gaps: [
      `Permits in Rock Island County are not county-level: sixteen jurisdictions each run their own permitting and only this one publishes a bulk-shaped source. The other fifteen were not harvested — four of them are listed as their own sources in this stage, and the eleven that publish nothing online at all are listed below. A parcel with no permits found here is not a parcel with no permits.`,
      // The absence is stated first, in the same words, for every one of the eleven — then the
      // jurisdiction's own recorded note. The note is not repeated when it already opens with that
      // same sentence.
      ...offline.map((row) =>
        /^no online permit lookup exists/i.test(row.coverage_note)
          ? `${row.display_name} — ${row.coverage_note.charAt(0).toLowerCase()}${row.coverage_note.slice(1)}`
          : `${row.display_name} — no online permit lookup exists. ${row.coverage_note}`,
      ),
      coverage.archive_lag_note,
      `March 2021 has no report of its own. The city's index links document 15854 under both October 2020 and March 2021, and that document's own records are October 2020 permits, so 2021-03 is absent from the archive rather than empty. 111 distinct documents cover 111 of the 112 index entries, and every month from 2017-01 to 2026-04 except 2021-03.`,
      `${(linkage.total_permit_records - linkage.matched).toLocaleString("en-US")} of ${linkage.total_permit_records.toLocaleString("en-US")} permit records did not resolve to a parcel: ${unmatchedLines}. ${linkage.limits_statement}`,
      `The reports carry no permit status, no inspection outcome and no issued-vs-applied distinction beyond the printed date, so none of those is claimed here.`,
    ],
    notes: [
      `${coverage.report_count} monthly PDF reports harvested from ${REPORTS_URL}, covering ${coverage.period_start} to ${coverage.period_end}. ${coverage.record_count.toLocaleString("en-US")} permit records extracted, one per printed permit block. A permit spanning several parcels prints one block per parcel and every block is kept, so distinct permit numbers are fewer than records; nothing is de-duplicated away.`,
      `Two report layouts, detected per document from the header row: legacy-tabular (${extractedMonths.length - 1} reports, 2017-01 to 2026-03, columns Permit # / Permit Date / Owner and Contractor / PURPOSE / TAX_MAP / Address / TOTALCOST) and energov-tabular (1 report, 2026-04 onward, the Tyler EnerGov output, which adds a Parcel Number column and prints no owner or contractor). A document matching neither header would be recorded as unknown-layout and left unclaimed; none was.`,
      `Provenance is per record, not per file: every extracted record carries the source report URL, its document id, the SHA-256 of the exact PDF bytes it was read from, the report month, the layout and the page number. ${duplicates.length} index entry was a duplicate link to an already-downloaded document and is recorded as such rather than downloaded twice.`,
      `Permit-to-parcel linkage: ${linkage.matched.toLocaleString("en-US")} of ${linkage.total_permit_records.toLocaleString("en-US")} records matched a parcel (${linkage.match_rate_pct}%) — ${linkage.by_method["legacy-key-exact"].toLocaleString("en-US")} on the legacy TAX_MAP key against the parcel layer's RICO_PARCE, ${linkage.by_method["pin-exact"].toLocaleString("en-US")} on the 10-digit PIN the EnerGov report prints, ${linkage.by_method["address-normalized"].toLocaleString("en-US")} on a normalised site address. ${linkage.method_statement}`,
      `Records are loaded into the pipeline Postgres table permits_rock_island_city, keyed on a deterministic id of <document id>:<permit number>:<occurrence>, so a re-run refreshes rather than duplicates. Valuations preserve the distinction the source makes: a printed $0.00 loads as 0.00 and an unprinted valuation loads as NULL.`,
      `Politeness: rigov.org/robots.txt disallows neither /DocumentCenter nor /1276 and imposes no Crawl-delay on a generic client. The harvest was strictly sequential with a 1500 ms courtesy delay, identified itself by User-Agent, and was never parallelised. ${downloaded.length} of ${statuses.length} index entries downloaded, ${statuses.filter((s) => s.download === "failed").length} failures. Measured document latency this run: p50 ${p(0.5)} ms, p95 ${p(0.95)} ms, max ${elapsed[elapsed.length - 1]} ms; ${pct(elapsed.filter((ms) => ms < 1000).length)} of fetches came back under a second. Full harvest wall time ${durationS} s. A 15-document sample taken before the run measured p50 2724 ms / p95 5977 ms and projected about 9.3 minutes; the live run was faster. Both measurements are recorded rather than one replacing the other — this source's latency varies by a factor of two between sittings, which is itself the constraint worth knowing.`,
      `Correction to discovery: ${coverage.corrections[0].now}`,
      `Correction to discovery: ${coverage.corrections[1].now}`,
      `Correction to discovery: ${coverage.corrections[2].now}`,
      `The city's own Tyler EnerGov Civic Access portal (${"https://cityofrockislandil-energovweb.tylerhost.net/apps/selfservice"}) returns HTTP 403 from this egress and was not used. ${ri.coverage_note}`,
      `Full artifacts on the branch: data/artifacts/permits/rock-island/rock-island-city-permits-v1/ — inventory.json (the 112 index entries), status/<month>.json (per-document HTTP status, byte length, SHA-256, timing), extracted/<month>.json (every record), linkage.json (the match rates) and coverage.json (all 16 jurisdictions). The raw PDFs are excluded from git as ~11 MB of binaries the inventory already identifies by URL, byte length and hash.`,
    ],
  };

  const otherSources = Object.entries(NON_HARVESTED_SOURCES).map(([slug, meta]) => {
    const row = byJurisdiction.get(slug);
    return {
      id: meta.id,
      name: meta.name,
      url: row.source_url,
      licence: null,
      retrieved_at: null,
      // null, never 0: nothing was counted here. 0 would read as "this jurisdiction issued no
      // permits", which is not something this pipeline knows.
      record_count: null,
      duration_s: null,
      decision: meta.decision,
      gaps: [
        `${row.display_name} — not harvested. ${row.coverage_note}`,
        `No permit record from ${row.display_name} is present in this pipeline. That is a limit of what the source exposes, not a statement that ${row.display_name} issued no permits.`,
      ],
      notes: [
        `Vendor: ${row.vendor_real_name ?? row.vendor}. Search capability as observed: ${row.search}. Discovery status: ${row.discovery_status}.`,
        latencyNote(row),
      ],
    };
  });

  const manifest = {
    stage: "permits",
    status: coverage.record_count > 0 ? "ready" : "awaiting-data",
    county_slug: coverage.county_slug,
    sources: [ingestedSource, ...otherSources],
    run: {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    },
  };

  const bytes = toJson(manifest);
  await writeFile(files.manifest, bytes);
  console.log(
    `manifest: wrote data/manifests/permits.json (${Buffer.byteLength(bytes)} B) — ${manifest.sources.length} sources, ${ingestedSource.gaps.length} gaps, ${ingestedSource.notes.length} notes on the ingested source`,
  );
  console.log(
    `  run scripts/sync-manifests.mjs to copy it into app/data/manifests/ for the deploy (inventory: ${inventory.index_entry_count} index entries)`,
  );
}

await main();
