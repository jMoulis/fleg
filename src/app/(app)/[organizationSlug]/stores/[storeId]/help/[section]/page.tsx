import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpenText, TriangleAlert } from "lucide-react";

import { UserGuideArticle } from "@/components/help/user-guide-article";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  getUserGuideSection,
  userGuideSections,
} from "@/domain/help/user-guide";
import { cn } from "@/lib/utils";
import { requireStoreContext } from "@/server/auth/store-context";
import { readUserGuideSection } from "@/server/user-guide";

export const metadata: Metadata = {
  title: "Guide utilisateur — F&L Cockpit",
};

export default async function StoreHelpSectionPage({
  params,
}: {
  params: Promise<{
    organizationSlug: string;
    storeId: string;
    section: string;
  }>;
}) {
  const [{ organizationSlug, storeId, section: sectionInput }, requestHeaders] =
    await Promise.all([params, headers()]);
  await requireStoreContext(storeId, ["stores.read"], requestHeaders);

  const section = getUserGuideSection(sectionInput);
  if (!section) {
    notFound();
  }

  const content = await readUserGuideSection(section);
  const baseHref = `/${organizationSlug}/stores/${storeId}/help`;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Link
        href={baseHref}
        className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")}
      >
        <ArrowLeft aria-hidden="true" />
        Tous les chapitres
      </Link>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav
          aria-label="Chapitres du guide utilisateur"
          className="rounded-xl border bg-card p-3 lg:sticky lg:top-24"
        >
          <p className="flex items-center gap-2 px-3 pb-3 text-sm font-semibold">
            <BookOpenText aria-hidden="true" className="size-4 text-primary" />
            Guide utilisateur
          </p>
          <ol className="space-y-1">
            {userGuideSections.map((candidate) => {
              const active = candidate.slug === section.slug;

              return (
                <li key={candidate.slug}>
                  <Link
                    href={`${baseHref}/${candidate.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm leading-5 transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {candidate.title}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <article className="min-w-0 rounded-xl border bg-card px-5 py-7 shadow-xs sm:px-8 sm:py-9 lg:px-10">
          {content ? (
            <UserGuideArticle baseHref={baseHref} content={content} />
          ) : (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Guide momentanément indisponible</AlertTitle>
              <AlertDescription>
                Le fichier de ce chapitre n’a pas pu être chargé. Revenez au
                sommaire ou contactez l’administrateur.
              </AlertDescription>
            </Alert>
          )}
        </article>
      </div>
    </main>
  );
}
