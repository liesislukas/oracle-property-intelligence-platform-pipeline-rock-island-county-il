// Shared descriptor table for the seven power and geo-signal datasets.
//
// Every literal here was measured live on 2026-08-12 during planning. Endpoints, licence strings,
// licence provenance, count bands and caveat copy are pinned — do not paraphrase and do not widen
// a band to make a run pass.
//
// Bounding-box conventions differ by transport and getting them backwards returns zero features:
//   ArcGIS envelope order = (W, S, E, N)
//   Overpass bbox order   = (S, W, N, E)

export const UA = "ateam-county-discovery/1.0";
export const COUNTY_SLUG = "rock-island";

// The TIGER county envelope, rounded outward to two decimals. Every dataset is fetched over this.
export const FETCH_BBOX = [-91.08, 41.32, -90.15, 41.79];

// The rectangle used by the ISSUE-001 source-discovery run. It holds 61,384 of the county's 65,955
// parcels (93.1%) and misses the county's two largest generators. Retained for count-only requests
// so the discovery findings stay reproducible; never the basis of a county figure.
export const DISCOVERY_BBOX = [-90.79, 41.36, -90.25, 41.65];

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

const OSM_LICENCE_URL = "https://www.openstreetmap.org/copyright";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const OSM_CROWD_CAVEAT =
  "OpenStreetMap data, licensed ODbL, © OpenStreetMap contributors. Crowd-sourced and not authoritative: completeness is unknown and unwarranted. Nobody guarantees that every feature here is real, and nobody guarantees there are no others.";

export const DATASETS = [
  {
    id: "hifld-transmission-lines",
    label: "HIFLD electric power transmission lines",
    publisher: "Homeland Infrastructure Foundation-Level Data (HIFLD)",
    kind: "transmission-lines",
    geometryType: "LineString",
    transport: "arcgis",
    endpoint:
      "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0",
    licence: "This work is licensed under the Esri Master License Agreement.",
    licenceSource:
      'ArcGIS Online item d4090758322c4d32a4cd002ffaa0aa12 ("U.S. Electric Power Transmission Lines (Archive)"), licenseInfo',
    licenceUrl: null,
    attribution: "U.S. Government",
    crowdSourced: false,
    completenessKnown: true,
    floor: 90,
    ceiling: 400,
    caveats: [
      "HIFLD's INFERRED field marks a route that was inferred from imagery and open data rather than surveyed. These lines are approximately where the grid is, not authoritatively where it is, and any distance computed from them inherits that uncertainty.",
      "VOLTAGE = -999999 is a missing-value sentinel, not a voltage. Rows carrying it are stored with voltage_kv NULL and are excluded from every numeric comparison.",
      'The ArcGIS Online item behind this layer is titled "U.S. Electric Power Transmission Lines (Archive)". It is public and live, but it is published as an archived snapshot.',
    ],
  },
  {
    id: "hifld-power-plants",
    label: "HIFLD power plants",
    publisher: "Homeland Infrastructure Foundation-Level Data (HIFLD) / U.S. EIA",
    kind: "power-plants",
    geometryType: "Point",
    transport: "arcgis",
    endpoint:
      "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0",
    licence: "This work is licensed under the Esri Master License Agreement.",
    licenceSource:
      'ArcGIS Online item b063316fac7345dba4bae96eaa813b2f ("Power Plants in the U.S."), licenseInfo',
    licenceUrl: null,
    attribution: "Energy Information Administration (EIA)",
    crowdSourced: false,
    completenessKnown: true,
    floor: 5,
    ceiling: 50,
    caveats: [
      "Bounding-box counts are not county counts. The fetch rectangle crosses the Mississippi into Scott, Muscatine and Cedar counties, Iowa. The clipped count is the county figure.",
      "The clip is cross-checked against the layer's own County and State attributes: every plant kept by the polygon also reads Rock Island, Illinois.",
    ],
  },
  {
    id: "osm-substations",
    label: "OpenStreetMap electric substations",
    publisher: "OpenStreetMap contributors (via Overpass API)",
    kind: "substations",
    geometryType: "Point",
    transport: "overpass",
    endpoint: OVERPASS_ENDPOINT,
    dataQuery: '[out:json][timeout:180];nwr["power"="substation"]({BB});out center tags;',
    countQuery: '[out:json][timeout:180];nwr["power"="substation"]({BB});out count;',
    licence:
      "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    licenceSource:
      "Overpass API response, osm3s.copyright — copied from the live response, not hardcoded",
    licenceUrl: OSM_LICENCE_URL,
    attribution: OSM_ATTRIBUTION,
    crowdSourced: true,
    completenessKnown: false,
    floor: 80,
    ceiling: 500,
    caveats: [
      OSM_CROWD_CAVEAT,
      "HIFLD publishes no public electric substations layer. Listing all 222 services in the HIFLD ArcGIS organisation and filtering for substation|transmission|power|electric|energy matched exactly four services, none of them substations. OpenStreetMap is the public substitute, and its provenance character is fundamentally different from HIFLD's.",
    ],
  },
  {
    id: "osm-power-lines",
    label: "OpenStreetMap power lines",
    publisher: "OpenStreetMap contributors (via Overpass API)",
    kind: "power-lines",
    geometryType: "LineString",
    transport: "overpass",
    endpoint: OVERPASS_ENDPOINT,
    dataQuery: '[out:json][timeout:180];way["power"="line"]({BB});out geom tags;',
    countQuery: '[out:json][timeout:180];way["power"="line"]({BB});out count;',
    licence:
      "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    licenceSource:
      "Overpass API response, osm3s.copyright — copied from the live response, not hardcoded",
    licenceUrl: OSM_LICENCE_URL,
    attribution: OSM_ATTRIBUTION,
    crowdSourced: true,
    completenessKnown: false,
    floor: 240,
    ceiling: 1500,
    caveats: [OSM_CROWD_CAVEAT],
  },
  {
    id: "osm-bus-stops",
    label: "OpenStreetMap bus stops",
    publisher: "OpenStreetMap contributors (via Overpass API)",
    kind: "bus-stops",
    geometryType: "Point",
    transport: "overpass",
    endpoint: OVERPASS_ENDPOINT,
    dataQuery: '[out:json][timeout:180];node["highway"="bus_stop"]({BB});out center tags;',
    countQuery: '[out:json][timeout:180];node["highway"="bus_stop"]({BB});out count;',
    licence:
      "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    licenceSource:
      "Overpass API response, osm3s.copyright — copied from the live response, not hardcoded",
    licenceUrl: OSM_LICENCE_URL,
    attribution: OSM_ATTRIBUTION,
    crowdSourced: true,
    completenessKnown: false,
    floor: 100,
    ceiling: 2000,
    caveats: [
      OSM_CROWD_CAVEAT,
      'No authoritative GTFS feed was located for the Quad Cities operator. MetroLINK/MetroQC publishes none, transitfeeds returns 403 from our egress, transit.land returns 401 without a key, and the Mobility Database requires authentication. A feed may exist behind those keyed APIs — it is "not located", not "does not exist".',
      "A stop location is not a service. Without a timetable, near a stop does not establish served frequently, or at all.",
    ],
  },
  {
    id: "osm-starbucks",
    label: "OpenStreetMap Starbucks features",
    publisher: "OpenStreetMap contributors (via Overpass API)",
    kind: "starbucks",
    geometryType: "Point",
    transport: "overpass",
    endpoint: OVERPASS_ENDPOINT,
    dataQuery: '[out:json][timeout:180];nwr["name"~"Starbucks",i]({BB});out center tags;',
    countQuery: '[out:json][timeout:180];nwr["name"~"Starbucks",i]({BB});out count;',
    licence:
      "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
    licenceSource:
      "Overpass API response, osm3s.copyright — copied from the live response, not hardcoded",
    licenceUrl: OSM_LICENCE_URL,
    attribution: OSM_ATTRIBUTION,
    crowdSourced: true,
    completenessKnown: false,
    floor: 6,
    ceiling: 60,
    caveats: [
      OSM_CROWD_CAVEAT,
      "A count of OpenStreetMap features matching the name Starbucks, not a verified count of operating stores. A licensed in-store Starbucks inside a grocery store or hotel may be tagged under the host business and missed, and a closed location may persist in the data.",
      "The brand:wikidata=Q37158 cross-check was attempted during source discovery and did not complete. This count rests on the name match alone.",
    ],
  },
  {
    id: "usgs-nhd-waterbodies",
    label: "USGS National Hydrography Dataset waterbodies",
    publisher: "U.S. Geological Survey — The National Map",
    kind: "waterbodies",
    geometryType: "Polygon",
    transport: "arcgis",
    endpoint: "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12",
    licence: "USGS TNM – National Hydrography Dataset.  Data Refreshed July, 2026.",
    licenceSource:
      'MapServer copyrightText (service root); layer 12 copyrightText is "U.S. Geological Survey"',
    licenceUrl: null,
    attribution: "U.S. Geological Survey — a United States Government work, public domain",
    crowdSourced: false,
    completenessKnown: true,
    floor: 1800,
    ceiling: 8000,
    caveats: [
      "This is water location, not water view. A view is a line-of-sight computation requiring terrain elevation and structure heights, and no public structure-height source was found for this county. Anything derived from this layer is distance-to-water and must be labelled as such.",
      "A parcel 50 m from the Mississippi behind a levee and a warehouse has no view. This data cannot tell the difference.",
    ],
  },
];

export const GAPS = [
  "MISO generator interconnection queue — named, not evaluated. MISO is the regional grid operator for northwestern Illinois and publishes a generator interconnection queue. It was not evaluated in this run. It is not claimed to be unavailable; it is the next place to look for interconnection feasibility.",
  "Distribution-level (sub-transmission) infrastructure — no public source located. HIFLD covers bulk transmission only, and distribution networks are generally utility-confidential. No utility was contacted.",
  "Bi-State Regional Commission — named, not evaluated. Recorded as an unevaluated regional source, not as an absent one.",
];

export const ODBL_DERIVATIVE_NOTE =
  "This dataset is a Derivative Database of OpenStreetMap and is offered under the same Open Database License (ODbL) v1.0.";

export function overpassBbox(bbox) {
  const [w, s, e, n] = bbox;
  return `${s},${w},${n},${e}`;
}

export function arcgisEnvelope(bbox) {
  return bbox.join(",");
}
