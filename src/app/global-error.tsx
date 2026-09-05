"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body className="grid min-h-svh place-items-center bg-background px-5 text-foreground">
        <main className="w-full max-w-xl rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-sm font-semibold text-destructive">Erreur inattendue</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            L’application ne peut pas afficher cette page
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Réessayez dans un instant. Aucun droit ni aucune donnée métier n’ont été modifiés.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              Référence : {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
