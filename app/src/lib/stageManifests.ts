// Reader for the STAGE manifests — `seed`, `property-ingest`, `permits`, `geo-signals`,
// `reconciliation` and `publish` in `app/data/manifests/`. These are the per-pipeline-stage
// artifacts written by the ingest stages and synced from the repo root by
// `scripts/sync-manifests.mjs`.
//
// ISSUE-016's `app/src/lib/manifests.ts` reads the SECTION manifests — `runs`, `sources`, `data`,
// `query`, `ipfs`, `signals`, `agent`, `mcp` — which drive the eight nav slugs' "Awaiting data"
// toggle. The two filename sets are disjoint and neither reader touches the other's files.
//
// Provenance honesty is mechanical here: an absent count renders as "not counted", never as 0; a
// stage with no sources is stated as not run; `gaps` and `notes` are pipeline-written strings that
// are rendered verbatim and never paraphrased.

import seed from "../../data/manifests/seed.json";
import propertyIngest from "../../data/manifests/property-ingest.json";
import permits from "../../data/manifests/permits.json";
import geoSignals from "../../data/manifests/geo-signals.json";
import reconciliation from "../../data/manifests/reconciliation.json";
import publish from "../../data/manifests/publish.json";

export type StageId =
  | "seed"
  | "property-ingest"
  | "permits"
  | "geo-signals"
  | "reconciliation"
  | "publish";

/** Free-form. The county-discovery vocabulary plus whatever a stage actually recorded
 *  (seed.json records "paged-live-query", which is outside that vocabulary). Never coerced. */
export type SourceDecision = string;

export type ManifestSource = {
  id: string;
  name: string;
  url: string | null; // null => "No public URL". Never "".
  licence: string | null; // null => "not recorded". Never "".
  retrieved_at: string | null; // ISO-8601. null => "not recorded".
  record_count: number | null; // null => "not counted". NEVER 0 as a stand-in for unknown.
  bbox_count: number | null; // bounding-box UPPER BOUND. Never summed into a total.
  duration_s: number | null; // null => "not measured".
  decision: SourceDecision;
  gaps: string[]; // pipeline-written. Rendered verbatim, never paraphrased.
  notes: string[]; // pipeline-written. Rendered verbatim, never paraphrased.
};

export type StageEntry = {
  id: StageId;
  label: string; // e.g. "Stack bootstrap and parcel seed"
  file: string; // repo-relative, e.g. "data/manifests/seed.json"
  issue: string; // e.g. "ISSUE-017"
  hasRun: boolean; // sources.length > 0
  producedBy: string | null; // the manifest's own `stage` string, e.g. "county-seed-data"
  startedAt: string | null;
  finishedAt: string | null;
  sources: ManifestSource[]; // [] when hasRun is false
};

export const NOT_COUNTED = "not counted";
export const NOT_RECORDED = "not recorded";
export const NOT_MEASURED = "not measured";
export const NO_PUBLIC_URL = "No public URL";

type RawManifest = {
  stage?: unknown;
  status?: unknown;
  county_slug?: unknown;
  sources?: unknown;
  run?: unknown;
};

const RAW: Record<StageId, RawManifest> = {
  seed: seed,
  "property-ingest": propertyIngest,
  permits: permits,
  "geo-signals": geoSignals,
  reconciliation: reconciliation,
  publish: publish,
} as Record<StageId, RawManifest>;

type StageRegistryRow = {
  id: StageId;
  label: string;
  file: string;
  issue: string;
};

const REGISTRY: StageRegistryRow[] = [
  {
    id: "seed",
    label: "Stack bootstrap and parcel seed",
    file: "data/manifests/seed.json",
    issue: "ISSUE-017",
  },
  {
    id: "property-ingest",
    label: "Property records ingest",
    file: "data/manifests/property-ingest.json",
    issue: "ISSUE-018",
  },
  {
    id: "permits",
    label: "Permit records ingest",
    file: "data/manifests/permits.json",
    issue: "ISSUE-019",
  },
  {
    id: "geo-signals",
    label: "Power and geo signals ingest",
    file: "data/manifests/geo-signals.json",
    issue: "ISSUE-020",
  },
  {
    id: "reconciliation",
    label: "Entity reconciliation and provenance",
    file: "data/manifests/reconciliation.json",
    issue: "ISSUE-021",
  },
  {
    id: "publish",
    label: "IPFS publish and query table",
    file: "data/manifests/publish.json",
    issue: "ISSUE-022",
  },
];

/** "" is not a value. It collapses to null so the UI renders "not recorded", never a blank cell. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
}

function normaliseSource(
  raw: Record<string, unknown>,
  stageId: StageId,
  index: number,
): ManifestSource {
  const id = str(raw.id) ?? `unnamed-${stageId}-${index}`;
  return {
    id,
    name: str(raw.name) ?? id,
    url: str(raw.url),
    licence: str(raw.licence),
    retrieved_at: str(raw.retrieved_at),
    record_count: num(raw.record_count),
    bbox_count: num(raw.bbox_count),
    duration_s: num(raw.duration_s),
    decision: str(raw.decision) ?? NOT_RECORDED,
    gaps: strList(raw.gaps),
    notes: strList(raw.notes),
  };
}

function normaliseStage(row: StageRegistryRow): StageEntry {
  const raw = RAW[row.id] ?? {};
  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  const sources = rawSources
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s, i) => normaliseSource(s, row.id, i));

  // A stage has run iff its manifest carries at least one source. The `status` field written into
  // the placeholders is for human readers and the validator; the reader never branches on it.
  const hasRun = sources.length > 0;
  const run = (typeof raw.run === "object" && raw.run !== null ? raw.run : {}) as Record<
    string,
    unknown
  >;

  return {
    id: row.id,
    label: row.label,
    file: row.file,
    issue: row.issue,
    hasRun,
    producedBy: hasRun ? str(raw.stage) : null,
    startedAt: hasRun ? str(run.started_at) : null,
    finishedAt: hasRun ? str(run.finished_at) : null,
    sources: hasRun ? sources : [],
  };
}

export const STAGES: StageEntry[] = REGISTRY.map(normaliseStage);

export function loadStages(): StageEntry[] {
  return STAGES;
}

/** Every source across the given stages, de-duplicated by id, first occurrence in registry order. */
export function allSources(
  stages: StageEntry[],
): Array<ManifestSource & { stage: StageId }> {
  const seen = new Set<string>();
  const out: Array<ManifestSource & { stage: StageId }> = [];
  for (const stage of stages) {
    for (const source of stage.sources) {
      if (seen.has(source.id)) continue;
      seen.add(source.id);
      out.push({ ...source, stage: stage.id });
    }
  }
  return out;
}

/** Sum of the counts that were actually measured. `bbox_count` is a bounding-box upper bound and is
 *  never added; a null `record_count` contributes nothing rather than a zero. */
export function recordsCounted(stages: StageEntry[]): number {
  return allSources(stages).reduce(
    (total, source) => total + (source.record_count ?? 0),
    0,
  );
}

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

export function formatCount(n: number | null): string {
  if (n === null) return NOT_COUNTED;
  return COUNT_FORMAT.format(n);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return NOT_MEASURED;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m} m ${s} s`;
  }
  const h = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  return `${h} h ${mm} m`;
}

export function formatTimestamp(iso: string | null): string {
  if (iso === null) return NOT_RECORDED;
  const parsed = new Date(iso);
  // Never toLocaleString: it renders differently on the build machine than in the browser.
  if (Number.isNaN(parsed.getTime())) return iso;
  const utc = parsed.toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
}

const DECISION_LABELS: Record<string, string> = {
  download: "Bulk download",
  ingest: "Ingested",
  "paged-live-query": "Paged live query",
  "runtime-fetch": "Fetched at query time",
  "not-feasible": "Not feasible within the 48-hour gate",
  "undetermined-unreachable": "Unreachable from this network — undetermined",
};

/** Any decision outside the known vocabulary is returned verbatim. Coercing a real recorded
 *  decision into a closed union — or labelling it "Unknown" — would be a fabrication. */
export function formatDecision(decision: string): string {
  return DECISION_LABELS[decision] ?? decision;
}
