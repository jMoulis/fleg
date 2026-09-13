"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AttachmentTarget } from "@/domain/attachments/schemas";
import {
  uploadIntentReceiptSchema,
  type UploadIntentReceipt,
} from "@/domain/attachments/private-storage";
import {
  attachmentCommand,
  recoverDocumentUpload,
  sendPhoto,
} from "@/lib/attachments/private-upload";

const recoveryEvent = "fleg-photo-recovery";
function subscribe(notify: () => void) {
  window.addEventListener(recoveryEvent, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(recoveryEvent, notify);
    window.removeEventListener("storage", notify);
  };
}

export function PhotoUploadForm({
  storeId,
  userId,
  target,
  onLinked,
}: {
  storeId: string;
  userId: string;
  target: AttachmentTarget | null;
  onLinked: (sourceId?: string) => Promise<void>;
}) {
  const base = `/api/stores/${storeId}/attachments/upload-intents`;
  // No file, signed URL, caption or target is persisted in this connected lot.
  // The offline byte queue is a separate, consented IndexedDB workflow.
  const recoveryKey = `fleg-photo-upload:${userId}:${storeId}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const attempt = useRef(crypto.randomUUID());
  const locked = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const recovery = useSyncExternalStore(
    subscribe,
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
  const pending = ready ? recovery : "";
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const forget = useCallback(() => {
    sessionStorage.removeItem(recoveryKey);
    window.dispatchEvent(new Event(recoveryEvent));
    setFile(null);
    setCaption("");
    attempt.current = crypto.randomUUID();
    if (fileInput.current) fileInput.current.value = "";
  }, [recoveryKey]);
  const finish = useCallback(
    async (intent: UploadIntentReceipt) => {
      if (lifetime.current?.signal.aborted) return;
      if (intent.state === "linked") {
        // Keep the recovery ID if refreshing the gallery fails.
        await onLinked(intent.sourceId);
        if (lifetime.current?.signal.aborted) return;
        forget();
        setMessage(
          "Photo vérifiée et ajoutée. La géométrie du plan reste inchangée.",
        );
      } else if (
        ["cancelled", "deleted", "deleting", "rejected"].includes(intent.state)
      ) {
        forget();
        setMessage(
          intent.state === "rejected"
            ? "Photo refusée après vérification du format, de la taille ou de la cible. Choisissez un autre fichier."
            : "Envoi abandonné. Nettoyage programmé.",
        );
      } else {
        const received = intent.receivedAt || intent.state === "uploaded";
        const date = new Date(intent.reconcileAfter).toLocaleString("fr-FR");
        setMessage(
          `${received ? "Photo reçue — vérification en cours." : "Réception non confirmée."} Vérification à reprendre à partir du ${date}. Ne renvoyez pas le fichier.`,
        );
      }
    },
    [forget, onLinked],
  );
  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      if (lifetime.current?.signal.aborted) return;
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
  }, []);
  const recover = useCallback(
    async (id: string, initial?: UploadIntentReceipt) => {
      const controller = lifetime.current;
      if (!controller || controller.signal.aborted) return;
      await finish(
        await recoverDocumentUpload({
          base,
          id,
          initial,
          signal: controller.signal,
          onProgress: (intent) =>
            setMessage(
              intent.receivedAt || intent.state === "uploaded"
                ? "Photo reçue — vérification automatique en cours."
                : "Confirmation de réception en cours. Aucun nouvel envoi.",
            ),
        }),
      );
    },
    [base, finish],
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => void run(() => recover(pending)), 0);
    return () => clearTimeout(timer);
  }, [pending, recover, run]);

  return (
    <form
      className="space-y-3"
      aria-label="Ajouter une photo"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        const controller = lifetime.current;
        if (!file || !target || pending || !ready || !controller) return;
        void run(async () => {
          const intent = await sendPhoto({
            base,
            file,
            target,
            caption,
            idempotencyKey: attempt.current,
            signal: controller.signal,
            phase: setMessage,
            remember: (id) => {
              sessionStorage.setItem(recoveryKey, id);
              window.dispatchEvent(new Event(recoveryEvent));
            },
          });
          await recover(intent.id, intent);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="attachment-file">Photo</Label>
          <Input
            ref={fileInput}
            id="attachment-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || !!pending || !ready}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              attempt.current = crypto.randomUUID();
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="attachment-caption">Légende facultative</Label>
          <Textarea
            id="attachment-caption"
            value={caption}
            maxLength={300}
            placeholder="Ex. implantation observée avant ouverture"
            disabled={busy || !!pending}
            onChange={(event) => {
              setCaption(event.target.value);
              attempt.current = crypto.randomUUID();
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Connexion requise pour envoyer. La photo n’est pas sauvegardée sur cet
        appareil.
      </p>
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run(() => recover(pending))}
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
                    await attachmentCommand(
                      `${base}/${pending}/cancel`,
                      {},
                      lifetime.current?.signal,
                    ),
                  );
                if (
                  !["cancelled", "deleted", "deleting"].includes(
                    result.intent.state,
                  )
                )
                  throw new Error(
                    "Annulation non confirmée. Vérifiez la réception.",
                  );
                await finish(result.intent);
              })
            }
          >
            Abandonner l’envoi
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={busy || !file || !target || !ready}>
          Ajouter la photo
        </Button>
      )}
      <p role="status" aria-live="polite" className="text-sm">
        {message ||
          (pending
            ? "Un envoi reste à vérifier. Aucun fichier ne sera renvoyé."
            : "")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {recovery === "unavailable" && (
        <p role="alert" className="text-sm text-destructive">
          Autorisez le stockage de session pour reprendre un envoi interrompu.
        </p>
      )}
    </form>
  );
}
