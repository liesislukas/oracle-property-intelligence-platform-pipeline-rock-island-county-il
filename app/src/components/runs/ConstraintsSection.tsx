import Link from "next/link";

import {
  CONSTRAINTS,
  FEASIBILITY_FORMULA,
  FEASIBILITY_NOTE,
  FEASIBILITY_ROWS,
  FINDINGS_DOC_URL,
  SPEED_HEADLINE,
} from "@/lib/constraints";
import { formatDecision } from "@/lib/stageManifests";

// The documented source limitations, verbatim from docs/rock-island-county-findings.md. ISSUE-028.
//
// The measured speed answer comes first because it is the surprising one: nothing reachable in this
// county is slow. The binding constraints are fragmentation, absence and egress — and only the last
// of the three is ours rather than the county's.

export function ConstraintsSection() {
  return (
    <section data-testid="constraints-section" className="mt-14">
      <h2 className="text-lg font-semibold">Constraints and speed</h2>

      <div
        data-testid="speed-headline"
        className="mt-4 rounded-md border border-black/10 p-6 dark:border-white/15"
      >
        <h3 className="text-base font-semibold">{SPEED_HEADLINE.heading}</h3>
        <p className="mt-2 text-sm text-black/70 dark:text-white/70">
          {SPEED_HEADLINE.body}
        </p>
        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Structural limit
        </h4>
        <p className="mt-2 text-sm text-black/70 dark:text-white/70">
          {SPEED_HEADLINE.caveat}
        </p>
      </div>

      <p className="mt-6 text-sm text-black/70 dark:text-white/70">
        The constraints are of three completely different kinds, and only one of
        them is technical.
      </p>

      <div className="mt-4 space-y-6">
        {CONSTRAINTS.map((constraint) => (
          <article
            key={constraint.kind}
            data-testid={`constraint-${constraint.kind}`}
            className="rounded-md border border-black/10 p-6 dark:border-white/15"
          >
            <h3 className="text-base font-semibold">{constraint.heading}</h3>
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              {constraint.body}
            </p>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-black/70 dark:text-white/70">
              {constraint.evidence.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <a
                href={FINDINGS_DOC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Findings {constraint.findingsSection}
              </a>
            </p>
          </article>
        ))}
      </div>

      <h3 className="mt-10 text-base font-semibold">
        Per-source feasibility decision (48-hour gate)
      </h3>
      <p className="mt-2 text-sm text-black/50 dark:text-white/50">
        {FEASIBILITY_FORMULA}
      </p>
      <p className="mt-2 text-sm text-black/50 dark:text-white/50">
        {FEASIBILITY_NOTE}
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
                p50
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Estimated full download
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Decision
              </th>
              <th scope="col" className="py-2 font-medium">
                Why
              </th>
            </tr>
          </thead>
          <tbody>
            {FEASIBILITY_ROWS.map((row, index) => (
              <tr
                key={`${row.label}-${index}`}
                data-testid={`feasibility-row-${index}`}
                className="border-b border-black/10 align-top dark:border-white/15"
              >
                <th scope="row" className="py-2 pr-4 font-medium">
                  {row.sourceId !== null ? (
                    <Link
                      href={`/sources#source-${row.sourceId}`}
                      className="underline underline-offset-2"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </th>
                <td className="py-2 pr-4">{row.records}</td>
                <td className="py-2 pr-4">{row.p50}</td>
                <td className="max-w-xs py-2 pr-4">{row.estimate}</td>
                <td className="py-2 pr-4">{formatDecision(row.decision)}</td>
                <td className="max-w-md py-2">{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
