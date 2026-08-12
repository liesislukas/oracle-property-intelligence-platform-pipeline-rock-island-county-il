// ISSUE-021 — the reconciliation corpus.
//
// WHY THE MIRROR AND NOT THE `parcels` TABLE, stated once here so every metric downstream inherits
// the answer: ISSUE-018's per-parcel ingest is a durable Restate workflow that was STILL RUNNING
// while ISSUE-021 executed, climbing at roughly 1.5 parcels/s toward 65,955 over ~11 hours. Any
// figure computed over `parcels` today would be a figure over a moving, partial subset and could
// never be called a county metric. The per-parcel source mirror at
// `<DATA_DIR>/source-mirror/rock-island/` holds all 65,955 records with all 82 source fields, and
// `scripts/reconcile-before-load.mjs` proves it equals the live FeatureServer count. Reconciliation
// therefore runs over the mirror, and every published metric names the mirror and its record count.
//
// Nothing here repairs, pads or guesses a value. Blank in this source is "" or " ", never NULL, so
// presence is tested after trimming and a blank stays blank.

import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

export const DATA_DIR =
  process.env.DATA_DIR ?? "/Users/lukas/Developer/ateam/elephant-pipeline/data";
export const MIRROR_DIR = join(DATA_DIR, "source-mirror", "rock-island");
const CACHE_PATH = join(DATA_DIR, "derived", "rock-island-reconciliation-input.jsonl");

// The source fields ISSUE-021 reads. Every other field stays in the mirror and in the query DB's
// source_payload; nothing is dropped anywhere, this is just the read set.
const FIELDS = [
  "OBJECTID",
  "PIN",
  "RICO_PARCE",
  "owner1_name",
  "taxbill_name",
  "taxbill_csz",
  "Taxbill_CS",
  "Taxbill_Zip",
  "taxbill_addr",
  "owner1_csz",
  "site_address",
  "Site_City",
  "Site_State",
  "Site_Zip",
];

/** Trim; "" and " " and null all collapse to null. The source writes blanks, not NULLs. */
export function blankToNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

async function buildCache() {
  const names = (await readdir(MIRROR_DIR)).filter((n) => n.endsWith(".json")).sort();
  const out = [];
  let meta = null;
  for (const name of names) {
    const parsed = JSON.parse(await readFile(join(MIRROR_DIR, name), "utf8"));
    const a = parsed.attributes ?? {};
    if (meta === null && parsed.meta) meta = parsed.meta;
    const row = {};
    for (const f of FIELDS) row[f] = a[f] === undefined ? null : a[f];
    out.push(row);
  }
  await mkdir(join(DATA_DIR, "derived"), { recursive: true });
  await writeFile(
    CACHE_PATH,
    `${JSON.stringify({ __meta: meta, __record_count: out.length, __mirror_dir: MIRROR_DIR, __built_at: new Date().toISOString() })}\n${out
      .map((r) => JSON.stringify(r))
      .join("\n")}\n`,
    "utf8",
  );
  return { records: out, meta };
}

/**
 * Every mirrored record, with the read set above. Builds a compact JSONL extract on first call so
 * that the three reconciliation steps read the 264 MB mirror once rather than three times. The
 * extract is derived data under DATA_DIR and is never committed; delete it and it rebuilds.
 */
export async function readSourceMirror({ rebuild = false } = {}) {
  if (!rebuild) {
    try {
      await stat(CACHE_PATH);
      const records = [];
      let header = null;
      const rl = createInterface({
        input: createReadStream(CACHE_PATH, "utf8"),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (line.length === 0) continue;
        if (header === null) {
          header = JSON.parse(line);
          continue;
        }
        records.push(JSON.parse(line));
      }
      if (header !== null && records.length === header.__record_count) {
        return { records, meta: header.__meta, cached: true, builtAt: header.__built_at };
      }
    } catch {
      // fall through and rebuild
    }
  }
  const built = await buildCache();
  return { ...built, cached: false, builtAt: new Date().toISOString() };
}

/** OBJECTID as a decimal string — the pipeline key, board-sweep contract 4. */
export function requestIdentifier(record) {
  const raw = record.OBJECTID;
  if (raw === null || raw === undefined) return null;
  return String(raw);
}

/** PIN verbatim. NEVER normalizeParcelIdentifier: digits-only keying is the Lee County collapse. */
export function parcelIdentifier(record) {
  return record.PIN === null || record.PIN === undefined ? null : String(record.PIN);
}
