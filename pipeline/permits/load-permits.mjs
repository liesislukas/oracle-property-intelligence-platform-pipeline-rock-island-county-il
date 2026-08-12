// WI-6 — Load the extracted, linked permit records into the pipeline Postgres database.
//
//   npm run load:permits
//
// Upserts on the deterministic record id, so a re-run refreshes rather than duplicating. The
// summary is printed from SQL against the loaded table, never from the in-memory arrays.
//
// If DATABASE_URL is unreachable this exits non-zero. It never falls back to SQLite, to a file, or
// to skipping the load — a load that did not happen is not reported as one that did.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import { dirs } from "./paths.mjs";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:elephant@localhost:5432/elephant";
const BATCH = 1000;
const SCHEMA_FILE = new URL("./schema.sql", import.meta.url);

/** "MM/DD/YYYY" -> a Date, or null when the source printed nothing. */
function toDate(printed) {
  if (!printed || !/^\d{2}\/\d{2}\/\d{4}$/.test(printed)) return null;
  const [mm, dd, yyyy] = printed.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/** "$23,000.00" -> 23000.00. "$0.00" -> 0.00 (the source printed a zero and a zero is a fact).
 *  Absent -> null. Absent and zero are different facts. */
function toUsd(printed) {
  if (typeof printed !== "string" || printed.trim() === "") return null;
  const cleaned = printed.replace(/[$,]/g, "").trim();
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

async function main() {
  const sql = postgres(DATABASE_URL, { onnotice: () => {} });

  try {
    await sql`SELECT 1`;
  } catch {
    console.error("permit load: DATABASE_URL unreachable — run ISSUE-017 stack bootstrap first");
    process.exit(1);
  }

  await sql.unsafe(await readFile(SCHEMA_FILE, "utf8"));

  const rows = [];
  const names = (await readdir(dirs.extracted)).filter((f) => f.endsWith(".json")).sort();
  for (const name of names) {
    const artifact = JSON.parse(await readFile(path.join(dirs.extracted, name), "utf8"));
    for (const record of artifact.records) {
      rows.push({
        id: record.id,
        county_slug: artifact.county_slug,
        jurisdiction: artifact.jurisdiction,
        permit_number: record.permit_number,
        permit_date: toDate(record.permit_date),
        permit_type_source: record.permit_type_source,
        purpose: record.purpose,
        parties: JSON.stringify(record.parties ?? []),
        tax_map: record.tax_map,
        parcel_number_source: record.parcel_number_source,
        address_source: record.address_source,
        total_cost_usd: toUsd(record.total_cost),
        matched_pin: record.matched_pin ?? null,
        match_method: record.match_method ?? null,
        unmatched_reason: record.unmatched_reason ?? null,
        report_month: record.report_month,
        report_url: record.report_url,
        report_document_id: record.report_document_id,
        report_sha256: record.report_sha256,
        report_layout: record.report_layout,
        source_page: record.source_page ?? null,
        extracted_at: record.extracted_at,
      });
    }
  }

  // Column names are this file's own constants, never source data, so building the statement text
  // is safe; every VALUE travels as a bound parameter.
  const columns = Object.keys(rows[0]);
  const columnList = columns.map((c) => `"${c}"`).join(", ");
  const setClause = columns
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch
      .map(
        (_, r) =>
          `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(", ")})`,
      )
      .join(", ");
    const values = batch.flatMap((row) => columns.map((c) => row[c]));
    await sql.unsafe(
      `INSERT INTO permits_rock_island_city (${columnList}) VALUES ${placeholders}
       ON CONFLICT (id) DO UPDATE SET ${setClause}`,
      values,
    );
    console.log(`  loaded ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }

  const [summary] = await sql`
    SELECT count(*)::int                                        AS rows,
           count(DISTINCT permit_number)::int                   AS distinct_permits,
           count(DISTINCT report_month)::int                    AS months,
           count(matched_pin)::int                              AS matched,
           count(*) FILTER (WHERE total_cost_usd IS NULL)::int  AS null_cost,
           count(*) FILTER (WHERE total_cost_usd = 0)::int      AS zero_cost
    FROM permits_rock_island_city
  `;
  console.log(
    `load: rows=${summary.rows} distinct_permits=${summary.distinct_permits} months=${summary.months} matched=${summary.matched} null_cost=${summary.null_cost} zero_cost=${summary.zero_cost}`,
  );

  await sql.end();
}

await main();
