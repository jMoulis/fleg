import type { Metadata } from "next";

import { MercalysDailyImportWorkspace } from "@/components/imports/mercalys-daily-import-workspace";
import { MercalysImportFlow } from "@/components/imports/mercalys-import-flow";

export const metadata: Metadata = {
  title: "Import Mercalys — F&L Cockpit",
  description: "Prévisualisez et réconciliez un export Mercalys avant validation.",
};

interface ImportPageProps {
  params: Promise<{ storeId: string }>;
}

export default async function ImportPage({ params }: ImportPageProps) {
  const { storeId } = await params;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold text-primary">Données observées</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
          Import Mercalys
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Importez les observations mensuelles ou journalières sans mélanger leurs granularités.
        </p>
      </div>
      <section aria-labelledby="daily-import-title">
        <div className="mb-4">
          <h2 id="daily-import-title" className="text-xl font-semibold">
            Ventes journalières
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Les faits journaliers sont versionnés séparément des résultats mensuels.
          </p>
        </div>
        <MercalysDailyImportWorkspace storeId={storeId} />
      </section>

      <section className="mt-12 border-t pt-10" aria-labelledby="monthly-import-title">
        <div className="mb-4">
          <h2 id="monthly-import-title" className="text-xl font-semibold">
            Synthèse mensuelle
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Le format historique reste compatible. ITM8 et EAN sont utilisés lorsqu’ils sont présents.
          </p>
        </div>
        <MercalysImportFlow storeId={storeId} />
      </section>
    </main>
  );
}
