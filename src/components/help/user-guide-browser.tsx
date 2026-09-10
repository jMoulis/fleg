"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenText, Search } from "lucide-react";

import type { UserGuideSection } from "@/domain/help/user-guide";
import { normalizeSearchText } from "@/lib/text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface UserGuideBrowserProps {
  baseHref: string;
  sections: UserGuideSection[];
}

export function UserGuideBrowser({
  baseHref,
  sections,
}: UserGuideBrowserProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchText(deferredQuery.trim());
  const visibleSections = normalizedQuery
    ? sections.filter((section) =>
        normalizeSearchText(
          [
            section.eyebrow,
            section.title,
            section.summary,
            ...section.keywords,
          ].join(" "),
        ).includes(normalizedQuery),
      )
    : sections;

  return (
    <div className="mt-8">
      <div className="relative max-w-xl">
        <label htmlFor="guide-search" className="sr-only">
          Rechercher dans le guide utilisateur
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="guide-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher : colisage, XYZ, Copilote…"
          className="h-11 pl-9"
        />
      </div>

      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        {visibleSections.length} chapitre(s) disponible(s)
      </p>

      {visibleSections.length === 0 ? (
        <Card className="mt-5 border-dashed">
          <CardContent className="py-10 text-center">
            <p className="font-medium">Aucun chapitre trouvé</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Essayez un terme métier comme stock, ABC, colisage ou démarque.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleSections.map((section) => (
            <Link
              key={section.slug}
              href={`${baseHref}/${section.slug}`}
              className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Card className="h-full transition-colors group-hover:ring-primary/35">
                <CardHeader>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    <BookOpenText aria-hidden="true" className="size-4" />
                    {section.eyebrow}
                  </p>
                  <CardTitle className="mt-2 flex items-start justify-between gap-3 text-lg">
                    {section.title}
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-1"
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="leading-6 text-muted-foreground">
                    {section.summary}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
