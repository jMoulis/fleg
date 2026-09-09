"use client";

import { useState } from "react";

import { GranularSalesCoveragePanel } from "@/components/imports/granular-sales-coverage-panel";
import { MercalysDailyImportFlow } from "@/components/imports/mercalys-daily-import-flow";

export function MercalysDailyImportWorkspace({ storeId }: { storeId: string }) {
  const [refresh, setRefresh] = useState<{
    token: number;
    from?: string;
    to?: string;
  }>({ token: 0 });

  return (
    <div className="space-y-8">
      <MercalysDailyImportFlow
        storeId={storeId}
        onCommitted={({ from, to }) =>
          setRefresh((current) => ({ token: current.token + 1, from, to }))
        }
      />
      <GranularSalesCoveragePanel
        key={refresh.token}
        storeId={storeId}
        refreshToken={refresh.token}
        initialFrom={refresh.from}
        initialTo={refresh.to}
      />
    </div>
  );
}
