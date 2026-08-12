import Link from "next/link";

import { FINDINGS_DOC_URL } from "@/lib/constraints";
import type { StageEntry } from "@/lib/stageManifests";
import {
  NOT_RECORDED,
  NO_PUBLIC_URL,
  allSources,
  formatCount,
  formatDecision,
  formatDuration,
  formatTimestamp,
  runTotals,
  stageElapsedS,
} from "@/lib/stageManifests";

// The completed run: six stages, then every source they loaded with its count, collection
// timestamp, duration, decision, licence and links. ISSUE-028.
//
// Absence is never a zero here. A stage with no manifest sources says "Not yet run"; a source with
// no count says "not counted"; a bounding-box figure is labelled an upper bound and is never added
// to the county total.

export function RunStagesSection({ stages }: { stages: StageEntry[] }) {
  const totals = runTotals(stages);
  const sources = allSources(stages);

  return (
    <section data-testid="run-stages" className="mt-12">
      <h2 className="text-lg font-semibold">Pipeline run</h2>

      {totals.stagesRun === 0 ? (
        <p
          data-testid="run-totals"
          className="mt-3 text-sm text-black/70 dark:text-white/70"
        >
          No pipeline stage has committed a manifest yet. Record counts,
          timestamps and durations appear here as the ingest stages land.
          Nothing below is a zero — it is a stage that has not run.
        </p>
      ) : (
        <p
          data-testid="run-totals"
          className="mt-3 text-sm text-black/70 dark:text-white/70"
        >
          {totals.stagesRun} of {totals.stagesTotal} stages have run ·{" "}
          {totals.sourcesTotal} sources · {formatCount(totals.recordsCounted)}{" "}
          records counted · {totals.uncountedSources} sources report no count ·
          collected {formatTimestamp(totals.earliestRetrievedAt)} to{" "}
          {formatTimestamp(totals.latestRetrievedAt)} ·{" "}
          {formatDuration(totals.measuredDurationS)} of measured source time.
          Bounding-box figures are upper bounds and are never added to this
          total; {totals.uncountedSources} sources that were reached but not
          harvested are stated as not counted rather than as zero.
        </p>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/15">
              <th scope="col" className="py-2 pr-4 font-medium">
                Stage
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Started
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Finished
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Elapsed
              </th>
              <th scope="col" className="py-2 font-medium">
                Sources
              </th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr
                key={stage.id}
                data-testid={`stage-row-${stage.id}`}
                className="border-b border-black/10 align-top dark:border-white/15"
              >
                <th scope="row" className="py-2 pr-4 font-medium">
                  {stage.label}
                  <span className="block text-xs font-normal text-black/50 dark:text-white/50">
                    {stage.file}
                  </span>
                </th>
                <td className="py-2 pr-4">
                  {stage.hasRun ? "Completed" : "Not yet run"}
                </td>
                <td className="py-2 pr-4">
                  {stage.hasRun
                    ? formatTimestamp(stage.startedAt)
                    : "not run"}
                </td>
                <td className="py-2 pr-4">
                  {stage.hasRun
                    ? formatTimestamp(stage.finishedAt)
                    : "not run"}
                </td>
                <td className="py-2 pr-4">
                  {stage.hasRun ? formatDuration(stageElapsedS(stage)) : "not run"}
                </td>
                <td className="py-2">
                  {stage.hasRun ? stage.sources.length : "not run"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-10 text-base font-semibold">Records by source</h3>
      {sources.length === 0 ? (
        <p className="mt-3 text-sm text-black/70 dark:text-white/70">
          No sources yet — no stage has committed a manifest.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">
            One row per source, counted once. A source that appears in two
            stages is not added twice.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/15">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Source
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Records
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Collected
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Duration
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Decision
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Licence
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Links
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr
                    key={source.id}
                    data-testid={`source-row-${source.id}`}
                    className="border-b border-black/10 align-top dark:border-white/15"
                  >
                    <th scope="row" className="max-w-xs py-3 pr-4 font-medium">
                      {source.name}
                      <span className="block text-xs font-normal text-black/50 dark:text-white/50">
                        {source.id} · {source.stage}
                      </span>
                      {source.gaps.length > 0 && (
                        <ul
                          data-testid={`source-row-${source.id}-gaps`}
                          className="mt-2 list-disc space-y-1 pl-4 text-xs font-normal text-black/60 dark:text-white/60"
                        >
                          {source.gaps.map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      )}
                    </th>
                    <td className="py-3 pr-4">
                      {formatCount(source.record_count)}
                      {source.bbox_count !== null && (
                        <span className="mt-1 block text-xs text-black/50 dark:text-white/50">
                          {formatCount(source.bbox_count)} in the fetch bounding
                          box — an upper bound, not a county count, and never
                          added to the total
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {formatTimestamp(source.retrieved_at)}
                    </td>
                    <td className="py-3 pr-4">
                      {formatDuration(source.duration_s)}
                    </td>
                    <td className="py-3 pr-4">
                      {formatDecision(source.decision)}
                    </td>
                    <td className="max-w-xs py-3 pr-4">
                      {source.licence ?? NOT_RECORDED}
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/sources#source-${source.id}`}
                        className="block underline underline-offset-2"
                      >
                        Source detail
                      </Link>
                      {source.url !== null ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block underline underline-offset-2"
                        >
                          Source site
                        </a>
                      ) : (
                        <span className="mt-1 block text-black/50 dark:text-white/50">
                          {NO_PUBLIC_URL}
                        </span>
                      )}
                      <a
                        href={FINDINGS_DOC_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block underline underline-offset-2"
                      >
                        Findings
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
