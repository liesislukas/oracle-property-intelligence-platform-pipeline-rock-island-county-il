import Link from "next/link";

import { sections } from "@/lib/sections";

// prettier-ignore
const PRODUCT_STATEMENT = "The Rock Island County pipeline explorer shows the property, permit, ownership, contractor, business and location data loaded for Rock Island County, Illinois, and lets you query it through DuckDB and IPFS — so Oracle carries no ongoing database infrastructure cost.";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Rock Island County pipeline explorer
      </h1>
      <p
        data-testid="product-statement"
        className="mt-4 max-w-3xl text-black/70 dark:text-white/70"
      >
        {PRODUCT_STATEMENT}
      </p>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
        Sections
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.slug}>
            <Link
              href={section.href}
              data-testid={`home-card-${section.slug}`}
              className="block h-full rounded-md border border-black/10 p-5 hover:border-black/30 dark:border-white/15 dark:hover:border-white/40"
            >
              <span className="block text-sm font-semibold">
                {section.label}
              </span>
              <span className="mt-2 block text-sm text-black/60 dark:text-white/60">
                {section.blurb}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p
        data-testid="skeleton-note"
        className="mt-10 text-sm text-black/60 dark:text-white/60"
      >
        This is the deployed skeleton. Each section names what it will show; none
        of them are showing county records yet.
      </p>
    </div>
  );
}
