"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function OrganizationAdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Administration indisponible</AlertTitle>
        <AlertDescription>
          Réessayez. Aucun changement incomplet n’est présenté comme enregistré.
        </AlertDescription>
      </Alert>
      <Button className="mt-5" onClick={reset} type="button">
        Réessayer
      </Button>
    </main>
  );
}
