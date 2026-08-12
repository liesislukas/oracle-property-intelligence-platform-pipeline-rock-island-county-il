import { CategoryCoverageSection } from "@/components/runs/CategoryCoverageSection";
import { ConstraintsSection } from "@/components/runs/ConstraintsSection";
import { RunStagesSection } from "@/components/runs/RunStagesSection";
import { FINDINGS_DOC_URL } from "@/lib/constraints";
import { getSection } from "@/lib/sections";
import { loadStages } from "@/lib/stageManifests";

export const metadata = {
  title: "Run Summary — Rock Island pipeline explorer",
};

// The demo's opening page. Everything on it is read from the stage manifests statically imported by
// @/lib/stageManifests — nothing is hardcoded, so a stage that lands after this page shipped shows
// up on the next deploy without a code change. ISSUE-028.
export default function RunsPage() {
  const section = getSection("runs")!;
  const stages = loadStages();

  return (
    <section
      data-testid="section-runs"
      className="mx-auto w-full max-w-5xl px-6 py-12"
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        Pipeline run summary
      </h1>
      <p className="mt-3 text-black/70 dark:text-white/70">{section.blurb}</p>
      <p className="mt-4 text-sm text-black/70 dark:text-white/70">
        The Oracle ingestion run for Rock Island County, Illinois — every source
        with the records loaded, when they were collected, how long it took, and
        what it is licensed under. Where a category has no records, this page
        says why and what was checked rather than showing a zero.
      </p>
      <p className="mt-2 text-sm text-black/50 dark:text-white/50">
        County: rock-island · Source catalog and constraint measurements:{" "}
        <a
          href={FINDINGS_DOC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Rock Island County source discovery findings
        </a>
      </p>

      <RunStagesSection stages={stages} />
      <CategoryCoverageSection stages={stages} />
      <ConstraintsSection />
    </section>
  );
}
