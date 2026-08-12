/**
 * ISSUE-018 WI-7 — build data/manifests/property-ingest.json in the assignment repo.
 *
 *   node scripts/build-property-manifest.mjs
 *
 * Every coverage percentage is RECOMPUTED here from the 65,955 mirrored records. None is copied
 * from the discovery document; each is compared against the discovery figure and the script fails
 * loud if any drifted by more than 0.5 percentage points.
 *
 * The manifest envelope is the one `app/src/lib/stageManifests.ts` reads and the one
 * `data/manifests/seed.json` already uses — {stage, sources[], run} — so the deployed /sources page
 * renders it with no UI work. `gaps` and `notes` are rendered verbatim, which is why the caveats
 * live there in full sentences.
 */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSIGNMENT_REPO =
  "/Users/lukas/Developer/ateam/oracle-property-intelligence-platform-pipeline-rock-island-county-il";
const MIRROR = path.join(REPO_ROOT, "data", "source-mirror", "rock-island");
const JOB_FULL = "full-2026-08-12";
const JOB_PILOT = "pilot-2026-08-12";
const ART = (job) => path.join(REPO_ROOT, "data", "artifacts", "appraisal", "rock-island", job);

const txt = (v) => String(v ?? "").trim();
const pct = (n, d) => Number(((n / d) * 100).toFixed(3));

// --- read the mirror once ----------------------------------------------------------------------
const files = (await readdir(MIRROR)).filter((f) => f.endsWith(".json"));
const counts = {
  PIN: 0, owner1_name: 0, taxbill_name: 0, taxbill_addr: 0, site_address: 0,
  EAV: 0, EMV: 0, GIS_acres_num: 0, gross_acres: 0, date_last_sale: 0, YRBuilt: 0,
};
const pinCounts = new Map();
let ownerNameAbsent = 0;
let namesDifferFromTaxbill = 0;
let personEntities = 0;
let companyEntities = 0;
let zoningMunicipality = 0;
let zoningCounty = 0;
let zoningBlank = 0;
let zoningSuffixed = 0;
let retrievedAt = null;
let layerUrl = null;
let licence = null;

const MUNI = new Set(["MOL", "RI", "EM", "SIL", "MIL", "CV", "HAM", "PB", "CCL", "AND", "COR", "OAK", "REY"]);
const COMPANY_TOKENS = new Set([
  "LLC", "INC", "CORP", "CO", "COMPANY", "LTD", "LP", "LLP", "TRUST", "TR", "ESTATE", "BANK",
  "CHURCH", "ASSN", "ASSOCIATION", "PARTNERSHIP", "FOUNDATION", "MINISTRIES", "SCHOOL",
  "DISTRICT", "DEPT", "AUTHORITY", "COMMISSION", "USA", "STATE", "CITY", "VILLAGE", "COUNTY",
  "TOWNSHIP", "RAILROAD",
]);
const COMPANY_PREFIXES = ["CITY OF", "VILLAGE OF", "COUNTY OF", "STATE OF", "UNITED STATES"];
function classifyOwner(name) {
  const n = txt(name).toUpperCase();
  if (n === "") return null;
  for (const p of COMPANY_PREFIXES) if (n.startsWith(p)) return "company";
  for (const t of n.split(/[^A-Z0-9]+/)) if (COMPANY_TOKENS.has(t)) return "company";
  return "person";
}

for (const f of files) {
  const doc = JSON.parse(await readFile(path.join(MIRROR, f), "utf8"));
  const a = doc.attributes;
  if (!retrievedAt) {
    retrievedAt = doc.meta.retrievedAt;
    layerUrl = doc.meta.layerUrl;
    licence = doc.meta.licence;
  }
  if (txt(a.PIN) !== "") counts.PIN += 1;
  if (txt(a.owner1_name) !== "") counts.owner1_name += 1;
  else ownerNameAbsent += 1;
  if (txt(a.taxbill_name) !== "") counts.taxbill_name += 1;
  if (txt(a.taxbill_addr) !== "") counts.taxbill_addr += 1;
  if (txt(a.site_address) !== "") counts.site_address += 1;
  if (Number(a.EAV) > 0) counts.EAV += 1;
  if (Number(a.EMV) > 0) counts.EMV += 1;
  if (Number(a.GIS_acres_num) > 0) counts.GIS_acres_num += 1;
  if (Number(a.gross_acres) > 0) counts.gross_acres += 1;
  if (a.date_last_sale != null) counts.date_last_sale += 1;
  if (txt(a.YRBuilt) !== "") counts.YRBuilt += 1;

  const p = txt(a.PIN);
  pinCounts.set(p, (pinCounts.get(p) ?? 0) + 1);

  if (txt(a.owner1_name) !== txt(a.taxbill_name)) namesDifferFromTaxbill += 1;
  const cls = classifyOwner(a.owner1_name);
  if (cls === "person") personEntities += 1;
  if (cls === "company") companyEntities += 1;

  const z = txt(a.Zoning);
  if (z === "") zoningBlank += 1;
  else if (MUNI.has(z.replace(/[!?]$/, ""))) zoningMunicipality += 1;
  else zoningCounty += 1;
  if (/[!?]$/.test(z)) zoningSuffixed += 1;
}

const total = files.length;
const DISCOVERY = {
  PIN: 100.0, owner1_name: 99.71, taxbill_name: 99.71, taxbill_addr: 99.71,
  site_address: 88.91, EAV: 96.18, EMV: 89.47, GIS_acres_num: 99.997,
  gross_acres: 27.54, date_last_sale: 70.0, YRBuilt: 81.0,
};
const LABEL = {
  PIN: "PIN (county parcel identifier)", owner1_name: "owner1_name (owner of record)",
  taxbill_name: "taxbill_name", taxbill_addr: "taxbill_addr (owner mailing address)",
  site_address: "site_address (situs address)", EAV: "EAV > 0 (assessed value)",
  EMV: "EMV > 0 (market value)", GIS_acres_num: "GIS_acres_num > 0 (acreage)",
  gross_acres: "gross_acres > 0 (the acreage field NOT used)",
  date_last_sale: "date_last_sale (tenure)", YRBuilt: "YRBuilt (year built)",
};
const coverage = Object.keys(DISCOVERY).map((k) => {
  const p = pct(counts[k], total);
  return {
    field: k, label: LABEL[k], populated: counts[k], total,
    pct: p, discoveryPct: DISCOVERY[k], deltaPp: Number((p - DISCOVERY[k]).toFixed(2)),
  };
});
const drifted = coverage.filter((c) => Math.abs(c.deltaPp) > 0.5);
if (drifted.length) {
  console.error("FATAL: measured coverage drifted more than 0.5 pp from the discovery figure:");
  for (const d of drifted) console.error(`  ${d.field}: measured ${d.pct}% vs discovery ${d.discoveryPct}% (${d.deltaPp} pp)`);
  process.exit(1);
}

// --- run outcomes ------------------------------------------------------------------------------
async function countMarkers(job, name) {
  let n = 0;
  const root = ART(job);
  let entries;
  try {
    entries = await readdir(root);
  } catch {
    return 0;
  }
  for (const e of entries) {
    try {
      await stat(path.join(root, e, name));
      n += 1;
    } catch {
      /* absent */
    }
  }
  return n;
}
const runs = {};
for (const [phase, job] of [["pilot", JOB_PILOT], ["full", JOB_FULL]]) {
  runs[phase] = {
    job,
    ready: await countMarkers(job, "ready.json"),
    dead: await countMarkers(job, "dead.json"),
    invalid: await countMarkers(job, "invalid.json"),
  };
}

const dbRows = execFileSync(
  "docker",
  ["exec", execFileSync("docker", ["ps", "-q", "-f", "ancestor=postgres:16"]).toString().trim(),
   "psql", "-U", "postgres", "elephant", "-t", "-A", "-c",
   "SELECT count(*), count(DISTINCT request_identifier) FROM parcels"],
).toString().trim();
const [dbCount, dbDistinct] = dbRows.split("|").map(Number);

const durations = JSON.parse(await readFile(path.join(REPO_ROOT, "data", "run-timings.json"), "utf8"));

const scriptsSha = execFileSync("shasum", ["-a", "256", path.join(REPO_ROOT, "transforms", "rock-island", "transform-scripts.zip")])
  .toString().trim().split(/\s+/)[0];

const duplicates = [...pinCounts.entries()].filter(([, n]) => n > 1);
const identity = {
  distinctPin: pinCounts.size,
  duplicatePinValues: duplicates.length,
  recordsWithDuplicatePin: duplicates.reduce((s, [, n]) => s + n, 0),
  nonNumericPinRecords: [...pinCounts.entries()].filter(([p]) => !/^[0-9]{10}$/.test(p)).reduce((s, [, n]) => s + n, 0),
};

const num = (n) => n.toLocaleString("en-US");
const coverageLine = coverage
  .map((c) => `${c.label} ${c.pct}% (${num(c.populated)}/${num(c.total)}; discovery said ${c.discoveryPct}%, delta ${c.deltaPp} pp)`)
  .join("; ");

const manifest = {
  stage: "county-appraisal-onboarding",
  sources: [
    {
      id: "rock-island-parcels-featureserver",
      name: "Rock Island County GIS — parcel layer (ArcGIS FeatureServer 0)",
      url: layerUrl,
      licence,
      retrieved_at: retrievedAt,
      record_count: dbDistinct,
      duration_s: durations.full.duration_s,
      decision: "multi-request-flow-over-local-mirror",
      gaps: [
        `Zoning here is the county GIS layer's Zoning field, and for ${num(zoningMunicipality)} of ${num(total)} parcels (${pct(zoningMunicipality, total)}%) it holds a three-letter municipality code — MOL (Moline), RI (Rock Island), EM (East Moline), SIL (Silvis), MIL (Milan), CV (Coal Valley), HAM (Hampton), PB (Port Byron), CCL (Carbon Cliff), AND (Andalusia), COR (Cordova), OAK (Oak Grove), REY (Reynolds) — not a zoning class. Rock Island County records a zoning class only where it is the zoning authority, which is the unincorporated area: ${num(zoningCounty)} parcels (${pct(zoningCounty, total)}%). A further ${num(zoningBlank)} parcels (${pct(zoningBlank, total)}%) are blank. Municipal zoning for incorporated land is held by each municipality separately and was not ingested in this run. ${num(zoningSuffixed)} parcels also carry an undocumented ! or ? suffix on the code; the layer publishes no meaning for it, so the suffix is preserved verbatim and not interpreted.`,
        `Ownership tenure comes from the parcel layer's date_last_sale, populated for ${num(counts.date_last_sale)} of ${num(total)} parcels (${pct(counts.date_last_sale, total)}%). The remaining ${(100 - pct(counts.date_last_sale, total)).toFixed(1)}% have no last-sale date and are reported as unknown tenure — never as long-held. Sale prices of $10 appear in the source as nominal consideration for non-arm's-length transfers, so gross_sale_price is not a market value.`,
        `Full ownership history — the chain of deeds, mortgages and liens — is not in this dataset. Rock Island County's recorder runs Fidlar Tapestry, whose host does not resolve from this egress and which is a pay-per-search commercial product besides. The parcel layer gives the last sale, not the sequence of them.`,
        `PIN is the county's parcel identifier but it is not unique: ${num(total)} records carry ${num(identity.distinctPin)} distinct PIN values. ${identity.duplicatePinValues} values repeat across ${identity.recordsWithDuplicatePin} records, and ${identity.nonNumericPinRecords} records carry a non-numeric placeholder PIN such as USA, RAILROAD, STATE or LEVEE ROW. This pipeline is therefore keyed on the layer's unique OBJECTID and carries PIN as the county parcel identifier, so that no record is silently collapsed into another.`,
        `Each parcel carries two owner names: owner1_name, the owner of record, and taxbill_name, the name the tax bill is addressed to. They differ on ${num(namesDifferFromTaxbill)} of ${num(total)} records (${pct(namesDifferFromTaxbill, total)}%) — legitimately, for trusts, life estates and agents. This pipeline treats owner1_name as the canonical owner and preserves taxbill_name alongside it; neither is discarded. ${num(ownerNameAbsent)} parcels carry no owner name at all and are given no owner record rather than a placeholder.`,
        `Owner names classified as individuals (${num(personEntities)} of ${num(total)} parcels, ${pct(personEntities, total)}%) are NOT written as lexicon person entities. The person class requires a Title-Cased, parsed first_name/last_name pair; this source publishes one ALL-CAPS combined string that often names two people ("COERS ROBERT W & KRISTIN J"). Re-casing and splitting it would be inference, so the name is preserved verbatim in the per-parcel capture and source mirror instead. Company-classified owners (${num(companyEntities)} parcels, ${pct(companyEntities, total)}%) are written as company entities with their mailing address. This is a lexicon gap, recorded in elephant-pipeline/docs/open-lexicon-gaps.md, not a data loss.`,
        durations.full.complete
          ? `The full county run reached terminal state.`
          : `PARTIAL RUN, stated honestly: the full-county workflow was still running when this manifest was written. ${num(runs.full.ready)} of ${num(total)} parcels had completed and loaded at ${durations.full.measured_at}, at a measured ${durations.full.parcels_per_second} parcels/second, which projects to ${durations.full.projected_hours} hours for the whole county. The workflow is durable (Restate) and continues; record_count above is the count actually in Postgres at manifest time, never a projection.`,
      ],
      notes: [
        `Field coverage, recomputed over all ${num(total)} mirrored records at ingest time and compared with the ISSUE-001 discovery measurement (no figure is copied): ${coverageLine}.`,
        `Pilot then full, per county-ingest-run. Pilot ${JOB_PILOT}: ${runs.pilot.ready} ready, ${runs.pilot.dead} dead, ${runs.pilot.invalid} invalid over a 25-parcel seed selected by 25 measured variability predicates, ${durations.pilot.duration_s} s wall (${durations.pilot.started_at} to ${durations.pilot.finished_at}). Full ${JOB_FULL}: started ${durations.full.started_at}, ${num(runs.full.ready)} ready, ${runs.full.dead} dead, ${runs.full.invalid} invalid at ${durations.full.measured_at}.`,
        `Postgres holds ${num(dbCount)} rows and ${num(dbDistinct)} distinct request_identifier values in the parcels table, upserted on (source_system, source_record_key). request_identifier is the OBJECTID as a decimal string; parcel_identifier is the PIN verbatim, never digits-only-normalized.`,
        `Transform validation: validate-county-transform verdict pass-with-lexicon-gaps over 25 samples — 0 class-(a) extractor bugs, 0 class-(b) capture gaps, 12 class-(c) lexicon gaps, elephant-cli validate exit 0 on all 25. Mean extraction coverage 68.27% of the source fields present per record; every point of the shortfall is an enumerated lexicon gap. Report: evidence/validate-county-transform-report.md.`,
        `Per-record provenance: every entity in every parcel's transformed.zip carries source_http_request pointing at the county endpoint that serves that record (…/FeatureServer/0/query?where=OBJECTID=<id>&outFields=*&f=geojson&outSR=4326) plus request_identifier, and each Postgres row carries source_system, source_record_key, source_record_hash (sha256 of the validated transform) and source_artifact_uri.`,
        `Seam: multi-request-flow-over-local-mirror. The county's DEVNET Wedge appraiser portal is TCP-blocked from this egress, so county-appraisal-onboarding's per-parcel portal lookup is unreachable and the GIS parcel layer substitutes. One 33-page live pull (${durations.mirror.duration_s} s, ${durations.mirror.retrieved_at}) materialised a per-parcel mirror served on loopback, so the flow stays genuinely per-parcel while the county saw 33 requests instead of 65,955, and the ingest run itself made zero external requests to the county.`,
        `Deviation D1 — county-ingest-run requires egress US (curl ipinfo.io/country -> US) because county portals geo-block. This egress is LT. The precondition is not applicable to this source: the ArcGIS FeatureServer was re-verified reachable from here on 2026-08-12 (returnCountOnly -> 65955, plus a live single-parcel query). No block was bypassed. Evidence: evidence/egress-and-source-reachability.txt.`,
        `Deviation D2 — county-seed-data's "no duplicate parcel_id" gate cannot be met with PIN, which is measurably non-unique, so the pipeline key is OBJECTID. Evidence: evidence/pin-uniqueness-report.json.`,
        `Deviation D3 — transform-v2-builder documents a CLI surface @elephant-xyz/cli@1.58.1 does not ship: there is no --transform-version, no --transform-zip and no captures.json. The scripts path (--scripts-zip with data_extractor.js plus the four mandatory mapping modules) is the only path the installed binary offers, and it is what county-appraisal-onboarding §3 describes. Evidence: evidence/elephant-cli-surface.txt. Transform scripts package sha256 ${scriptsSha}.`,
        `Deviation D4 — @elephant-xyz/cli@1.58.1 resolves every lexicon schema by CID through public IPFS gateways and re-fetches the schema manifest on every transform and validate. Cold, one validate took 183 s and still failed because the property_to_file schema CID (bafkreic6z5xkxkvxja6rrzjzhcyhipu2xutb72ufzod4w23j4p6tg4s37y), which every County data group references, returned 504 "no providers found" from all four gateways the CLI tries. scripts/warm-schema-cache.mjs pre-populates the CLI's own ~/.elephant-cli/schema-cache once, hash-verifying every schema against its CID exactly as the CLI does. Warm, the same validate takes 1.8 s. No schema was altered.`,
        `Ownership edges: person_has_property and company_has_property are declared by the County data group schema but createCountyDataGroup in @elephant-xyz/cli@1.58.1 has no branch that populates either, so owner entities are linked through company_has_mailing_address only. Recorded in elephant-pipeline/docs/open-lexicon-gaps.md.`,
        `Eligibility policy PROPERTY_FIRST_PERMIT_ELIGIBLE_USAGE_TYPES_ROCK_ISLAND=__NONE__ makes this an appraisal-only run: every eligibility.json records eligible false and no permit artifact is produced. Permits are ISSUE-019's scope, not a failure here.`,
      ],
    },
  ],
  run: {
    started_at: durations.full.started_at,
    finished_at: durations.full.finished_at,
  },
};

await mkdir(path.join(ASSIGNMENT_REPO, "data", "manifests"), { recursive: true });
await writeFile(
  path.join(ASSIGNMENT_REPO, "data", "manifests", "property-ingest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `manifest written: record_count=${dbDistinct}, coverage rows=${coverage.length}, ` +
    `gaps=${manifest.sources[0].gaps.length}, notes=${manifest.sources[0].notes.length}`,
);
for (const c of coverage) console.log(`  ${c.field}: ${c.pct}% (discovery ${c.discoveryPct}%, delta ${c.deltaPp} pp)`);
