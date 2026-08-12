import {
  formatCount,
  formatMatchMethod,
  formatUnmatchedReason,
  getPermitDataset,
} from "@/lib/permits";

// The match rate with the method that produced it and the limits that qualify it. All three are
// rendered together on purpose: a rate without its method is not a measurement, and unmatched
// records are broken out by stated reason so that a source sentinel is never counted as a failure.
export function PermitLinkageSummary() {
  const { linkage } = getPermitDataset();
  const unmatchedTotal = Object.values(linkage.unmatched).reduce((a, b) => a + b, 0);

  return (
    <div data-testid="permit-linkage" className="mt-10">
      <h3 className="text-base font-semibold">Permit-to-parcel linkage</h3>

      <p
        data-testid="permit-linkage-rate"
        className="mt-2 text-sm text-black/80 dark:text-white/80"
      >
        {formatCount(linkage.matched)} of {formatCount(linkage.total)} permit records matched a
        parcel ({linkage.match_rate_pct}%).
      </p>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Matched, by method
          </h4>
          <dl data-testid="permit-linkage-methods" className="mt-2 space-y-1.5 text-sm">
            {Object.entries(linkage.by_method).map(([method, count]) => (
              <div key={method} className="flex justify-between gap-4">
                <dt className="text-black/70 dark:text-white/70">
                  {formatMatchMethod(method)}
                </dt>
                <dd className="whitespace-nowrap tabular-nums">{formatCount(count)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Unmatched, by reason ({formatCount(unmatchedTotal)})
          </h4>
          <dl data-testid="permit-linkage-unmatched" className="mt-2 space-y-1.5 text-sm">
            {Object.entries(linkage.unmatched).map(([reason, count]) => (
              <div key={reason} className="flex justify-between gap-4">
                <dt className="text-black/70 dark:text-white/70">
                  {formatUnmatchedReason(reason)}
                </dt>
                <dd className="whitespace-nowrap tabular-nums">{formatCount(count)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <p
        data-testid="permit-linkage-method-statement"
        className="mt-4 text-sm text-black/70 dark:text-white/70"
      >
        {linkage.method_statement}
      </p>
      <p
        data-testid="permit-linkage-limits-statement"
        className="mt-2 text-sm text-black/70 dark:text-white/70"
      >
        {linkage.limits_statement}
      </p>
    </div>
  );
}
