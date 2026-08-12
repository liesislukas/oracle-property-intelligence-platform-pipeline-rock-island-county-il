// ISSUE-021 — the one place that talks to the query DB.
//
// The Postgres that ISSUE-017 brought up is published on localhost:5432 by the
// `elephant-pipeline-postgres-1` container, but this machine has no `psql` on PATH, so every
// statement runs through `docker exec -i <container> psql`. Override with PSQL_CONTAINER, or set
// PSQL_BIN to a local psql binary and the docker hop is skipped.
//
// It never opens a second connection pool of its own and it never runs DDL that touches a kit
// table — ISSUE-021's tables are additive and namespaced (owner_entities, owner_entity_parcels).

import { spawn } from "node:child_process";

const CONTAINER = process.env.PSQL_CONTAINER ?? "elephant-pipeline-postgres-1";
const PSQL_BIN = process.env.PSQL_BIN ?? null;
const DB_USER = process.env.PGUSER ?? "postgres";
const DB_NAME = process.env.PGDATABASE ?? "elephant";
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:elephant@localhost:5432/elephant";

function argv(psqlArgs) {
  if (PSQL_BIN !== null) return [PSQL_BIN, [DATABASE_URL, ...psqlArgs]];
  return ["docker", ["exec", "-i", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, ...psqlArgs]];
}

function run(psqlArgs, stdin = null) {
  const [cmd, args] = argv(psqlArgs);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`psql exited ${code}\nargs: ${psqlArgs.join(" ")}\n${err}${out}`));
        return;
      }
      resolve(out);
    });
    if (stdin !== null) {
      if (typeof stdin === "string") child.stdin.end(stdin);
      else stdin.pipe(child.stdin);
    } else {
      child.stdin.end();
    }
  });
}

/** Run SQL that returns nothing useful. Stops on the first error. */
export async function exec(sql) {
  return run(["-v", "ON_ERROR_STOP=1", "-q", "-c", sql]);
}

/** Run a SQL file. */
export async function execFile(sqlText) {
  return run(["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], sqlText);
}

/** Rows as arrays of column strings, tab-separated, unaligned, no header. */
export async function rows(sql) {
  const out = await run(["-v", "ON_ERROR_STOP=1", "-tAF", "\t", "-c", sql]);
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

/** Single scalar. Throws when the query returns no row. */
export async function scalar(sql) {
  const r = await rows(sql);
  if (r.length === 0) throw new Error(`scalar query returned no rows: ${sql}`);
  return r[0][0];
}

/** Formatted, human-readable output — what goes into the evidence files verbatim. */
export async function table(sql) {
  return run(["-v", "ON_ERROR_STOP=1", "-c", sql]);
}

/**
 * COPY rows into a table from a generator of already-escaped TSV lines.
 * Text format, so \N is NULL and tab/newline/backslash must be escaped by the caller.
 */
export async function copyIn(target, columns, lines) {
  const sql = `COPY ${target} (${columns.join(", ")}) FROM STDIN WITH (FORMAT text)`;
  const [cmd, args] = argv(["-v", "ON_ERROR_STOP=1", "-q", "-c", sql]);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`COPY into ${target} exited ${code}\n${err}`)),
    );
    (async () => {
      let buffer = "";
      for (const line of lines) {
        buffer += line + "\n";
        if (buffer.length > 1 << 20) {
          if (!child.stdin.write(buffer)) {
            await new Promise((r) => child.stdin.once("drain", r));
          }
          buffer = "";
        }
      }
      if (buffer.length > 0) child.stdin.write(buffer);
      child.stdin.end();
    })().catch(reject);
  });
}

/** Escape one field for COPY ... WITH (FORMAT text). null/undefined become the \N NULL marker. */
export function tsv(value) {
  if (value === null || value === undefined) return "\\N";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}
