#!/usr/bin/env node
// Rock Island County source-discovery probe harness.
//
// Drives the reachability half of elephant-xyz/skills skills/county-discovery: for every
// catalogued source it records DNS resolution, HTTP status, elapsed ms and response size, then
// classifies the outcome with one fixed rule set so that "unreachable" is never confused with
// "absent" and a geo-block is never silently reported as a bot challenge.
//
// Usage:  node scripts/probe-sources.mjs      (from the repo root)
// Writes: docs/probe-results.json             (one entry per TARGETS row)
//
// Node 22 built-ins only. No npm packages, no package.json.

import { writeFile, mkdir } from "node:fs/promises";
import dns from "node:dns/promises";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

// A descriptive User-Agent is mandatory. Measured against overpass-api.de on 2026-08-12:
//   ""                                              -> 406
//   "Mozilla/5.0"                                   -> 406
//   "curl/8.7.1"                                    -> 504
//   "ateam-county-discovery/1.0"                    -> 200   <- the one we use
//   "ateam-county-discovery/1.0 (+https://github…)" -> 406
// The parenthesised contact URL is what trips Overpass's filter, so the UA is the bare token form.
const USER_AGENT = "ateam-county-discovery/1.0";

const TIMEOUT_MS = 20000;

const TARGETS = [
  // --- core discovery set (W2) ---------------------------------------------------------------
  {
    id: "parcels-featureserver",
    category: "parcels",
    url: "https://services9.arcgis.com/6FnscPPlUa9DXXOk/arcgis/rest/services/Parcels/FeatureServer/0?f=json",
    expect: "reachable",
  },
  {
    id: "county-cms",
    category: "county",
    url: "https://www.rockislandcountyil.gov/176/Assessment-Search",
    expect: "reachable",
  },
  {
    id: "netr-directory",
    category: "directory",
    url: "https://publicrecords.netronline.com/state/IL/county/rock_island",
    expect: "reachable",
  },
  {
    id: "assessor-devnet-wedge",
    category: "appraisal",
    url: "https://rockislandil.devnetwedge.com/",
    expect: "reachable",
  },
  {
    id: "county-zoning-building",
    category: "permits",
    url: "https://www.rockislandcountyil.gov/QuickLinks.aspx?CID=47",
    expect: "reachable",
  },
  {
    id: "recorder-landrecords",
    category: "recorder",
    url: "https://www.landrecords.com",
    expect: "reachable",
  },
  {
    id: "il-sos-corporate",
    category: "business_registration",
    url: "https://www.ilsos.gov/corporatellc/",
    expect: "reachable",
  },
  {
    id: "hifld-transmission",
    category: "power_infrastructure",
    url: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0?f=json",
    expect: "reachable",
  },
  {
    id: "hifld-power-plants",
    category: "power_infrastructure",
    url: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0?f=json",
    expect: "reachable",
  },
  {
    id: "overpass-api",
    category: "power_infrastructure",
    url: "https://overpass-api.de/api/status",
    expect: "reachable",
  },

  // --- ownership, business registration, contractor reputation (W6) ----------------------------
  {
    id: "il-sos-bulk",
    category: "business_registration",
    url: "https://www.ilsos.gov/departments/business_services/home.html",
    expect: "reachable",
  },
  {
    id: "recorder-tapestry-eon",
    category: "recorder",
    // The redirect target of www.landrecords.com. Probed as its own row precisely so that the
    // failing hop is attributed to the host that actually fails.
    url: "https://tapestry.fidlar.com/TapestryEON",
    expect: "reachable",
  },
  {
    id: "bbb",
    category: "contractor_reputation",
    url: "https://www.bbb.org/us/il/rock-island",
    expect: "reachable",
  },

  // --- permit jurisdictions (W5) ---------------------------------------------------------------
  // One row per jurisdiction that HAS a discovered URL. Hillsdale, Oak Grove and Reynolds have no
  // website at all and are therefore absent here: there is no endpoint to probe. That absence is
  // recorded in docs/rock-island-sources.yaml as vendor: none-found, url: null — a finding, not a
  // gap in this harness.
  {
    id: "permits-unincorporated-rock-island-county",
    category: "permits",
    url: "https://www.rockislandcountyil.gov/366/Building-Permits",
    expect: "reachable",
  },
  {
    id: "permits-andalusia",
    category: "permits",
    url: "https://villageofandalusiail.org/",
    expect: "reachable",
  },
  {
    id: "permits-carbon-cliff",
    category: "permits",
    url: "https://carboncliff.gov/permits-zoning-and-floodplain",
    expect: "reachable",
  },
  {
    id: "permits-coal-valley",
    category: "permits",
    url: "https://www.coalvalleyil.org/for-businesses/building-permits/",
    expect: "reachable",
  },
  {
    id: "permits-cordova",
    category: "permits",
    url: "https://villageofcordova.com/government",
    expect: "reachable",
  },
  {
    id: "permits-east-moline",
    category: "permits",
    url: "https://eastmolinepermit.portal.iworq.net/EASTMOLINE/permits/600",
    expect: "reachable",
  },
  {
    id: "permits-hampton",
    category: "permits",
    url: "https://www.hamptonil.org/info.php",
    expect: "reachable",
  },
  {
    id: "permits-milan",
    category: "permits",
    url: "https://www.milanil.org/building-and-inspections",
    expect: "reachable",
  },
  {
    id: "permits-moline",
    category: "permits",
    url: "https://moli.csqrcloud.com/community-etrakit/Search/permit.aspx",
    expect: "reachable",
  },
  {
    id: "permits-port-byron",
    category: "permits",
    url: "https://www.portbyronil.com/forms-permits",
    expect: "reachable",
  },
  {
    id: "permits-rapids-city",
    category: "permits",
    url: "https://www.rapidscity.us/information.php",
    expect: "reachable",
  },
  {
    id: "permits-rock-island",
    category: "permits",
    url: "https://cityofrockislandil-energovweb.tylerhost.net/apps/selfservice",
    expect: "reachable",
  },
  {
    id: "permits-rock-island-monthly-reports",
    category: "permits",
    url: "https://rigov.org/1276/Permit-Reports",
    expect: "reachable",
  },
  {
    id: "permits-silvis",
    category: "permits",
    url: "https://silvisil.org/inspections.html",
    expect: "reachable",
  },
];

/**
 * The verdict rule. This is the whole point of the harness: it separates a network-layer block
 * (DNS resolves, TCP does not connect) from a missing host (DNS does not resolve) from an
 * application-layer denial (403/401), because each needs a different mitigation and only one of
 * them is ever evidence about whether the data exists.
 */
function verdictFor(httpStatus, dnsA) {
  if (httpStatus >= 200 && httpStatus <= 399) return "reachable";
  if (httpStatus === 0) return dnsA.length > 0 ? "tcp-blocked" : "dns-unresolved";
  if (httpStatus === 403 || httpStatus === 401) return "http-denied";
  return "http-error";
}

async function resolveBoth(hostname) {
  const out = { dns_a: [], dns_aaaa: [] };
  try {
    out.dns_a = await dns.resolve4(hostname);
  } catch {
    out.dns_a = [];
  }
  try {
    out.dns_aaaa = await dns.resolve6(hostname);
  } catch {
    out.dns_aaaa = [];
  }
  return out;
}

async function probe(target) {
  const hostname = new URL(target.url).hostname;
  const { dns_a, dns_aaaa } = await resolveBoth(hostname);

  let httpStatus = 0;
  let bytes = 0;
  let error = null;
  let redirectTo = null;
  const started = performance.now();
  try {
    // Manual, not follow. A followed redirect attributes the redirect TARGET's failure to the
    // ORIGIN host, which would have recorded landrecords.com (alive, answers 301) as blocked when
    // the actual dead hop is tapestry.fidlar.com (no DNS). Each row measures its own host; the
    // redirect target is catalogued as its own target row.
    const res = await fetch(target.url, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    httpStatus = res.status;
    const body = await res.arrayBuffer();
    bytes = body.byteLength;
  } catch (err) {
    error = String(err && err.message ? err.message : err);
  }
  const ms = Math.round(performance.now() - started);

  return {
    id: target.id,
    category: target.category,
    url: target.url,
    host: hostname,
    http_status: httpStatus,
    ms,
    dns_a,
    dns_aaaa,
    bytes,
    redirect_to: redirectTo,
    error,
    verdict: verdictFor(httpStatus, dns_a),
    expect: target.expect,
    probed_at: new Date().toISOString(),
  };
}

async function main() {
  const results = [];
  // Sequential on purpose. This is a politeness probe of public infrastructure, not a load test.
  for (const target of TARGETS) {
    const row = await probe(target);
    results.push(row);
    console.log(
      `${row.id.padEnd(42)} ${row.verdict.padEnd(16)} ${String(row.http_status).padStart(3)} ${String(row.ms).padStart(6)}ms`,
    );
  }

  await mkdir("docs", { recursive: true });
  await writeFile("docs/probe-results.json", JSON.stringify(results, null, 2) + "\n", "utf8");

  const tally = {};
  for (const r of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  console.log("\n" + results.length + " targets probed ->", JSON.stringify(tally));
  console.log("written: docs/probe-results.json");
}

await main();
