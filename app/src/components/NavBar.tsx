"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { sections } from "@/lib/sections";

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-4">
        <Link href="/" className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight">
            Rock Island pipeline explorer
          </span>
          <span className="block text-xs text-black/50 dark:text-white/50">
            Rock Island County, IL
          </span>
        </Link>
        <nav aria-label="Pipeline explorer sections">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {sections.map((section) => {
              const active = pathname === section.href;
              return (
                <li key={section.slug}>
                  <Link
                    href={section.href}
                    data-testid={`nav-${section.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "text-sm font-semibold"
                        : "text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
                    }
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
