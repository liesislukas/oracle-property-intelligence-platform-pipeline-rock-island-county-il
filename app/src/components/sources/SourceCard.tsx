import type { ManifestSource } from "@/lib/stageManifests";
import {
  NOT_RECORDED,
  NO_PUBLIC_URL,
  formatCount,
  formatDecision,
  formatDuration,
  formatTimestamp,
} from "@/lib/stageManifests";

// `gaps` and `notes` are written by the pipeline run itself. They are rendered verbatim and in
// full — never paraphrased, truncated, clamped or hidden behind an expand control.
export function SourceCard({ source }: { source: ManifestSource }) {
  return (
    <article
      id={`source-${source.id}`}
      data-testid={`source-${source.id}`}
      className="rounded-md border border-black/10 p-6 dark:border-white/15"
    >
      <h3 className="text-base font-semibold">{source.name}</h3>

      {source.url !== null ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`source-${source.id}-url`}
          className="mt-1 block break-all text-sm underline underline-offset-2"
        >
          {source.url}
        </a>
      ) : (
        <span
          data-testid={`source-${source.id}-url`}
          className="mt-1 block break-all text-sm text-black/50 dark:text-white/50"
        >
          {NO_PUBLIC_URL}
        </span>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-black/50 dark:text-white/50">Licence</dt>
          <dd
            data-testid={`source-${source.id}-licence`}
            className="text-black/80 dark:text-white/80"
          >
            {source.licence ?? NOT_RECORDED}
          </dd>
        </div>
        <div>
          <dt className="text-black/50 dark:text-white/50">Retrieved</dt>
          <dd
            data-testid={`source-${source.id}-retrieved`}
            className="text-black/80 dark:text-white/80"
          >
            {formatTimestamp(source.retrieved_at)}
          </dd>
        </div>
        <div>
          <dt className="text-black/50 dark:text-white/50">Records</dt>
          <dd
            data-testid={`source-${source.id}-count`}
            className="text-black/80 dark:text-white/80"
          >
            {formatCount(source.record_count)}
          </dd>
        </div>
        <div>
          <dt className="text-black/50 dark:text-white/50">Duration</dt>
          <dd
            data-testid={`source-${source.id}-duration`}
            className="text-black/80 dark:text-white/80"
          >
            {formatDuration(source.duration_s)}
          </dd>
        </div>
        <div>
          <dt className="text-black/50 dark:text-white/50">Decision</dt>
          <dd
            data-testid={`source-${source.id}-decision`}
            className="text-black/80 dark:text-white/80"
          >
            {formatDecision(source.decision)}
          </dd>
        </div>
        {source.bbox_count !== null && (
          <div>
            <dt className="text-black/50 dark:text-white/50">
              Bounding-box count
            </dt>
            <dd
              data-testid={`source-${source.id}-bbox`}
              className="text-black/80 dark:text-white/80"
            >
              {`${formatCount(source.bbox_count)} — upper bound, the bounding box reaches outside the county`}
            </dd>
          </div>
        )}
      </dl>

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
        Gaps
      </h4>
      {source.gaps.length > 0 ? (
        <ul
          data-testid={`source-${source.id}-gaps`}
          className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-black/70 dark:text-white/70"
        >
          {source.gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      ) : (
        <p
          data-testid={`source-${source.id}-gaps`}
          className="mt-2 text-sm text-black/70 dark:text-white/70"
        >
          No gaps recorded for this source.
        </p>
      )}

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
        Notes
      </h4>
      {source.notes.length > 0 ? (
        <ul
          data-testid={`source-${source.id}-notes`}
          className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-black/70 dark:text-white/70"
        >
          {source.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : (
        <p
          data-testid={`source-${source.id}-notes`}
          className="mt-2 text-sm text-black/70 dark:text-white/70"
        >
          No notes recorded for this source.
        </p>
      )}
    </article>
  );
}
