"use client";

import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function DecisionsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Journal indisponible</AlertTitle>
        <AlertDescription>
          Le journal et ses suivis n’ont pas pu être chargés. Réessayez sans
          changer de contexte magasin.
        </AlertDescription>
      </Alert>
      <Button className="mt-4" onClick={reset} type="button" variant="outline">
        Réessayer
      </Button>
    </main>
  );
}
