// WI-7 — Build the 16-jurisdiction permit coverage artifact.
//
//   node permits/coverage.mjs
//
// Permits in Rock Island County are not county-level. Sixteen jurisdictions each run their own
// permitting, on four different vendors, and eleven of them publish nothing online at all. This
// artifact states, per jurisdiction, what exists online, what was ingested, and — for the eleven —
// that no online permit lookup exists. Absence of records is stated as absence of a public source,
// never as zero permits.
//
// The 16 rows are a literal constant transcribed from ISSUE-001's discovery findings
// (`docs/rock-island-county-findings.md` §3 and `docs/rock-island-sources.yaml`). Nothing here is
// re-scraped and no jurisdiction's site is probed by this script: every latency is a recorded
// measurement, never a fresh request.

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { COUNTY_SLUG, JOB_ID, dirs, files, toJson } from "./paths.mjs";

const JURISDICTIONS = [
  {
    jurisdiction: "andalusia",
    display_name: "Andalusia",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No permit page exists on the village site. The site carries Ordinances, Zoning Ordinances, Public Works and Contact only.",
  },
  {
    jurisdiction: "carbon-cliff",
    display_name: "Carbon Cliff",
    vendor: "unknown",
    vendor_real_name: null,
    search: "none",
    discovery_status: "discovered",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "delegated-records-unconfirmed",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "Permitting is contracted to the City of East Moline for all Plumbing, Mechanical, Building and Electrical work. Whether Carbon Cliff permit records live inside the East Moline iWorQ instance could not be confirmed, because that instance returns nothing without an exact permit number. Recorded as unconfirmed rather than guessed.",
  },
  {
    jurisdiction: "coal-valley",
    display_name: "Coal Valley",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No online permit lookup exists. PDF application submitted by mail, email or in person. Coal Valley issues its own permits but directs inspections to Rock Island County at 309-558-3771.",
  },
  {
    jurisdiction: "cordova",
    display_name: "Cordova",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No online permit lookup exists. PDF application submitted by mail, email or in person.",
  },
  {
    jurisdiction: "east-moline",
    display_name: "East Moline",
    vendor: "custom",
    vendor_real_name: "iWorQ",
    search: "by-permit-number",
    discovery_status: "certified",
    online_lookup: "lookup-only",
    latency_p50_ms: 1834,
    latency_p95_ms: 2457,
    ingest_status: "lookup-only-not-harvested",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "iWorQ portal is runtime lookup only. Its result table renders zero rows until an exact permit number or primary contractor is supplied, and it offers no browse-all and no date filter, so it cannot be enumerated and was not harvested.",
  },
  {
    jurisdiction: "hampton",
    display_name: "Hampton",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No online permit lookup exists. PDF application submitted by mail, email or in person.",
  },
  {
    jurisdiction: "hillsdale",
    display_name: "Hillsdale",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No village website exists. Candidate domains villageofhillsdale.org, hillsdaleil.org, hillsdaleillinois.org and villageofhillsdaleil.org were all probed and all failed to connect. Permits are handled at the village clerk's counter.",
  },
  {
    jurisdiction: "milan",
    display_name: "Milan",
    vendor: "custom",
    vendor_real_name: "GovBuilt",
    search: "browse-only",
    discovery_status: "discovered",
    online_lookup: "blocked",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "blocked-not-harvested",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "GovBuilt portal returned a 403 Cloudflare challenge and its search capability could not be observed. Out of scope by the standing no-US-egress decision; nothing about its contents is asserted.",
  },
  {
    jurisdiction: "moline",
    display_name: "Moline",
    vendor: "centralsquare",
    vendor_real_name: "CentralSquare eTRAKiT",
    search: "by-address",
    discovery_status: "certified",
    online_lookup: "lookup-only",
    latency_p50_ms: 981,
    latency_p95_ms: 1129,
    ingest_status: "lookup-only-not-harvested",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "CentralSquare eTRAKiT portal is runtime lookup only. It searches Permit Number and Site Address, exposes no date-range filter and offers no browse-all, so it cannot be enumerated and was not harvested.",
  },
  {
    jurisdiction: "oak-grove",
    display_name: "Oak Grove",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No village website exists. Its only web presence is Facebook pages and directory listings. Permits are handled at the village clerk's counter.",
  },
  {
    jurisdiction: "port-byron",
    display_name: "Port Byron",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No online permit lookup exists. PDF application submitted by mail, email or in person.",
  },
  {
    jurisdiction: "rapids-city",
    display_name: "Rapids City",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      'Counter-only by explicit policy: "A permit will need to be purchased in person at the Village of Rapids City Office... No permits or payments for permits will be accepted via email, fax, or mail!" Rapids City adopts the county fee schedule but runs its own counter-only permitting.',
  },
  {
    jurisdiction: "reynolds",
    display_name: "Reynolds",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No village website exists. Its only web presence is Facebook pages and directory listings. Permits are handled at the village clerk's counter.",
  },
  {
    jurisdiction: "rock-island",
    display_name: "Rock Island (City)",
    vendor: "tyler",
    vendor_real_name: "Tyler EnerGov Civic Access",
    search: "browse-only",
    discovery_status: "discovered",
    online_lookup: "portal-403-reports-published",
    latency_p50_ms: 2724,
    latency_p95_ms: 5977,
    ingest_status: "ingested",
    ingested_period: null,
    source_url: "https://rigov.org/1276/Permit-Reports",
    coverage_note:
      "The city's Tyler EnerGov Civic Access portal returns HTTP 403 from this egress and was not used. Permits here were ingested from the city's own monthly PDF permit reports at https://rigov.org/1276/Permit-Reports, covering 2017-01 through 2026-04. This is the only bulk-shaped permit source in the county.",
  },
  {
    jurisdiction: "silvis",
    display_name: "Silvis",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No online permit lookup exists. PDF application submitted by mail, email or in person.",
  },
  {
    jurisdiction: "unincorporated-rock-island-county",
    display_name: "Unincorporated Rock Island County",
    vendor: "none-found",
    vendor_real_name: null,
    search: "none",
    discovery_status: "certified",
    online_lookup: "none",
    latency_p50_ms: null,
    latency_p95_ms: null,
    ingest_status: "no-online-permit-lookup-exists",
    ingested_period: null,
    source_url: null,
    coverage_note:
      "No online permit lookup exists. Commercial and Residential PDF applications, submitted by mail, email or in person; 309-558-3771. Absence of records here is absence of a public source, not absence of permits.",
  },
];

// The page each jurisdiction's permit information actually lives on, verbatim from the `url:` key
// of the `permits:` block in docs/rock-island-sources.yaml. `null` is recorded where the discovery
// probe established that no village website exists at all — that is a finding, not a gap.
const SOURCE_URLS = {
  andalusia: "https://villageofandalusiail.org/",
  "carbon-cliff": "https://carboncliff.gov/permits-zoning-and-floodplain",
  "coal-valley": "https://www.coalvalleyil.org/for-businesses/building-permits/",
  cordova: "https://villageofcordova.com/government",
  "east-moline": "https://eastmolinepermit.portal.iworq.net/EASTMOLINE/permits/600",
  hampton: "https://www.hamptonil.org/info.php",
  hillsdale: null,
  milan: "https://www.milanil.org/building-and-inspections",
  moline: "https://moli.csqrcloud.com/community-etrakit/Search/permit.aspx",
  "oak-grove": null,
  "port-byron": "https://www.portbyronil.com/forms-permits",
  "rapids-city": "https://www.rapidscity.us/information.php",
  reynolds: null,
  "rock-island": "https://rigov.org/1276/Permit-Reports",
  silvis: "https://silvisil.org/inspections.html",
  "unincorporated-rock-island-county": "https://www.rockislandcountyil.gov/366/Building-Permits",
};

const CORRECTIONS = [
  {
    corrects: "docs/rock-island-county-findings.md:189",
    was: "It is PDF, so it needs extraction, and it is report-level rather than record-level.",
    now: "The monthly reports are record-level. Each prints one row per permit with permit number, date, parties, description, parcel key, address and valuation. Verified against 15 reports spanning 2017-01 to 2026-04.",
  },
  {
    corrects: "docs/rock-island-county-findings.md:242",
    was: "parcel-keyed permit lookup does not appear to be offered publicly anywhere in the county",
    now: "True of the live portals, not of the published reports. The legacy reports print a TAX_MAP legacy parcel key that matched the parcel layer's RICO_PARCE for 98.50% of a 1,200-record sample, and the 2026-04 EnerGov report prints the 10-digit county PIN directly.",
  },
  {
    corrects: "docs/rock-island-county-findings.md:167",
    was: "monthly PDF reports measured p50 1365 ms",
    now: "1365 ms is the index page. Document fetches measured p50 2724 ms and p95 5977 ms over 15 sequential downloads, so a polite full harvest of 111 reports takes about 9.3 minutes, not the ~190 s the feasibility table estimated.",
  },
];

const ARCHIVE_LAG_NOTE =
  "The city's archive ends at 2026-04. Coverage is stated through 2026-04, not through the current month.";

async function main() {
  const names = (await readdir(dirs.extracted)).filter((f) => f.endsWith(".json")).sort();
  let recordCount = 0;
  const months = [];
  for (const name of names) {
    const artifact = JSON.parse(await readFile(path.join(dirs.extracted, name), "utf8"));
    recordCount += artifact.record_count;
    months.push(artifact.report_month);
  }
  months.sort();

  const linkage = JSON.parse(await readFile(files.linkage, "utf8"));

  const jurisdictions = JURISDICTIONS.map((row) => ({
    ...row,
    // 0 here means "we ingested nothing", which is true. The coverage_note carries why, so 0 is
    // never mistaken for "zero permits exist".
    ingested_record_count: row.jurisdiction === "rock-island" ? recordCount : 0,
    source_url: row.source_url ?? SOURCE_URLS[row.jurisdiction] ?? null,
    ingested_period:
      row.jurisdiction === "rock-island"
        ? `${months[0]}..${months[months.length - 1]}`
        : row.ingested_period,
  }));

  const coverage = {
    county_slug: COUNTY_SLUG,
    job_id: JOB_ID,
    generated_at: new Date().toISOString(),
    report_count: names.length,
    record_count: recordCount,
    period_start: months[0],
    period_end: months[months.length - 1],
    archive_lag_note: ARCHIVE_LAG_NOTE,
    linkage_summary: {
      matched: linkage.matched,
      total: linkage.total_permit_records,
      match_rate_pct: linkage.match_rate_pct,
    },
    jurisdictions,
    corrections: CORRECTIONS,
  };

  await writeFile(files.coverage, toJson(coverage));

  const count = (status) => jurisdictions.filter((j) => j.ingest_status === status).length;
  console.log(
    `coverage: jurisdictions=${jurisdictions.length} offline=${count("no-online-permit-lookup-exists")} lookup_only=${count("lookup-only-not-harvested")} blocked=${count("blocked-not-harvested")} delegated=${count("delegated-records-unconfirmed")} ingested=${count("ingested")}`,
  );
}

await main();
