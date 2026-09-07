"use client";

import { useState } from "react";

import { GranularSalesCoveragePanel } from "@/components/imports/granular-sales-coverage-panel";
import { MercalysDailyImportFlow } from "@/components/imports/mercalys-daily-import-flow";

export function MercalysDailyImportWorkspace({ storeId }: { storeId: string }) {
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="space-y-8">
      <MercalysDailyImportFlow
        storeId={storeId}
        onCommitted={() => setRefreshToken((current) => current + 1)}
      />
      <GranularSalesCoveragePanel
        key={refreshToken}
        storeId={storeId}
        refreshToken={refreshToken}
      />
    </div>
  );
}
