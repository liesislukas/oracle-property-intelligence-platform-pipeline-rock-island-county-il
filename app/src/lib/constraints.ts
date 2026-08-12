// The constraint narrative and the per-source 48-hour feasibility decisions, transcribed from
// `docs/rock-island-county-findings.md` §§ 3, 5, 6, 7, 8 and 10. ISSUE-028.
//
// Nothing here is re-derived, recomputed or re-probed. These are measurements taken 2026-08-12 by
// the source-discovery run and recorded; this module only carries them to the page.
//
// One deliberate correction: findings § 7 writes the count as "4" in the sentence that then
// enumerates the assessor portal, IL SOS, BBB, and the Rock Island and Milan permit portals — five
// sources. §§ 8 and 10 both say five, and the enumeration is five. The UI says FIVE. The typo in
// § 7 is not propagated, and the findings doc should be corrected separately.

/** The branch lives on the `liesislukas` fork (PR #2 against `prismteam-ai`), so the blob URL that
 *  actually resolves today is the fork's. Change to the upstream `/blob/main/` URL on merge. */
export const FINDINGS_DOC_URL =
  "https://github.com/liesislukas/oracle-property-intelligence-platform-pipeline-rock-island-county-il/blob/feat/rock-island-source-discovery/docs/rock-island-county-findings.md";

export type ConstraintKind = "fragmentation" | "absence" | "egress";

export type Constraint = {
  kind: ConstraintKind;
  heading: string;
  /** Plain-language body, from findings § 7. */
  body: string;
  /** The measured facts behind it, one per line. */
  evidence: string[];
  findingsSection: string;
};

export const SPEED_HEADLINE = {
  heading: "Nothing reachable in this county is slow.",
  body: "Every reachable source answers in under 2 seconds, none rate-limited us, none returned a 429, and the largest dataset in scope — 65,955 parcel polygons — downloads whole, in 4.8 seconds, as a 19 MB shapefile. The 48-hour feasibility gate is not close to binding on any reachable source. A pipeline built on this county will not be waiting on the network.",
  caveat:
    "The one structural data limit worth flagging to a consumer: the parcel layer's per-request cap of maxRecordCount 2000 and the Hub export's cached-snapshot drift (66,028 export features vs 65,955 live) mean a full-fidelity extract must either paginate 33 live requests or accept a stale count. Neither is slow; both need to be a deliberate choice.",
};

export const CONSTRAINTS: Constraint[] = [
  {
    kind: "fragmentation",
    heading: "Fragmentation — the real constraint",
    body: "Permits are split across 16 jurisdictions with no shared vendor. Four online jurisdictions run four different platforms, so the one-adapter-per-vendor leverage that county-discovery depends on does not apply here. Zoning is fragmented the same way, so there is no countywide zoning classification for incorporated land.",
    evidence: [
      "16 permit jurisdictions: the 15 municipalities in the county GIS Municipal Boundaries layer, plus unincorporated county.",
      "4 distinct vendors in 4 adjacent cities — Moline: CentralSquare eTRAKiT · Rock Island: Tyler EnerGov Civic Access · East Moline: iWorQ · Milan: GovBuilt. No two jurisdictions share a vendor.",
      "iWorQ and GovBuilt are real commercial permit platforms and neither appears in county-discovery's known-vendor library. Both are recorded as \"custom\" with the true vendor named. The library should gain iworq and govbuilt.",
      "77.4% of parcels (51,039 of 65,955) carry a three-letter municipality code in the Zoning field instead of a zoning class. Only 20.9% (13,770) carry a county zoning class; 1.7% (1,146) are empty or null.",
      "Municipal zoning for Moline, Rock Island, East Moline and Silvis — 43,531 parcels, two-thirds of the county — would have to be sourced from each municipality separately.",
    ],
    findingsSection: "§ 3, § 5, § 7",
  },
  {
    kind: "absence",
    heading: "Absence — not a speed limit at all",
    body: "11 of 16 permit jurisdictions have no online permit lookup of any kind, including the county's own unincorporated jurisdiction. No amount of throughput fixes this. Countywide permit completeness from public online sources is not achievable, and any countywide permit claim must be scoped rather than implied.",
    evidence: [
      "PDF application, submit by mail, email or in person: unincorporated county, Coal Valley, Cordova, Hampton, Port Byron, Silvis.",
      "Counter-only by explicit policy — Rapids City: \"A permit will need to be purchased in person at the Village of Rapids City Office… No permits or payments for permits will be accepted via email, fax, or mail!\"",
      "No permit page at all: Andalusia.",
      "No village website exists at all: Hillsdale, Oak Grove, Reynolds. Multiple candidate domains were probed for each and every one failed to connect. Their only web presence is Facebook pages and directory listings.",
      "Consequence: a parcel in Reynolds with no permits found is not a parcel with no permits. The UI must say which of the two it means.",
      "Three cross-jurisdiction arrangements would otherwise cause misattribution: Carbon Cliff contracts its permitting to East Moline; Coal Valley issues its own permits but directs inspections to Rock Island County; Rapids City adopts the county fee schedule while running its own counter-only permitting.",
    ],
    findingsSection: "§ 3, § 7",
  },
  {
    kind: "egress",
    heading: "Egress — our constraint, not the county's",
    body: "Five sources are unreachable from the Lithuanian egress this discovery run executed from. This is an artefact of our run, not a fact about Rock Island County. It is recorded as such throughout, and one action — re-probing from a US exit — resolves it.",
    evidence: [
      "The five: the county assessor portal (DEVNET Wedge), the Illinois Secretary of State business-registration search, the Better Business Bureau, and the Rock Island and Milan permit portals.",
      "Three distinct block mechanisms were observed and they need different mitigations. Conflating them leads to the wrong fix.",
      "tcp-blocked — assessor portal: DNS resolves to 184.105.34.17, TCP connect times out after 20 s on IPv4 and IPv6. A network-layer filter; it needs a different egress. This is not what a bot challenge looks like — a bot challenge completes the connection and answers with a page.",
      "http-denied (403) — IL SOS, BBB, Rock Island, Milan: an edge rule. From a non-US egress we cannot tell a geo-block from a bot rule. Milan's is explicitly a Cloudflare \"Just a moment…\" challenge, which may yield to a real browser session; the assessor's TCP timeout will not.",
      "dns-unresolved — the Recorder (Fidlar Tapestry): the hostname returns no A and no AAAA record from this resolver. A DNS failure does not prove the service is retired.",
      "Upgrade path: supply a US exit and re-run \"node scripts/probe-sources.mjs\" from the repo root. Nothing else in the findings depends on it — every other source was reached and measured. The residual question is fidelity, not feasibility.",
      "No block was bypassed to produce these findings. No proxy was shopped for, no header was spoofed beyond the declared User-Agent, and no anonymising network was used.",
    ],
    findingsSection: "§ 7, § 8, § 10",
  },
];

export type FeasibilityRow = {
  /** A manifest source id when the source is in the loaded run and has a row on /sources; null when
   *  it was never ingested (unreachable, or not evaluated) and therefore has nothing to link to. */
  sourceId: string | null;
  label: string;
  /** "65,955" or the literal "not-measured". */
  records: string;
  /** "0.46 s" or the literal "not-measured". */
  p50: string;
  estimate: string;
  decision: string;
  why: string;
};

export const FEASIBILITY_FORMULA =
  "hours = (record_count / page_size) * p50_seconds / safe_concurrency / 3600, with a 1.2x retry-overhead multiplier applied to every estimate. Where any input is unmeasured the estimate is \"not-estimable\" naming the missing input — never a guessed number.";

/** The Records and p50 columns are the source-discovery measurements of 2026-08-12, taken before
 *  any stage ran. Where a stage has since run, the loaded county count is in the source table
 *  above; the two are different measurements and neither is corrected into the other. */
export const FEASIBILITY_NOTE =
  "Records and p50 below are the source-discovery measurements of 2026-08-12, taken before any pipeline stage ran, and several used a rectangular bounding box rather than the county polygon. Where a stage has since run, its loaded county count is in the source table above. The two are different measurements and neither is silently corrected into the other.";

export const FEASIBILITY_ROWS: FeasibilityRow[] = [
  {
    sourceId: "rock-island-parcels-featureserver",
    label: "Parcels (county GIS layer)",
    records: "65,955",
    p50: "0.46 s",
    estimate:
      "18 s paged (33 pages × 0.46 s × 1.2), or 4.8 s for the 19 MB shapefile",
    decision: "download",
    why: "Bulk artifact exists and is trivially cheap. Five orders of magnitude inside the gate.",
  },
  {
    sourceId: "rock-island-parcels-featureserver",
    label: "Zoning and class codes",
    records: "65,955",
    p50: "0.46 s",
    estimate: "same 18 s — attributes ride along with the parcel pull",
    decision: "download",
    why: "Same layer, same request. No separate fetch.",
  },
  {
    sourceId: null,
    label: "Assessor portal (DEVNET Wedge)",
    records: "not-measured",
    p50: "not-measured",
    estimate:
      "not-estimable (unmeasured: latency, page size, record count — host TCP-blocked)",
    decision: "undetermined-unreachable",
    why: "Cannot be estimated from this egress. Re-probe from a US exit.",
  },
  {
    sourceId: null,
    label: "IL SOS business registration",
    records: "not-measured",
    p50: "not-measured",
    estimate: "not-estimable (unmeasured: latency, record count — domain 403)",
    decision: "undetermined-unreachable",
    why: "Whole domain refused. The paid bulk channel is the likely real path and is unevaluated.",
  },
  {
    sourceId: null,
    label: "Recorder (Fidlar Tapestry)",
    records: "not-measured",
    p50: "not-measured",
    estimate: "not-estimable (unmeasured: everything — DNS does not resolve)",
    decision: "undetermined-unreachable",
    why: "Also a pay-per-search commercial product, so unlikely to be bulk-feasible even when reachable.",
  },
  {
    sourceId: null,
    label: "Contractor reputation (BBB)",
    records: "not-measured",
    p50: "not-measured",
    estimate: "not-estimable (unmeasured: latency, record count — 403)",
    decision: "undetermined-unreachable",
    why: "National source; blocked from this egress.",
  },
  {
    sourceId: "hifld-transmission-lines",
    label: "HIFLD transmission lines",
    records: "78",
    p50: "0.46 s",
    estimate: "0.6 s (single bbox request)",
    decision: "download",
    why: "One request returns the whole county.",
  },
  {
    sourceId: "hifld-power-plants",
    label: "HIFLD power plants",
    records: "2",
    p50: "0.42 s",
    estimate: "0.5 s (single bbox request)",
    decision: "download",
    why: "One request.",
  },
  {
    sourceId: "osm-substations",
    label: "OSM substations",
    records: "66",
    p50: "1.47 s",
    estimate: "1.8 s (single Overpass query)",
    decision: "download",
    why: "One query.",
  },
  {
    sourceId: "osm-power-lines",
    label: "OSM power lines",
    records: "176",
    p50: "1.52 s",
    estimate: "1.8 s (single Overpass query)",
    decision: "download",
    why: "One query.",
  },
  {
    sourceId: null,
    label: "MISO interconnection queue",
    records: "not-measured",
    p50: "not-measured",
    estimate: "not-estimable (unmeasured: everything — not evaluated)",
    decision: "undetermined-unreachable",
    why: "Named as the next place to look, not assessed.",
  },
  {
    sourceId: "moline-etrakit-permit-search",
    label: "Permits — Moline (eTRAKiT)",
    records: "not-measured",
    p50: "0.981 s",
    estimate:
      "not-estimable (unmeasured: record count — no browse-all, count not exposed)",
    decision: "runtime-fetch",
    why: "Search-shaped, not enumerable. Per-address lookup at query time.",
  },
  {
    sourceId: "east-moline-iworq-permit-search",
    label: "Permits — East Moline (iWorQ)",
    records: "not-measured",
    p50: "1.834 s",
    estimate:
      "not-estimable (unmeasured: record count — table returns nothing without an exact permit number)",
    decision: "runtime-fetch",
    why: "Cannot be enumerated at all; targeted lookup only.",
  },
  {
    sourceId: "rock-island-city-permit-reports",
    label: "Permits — Rock Island monthly PDF reports",
    records: "~116 monthly reports (2017-01 → 2026-08)",
    p50: "1.365 s",
    estimate: "190 s (116 × 1.365 s × 1.2)",
    decision: "download",
    why: "The one bulk-shaped permit source in the county. PDF, so extraction is required.",
  },
  {
    sourceId: null,
    label: "Permits — Rock Island (Tyler portal)",
    records: "not-measured",
    p50: "not-measured",
    estimate: "not-estimable (unmeasured: everything — 403)",
    decision: "undetermined-unreachable",
    why: "Portal unreachable; the monthly reports above are the reachable substitute.",
  },
  {
    sourceId: "milan-govbuilt-permit-portal",
    label: "Permits — Milan (GovBuilt)",
    records: "not-measured",
    p50: "not-measured",
    estimate: "not-estimable (unmeasured: everything — 403 Cloudflare)",
    decision: "undetermined-unreachable",
    why: "Bot challenge, not a network block.",
  },
  {
    sourceId: "carbon-cliff-permits-delegated",
    label: "Permits — Carbon Cliff",
    records: "not-measured",
    p50: "not-measured",
    estimate:
      "not-estimable (unmeasured: record scope — permitting contracted to East Moline)",
    decision: "undetermined-unreachable",
    why: "Whether its records live in East Moline's instance is unresolved.",
  },
  {
    sourceId: null,
    label: "Permits — the other 11 jurisdictions",
    records: "0 online",
    p50: "n/a",
    estimate: "no online access path exists",
    decision: "not-feasible",
    why: "PDF-application, counter-only, or no website at all. Not slow — absent.",
  },
];
