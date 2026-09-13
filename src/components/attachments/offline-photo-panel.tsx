"use client";

import { liveQuery } from "dexie";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BoundedOptionPicker } from "@/components/ui/bounded-option-picker";
import {
  attachmentTargetKey,
  type AttachmentTarget,
} from "@/domain/attachments/schemas";
import type {
  LocalPhoto,
  PreparedPhotos,
} from "@/domain/attachments/photo-queue";
import {
  enqueuePhoto,
  exportLocalPhoto,
  discardUnsentPhoto,
  listLocalPhotos,
  readPhotoPreparation,
  savePhotoPreparation,
  assertPhotoPreparation,
} from "@/lib/attachments/photo-queue-storage";
import {
  checkPhotoAccess,
  syncLocalPhoto,
} from "@/lib/attachments/photo-queue-sync";
import {
  preparationEpoch,
  forgetPreparedWorkspace,
} from "@/lib/offline/database";
import {
  registerFieldWorker,
  verifyFieldShell,
} from "@/lib/offline/service-worker";
import { attachmentCommand } from "@/lib/attachments/private-upload";

export function OfflinePhotoPanel({
  scope,
  target,
  onLinked,
}: {
  scope?: { userId?: string; storeId: string };
  target?: { target: AttachmentTarget; label: string } | null;
  onLinked?: (id?: string) => Promise<void>;
}) {
  const [snapshot, setPrepared] = useState<PreparedPhotos | null>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  const linked = useRef(onLinked);
  useEffect(() => {
    linked.current = onLinked;
  }, [onLinked]);
  const userId = scope?.userId;
  const storeId = scope?.storeId;
  const prepared =
    snapshot &&
    (!userId || snapshot.identity.userId === userId) &&
    (!storeId || snapshot.identity.storeId === storeId)
      ? snapshot
      : null;

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    let running = false;
    let identityKey = "";
    function clearPrivate() {
      setPrepared(null);
      setPhotos([]);
      setFile(null);
      setCaption("");
      setSelected("");
      setConfirm(null);
      setConsent(false);
      setMessage("");
      if (input.current) input.current.value = "";
    }
    async function refresh() {
      if (controller.signal.aborted || running) return;
      running = true;
      try {
        const copy = await readPhotoPreparation();
        if (
          !copy ||
          (userId && copy.identity.userId !== userId) ||
          (storeId && copy.identity.storeId !== storeId)
        ) {
          clearPrivate();
          return;
        }
        await assertPhotoPreparation(copy);
        let online = navigator.onLine;
        if (online) {
          try {
            const access = await checkPhotoAccess(copy, controller.signal);
            if (!access) {
              await forgetPreparedWorkspace();
              throw new Error(
                "Session modifiée. Préparez à nouveau la cible avec le bon compte.",
              );
            }
            online = access === "ready";
          } catch (cause) {
            // Wi-Fi without an uplink: a still-fresh consented copy stays usable.
            if (
              cause instanceof TypeError ||
              (cause instanceof DOMException && cause.name === "TimeoutError")
            )
              online = false;
            else throw cause;
          }
        }
        const rows = await listLocalPhotos(copy);
        if (controller.signal.aborted) return;
        setPrepared(copy);
        setPhotos(rows);
        if (online && document.visibilityState === "visible") {
          for (const row of rows) {
            if (controller.signal.aborted) break;
            if (
              row.phase === "attention" ||
              row.nextAttemptAt > Date.now() ||
              (row.lease && row.lease.until > Date.now())
            )
              continue;
            const receipt = await syncLocalPhoto({
              preparation: copy,
              id: row.id,
              signal: controller.signal,
            });
            if (receipt?.state === "linked") {
              setMessage("Photo vérifiée et ajoutée à la photothèque.");
              await linked.current?.(receipt.sourceId);
            }
          }
          const latest = await listLocalPhotos(copy);
          if (!controller.signal.aborted) setPhotos(latest);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error && cause.name !== "ZodError"
              ? cause.message
              : "Stockage local indisponible ou incompatible. Aucune photo effacée.",
          );
          // Do not retain visible private labels after expiry or account invalidation.
          // Lock private contents after an unexpected access/storage error.
          clearPrivate();
        }
      } finally {
        running = false;
      }
    }
    const subscription = liveQuery(async () => {
      const copy = await readPhotoPreparation();
      if (copy) await listLocalPhotos(copy).catch(() => []);
      return copy;
    }).subscribe({
      next: (copy) => {
        const nextIdentity = copy ? JSON.stringify(copy.identity) : "";
        if (identityKey && identityKey !== nextIdentity) clearPrivate();
        identityKey = nextIdentity;
        if (
          !copy ||
          (userId && copy.identity.userId !== userId) ||
          (storeId && copy.identity.storeId !== storeId) ||
          Date.parse(copy.expiresAt) <= Date.now()
        ) {
          clearPrivate();
        }
        void refresh();
      },
      error: () => {
        clearPrivate();
        setError("Stockage local indisponible. Photos non enregistrées.");
      },
    });
    const resume = () => void refresh();
    const timer = setInterval(resume, 30_000);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
    // Identity, not a rendered queue update, owns the lifetime of an upload.
  }, [userId, storeId]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error &&
          !["ZodError", "TypeError"].includes(cause.name)
          ? cause.message
          : "Action interrompue. Aucune confirmation d’enregistrement ; conservez le fichier d’origine.",
      );
    } finally {
      setBusy(false);
    }
  }
  const chosen =
    prepared?.targets.find((v) => attachmentTargetKey(v.target) === selected) ??
    prepared?.targets[0];
  return (
    <section
      aria-label="Photos hors connexion"
      className="space-y-3 rounded-xl border p-4"
    >
      <h3 className="font-semibold">Photos terrain · sur cet appareil</h3>
      {scope && target && (
        <details>
          <summary className="cursor-pointer text-sm">
            Préparer « {target.label} » hors connexion
          </summary>
          <label className="my-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            J’autorise la conservation locale des photos sur cet appareil de
            confiance et leur envoi au retour du réseau, app ouverte.
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            10 photos / 40 Mio maximum sur cet appareil. Pas d’effacement
            automatique des photos en attente. Ne pas utiliser sur un appareil
            partagé sans protection.
          </p>
          <Button
            type="button"
            disabled={!consent || busy}
            onClick={() =>
              void run(async () => {
                const epoch = await preparationEpoch();
                if (process.env.NODE_ENV === "production") {
                  await registerFieldWorker();
                  await verifyFieldShell();
                }
                const response = await attachmentCommand(
                  `/api/stores/${scope.storeId}/attachments/offline`,
                  target,
                );
                await savePhotoPreparation(response, epoch);
                setMessage(
                  "Cible préparée. Ouvrez Photos terrain avant de couper le réseau.",
                );
              })
            }
          >
            Préparer cette cible
          </Button>
        </details>
      )}
      {prepared ? (
        <>
          <p className="text-sm font-medium">{prepared.storeName}</p>
          <p className="text-xs text-muted-foreground">
            Préparation valable jusqu’au{" "}
            {new Date(prepared.expiresAt).toLocaleString("fr-FR")}.{" "}
            {photos.length} photo(s) en attente pour ce compte et ce magasin.
          </p>
          <Link
            prefetch={false}
            href={`/offline?storeId=${prepared.identity.storeId}#offline-photos`}
            onClick={(event) => {
              event.preventDefault();
              // Full document navigation uses the precached static shell, not an RSC fetch.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign(
                `/offline?storeId=${prepared.identity.storeId}#offline-photos`,
              );
            }}
            className="inline-flex min-h-11 items-center text-sm underline"
          >
            Ouvrir Photos terrain dans l’espace hors connexion
          </Link>
          <form
            aria-label="Conserver une photo sur cet appareil"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!file || !chosen) return;
              void run(async () => {
                await enqueuePhoto({
                  preparation: prepared,
                  file,
                  target: chosen.target,
                  caption,
                });
                setMessage(
                  "Photo enregistrée sur cet appareil. Envoi au retour du réseau, app ouverte.",
                );
                setFile(null);
                setCaption("");
                if (input.current) input.current.value = "";
              });
            }}
          >
            <BoundedOptionPicker
              id="local-photo-target"
              label="Cible préparée"
              itemLabel="cible(s)"
              options={prepared.targets.map((v) => ({
                id: attachmentTargetKey(v.target),
                label: v.label,
                description: "Cible et version figées",
              }))}
              selectedId={chosen ? attachmentTargetKey(chosen.target) : ""}
              onSelect={setSelected}
              placeholder="Rechercher une cible…"
              emptyMessage="Aucune cible préparée"
            />
            <Label htmlFor="local-photo-file">Photo à conserver</Label>
            <Input
              id="local-photo-file"
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Label htmlFor="local-photo-caption">
              Légende de la photo locale
            </Label>
            <Input
              id="local-photo-caption"
              value={caption}
              maxLength={300}
              disabled={busy}
              onChange={(e) => setCaption(e.target.value)}
            />
            <Button type="submit" disabled={busy || !file}>
              Conserver et envoyer dès que possible
            </Button>
          </form>
          <ul className="space-y-3">
            {photos.map((photo) => (
              <li
                key={photo.id}
                className="space-y-2 rounded-lg border p-3 text-sm"
              >
                <p className="break-words font-medium">
                  {photo.label} · {photo.metadata.originalFileName}
                </p>
                <p>{photo.message}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const receipt = await syncLocalPhoto({
                          preparation: prepared,
                          id: photo.id,
                          signal: lifetime.current!.signal,
                          manual: true,
                        });
                        if (receipt?.state === "linked") {
                          setMessage(
                            "Photo vérifiée et ajoutée à la photothèque.",
                          );
                          await linked.current?.(receipt.sourceId);
                        }
                      })
                    }
                  >
                    Reprendre la vérification
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const exported = await exportLocalPhoto(
                          prepared,
                          photo.id,
                        );
                        const url = URL.createObjectURL(exported.bytes);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = exported.fileName;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      })
                    }
                  >
                    Garder une copie
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirm(photo.id)}
                  >
                    Retirer de la file
                  </Button>
                </div>
                {confirm === photo.id && (
                  <div className="space-y-2">
                    <p>
                      Supprimer la copie locale ? Gardez une copie si
                      nécessaire. Un envoi commencé devra être rapproché en
                      ligne ; une photo déjà liée restera dans la photothèque.
                    </p>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (photo.phase === "queued")
                            await discardUnsentPhoto(prepared, photo.id);
                          else
                            await syncLocalPhoto({
                              preparation: prepared,
                              id: photo.id,
                              signal: lifetime.current!.signal,
                              discard: true,
                            });
                          setConfirm(null);
                        })
                      }
                    >
                      Confirmer le retrait
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirm(null)}
                    >
                      Conserver
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Avec du réseau, préparez une cible depuis les photos d’Espace, TG ou
          Paramètres. Les photos déjà en attente sont conservées si la
          préparation expire.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
