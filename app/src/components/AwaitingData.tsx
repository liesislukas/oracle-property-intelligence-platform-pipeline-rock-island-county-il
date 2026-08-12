export function AwaitingData({
  label,
  planned,
}: {
  label: string;
  planned: string[];
}) {
  return (
    <div className="mt-8 rounded-md border border-black/10 bg-black/[0.02] p-6 dark:border-white/15 dark:bg-white/[0.03]">
      <span
        data-testid="awaiting-data"
        className="inline-block rounded border border-black/15 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-black/60 dark:border-white/20 dark:text-white/60"
      >
        Awaiting data
      </span>
      <p className="mt-4 text-sm text-black/70 dark:text-white/70">
        Nothing has been published to this section yet. When the pipeline run
        completes, this page will show:
      </p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-black/70 dark:text-white/70">
        {planned.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="sr-only">{label}</p>
    </div>
  );
}
