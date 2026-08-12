/**
 * ISSUE-018 WI-2 — serve the per-parcel source mirror over loopback.
 *
 *   node scripts/serve-mirror.mjs
 *
 * One route: GET /parcels/<OBJECTID>.json -> data/source-mirror/rock-island/<OBJECTID>.json
 * Unknown id -> 404 with an empty body. It NEVER falls back to the live layer: a 404 must be a
 * loud DEAD classification (county-seed-data lines 74-77, "fail loud on an empty/zero-result
 * lookup — never silently skip").
 *
 * Binds 127.0.0.1 only. This is local pipeline plumbing, never a deployed surface, and it is
 * never presented as the runtime.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIRROR_DIR = path.join(REPO_ROOT, "data", "source-mirror", "rock-island");
const HOST = "127.0.0.1";
const PORT = Number(process.env.MIRROR_PORT) || 8099;
const QUIET = process.env.MIRROR_QUIET === "1";

const ROUTE = /^\/parcels\/([A-Za-z0-9_-]+)\.json$/;

const server = createServer((req, res) => {
  const log = (status, id) => {
    if (!QUIET) console.log(`${new Date().toISOString()} ${status} ${id}`);
  };
  const url = (req.url ?? "").split("?")[0];
  const m = ROUTE.exec(url);
  if (req.method !== "GET" || !m) {
    log(404, url);
    res.writeHead(404).end();
    return;
  }
  const id = m[1];
  readFile(path.join(MIRROR_DIR, `${id}.json`))
    .then((buf) => {
      log(200, id);
      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": String(buf.length),
      }).end(buf);
    })
    .catch(() => {
      log(404, id);
      res.writeHead(404).end();
    });
});

server.listen(PORT, HOST, () => {
  console.log(`mirror server listening on http://${HOST}:${PORT} (root ${MIRROR_DIR})`);
});
