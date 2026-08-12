const repo =
  process.env.NEXT_PUBLIC_GIT_REPO ??
  "oracle-property-intelligence-platform-pipeline-rock-island-county-il";
const branch =
  process.env.NEXT_PUBLIC_GIT_BRANCH ??
  process.env.VERCEL_GIT_COMMIT_REF ??
  "local";
const commit =
  process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  "local";

export function BuildFooter() {
  return (
    <footer
      data-testid="build-footer"
      className="border-t border-black/10 dark:border-white/15"
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-4">
        <p className="font-mono text-xs text-black/50 dark:text-white/50">
          {repo} · {branch} · {commit}
        </p>
      </div>
    </footer>
  );
}
