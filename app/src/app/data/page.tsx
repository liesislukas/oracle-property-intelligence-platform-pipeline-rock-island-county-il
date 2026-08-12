import { PermitRecordsPanel } from "@/components/records/PermitRecordsPanel";
import { getSection } from "@/lib/sections";

export const metadata = {
  title: "Data Browser — Rock Island pipeline explorer",
};

// The Data Browser is one panel per loaded dataset. Permits (ISSUE-019) is the first.
// APPEND your dataset's panel below the ones already here — never replace them, and never fold a
// second dataset into an existing panel.
// Panels: PermitRecordsPanel ISSUE-019.
export default function DataPage() {
  const section = getSection("data")!;

  return (
    <section
      data-testid="section-data"
      className="mx-auto w-full max-w-5xl px-6 py-12"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{section.label}</h1>
      <p className="mt-3 text-black/70 dark:text-white/70">{section.blurb}</p>
      <p className="mt-4 text-sm text-black/50 dark:text-white/50">
        Each dataset appears below as its own panel once its pipeline stage has run, with the counts
        and the source it came from. A dataset that is not shown here has not been loaded — that is
        an absence, not a zero.
      </p>

      <PermitRecordsPanel />
    </section>
  );
}
