"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { documentSourceListSchema } from "@/domain/attachments/document-source";
import {
  uploadIntentReceiptSchema,
  type UploadIntentReceipt,
} from "@/domain/attachments/private-storage";
import {
  attachmentCommand,
  sendDocument,
  verifyDocumentUpload,
} from "@/lib/attachments/document-upload";

interface Props {
  storeId: string;
  userId: string;
  basePath: string;
  canWrite: boolean;
  uploadsAvailable: boolean;
  documents: z.infer<typeof documentSourceListSchema>;
  hasCursor: boolean;
}

const recoveryEvent = "fleg-document-recovery";
function subscribeRecovery(notify: () => void) {
  window.addEventListener(recoveryEvent, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(recoveryEvent, notify);
    window.removeEventListener("storage", notify);
  };
}

export function DocumentManager({
  storeId,
  userId,
  basePath,
  canWrite,
  uploadsAvailable,
  documents,
  hasCursor,
}: Props) {
  const router = useRouter();
  const base = `/api/stores/${storeId}/attachments/upload-intents`;
  const recoveryKey = `fleg-document-upload:${userId}:${storeId}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const attempt = useRef(crypto.randomUUID());
  const locked = useRef(false);
  const recovery = useSyncExternalStore(
    subscribeRecovery,
    () => {
      try {
        const id = z.uuid().safeParse(sessionStorage.getItem(recoveryKey));
        return id.success ? id.data : "";
      } catch {
        return "unavailable";
      }
    },
    () => "loading",
  );
  const ready = recovery !== "loading" && recovery !== "unavailable";
  const pending = ready && recovery ? recovery : null;
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function forget() {
    sessionStorage.removeItem(recoveryKey);
    window.dispatchEvent(new Event(recoveryEvent));
    setFile(null);
    setCaption("");
    attempt.current = crypto.randomUUID();
    if (fileInput.current) fileInput.current.value = "";
  }
  function finish(intent: UploadIntentReceipt) {
    if (intent.state === "linked") {
      forget();
      setMessage("PDF vérifié et enregistré.");
      router.refresh();
    } else if (
      ["cancelled", "deleted", "deleting", "rejected"].includes(intent.state)
    ) {
      forget();
      setMessage(
        intent.state === "rejected"
          ? "PDF refusé après vérification (contenu invalide, protégé ou limites dépassées). Choisissez un autre fichier."
          : "Envoi abandonné. Son nettoyage sera effectué séparément.",
      );
    } else
      setMessage(
        `Réception non confirmée. Réessayez la vérification à partir de ${new Date(intent.reconcileAfter).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Ne renvoyez pas le fichier.`,
      );
  }
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof Error &&
          !["TypeError", "AbortError", "TimeoutError", "ZodError"].includes(
            caught.name,
          )
          ? caught.message
          : "Connexion interrompue ou réponse indisponible. Vérifiez la réception avant de recommencer.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {canWrite && uploadsAvailable ? (
        <form
          className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!file || pending || !ready) return;
            void run(async () =>
              finish(
                await sendDocument({
                  base,
                  file,
                  caption,
                  idempotencyKey: attempt.current,
                  phase: setMessage,
                  remember: (id) => {
                    sessionStorage.setItem(recoveryKey, id);
                    window.dispatchEvent(new Event(recoveryEvent));
                  },
                }),
              ),
            );
          }}
          aria-busy={busy}
        >
          <h2 className="text-lg font-semibold">Ajouter un document</h2>
          <p id="document-limits" className="text-sm text-muted-foreground">
            PDF uniquement · 25 Mo et 60 pages maximum · connexion requise
          </p>
          <div className="space-y-2">
            <label htmlFor="document-file" className="text-sm font-medium">
              Fichier PDF
            </label>
            <Input
              id="document-file"
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              aria-describedby="document-limits"
              disabled={busy || !!pending || !ready}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                attempt.current = crypto.randomUUID();
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="document-caption" className="text-sm font-medium">
              Description (facultative)
            </label>
            <Input
              id="document-caption"
              maxLength={300}
              value={caption}
              disabled={busy || !!pending}
              onChange={(event) => {
                setCaption(event.target.value);
                attempt.current = crypto.randomUUID();
              }}
              placeholder="Ex. Promotions de la semaine 37"
            />
          </div>
          {pending ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setMessage("Vérification du PDF…");
                    finish(await verifyDocumentUpload(base, pending));
                  })
                }
              >
                Vérifier la réception
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = z
                      .object({ intent: uploadIntentReceiptSchema })
                      .parse(
                        await attachmentCommand(`${base}/${pending}/cancel`),
                      );
                    if (
                      !["cancelled", "deleted", "deleting"].includes(
                        result.intent.state,
                      )
                    )
                      throw new Error(
                        "L’annulation n’est pas confirmée. Vérifiez la réception.",
                      );
                    forget();
                    setMessage(
                      "Envoi abandonné. Son nettoyage sera effectué séparément.",
                    );
                    router.refresh();
                  })
                }
              >
                Abandonner l’envoi
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={busy || !file || !ready}>
              Envoyer le PDF
            </Button>
          )}
        </form>
      ) : (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          {canWrite
            ? "L’envoi de PDF n’est pas activé sur cet environnement. Les essais sont ouverts sur le stockage de développement uniquement."
            : "Vous pouvez consulter les documents. Leur ajout est réservé aux responsables autorisés."}
        </p>
      )}
      <p role="status" className="text-sm" aria-live="polite">
        {message ||
          (pending
            ? "Un envoi reste à vérifier. Aucun fichier ne sera renvoyé."
            : "")}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {recovery === "unavailable" && (
        <p role="alert" className="text-sm text-destructive">
          Autorisez le stockage de session du navigateur pour pouvoir reprendre
          un envoi interrompu.
        </p>
      )}
      <section aria-labelledby="documents-title">
        <h2 id="documents-title" className="mb-3 text-lg font-semibold">
          Documents du magasin
        </h2>
        {documents.sources.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aucun document enregistré
            {hasCursor ? " sur cette page" : " pour le moment"}.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {documents.sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">
                    {source.originalFileName}
                  </h3>
                  {source.caption && (
                    <p className="break-words text-sm">{source.caption}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {source.pageCount} page{source.pageCount > 1 ? "s" : ""} ·{" "}
                    {source.sizeBytes < 1024 * 1024
                      ? `${Math.max(1, Math.ceil(source.sizeBytes / 1024))} Ko`
                      : `${(source.sizeBytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mo`}
                    {" · "}
                    {new Date(source.createdAt).toLocaleDateString("fr-FR", {
                      timeZone: "Europe/Paris",
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <a
                    className="text-sm font-medium text-primary underline underline-offset-4"
                    href={source.contentUrl}
                    download
                    aria-label={`Télécharger ${source.originalFileName}`}
                  >
                    Télécharger
                  </a>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      aria-label={`Supprimer ${source.originalFileName}`}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Retirer « ${source.originalFileName} » des documents du magasin ?`,
                          )
                        )
                          return;
                        void run(async () => {
                          z.object({
                            state: z.literal("deleting"),
                            deletionComplete: z.literal(false),
                          }).parse(
                            await attachmentCommand(
                              `/api/stores/${storeId}/attachments/sources/${source.id}/remove`,
                            ),
                          );
                          setMessage(
                            "Document retiré. Le nettoyage du stockage est en attente.",
                          );
                          router.refresh();
                        });
                      }}
                    >
                      Supprimer
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {hasCursor && (
            <Link href={basePath} className="text-primary underline">
              Revenir aux plus récents
            </Link>
          )}
          {documents.nextCursor && (
            <Link
              href={`${basePath}?cursor=${documents.nextCursor}`}
              className="text-primary underline"
            >
              Documents plus anciens
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
