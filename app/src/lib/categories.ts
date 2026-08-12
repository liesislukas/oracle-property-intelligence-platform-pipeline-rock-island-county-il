// The six record categories the demo transcript names — property, permit, ownership, contractor,
// business, coordinate — mapped to what the pipeline actually loaded, or to an explicit documented
// gap. ISSUE-028.
//
// Three coverage kinds, and the rule for each:
//   loaded         — records landed, counted once against the sources of the named stages.
//   carried-by     — the records are fields of a dataset already counted under another category.
//                    They are shown, labelled "already counted", and NEVER added again.
//   documented-gap — no records. The page states why and what was checked, and renders NO number
//                    of any kind. Never a zero, never a dash, never a placeholder.
//
// Every string in `gapStatements` is a measurement quoted verbatim — from
// `docs/rock-island-county-findings.md` where the fact is a discovery finding, and from the stage
// manifest's own `gaps`/`notes` where the ingest run has since measured it more precisely. Neither
// is paraphrased: a paraphrased measurement is a provenance failure.

import type { ManifestSource, StageEntry, StageId } from "@/lib/stageManifests";
import { allSources } from "@/lib/stageManifests";

export type CategoryId =
  | "property"
  | "permit"
  | "ownership"
  | "contractor"
  | "business"
  | "coordinate";

export type CategoryCoverage =
  /** Records were loaded by these stages and are counted against them. */
  | { kind: "loaded"; stageIds: StageId[] }
  /** Records are carried by a dataset already counted under another category. Never re-counted. */
  | { kind: "carried-by"; stageIds: StageId[]; carrierLabel: string }
  /** No records. State why and what was checked. Never rendered as zero. */
  | { kind: "documented-gap" };

export type Category = {
  id: CategoryId;
  /** The transcript's own word. */
  label: string;
  coverage: CategoryCoverage;
  /** What this category is, in one plain sentence for a non-technical reader. */
  description: string;
  /** Verbatim measurements. Never paraphrased, never truncated. */
  gapStatements: string[];
  /** Which findings section backs the statements. */
  findingsSection: string;
  /** Internal detail route. */
  detailHref: string;
};

export const CATEGORIES: Category[] = [
  {
    id: "property",
    label: "Property records",
    coverage: { kind: "loaded", stageIds: ["seed", "property-ingest"] },
    description:
      "Parcel-level property records — owner, situs and mailing address, assessed values, acreage, year built, square footage, zoning and class.",
    gapStatements: [
      "The county assessor portal (DEVNET Wedge, rockislandil.devnetwedge.com) is unreachable from this egress — DNS resolves to 184.105.34.17 and TCP connect times out after 20 s on IPv4 and IPv6. This proves the host does not accept connections from this egress. It does not prove the portal is down, bot-protected, or unusable from a US exit.",
      "The reachable substitute is the county's own GIS parcel layer, which independently carries owner name, mailing address, situs address, EAV/EMV assessed values, acreage, last-sale date and price, year built, square footage, zoning and class for 65,955 parcels with no auth. It is not a substitute for the assessor portal and is catalogued separately.",
      "The assessor property-class code-to-label table is NOT YET MAPPED — it lives on the unreachable portal. 23 distinct class codes are measured; which code means commercial or industrial is not established.",
      "Coverage is not uniform: owner1_name 99.71%, taxbill_name 99.71%, EAV > 0 96.18%, EMV > 0 89.47%, site_address 88.91%, YRBuilt 81.0%. Empty is \"\" or \" \", not NULL.",
    ],
    findingsSection: "§ 1, § 4",
    detailHref: "/data",
  },
  {
    id: "permit",
    label: "Permit records",
    coverage: { kind: "loaded", stageIds: ["permits"] },
    description:
      "Building-permit records for the jurisdictions in Rock Island County that publish them online.",
    gapStatements: [
      "Permits are not county-level. The county GIS Municipal Boundaries layer returns 15 municipalities, and unincorporated county is a sixteenth jurisdiction, so there are 16 permit jurisdictions, each its own permitting authority with its own vendor and its own idea of what is public.",
      "11 of 16 jurisdictions have no online permit lookup of any kind, including the county's own unincorporated jurisdiction. Three villages — Hillsdale, Oak Grove and Reynolds — have no website whatsoever.",
      "Permit coverage for Rock Island County cannot be complete from public online sources. A parcel in Reynolds with no permits found is not a parcel with no permits.",
      "No parcel-keyed permit search exists anywhere in the county. Moline searches by address, East Moline by permit number or contractor. Joining permits to parcels goes through address matching against a site_address field that is only 88.91% populated.",
      "The Rock Island Tyler EnerGov portal returns 403 from this egress and Milan's GovBuilt portal returns a 403 Cloudflare challenge. Rock Island's monthly PDF permit reports at rigov.org/1276/Permit-Reports are reachable and are the one bulk-shaped permit source in the county.",
    ],
    findingsSection: "§ 3, § 7",
    detailHref: "/data",
  },
  {
    id: "ownership",
    label: "Ownership records",
    coverage: {
      kind: "carried-by",
      stageIds: ["seed", "property-ingest"],
      carrierLabel: "Rock Island County GIS — parcel layer (ArcGIS FeatureServer 0)",
    },
    description:
      "Who owns each parcel, and how long they have owned it — carried by the owner and sale fields of the parcel dataset, not by a separate ownership source.",
    gapStatements: [
      "Ownership records are the owner fields of the parcel dataset — owner1_name (99.71%), taxbill_name (99.71%) and taxbill_addr (99.71%) — plus tenure from date_last_sale. They are NOT a separate source and are not counted again in the run total.",
      "Ownership tenure is answerable: date_last_sale is populated for 46,182 of 65,955 parcels (70.0%), and 12,476 parcels have a last sale more than 10 years before 2026-08-12. The 30% with a null date_last_sale are unknown tenure, not long-held.",
      "Full ownership HISTORY — the chain of deeds, mortgages and liens — is not available. The county Recorder's land-record search is Fidlar Tapestry; www.landrecords.com answers its 301 normally and tapestry.fidlar.com returns no A record and no AAAA record from this resolver — verdict dns-unresolved. This is a different failure mode from the assessor portal's TCP block and must not be conflated with it.",
      "Tapestry is additionally a pay-per-search commercial product. Even reachable, it would not be a free bulk source. The parcel layer gives the LAST sale, not the sequence of them.",
      "owner1_name and taxbill_name disagree in 2 of 3 sampled records, including an apparent source typo (SHELTER K TRUST vs SHETLER KATHRYN/KENNETH D). gross_sale_price exceeds 100 on only 20,378 of 65,955 parcels — sale price is not market value in this dataset.",
    ],
    findingsSection: "§ 6, § 9",
    detailHref: "/data",
  },
  {
    id: "contractor",
    label: "Contractor records",
    coverage: { kind: "documented-gap" },
    description:
      "Contractor reputation records — who did the work, and what their standing is.",
    gapStatements: [
      "Better Business Bureau (BBB) — geo-blocked from this egress. Measured 2026-08-12: https://www.bbb.org/us/il/rock-island returns HTTP 403 on IPv4 and IPv6, and so does https://www.bbb.org/ itself. The block is at the site's edge and applies to the whole domain from here.",
      "BBB was NOT harvested and the bbb-harvest skill was NOT run — skipped by decision, with the feasibility gate recording undetermined-unreachable. This is recorded as unreachable from this egress, never as absent.",
      "BBB is a national source, not a county one — the same BBB covers Rock Island as covers everywhere else, so nothing county-specific was missed in discovery.",
      "Re-probing from a US exit is the single action that would upgrade this row: node scripts/probe-sources.mjs from the repo root.",
    ],
    findingsSection: "§ 6, § 7",
    detailHref: "/sources",
  },
  {
    id: "business",
    label: "Business records",
    coverage: { kind: "documented-gap" },
    description:
      "Registered business entities — the corporate and LLC records behind commercial owners.",
    gapStatements: [
      "Illinois Secretary of State, Business Services corporate/LLC search (https://www.ilsos.gov/corporatellc/) — geo-blocked. Measured 2026-08-12: HTTP 403 on every path tried, on both IPv4 and IPv6, and also with a full browser User-Agent, Accept and Accept-Language. The 403 is served by an Akamai edge with no application content.",
      "Uniform 403 across an entire domain — including plain static content pages that have nothing to protect — is characteristic of an edge geo-rule rather than a per-request bot challenge. That is the strongest statement this evidence supports. It is not recorded as \"no public source\", and not as \"bot-protected\".",
      "The sunbiz-corporate-ingest skill does not apply to this county. Sunbiz is the Florida Division of Corporations; there is no Sunbiz outside Florida. The Illinois equivalent is a first-run source with no kit precedent.",
      "Illinois' paid bulk corporate-data purchase channel was NOT evaluated because the entire domain is blocked from this egress. It is named as an unevaluated option, not as unavailable.",
    ],
    findingsSection: "§ 6, § 7, § 10",
    detailHref: "/sources",
  },
  {
    id: "coordinate",
    label: "Coordinate records",
    coverage: {
      kind: "carried-by",
      stageIds: ["seed", "property-ingest", "geo-signals"],
      carrierLabel:
        "Rock Island County GIS — parcel layer (ArcGIS FeatureServer 0), plus the power, transit and water layers of the geo-signals stage",
    },
    description:
      "Location and coordinate data — parcel polygons and centroids, plus the power, transit and water geometry used for data-centre siting.",
    gapStatements: [
      // Findings § 4 — the parcel geometry measurements, unchanged by the ingest run.
      "Coordinate records are the geometry of the parcel dataset — 65,407 Polygon plus 621 MultiPolygon features, 0 null geometries, measured over the bulk export — together with the per-parcel centroids X_longitude and Y_latitude. They are NOT a separate source and are not counted again in the run total.",
      "Geometry is esriGeometryPolygon, native SR wkid 102672 (NAD83 Illinois West ftUS), outSR=4326 verified working, CORS access-control-allow-origin: *, no token and no API key. Licence: \"For use by the general public\", quoted from the ArcGIS Online item, not the FeatureServer endpoint.",
      // Quoted from the geo-signals stage manifest's own gaps — the ingest run measured the clip
      // more precisely than discovery did, so these supersede the discovery-bbox figures.
      "Bounding-box counts are not county counts. The fetch rectangle crosses the Mississippi into Scott, Muscatine and Cedar counties, Iowa. The clipped count is the county figure.",
      "HIFLD publishes no public electric substations layer. Listing all 222 services in the HIFLD ArcGIS organisation and filtering for substation|transmission|power|electric|energy matched exactly four services, none of them substations. OpenStreetMap is the public substitute, and its provenance character is fundamentally different from HIFLD's.",
      "HIFLD's INFERRED field marks a route that was inferred from imagery and open data rather than surveyed. These lines are approximately where the grid is, not authoritatively where it is, and any distance computed from them inherits that uncertainty: 55 of 60 in-county lines (92%) are INFERRED=Y.",
      "Distribution-level (sub-transmission) infrastructure — no public source located. HIFLD covers bulk transmission only, and distribution networks are generally utility-confidential. No utility was contacted.",
    ],
    findingsSection: "§ 4, § 6",
    detailHref: "/data",
  },
];

/** The sources a category resolves to, out of the manifests that are actually on disk. Returns []
 *  for a documented gap, and [] when the owning stage has not run — which the page states as
 *  "not yet ingested", never as a count of zero. */
export function categorySources(
  category: Category,
  stages: StageEntry[],
): Array<ManifestSource & { stage: StageId }> {
  if (category.coverage.kind === "documented-gap") return [];
  const wanted = new Set<StageId>(category.coverage.stageIds);
  return allSources(stages.filter((stage) => wanted.has(stage.id)));
}
