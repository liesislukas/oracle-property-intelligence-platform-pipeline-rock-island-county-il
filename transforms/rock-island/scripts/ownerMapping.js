/**
 * Rock Island County — owner classification.
 *
 * Two roles, deliberately:
 *   1. It is one of the four mapping modules `@elephant-xyz/cli@1.58.1` runs before
 *      `data_extractor.js` (dist/commands/transform/script-runner.js lines 119-127 make all four
 *      mandatory). Run as a script it writes nothing and exits 0 — this source has no per-owner
 *      document to map on its own.
 *   2. It exports `classifyOwner(name)`, which `data_extractor.js` imports.
 *
 * The rule is fixed and deterministic so the person/company split is auditable, and the branch
 * taken is recorded per parcel. Nothing about the name string is cleaned, re-cased or re-ordered.
 */

const COMPANY_TOKENS = new Set([
  "LLC", "INC", "CORP", "CO", "COMPANY", "LTD", "LP", "LLP", "TRUST", "TR", "ESTATE", "BANK",
  "CHURCH", "ASSN", "ASSOCIATION", "PARTNERSHIP", "FOUNDATION", "MINISTRIES", "SCHOOL",
  "DISTRICT", "DEPT", "AUTHORITY", "COMMISSION", "USA", "STATE", "CITY", "VILLAGE", "COUNTY",
  "TOWNSHIP", "RAILROAD",
]);

const COMPANY_PREFIXES = [
  "CITY OF", "VILLAGE OF", "COUNTY OF", "STATE OF", "UNITED STATES",
];

/**
 * @param {unknown} name
 * @returns {"company"|"person"|null} null when the name is absent (blank after trim).
 */
export function classifyOwner(name) {
  const n = String(name ?? "").trim().toUpperCase();
  if (n === "") return null;
  for (const p of COMPANY_PREFIXES) if (n.startsWith(p)) return "company";
  for (const token of n.split(/[^A-Z0-9]+/)) if (COMPANY_TOKENS.has(token)) return "company";
  return "person";
}

// Run as a mapping module: nothing to write for this source. Exit 0 — a non-zero exit aborts the
// whole transform (script-runner.js lines 129-136).
