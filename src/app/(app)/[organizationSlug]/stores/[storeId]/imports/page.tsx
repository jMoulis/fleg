import type { Metadata } from "next";

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
          Vérifiez les colonnes, la période, les lignes agrégées et les libellés avant d’engager les faits produits.
        </p>
      </div>
      <MercalysImportFlow storeId={storeId} />
    </main>
  );
}
