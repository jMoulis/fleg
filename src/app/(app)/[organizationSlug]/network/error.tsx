"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function NetworkError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-16">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>La vue réseau ne peut pas être chargée</AlertTitle>
        <AlertDescription>
          Vérifiez la connexion au service puis réessayez. Le périmètre autorisé n’a pas été modifié.
          {error.digest ? ` Référence : ${error.digest}.` : ""}
        </AlertDescription>
      </Alert>
      <Button className="mt-5" variant="outline" onClick={reset}>
        <RotateCcw aria-hidden="true" />
        Réessayer
      </Button>
    </main>
  );
}
