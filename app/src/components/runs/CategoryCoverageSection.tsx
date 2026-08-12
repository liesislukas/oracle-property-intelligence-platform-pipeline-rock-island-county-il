import Link from "next/link";

import { CATEGORIES, categorySources } from "@/lib/categories";
import { FINDINGS_DOC_URL } from "@/lib/constraints";
import type { StageEntry } from "@/lib/stageManifests";
import { formatCount, formatTimestamp } from "@/lib/stageManifests";

// The six record categories the demo transcript names. ISSUE-028.
//
// A `documented-gap` category renders NO number of any kind — not a zero, not a dash, not an empty
// cell. A `carried-by` category shows its carrier's counts labelled "already counted", because
// those records are counted once, under their own source.

const CHIP =
  "inline-block rounded border border-black/15 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-black/60 dark:border-white/20 dark:text-white/60";

export function CategoryCoverageSection({ stages }: { stages: StageEntry[] }) {
  return (
    <section data-testid="category-coverage" className="mt-14">
      <h2 className="text-lg font-semibold">Record categories</h2>
      <p className="mt-3 text-sm text-black/70 dark:text-white/70">
        The demo transcript names six record categories. Each one below is
        either counted against a named source, carried by a source counted under
        another category, or an explicitly documented gap. None of them is a
        zero.
      </p>

      <div className="mt-6 space-y-6">
        {CATEGORIES.map((category) => {
          const resolved = categorySources(category, stages);
          const chipLabel =
            category.coverage.kind === "loaded"
              ? "Loaded"
              : category.coverage.kind === "carried-by"
                ? "Carried by another dataset"
                : "Documented gap";

          return (
            <article
              key={category.id}
              id={`category-${category.id}`}
              data-testid={`category-row-${category.id}`}
              className="rounded-md border border-black/10 p-6 dark:border-white/15"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold">{category.label}</h3>
                <span
                  data-testid={`category-row-${category.id}-status`}
                  className={CHIP}
                >
                  {chipLabel}
                </span>
              </div>

              <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                {category.description}
              </p>

              {category.coverage.kind === "loaded" &&
                (resolved.length === 0 ? (
                  <p className="mt-4 text-sm text-black/70 dark:text-white/70">
                    Source not yet ingested — see the stage table above. This is
                    not a count of zero.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-1 text-sm">
                    {resolved.map((source) => (
                      <li key={source.id}>
                        {source.name} — {formatCount(source.record_count)}{" "}
                        records, collected{" "}
                        {formatTimestamp(source.retrieved_at)}
                      </li>
                    ))}
                  </ul>
                ))}

              {category.coverage.kind === "carried-by" && (
                <>
                  <p className="mt-4 text-sm text-black/70 dark:text-white/70">
                    Carried by {category.coverage.carrierLabel}. Counted once,
                    under its own source — not added again here.
                  </p>
                  {resolved.length === 0 ? (
                    <p className="mt-2 text-sm text-black/70 dark:text-white/70">
                      Source not yet ingested — see the stage table above. This
                      is not a count of zero.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-black/50 dark:text-white/50">
                      {resolved.map((source) => (
                        <li key={source.id}>
                          {source.name} — {formatCount(source.record_count)}{" "}
                          records, already counted
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
                {category.coverage.kind === "documented-gap"
                  ? "Why there are no records, and what was checked"
                  : "Documented gaps and caveats"}
              </h4>
              <ul
                data-testid={`category-row-${category.id}-gaps`}
                className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-black/70 dark:text-white/70"
              >
                {category.gapStatements.map((statement) => (
                  <li key={statement}>{statement}</li>
                ))}
              </ul>

              <p className="mt-4 text-sm">
                <Link
                  href={category.detailHref}
                  className="underline underline-offset-2"
                >
                  Detail
                </Link>
                <span className="text-black/50 dark:text-white/50"> · </span>
                <a
                  href={FINDINGS_DOC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Findings {category.findingsSection}
                </a>
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
