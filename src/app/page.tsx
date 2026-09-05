import {
  ArrowRight,
  BadgeEuro,
  ChartNoAxesCombined,
  CircleCheck,
  DatabaseZap,
  Leaf,
  ShieldCheck,
  Store,
} from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const previewMetrics = [
  { label: "CA fruits & légumes", value: "58 891 €", trend: "+6,8 % vs N-1" },
  { label: "Marge brute", value: "17 202 €", trend: "29,2 % du CA" },
  { label: "Actions prioritaires", value: "12", trend: "4 à valider" },
] as const;

const principles = [
  {
    icon: DatabaseZap,
    title: "Importer sans friction",
    description:
      "Prévisualisez, réconciliez et validez les données Mercalys avant tout engagement.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Comprendre les écarts",
    description:
      "Reliez chiffre d’affaires, marge, saisonnalité et assortiment dans un même contexte.",
  },
  {
    icon: CircleCheck,
    title: "Décider avec des preuves",
    description:
      "Chaque recommandation expose ses signaux et reste un brouillon jusqu’à validation.",
  },
] as const;

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-svh overflow-hidden bg-background">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
            <Leaf aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">
              F&amp;L Cockpit
            </p>
            <p className="text-xs text-muted-foreground">
              Pilotage multi-magasin
            </p>
          </div>
        </div>
        <span className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs">
          Fondation P0
        </span>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-12 lg:pb-24 lg:pt-20">
        <div className="absolute -left-40 top-0 -z-10 size-128 rounded-full bg-primary/8 blur-3xl" />

        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/7 px-3 py-1.5 text-sm font-medium text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Conçu pour isoler chaque magasin dès le départ
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.05]">
            Décider vite, magasin par magasin.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            F&amp;L Cockpit transforme les données fruits et légumes en
            décisions opérationnelles lisibles, traçables et toujours validées
            par un manager.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ size: "lg" }), "w-fit")}
            >
              Se connecter au cockpit
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
            <p className="text-sm text-muted-foreground">
              Chaque magasin est revérifié côté serveur à l’ouverture.
            </p>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-foreground/75">
            <span className="inline-flex items-center gap-2">
              <Store aria-hidden="true" className="size-4 text-primary" />
              Multi-magasin natif
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeEuro aria-hidden="true" className="size-4 text-primary" />
              Montants précis en centimes
            </span>
          </div>
        </div>

        <section
          aria-labelledby="preview-title"
          className="relative rounded-[1.75rem] border border-primary/10 bg-card p-3 shadow-[0_24px_80px_-32px_color-mix(in_oklch,var(--primary),transparent_65%)] sm:p-5"
        >
          <div className="rounded-[1.2rem] border bg-background p-4 sm:p-6">
            <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Aperçu produit
                </p>
                <h2
                  id="preview-title"
                  className="mt-1 text-xl font-semibold tracking-tight"
                >
                  Vue magasin
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                <Store aria-hidden="true" className="size-4 text-primary" />
                <span className="font-medium">Paris Centre</span>
                <span className="text-muted-foreground">· Août 2026</span>
              </div>
            </div>

            <div className="grid gap-3 py-5 sm:grid-cols-3">
              {previewMetrics.map((metric) => (
                <article
                  key={metric.label}
                  className="rounded-xl border bg-card p-4"
                >
                  <p className="text-xs leading-5 text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs font-medium text-primary">
                    {metric.trend}
                  </p>
                </article>
              ))}
            </div>

            <div className="rounded-xl bg-muted/70 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">
                    Prochaine action expliquée
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Les recommandations resteront en brouillon jusqu’à votre
                    décision.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-300/15 dark:text-amber-200">
                  À valider
                </span>
              </div>
            </div>
          </div>
          <p className="px-2 pb-1 pt-3 text-center text-xs text-muted-foreground">
            Données illustratives — aucune donnée magasin n’est encore
            connectée.
          </p>
        </section>
      </section>

      <section
        id="workflow"
        aria-labelledby="workflow-title"
        className="border-t bg-muted/35"
      >
        <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:px-12 lg:py-18">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">
              Le flux de décision
            </p>
            <h2
              id="workflow-title"
              className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              De la donnée brute à l’action auditée.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {principles.map(({ icon: Icon, title, description }, index) => (
              <article
                key={title}
                className="rounded-2xl border bg-card p-6 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
