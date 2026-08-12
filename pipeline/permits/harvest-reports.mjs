// WI-3 — Download every monthly permit report PDF politely, idempotently and with a content hash.
//
//   npm run harvest:reports
//
// This is the `durable-workflow-builder` resumability pattern without the Restate runtime: the unit
// of work is one `index_month`, and the journal is the on-disk pair `raw/<YYYY-MM>.pdf` +
// `status/<YYYY-MM>.json`. A month is skipped when its status file says `download: "ok"` AND the
// PDF on disk still re-hashes to the recorded sha256. Re-running after a complete run performs zero
// network requests.
//
// Politeness: strictly sequential, never concurrent, 1500 ms between requests. rigov.org's
// robots.txt imposes no Crawl-delay on a generic `User-agent: *` client and disallows neither
// /DocumentCenter nor /1276; the delay is a deliberate courtesy, not a minimum. Expected wall time
// is about 9.3 minutes for 111 documents.
//
// A failed download is RECORDED, never silently skipped.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { USER_AGENT, dirs, ensureDirs, files, toJson } from "./paths.mjs";

const DELAY_MS = 1500;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2000, 8000];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const rawPath = (month) => path.join(dirs.raw, `${month}.pdf`);
const statusPath = (month) => path.join(dirs.status, `${month}.json`);

async function readJsonOrNull(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** True when the month is already downloaded and the bytes on disk still match the record. */
async function isCached(month) {
  const status = await readJsonOrNull(statusPath(month));
  if (!status || status.download !== "ok" || !status.sha256) return false;
  try {
    const bytes = await readFile(rawPath(month));
    return sha256(bytes) === status.sha256;
  } catch {
    return false;
  }
}

async function download(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,*/*" },
        redirect: "follow",
      });
      const elapsedMs = Date.now() - startedAt;
      if (response.status !== 200) {
        lastError = { http_status: response.status, error: `http-${response.status}` };
      } else {
        const body = Buffer.from(await response.arrayBuffer());
        if (body.subarray(0, 5).toString("latin1") !== "%PDF-") {
          lastError = { http_status: 200, error: "not-a-pdf" };
        } else {
          return { ok: true, body, http_status: 200, elapsed_ms: elapsedMs, attempts: attempt };
        }
      }
    } catch (cause) {
      lastError = { http_status: null, error: String(cause?.message ?? cause) };
    }
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1]);
  }
  return { ok: false, ...lastError, attempts: MAX_ATTEMPTS };
}

async function main() {
  const runStart = Date.now();
  const inventory = JSON.parse(await readFile(files.inventory, "utf8"));
  await ensureDirs("raw", "status");

  // The known source defect: document 15854 is linked under both 2020-10 and 2021-03. Download it
  // once, under its EARLIEST index_month; the later entry records why it has no raw file. The real
  // month is resolved from the PDF's own contents in WI-4, never guessed at here.
  const firstMonthForDocument = new Map();
  for (const report of inventory.reports) {
    if (!firstMonthForDocument.has(report.document_id)) {
      firstMonthForDocument.set(report.document_id, report.index_month);
    }
  }

  const counts = { ok: 0, failed: 0, cached: 0, duplicate: 0 };
  const total = inventory.reports.length;
  let n = 0;

  for (const report of inventory.reports) {
    n += 1;
    const tag = `[${String(n).padStart(3)}/${total}] ${report.index_month}`;
    const owner = firstMonthForDocument.get(report.document_id);

    if (owner !== report.index_month) {
      await writeFile(
        statusPath(report.index_month),
        toJson({
          index_month: report.index_month,
          document_id: report.document_id,
          url: report.url,
          download: "skipped-duplicate-document",
          duplicate_of: owner,
          http_status: null,
          bytes: null,
          sha256: null,
          elapsed_ms: null,
          attempts: 0,
          downloaded_at: new Date().toISOString(),
          extract: null,
        }),
      );
      counts.duplicate += 1;
      console.log(`${tag}  skipped-duplicate-document (same document as ${owner})`);
      continue;
    }

    if (await isCached(report.index_month)) {
      counts.cached += 1;
      console.log(`${tag}  skipped-cached`);
      continue;
    }

    const result = await download(report.url);
    const now = new Date().toISOString();
    if (result.ok) {
      await writeFile(rawPath(report.index_month), result.body);
      await writeFile(
        statusPath(report.index_month),
        toJson({
          index_month: report.index_month,
          document_id: report.document_id,
          url: report.url,
          download: "ok",
          http_status: 200,
          bytes: result.body.length,
          sha256: sha256(result.body),
          elapsed_ms: result.elapsed_ms,
          attempts: result.attempts,
          downloaded_at: now,
          extract: null,
        }),
      );
      counts.ok += 1;
      console.log(
        `${tag}  ok    ${result.body.length} B  ${result.elapsed_ms} ms`,
      );
    } else {
      await writeFile(
        statusPath(report.index_month),
        toJson({
          index_month: report.index_month,
          document_id: report.document_id,
          url: report.url,
          download: "failed",
          http_status: result.http_status ?? null,
          error: result.error,
          bytes: null,
          sha256: null,
          elapsed_ms: null,
          attempts: result.attempts,
          downloaded_at: now,
          extract: null,
        }),
      );
      counts.failed += 1;
      console.log(`${tag}  FAILED  ${result.error}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `downloads: ok=${counts.ok} failed=${counts.failed} skipped-cached=${counts.cached} skipped-duplicate=${counts.duplicate} total_elapsed_s=${((Date.now() - runStart) / 1000).toFixed(1)}`,
  );
}

await main();
