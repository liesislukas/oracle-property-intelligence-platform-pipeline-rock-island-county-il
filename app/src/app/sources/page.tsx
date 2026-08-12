import { SourceCard } from "@/components/sources/SourceCard";
import { StageNotRun } from "@/components/sources/StageNotRun";
import {
  STAGES,
  allSources,
  formatCount,
  formatTimestamp,
  recordsCounted,
} from "@/lib/stageManifests";
import { getSection } from "@/lib/sections";

export const metadata = {
  title: "Sources — Rock Island pipeline explorer",
};

export default function SourcesPage() {
  const section = getSection("sources")!;
  const stagesRun = STAGES.filter((s) => s.hasRun).length;
  const sourceCount = allSources(STAGES).length;
  const records = formatCount(recordsCounted(STAGES));

  return (
    <section
      data-testid="section-sources"
      className="mx-auto w-full max-w-3xl px-6 py-12"
    >
      <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
      <p className="mt-3 text-black/70 dark:text-white/70">{section.blurb}</p>
      <p
        data-testid="sources-summary"
        className="mt-6 text-sm text-black/70 dark:text-white/70"
      >
        Pipeline stages run: {stagesRun} of 6. Sources recorded: {sourceCount}.
        Records counted: {records}. Stages that have not run are listed below as
        not yet run — they are not counted as zero, and bounding-box counts are
        never added to this total.
      </p>

      {STAGES.map((stage) => (
        <section
          key={stage.id}
          data-testid={`stage-${stage.id}`}
          className="mt-10"
        >
          <h2 className="text-lg font-semibold">{stage.label}</h2>
          {stage.hasRun ? (
            <>
              <p
                data-testid={`stage-${stage.id}-run`}
                className="mt-1 text-sm text-black/50 dark:text-white/50"
              >
                Produced by {stage.producedBy ?? "not recorded"} · {stage.file} ·
                run {formatTimestamp(stage.startedAt)} to{" "}
                {formatTimestamp(stage.finishedAt)}
              </p>
              <div className="mt-4 space-y-6">
                {stage.sources.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4">
              <StageNotRun file={stage.file} issue={stage.issue} />
            </div>
          )}
        </section>
      ))}
    </section>
  );
}
