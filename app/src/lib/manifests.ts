import type { SectionSlug } from "@/lib/sections";

import agent from "../../data/manifests/agent.json";
import data from "../../data/manifests/data.json";
import ipfs from "../../data/manifests/ipfs.json";
import mcp from "../../data/manifests/mcp.json";
import query from "../../data/manifests/query.json";
import runs from "../../data/manifests/runs.json";
import signals from "../../data/manifests/signals.json";
import sources from "../../data/manifests/sources.json";

export type ManifestStatus = "awaiting-data" | "ready";

export type StageManifest = {
  stage: SectionSlug;
  status: ManifestStatus;
  county_slug: string;
  generated_at: string | null;
  source_note: string | null;
  records: unknown[];
};

const manifests: Record<SectionSlug, StageManifest> = {
  runs: runs as StageManifest,
  sources: sources as StageManifest,
  data: data as StageManifest,
  query: query as StageManifest,
  ipfs: ipfs as StageManifest,
  signals: signals as StageManifest,
  agent: agent as StageManifest,
  mcp: mcp as StageManifest,
};

export function getManifest(slug: SectionSlug): StageManifest {
  return manifests[slug];
}
