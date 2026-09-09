"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileClock,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiErrorSchema } from "@/domain/api/schemas";
import {
  dailyImportCommitResponseSchema,
  dailyImportPreviewResponseSchema,
} from "@/domain/imports/daily-schemas";
import type { AliasResolution } from "@/domain/imports/schemas";
import {
  productOptionsResponseSchema,
  type ProductOption,
} from "@/domain/products/schemas";

interface MercalysDailyImportFlowProps {
  storeId: string;
  onCommitted?: (range: { from: string; to: string }) => void;
}

type Preview = ReturnType<typeof dailyImportPreviewResponseSchema.parse>;
type Commit = ReturnType<typeof dailyImportCommitResponseSchema.parse>;

interface ResolutionDraft {
  action: "create" | "merge" | "ignore";
  canonicalLabel: string;
  productId: string;
}

const euroFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const quantityFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 3,
});

async function readApiError(response: Response, fallback: string) {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.message : fallback;
}

export function MercalysDailyImportFlow({
  storeId,
  onCommitted,
}: MercalysDailyImportFlowProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ResolutionDraft>>(
    {},
  );
  const [commit, setCommit] = useState<Commit | null>(null);
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCommit(null);
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Sélectionnez un export journalier Mercalys XLSX ou CSV.");
      return;
    }

    setPending("preview");
    try {
      const [previewResponse, productsResponse] = await Promise.all([
        fetch(`/api/stores/${storeId}/imports/daily/preview`, {
          method: "POST",
          body: formData,
        }),
        fetch(`/api/stores/${storeId}/products/options`, {
          headers: { Accept: "application/json" },
        }),
      ]);
      if (!previewResponse.ok) {
        throw new Error(
          await readApiError(
            previewResponse,
            "La prévisualisation journalière a échoué.",
          ),
        );
      }

      const parsedPreview = dailyImportPreviewResponseSchema.safeParse(
        await previewResponse.json(),
      );
      if (!parsedPreview.success) {
        throw new Error("La réponse de prévisualisation est invalide.");
      }
      let availableProducts: ProductOption[] = [];
      if (productsResponse.ok) {
        const parsedProducts = productOptionsResponseSchema.safeParse(
          await productsResponse.json(),
        );
        availableProducts = parsedProducts.success
          ? parsedProducts.data.products
          : [];
      }

      setProducts(availableProducts);
      setPreview(parsedPreview.data);
      setResolutions(
        Object.fromEntries(
          parsedPreview.data.unresolvedAliases.map((alias) => [
            alias.externalKey,
            {
              action: "create" as const,
              canonicalLabel: alias.sourceLabel,
              productId: "",
            },
          ]),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La prévisualisation journalière a échoué.",
      );
    } finally {
      setPending(null);
    }
  }

  function updateResolution(
    externalKey: string,
    update: Partial<ResolutionDraft>,
  ) {
    setResolutions((current) => ({
      ...current,
      [externalKey]: {
        action: current[externalKey]?.action ?? "create",
        canonicalLabel: current[externalKey]?.canonicalLabel ?? "",
        productId: current[externalKey]?.productId ?? "",
        ...update,
      },
    }));
  }

  async function handleCommit() {
    if (!preview) return;

    const payload: AliasResolution[] = [];
    for (const alias of preview.unresolvedAliases) {
      const resolution = resolutions[alias.externalKey];
      if (!resolution) {
        setError(`Résolution manquante pour ${alias.sourceLabel}.`);
        return;
      }
      if (resolution.action === "create") {
        if (!resolution.canonicalLabel.trim()) {
          setError(`Nom canonique manquant pour ${alias.sourceLabel}.`);
          return;
        }
        payload.push({
          externalKey: alias.externalKey,
          action: "create",
          canonicalLabel: resolution.canonicalLabel.trim(),
        });
      } else if (resolution.action === "merge") {
        if (!resolution.productId) {
          setError(`Choisissez le produit à fusionner pour ${alias.sourceLabel}.`);
          return;
        }
        payload.push({
          externalKey: alias.externalKey,
          action: "merge",
          productId: resolution.productId,
        });
      } else {
        payload.push({ externalKey: alias.externalKey, action: "ignore" });
      }
    }

    setPending("commit");
    setError(null);
    try {
      const response = await fetch(
        `/api/stores/${storeId}/imports/daily/${preview.importId}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolutions: payload }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await readApiError(response, "La validation journalière a échoué."),
        );
      }
      const result = dailyImportCommitResponseSchema.safeParse(
        await response.json(),
      );
      if (!result.success) {
        throw new Error("La réponse de validation est invalide.");
      }
      setCommit(result.data);
      onCommitted?.({ from: preview.startDate, to: preview.endDate });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La validation journalière a échoué.",
      );
    } finally {
      setPending(null);
    }
  }

  if (commit) {
    return (
      <Card className="border-primary/20 bg-primary/[0.035]">
        <CardContent className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <CheckCircle2 aria-hidden="true" className="size-7" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">Import journalier validé</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {commit.importedFactCount} fait(s) journalier(s) enregistré(s), {commit.unchangedFactCount} inchangé(s). Révision des données : {commit.dataRevision}.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => setCommit(null)}>
            Importer un autre fichier
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Action impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileClock aria-hidden="true" className="size-5 text-primary" />
            Export journalier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePreview} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field className="flex-1">
              <FieldLabel htmlFor="mercalys-daily-file">Ventes journalières Mercalys</FieldLabel>
              <Input
                id="mercalys-daily-file"
                name="file"
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                disabled={pending !== null}
                required
              />
              <FieldDescription>
                La date et le code PDV sont contrôlés depuis le contenu du fichier.
              </FieldDescription>
            </Field>
            <Button type="submit" size="lg" disabled={pending !== null}>
              {pending === "preview" ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              Prévisualiser
            </Button>
          </form>
        </CardContent>
      </Card>

      {preview ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Réconciliation journalière">
            <PreviewMetric
              label="Journée"
              value={
                preview.startDate === preview.endDate
                  ? preview.startDate
                  : `${preview.startDate} au ${preview.endDate}`
              }
            />
            <PreviewMetric label="PDV source" value={preview.sourceStoreCode ?? "Non détecté"} />
            <PreviewMetric label="Chiffre d’affaires" value={euroFormatter.format(preview.totals.revenueCents / 100)} />
            <PreviewMetric label="Marge" value={euroFormatter.format(preview.totals.marginCents / 100)} />
            <PreviewMetric label="Quantité" value={quantityFormatter.format(preview.totals.quantity)} />
          </section>

          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>
              Couverture {preview.coverage.status === "complete" ? "complète" : "partielle"}
            </AlertTitle>
            <AlertDescription>
              {preview.includedRowCount} article(s) inclus, {preview.excludedRowCount} ligne(s) agrégée(s) exclue(s), {preview.observedDates.length} journée(s) observée(s).
            </AlertDescription>
          </Alert>

          {preview.warnings.length > 0 ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Contrôles de prévisualisation</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {preview.warnings.map((warning, index) => (
                    <li key={`${warning.code}-${warning.rowNumber ?? index}`}>
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Résolution des produits</CardTitle>
              <p className="text-sm text-muted-foreground">
                {preview.unresolvedAliases.length === 0
                  ? "Les identifiants ITM8, EAN ou les libellés correspondent déjà à des produits connus."
                  : `${preview.unresolvedAliases.length} produit(s) nécessitent une décision.`}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {preview.unresolvedAliases.map((alias) => {
                const resolution = resolutions[alias.externalKey];
                return (
                  <div key={alias.externalKey} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_12rem_1.2fr] lg:items-end">
                    <Field>
                      <FieldLabel>Produit source</FieldLabel>
                      <Input value={alias.sourceLabel} readOnly />
                      <FieldDescription>
                        ITM8 {alias.sourceItm8 ?? "—"} · EAN {alias.sourceEan ?? "—"}
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel>Décision</FieldLabel>
                      <Select
                        value={resolution?.action ?? "create"}
                        onValueChange={(value) =>
                          updateResolution(alias.externalKey, {
                            action: (value ?? "create") as ResolutionDraft["action"],
                          })
                        }
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="create">Créer</SelectItem>
                          <SelectItem value="merge" disabled={products.length === 0}>Fusionner</SelectItem>
                          <SelectItem value="ignore">Ignorer</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {resolution?.action === "merge" ? (
                      <Field>
                        <FieldLabel>Produit canonique</FieldLabel>
                        <Select
                          value={resolution.productId}
                          onValueChange={(value) =>
                            updateResolution(alias.externalKey, { productId: value ?? "" })
                          }
                        >
                          <SelectTrigger className="w-full"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                          <SelectContent>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>{product.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    ) : resolution?.action === "ignore" ? (
                      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                        Les lignes correspondantes ne seront pas enregistrées.
                      </p>
                    ) : (
                      <Field>
                        <FieldLabel>Nom canonique</FieldLabel>
                        <Input
                          value={resolution?.canonicalLabel ?? alias.sourceLabel}
                          onChange={(event) =>
                            updateResolution(alias.externalKey, { canonicalLabel: event.target.value })
                          }
                        />
                      </Field>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                  Le commit est versionné, idempotent et audité.
                </p>
                <Button size="lg" onClick={handleCommit} disabled={pending !== null}>
                  {pending === "commit" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                  Valider l’import journalier
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">{value}</p>
      </CardContent>
    </Card>
  );
}
