/**
 * ISSUE-018 — pre-warm @elephant-xyz/cli's own lexicon schema cache.
 *
 *   node scripts/warm-schema-cache.mjs
 *
 * `transform` and `validate` resolve every lexicon schema by CID through four public IPFS
 * gateways (dist/utils/schema-fetcher.js) and cache the result under ~/.elephant-cli/schema-cache.
 * Cold, a single validate took 183 s and still failed on one CID because the gateways time out.
 * At 65,955 parcels that is neither feasible nor polite to the gateways.
 *
 * This script fetches every CID in the published schema manifest ONCE, with retries across the
 * same four gateways, and writes it into the CLI's own cache directory in the CLI's own format.
 * It changes no schema and no data — it only moves the fetch from 65,955 times to once.
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { CID } from "multiformats/cid";

/**
 * Same integrity check the CLI performs on its own fetches (dist/utils/schema-fetcher.js
 * verifyFetchedContent): the bytes must hash to the multihash inside the CID. A gateway is only a
 * transport; content that does not verify is discarded, never cached.
 */
function verify(cidStr, text) {
  const cid = CID.parse(cidStr);
  if (cid.multihash.code !== 0x12) return false; // sha2-256 only
  const digest = createHash("sha256").update(Buffer.from(text, "utf8")).digest();
  return Buffer.from(cid.multihash.digest).equals(digest);
}

const MANIFEST = "https://lexicon.elephant.xyz/json-schemas/schema-manifest.json";
const GATEWAYS = [
  // Pinata first: the four gateways the CLI itself tries were returning 504 "no providers found"
  // for several lexicon CIDs on 2026-08-12, including property_to_file, which every County data
  // group references. Content is hash-verified below, so the gateway is only a transport.
  "https://gateway.pinata.cloud",
  "https://ipfs.io",
  "https://dweb.link",
  "https://w3s.link",
  "https://gateway.ipfs.io",
];
const CACHE = path.join(os.homedir(), ".elephant-cli", "schema-cache");
const ROUNDS = Number(process.env.WARM_ROUNDS) || 8;

await mkdir(CACHE, { recursive: true });
const have = new Set((await readdir(CACHE)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));

const manifest = await (await fetch(MANIFEST)).json();
const cids = new Set();
for (const entry of Object.values(manifest)) if (entry?.ipfsCid) cids.add(entry.ipfsCid);

// Extra CIDs the manifest does not list (relationship schemas referenced from inside a schema).
for (const extra of process.argv.slice(2)) cids.add(extra);

const todo = [...cids].filter((c) => !have.has(c));
console.log(`${cids.size} CIDs in manifest, ${have.size} already cached, ${todo.length} to fetch`);

let ok = 0;
let failed = [];
const queue = [...todo];
const workers = Array.from({ length: 8 }, async () => {
  for (;;) {
    const cid = queue.shift();
    if (!cid) return;
    let done = false;
    for (let r = 0; r < ROUNDS && !done; r++) {
      for (const gw of GATEWAYS) {
        try {
          const res = await fetch(`${gw}/ipfs/${cid}`, { signal: AbortSignal.timeout(12_000) });
          if (!res.ok) continue;
          const text = await res.text();
          const parsed = JSON.parse(text);
          if (typeof parsed !== "object" || parsed === null) continue;
          if (!verify(cid, text)) { console.log(`hash mismatch for ${cid} from ${gw} — discarded`); continue; }
          await writeFile(path.join(CACHE, `${cid}.json`), text, "utf8");
          ok += 1;
          done = true;
          break;
        } catch {
          /* next gateway */
        }
      }
    }
    if (!done) failed.push(cid);
  }
});
await Promise.all(workers);

// Schemas reference other schemas by CID (`{"cid": "..."}`); pull those in too, transitively.
for (let depth = 0; depth < 4; depth++) {
  const cached = (await readdir(CACHE)).filter((f) => f.endsWith(".json"));
  const referenced = new Set();
  for (const f of cached) {
    const text = await readFile(path.join(CACHE, f), "utf8");
    for (const m of text.matchAll(/"cid"\s*:\s*"(baf[a-z0-9]+)"/g)) referenced.add(m[1]);
    for (const m of text.matchAll(/\/ipfs\/(baf[a-z0-9]+)/g)) referenced.add(m[1]);
  }
  const present = new Set(cached.map((f) => f.slice(0, -5)));
  const missing = [...referenced].filter((c) => !present.has(c));
  if (missing.length === 0) break;
  console.log(`depth ${depth}: ${missing.length} referenced schema CIDs still missing`);
  for (const cid of missing) {
    let done = false;
    for (let r = 0; r < ROUNDS && !done; r++) {
      for (const gw of GATEWAYS) {
        try {
          const res = await fetch(`${gw}/ipfs/${cid}`, { signal: AbortSignal.timeout(12_000) });
          if (!res.ok) continue;
          const text = await res.text();
          JSON.parse(text);
          if (!verify(cid, text)) { console.log(`hash mismatch for ${cid} from ${gw} — discarded`); continue; }
          await writeFile(path.join(CACHE, `${cid}.json`), text, "utf8");
          ok += 1;
          done = true;
          break;
        } catch {
          /* next */
        }
      }
    }
    if (!done) failed.push(cid);
  }
}

failed = failed.filter(async (c) => !(await readdir(CACHE)).includes(`${c}.json`));
console.log(`fetched ${ok}; cache now holds ${(await readdir(CACHE)).length} schemas`);
if (failed.length) console.log(`STILL MISSING: ${failed.join(" ")}`);
