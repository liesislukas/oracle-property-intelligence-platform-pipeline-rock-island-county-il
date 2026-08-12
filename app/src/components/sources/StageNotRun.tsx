export function StageNotRun({ file, issue }: { file: string; issue: string }) {
  return (
    <div
      data-testid="stage-not-run"
      className="rounded-md border border-black/10 bg-black/[0.02] p-6 dark:border-white/15 dark:bg-white/[0.03]"
    >
      <span
        data-testid="not-run-badge"
        className="inline-block rounded border border-black/15 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-black/60 dark:border-white/20 dark:text-white/60"
      >
        Not yet run
      </span>
      <p className="mt-4 text-sm text-black/70 dark:text-white/70">
        This stage has not run. No manifest has been committed at {file}. No
        records have been counted for this stage — that is an absence, not a
        zero.
      </p>
      <p className="mt-2 text-sm text-black/50 dark:text-white/50">
        It will be produced by {issue}.
      </p>
    </div>
  );
}
