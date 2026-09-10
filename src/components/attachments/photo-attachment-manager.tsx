"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  Camera,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BoundedOptionPicker } from "@/components/ui/bounded-option-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorSchema } from "@/domain/api/schemas";
import {
  attachmentCreateMetadataSchema,
  attachmentDeletionResponseSchema,
  attachmentMaxSizeBytes,
  attachmentResponseSchema,
  attachmentTargetKey,
  type Attachment,
  type AttachmentTarget,
} from "@/domain/attachments/schemas";

export interface AttachmentTargetOption {
  label: string;
  description: string;
  target: AttachmentTarget;
}

interface PhotoAttachmentManagerProps {
  title: string;
  description: string;
  storeId: string;
  targets: AttachmentTargetOption[];
  initialAttachments: Attachment[];
  canWrite: boolean;
}

function formatBytes(bytes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024));
}

function apiMessage(body: unknown, fallback: string): string {
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success ? parsed.data.message : fallback;
}

export function PhotoAttachmentManager({
  title,
  description,
  storeId,
  targets,
  initialAttachments,
  canWrite,
}: PhotoAttachmentManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [selectedTargetKey, setSelectedTargetKey] = useState(() =>
    targets[0] ? attachmentTargetKey(targets[0].target) : "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const targetByKey = useMemo(
    () =>
      new Map(
        targets.map((option) => [attachmentTargetKey(option.target), option]),
      ),
    [targets],
  );
  const targetPickerOptions = useMemo(
    () =>
      targets.map((option) => ({
        id: attachmentTargetKey(option.target),
        label: option.label,
        description: option.description,
      })),
    [targets],
  );
  const selectedTarget = targetByKey.get(selectedTargetKey) ?? null;
  const visibleAttachments = attachments.filter(
    (attachment) => attachment.targetKey === selectedTargetKey,
  );

  async function uploadPhoto() {
    if (!selectedTarget || !file || pending) return;
    setError(null);
    setNotice(null);
    const metadata = attachmentCreateMetadataSchema.safeParse({
      target: selectedTarget.target,
      caption: caption.trim() || null,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!metadata.success) {
      setError(metadata.error.issues[0]?.message ?? "Métadonnées invalides.");
      return;
    }
    if (file.size > attachmentMaxSizeBytes) {
      setError("La photo doit peser au maximum 4 Mio.");
      return;
    }

    setPending(true);
    try {
      const form = new FormData();
      form.set("metadata", JSON.stringify(metadata.data));
      form.set("file", file);
      const response = await fetch(`/api/stores/${storeId}/attachments`, {
        method: "POST",
        body: form,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          apiMessage(body, "La photo n’a pas pu être enregistrée."),
        );
      }
      const result = attachmentResponseSchema.parse(body);
      setAttachments((current) => [
        result.attachment,
        ...current.filter(({ id }) => id !== result.attachment.id),
      ]);
      setFile(null);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      setNotice("Photo ajoutée. La géométrie du plan reste inchangée.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La photo n’a pas pu être enregistrée.",
      );
    } finally {
      setPending(false);
    }
  }

  async function deletePhoto(attachmentId: string) {
    if (!canWrite || deletingId) return;
    setDeletingId(attachmentId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/stores/${storeId}/attachments/${attachmentId}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(apiMessage(body, "La photo n’a pas pu être supprimée."));
      }
      const result = attachmentDeletionResponseSchema.parse(body);
      setAttachments((current) =>
        current.filter(({ id }) => id !== result.deletedAttachment.id),
      );
      setConfirmDeleteId(null);
      setNotice("Photo supprimée définitivement. La trace d’audit est conservée.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La photo n’a pas pu être supprimée.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Camera aria-hidden="true" className="size-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-2 max-w-3xl leading-6">
              {description}
            </CardDescription>
          </div>
          <Badge variant="secondary">Manuel · privé</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs leading-5 text-muted-foreground">
          JPEG, PNG ou WebP · 4 Mio maximum · 20 photos par cible · conservées
          jusqu’à suppression manuelle. La suppression retire définitivement le
          fichier ; l’audit reste conservé.
        </p>

        {error ? (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Photo non traitée</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert role="status">
            <AlertTitle>Photothèque mise à jour</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {targets.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <Camera
              aria-hidden="true"
              className="mx-auto size-7 text-muted-foreground"
            />
            <p className="mt-3 text-sm font-medium">Aucune cible disponible</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Créez d’abord l’élément auquel rattacher une photo.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
              <BoundedOptionPicker
                emptyMessage="Aucune cible ne correspond à cette recherche."
                id="attachment-target"
                itemLabel="cible(s)"
                label="Élément photographié"
                onSelect={(targetKey) => {
                  setSelectedTargetKey(targetKey);
                  setConfirmDeleteId(null);
                  setError(null);
                  setNotice(null);
                }}
                options={targetPickerOptions}
                placeholder="Rechercher par nom ou description…"
                selectedId={selectedTargetKey}
                testIdPrefix="attachment-target-picker"
              />

              {canWrite ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="attachment-file">Photo</Label>
                    <Input
                      ref={inputRef}
                      id="attachment-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setError(null);
                        setNotice(null);
                      }}
                    />
                  </div>
                  <div className="space-y-2 sm:row-span-2">
                    <Label htmlFor="attachment-caption">Légende facultative</Label>
                    <Textarea
                      id="attachment-caption"
                      value={caption}
                      maxLength={300}
                      placeholder="Ex. implantation observée avant ouverture"
                      onChange={(event) => setCaption(event.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full sm:w-fit"
                    disabled={!file || pending}
                    onClick={uploadPhoto}
                    type="button"
                  >
                    {pending ? (
                      <LoaderCircle aria-hidden="true" className="animate-spin" />
                    ) : (
                      <ImagePlus aria-hidden="true" />
                    )}
                    Ajouter la photo
                  </Button>
                </div>
              ) : (
                <Alert>
                  <AlertTitle>Consultation uniquement</AlertTitle>
                  <AlertDescription>
                    La permission d’écriture des pièces jointes est requise pour
                    ajouter ou supprimer une photo.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {visibleAttachments.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <Camera
                  aria-hidden="true"
                  className="mx-auto size-8 text-muted-foreground"
                />
                <p className="mt-3 text-sm font-medium">Aucune photo</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Les photos ajoutées restent de simples observations manuelles.
                </p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleAttachments.map((attachment) => (
                  <li key={attachment.id}>
                    <article className="overflow-hidden rounded-xl border bg-card">
                      <div className="relative aspect-[4/3] bg-muted">
                        <Image
                          fill
                          unoptimized
                          alt={attachment.caption ?? attachment.originalFileName}
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          src={attachment.contentUrl}
                        />
                      </div>
                      <div className="space-y-3 p-4">
                        <div>
                          <p className="truncate text-sm font-medium">
                            {attachment.caption ?? attachment.originalFileName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatBytes(attachment.sizeBytes)} Mio ·{" "}
                            {new Intl.DateTimeFormat("fr-FR", {
                              dateStyle: "medium",
                            }).format(new Date(attachment.createdAt))}
                          </p>
                        </div>
                        {canWrite ? (
                          confirmDeleteId === attachment.id ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={deletingId === attachment.id}
                                onClick={() => deletePhoto(attachment.id)}
                                size="sm"
                                type="button"
                                variant="destructive"
                              >
                                {deletingId === attachment.id ? (
                                  <LoaderCircle
                                    aria-hidden="true"
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Trash2 aria-hidden="true" />
                                )}
                                Confirmer
                              </Button>
                              <Button
                                disabled={deletingId === attachment.id}
                                onClick={() => setConfirmDeleteId(null)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <X aria-hidden="true" />
                                Annuler
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={() => setConfirmDeleteId(attachment.id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Trash2 aria-hidden="true" />
                              Supprimer
                            </Button>
                          )
                        ) : null}
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
