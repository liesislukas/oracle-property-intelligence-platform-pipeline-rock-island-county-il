import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AwaitingData } from "@/components/AwaitingData";
import { getManifest } from "@/lib/manifests";
import { getSection, sections } from "@/lib/sections";

export const dynamicParams = false;

export function generateStaticParams() {
  return sections.map((s) => ({ section: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const found = getSection(section);
  return {
    title: `${found?.label ?? "Not found"} — Rock Island pipeline explorer`,
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const found = getSection(section);
  if (!found) notFound();

  const manifest = getManifest(found.slug);

  return (
    <section
      data-testid={`section-${found.slug}`}
      className="mx-auto w-full max-w-3xl px-6 py-12"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{found.label}</h1>
      <p className="mt-3 text-black/70 dark:text-white/70">{found.blurb}</p>
      {manifest.status !== "ready" && (
        <AwaitingData label={found.label} planned={found.planned} />
      )}
    </section>
  );
}
