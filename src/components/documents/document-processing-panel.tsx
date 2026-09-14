"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  processingDetail,
  processingLabels,
  requestDocumentProcessing,
  type DocumentProcessingStatus,
} from "@/lib/attachments/document-processing";

interface Props {
  storeId: string;
  sourceId: string;
  fileName: string;
  canWrite: boolean;
  processingAvailable: boolean;
}

export function DocumentProcessingPanel(props: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="w-full min-w-0 border-t pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Masquer le texte du PDF" : "Texte du PDF"}
      </Button>
      <div id={id}>{open && <ProcessingContent {...props} />}</div>
    </div>
  );
}

// Mounted only while expanded: closing/navigation drops private text, aborts
// requests and stops polling. No request for every document on list rendering.
function ProcessingContent({
  storeId,
  sourceId,
  fileName,
  canWrite,
  processingAvailable,
}: Props) {
  const [job, setJob] = useState<DocumentProcessingStatus | null>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [checks, setChecks] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const pageId = useId();

  const run = useCallback(
    async (method: "GET" | "POST" | "DELETE") => {
      const controller = lifetime.current;
      if (!controller || controller.signal.aborted || locked.current) return;
      locked.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await requestDocumentProcessing({
          storeId,
          sourceId,
          method,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setJob(result);
      } catch {
        if (controller.signal.aborted) return;
        // Do not keep displaying a result after access/deletion may have changed.
        setJob(undefined);
        setError(
          method === "GET"
            ? "Statut indisponible. Vérifiez votre connexion et votre accès au document, puis actualisez."
            : "Action non confirmée. Actualisez le statut avant de recommencer ; ne renvoyez pas le PDF.",
        );
      } finally {
        locked.current = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [storeId, sourceId],
  );

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const timer = setTimeout(() => void run("GET"), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [run]);

  const active = job?.state === "queued" || job?.state === "running";
  useEffect(() => {
    if (!active || error || checks >= 20) return;
    const timer = setInterval(() => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        locked.current
      )
        return;
      setChecks((value) => value + 1);
      void run("GET");
    }, 30_000);
    return () => clearInterval(timer);
  }, [active, error, checks, run]);

  // Expiry also applies to text already in memory, not just the next API read.
  useEffect(() => {
    if (!job) return;
    const timer = setTimeout(
      () => {
        setJob(undefined);
        void run("GET");
      },
      Math.max(0, Date.parse(job.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [job, run]);

  const pages = job?.state === "ready" ? job.result?.pages : undefined;
  const index = Math.min(pageIndex, Math.max(0, (pages?.length ?? 1) - 1));
  const selected = pages?.[index];
  return (
    <section
      aria-label={`Texte de ${fileName}`}
      className="mt-3 min-w-0 space-y-3 text-sm"
    >
      <p role="status" aria-live="polite">
        {job
          ? processingLabels[job.state]
          : job === null
            ? "Aucune extraction disponible"
            : busy
              ? "Chargement du statut…"
              : "Statut à vérifier"}
      </p>
      {job && <p className="text-muted-foreground">{processingDetail(job)}</p>}
      {job === null && (
        <p className="text-muted-foreground">
          {processingAvailable && canWrite
            ? "Extrayez le texte natif du PDF, sans IA. Les pages scannées ne sont pas transcrites."
            : processingAvailable
              ? "Un responsable autorisé peut demander l’extraction du texte."
              : "L’extraction n’est pas activée pour ce magasin. Le PDF reste téléchargeable."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canWrite && processingAvailable && job === null && !error && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void run("POST")}
          >
            Extraire le texte
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setChecks(0);
            void run("GET");
          }}
        >
          Actualiser le statut
        </Button>
        {canWrite && job && job.state !== "cancelled" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Annuler l’extraction et retirer son texte ? Le PDF original sera conservé.",
                )
              )
                void run("DELETE");
            }}
          >
            {job.state === "ready"
              ? "Retirer le texte extrait"
              : "Annuler l’extraction"}
          </Button>
        )}
      </div>
      {active && checks >= 20 && (
        <p className="text-muted-foreground">
          Suivi automatique en pause. Actualisez pour reprendre le suivi.
        </p>
      )}
      {selected && pages && job && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={pageId}>Page</label>
            <select
              id={pageId}
              value={index}
              className="rounded-md border bg-background px-2 py-1"
              onChange={(event) => setPageIndex(Number(event.target.value))}
            >
              {pages.map((page, position) => (
                <option key={page.page} value={position}>
                  {page.page} / {pages.length}
                </option>
              ))}
            </select>
          </div>
          {selected.text.trim() ? (
            <pre
              className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm [overflow-wrap:anywhere]"
              tabIndex={0}
              aria-label={`Texte de la page ${selected.page}`}
            >
              {selected.text}
            </pre>
          ) : (
            <p className="text-muted-foreground">
              Aucun texte détecté sur cette page. Elle peut être vide ou scannée
              ; aucun OCR n’est effectué.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Extraction temporaire jusqu’au{" "}
            {new Date(job.expiresAt).toLocaleString("fr-FR", {
              timeZone: "Europe/Paris",
            })}
            . Le PDF original reste conservé.
          </p>
        </div>
      )}
    </section>
  );
}
