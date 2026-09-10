"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  CloudSun,
  LoaderCircle,
  Megaphone,
  X,
} from "lucide-react";

import { BoundedProductPicker } from "@/components/products/bounded-product-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BoundedListPagination } from "@/components/ui/bounded-list-pagination";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  promotionMechanicLabels,
  promotionMechanicSchema,
  promotionObservationResponseSchema,
  weatherConditionLabels,
  weatherConditionSchema,
  weatherObservationResponseSchema,
  type BusinessContextView,
  type PromotionMechanic,
  type WeatherCondition,
} from "@/domain/context-observations/schemas";
import type { ProductOption } from "@/domain/products/schemas";

interface BusinessContextManagerProps {
  canWrite: boolean;
  initialDate: string;
  initialView: BusinessContextView;
  products: ProductOption[];
  storeId: string;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const coverageLabels = {
  complete: "Complète",
  partial: "Partielle",
  unknown: "Inconnue",
} as const;

const contextHistoryPageSize = 25;

function apiMessage(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return null;
}

function nullableNumber(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formattedDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function BusinessContextManager({
  canWrite,
  initialDate,
  initialView,
  products,
  storeId,
}: BusinessContextManagerProps) {
  const router = useRouter();
  const [promotionDate, setPromotionDate] = useState(initialDate);
  const [promotionState, setPromotionState] = useState<"active" | "none">(
    "active",
  );
  const [mechanic, setMechanic] = useState<PromotionMechanic>("display");
  const [promotionLabel, setPromotionLabel] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [promotionNotes, setPromotionNotes] = useState("");
  const [promotionPending, setPromotionPending] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [promotionNotice, setPromotionNotice] = useState<string | null>(null);

  const [weatherDate, setWeatherDate] = useState(initialDate);
  const [condition, setCondition] = useState<WeatherCondition>("clear");
  const [minimumTemperature, setMinimumTemperature] = useState("");
  const [maximumTemperature, setMaximumTemperature] = useState("");
  const [precipitation, setPrecipitation] = useState("");
  const [weatherNotes, setWeatherNotes] = useState("");
  const [weatherPending, setWeatherPending] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherNotice, setWeatherNotice] = useState<string | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product.label])),
    [products],
  );
  const availableProducts = useMemo(
    () =>
      products.filter((product) => !selectedProductIds.includes(product.id)),
    [products, selectedProductIds],
  );
  const days = useMemo(
    () => [...initialView.days].reverse(),
    [initialView.days],
  );
  const promotions = useMemo(
    () =>
      [...initialView.promotionObservations].sort((left, right) =>
        right.recordedAt.localeCompare(left.recordedAt),
      ),
    [initialView.promotionObservations],
  );
  const weather = useMemo(
    () =>
      [...initialView.weatherObservations].sort((left, right) =>
        right.recordedAt.localeCompare(left.recordedAt),
      ),
    [initialView.weatherObservations],
  );

  function addProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId) ? current : [...current, productId],
    );
  }

  function removeProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.filter((id) => id !== productId),
    );
  }

  async function submitPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || promotionPending) return;
    const parsedDiscount = nullableNumber(discountPercent);
    if (!promotionDate) {
      setPromotionError("Renseignez la date du constat.");
      return;
    }
    if (promotionState === "active" && selectedProductIds.length === 0) {
      setPromotionError("Sélectionnez au moins un produit concerné.");
      return;
    }
    if (promotionState === "active" && !promotionLabel.trim()) {
      setPromotionError("Renseignez un libellé pour la promotion.");
      return;
    }
    if (
      parsedDiscount === undefined ||
      (parsedDiscount !== null && (parsedDiscount < 0 || parsedDiscount > 100))
    ) {
      setPromotionError("La remise doit être comprise entre 0 et 100 %.");
      return;
    }

    setPromotionPending(true);
    setPromotionError(null);
    setPromotionNotice(null);
    try {
      const active = promotionState === "active";
      const response = await fetch(`/api/stores/${storeId}/context/promotions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          businessDate: promotionDate,
          state: promotionState,
          productIds: active ? selectedProductIds : [],
          mechanic: active ? mechanic : null,
          label: active ? promotionLabel.trim() : null,
          discountRate:
            active && parsedDiscount !== null ? parsedDiscount / 100 : null,
          provenance: { kind: "manual" },
          notes: promotionNotes.trim() || null,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          apiMessage(payload) ??
            "L’observation promotionnelle n’a pas pu être enregistrée.",
        );
      }
      promotionObservationResponseSchema.parse(payload);
      setPromotionLabel("");
      setDiscountPercent("");
      setSelectedProductIds([]);
      setPromotionNotes("");
      setPromotionNotice(
        "Observation enregistrée sans modifier les ventes ni les prévisions.",
      );
      router.refresh();
    } catch (caught) {
      setPromotionError(
        caught instanceof Error
          ? caught.message
          : "L’observation promotionnelle n’a pas pu être enregistrée.",
      );
    } finally {
      setPromotionPending(false);
    }
  }

  async function submitWeather(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || weatherPending) return;
    const minimum = nullableNumber(minimumTemperature);
    const maximum = nullableNumber(maximumTemperature);
    const precipitationMm = nullableNumber(precipitation);
    if (!weatherDate) {
      setWeatherError("Renseignez la date du constat.");
      return;
    }
    if (
      minimum === undefined ||
      maximum === undefined ||
      precipitationMm === undefined
    ) {
      setWeatherError("Les mesures météo doivent être des nombres valides.");
      return;
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      setWeatherError("La température maximale doit être supérieure au minimum.");
      return;
    }

    setWeatherPending(true);
    setWeatherError(null);
    setWeatherNotice(null);
    try {
      const response = await fetch(`/api/stores/${storeId}/context/weather`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          businessDate: weatherDate,
          condition,
          minimumTemperatureC: minimum,
          maximumTemperatureC: maximum,
          precipitationMm,
          provenance: { kind: "manual" },
          notes: weatherNotes.trim() || null,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          apiMessage(payload) ?? "L’observation météo n’a pas pu être enregistrée.",
        );
      }
      weatherObservationResponseSchema.parse(payload);
      setMinimumTemperature("");
      setMaximumTemperature("");
      setPrecipitation("");
      setWeatherNotes("");
      setWeatherNotice(
        "Observation enregistrée avec sa provenance et sa date métier.",
      );
      router.refresh();
    } catch (caught) {
      setWeatherError(
        caught instanceof Error
          ? caught.message
          : "L’observation météo n’a pas pu être enregistrée.",
      );
    } finally {
      setWeatherPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {!canWrite ? (
        <Alert>
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Consultation uniquement</AlertTitle>
          <AlertDescription>
            Votre rôle permet de consulter les preuves, mais pas d’en ajouter.
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="Saisie du contexte observé"
        className="grid gap-6 xl:grid-cols-2"
      >
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Megaphone aria-hidden="true" className="size-5 text-primary" />
              Promotion observée
            </CardTitle>
            <CardDescription>
              Une absence constatée est différente d’un jour non renseigné.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitPromotion}>
              {promotionError ? (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Enregistrement impossible</AlertTitle>
                  <AlertDescription>{promotionError}</AlertDescription>
                </Alert>
              ) : null}
              {promotionNotice ? (
                <Alert>
                  <CheckCircle2 aria-hidden="true" className="text-primary" />
                  <AlertTitle>Promotion enregistrée</AlertTitle>
                  <AlertDescription>{promotionNotice}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="promotion-date">Date métier</Label>
                  <Input
                    id="promotion-date"
                    max={initialDate}
                    min={initialView.from}
                    onChange={(event) => setPromotionDate(event.target.value)}
                    required
                    type="date"
                    value={promotionDate}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="promotion-state">Constat</Label>
                  <Select
                    onValueChange={(value) =>
                      setPromotionState(value === "none" ? "none" : "active")
                    }
                    value={promotionState}
                  >
                    <SelectTrigger className="w-full" id="promotion-state">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Promotion active</SelectItem>
                      <SelectItem value="none">Aucune promotion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {promotionState === "active" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="promotion-mechanic">Mécanique</Label>
                      <Select
                        onValueChange={(value) =>
                          setMechanic(promotionMechanicSchema.parse(value))
                        }
                        value={mechanic}
                      >
                        <SelectTrigger className="w-full" id="promotion-mechanic">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {promotionMechanicSchema.options.map((option) => (
                            <SelectItem key={option} value={option}>
                              {promotionMechanicLabels[option]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="promotion-discount">Remise (%)</Label>
                      <Input
                        id="promotion-discount"
                        inputMode="decimal"
                        max="100"
                        min="0"
                        onChange={(event) => setDiscountPercent(event.target.value)}
                        placeholder="Facultatif"
                        step="0.1"
                        type="number"
                        value={discountPercent}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="promotion-label">Libellé</Label>
                    <Input
                      id="promotion-label"
                      maxLength={160}
                      onChange={(event) => setPromotionLabel(event.target.value)}
                      placeholder="Ex. TG agrumes semaine 37"
                      required
                      value={promotionLabel}
                    />
                  </div>
                  <fieldset className="space-y-2 rounded-xl border p-3">
                    <legend className="px-1 text-sm font-medium">
                      Produits concernés
                    </legend>
                    {products.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Aucun produit disponible. Importez d’abord les ventes.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <BoundedProductPicker
                          actionLabel="Ajouter"
                          collapseOnSelect={false}
                          disabled={selectedProductIds.length >= 50}
                          id="promotion-product"
                          label="Ajouter un produit concerné"
                          onSelect={addProduct}
                          products={availableProducts}
                          selectedProductId=""
                        />
                        <p className="text-xs text-muted-foreground">
                          {selectedProductIds.length} / 50 produit(s) sélectionné(s)
                        </p>
                        {selectedProductIds.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedProductIds.map((productId) => {
                              const productLabel =
                                productById.get(productId) ??
                                "Produit indisponible";
                              return (
                                <Badge key={productId} variant="secondary">
                                  {productLabel}
                                  <button
                                    aria-label={`Retirer ${productLabel}`}
                                    onClick={() => removeProduct(productId)}
                                    type="button"
                                  >
                                    <X aria-hidden="true" className="size-3" />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </fieldset>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="promotion-notes">Notes (facultatif)</Label>
                <Textarea
                  id="promotion-notes"
                  maxLength={1_000}
                  onChange={(event) => setPromotionNotes(event.target.value)}
                  placeholder="Éléments terrain utiles à la provenance…"
                  value={promotionNotes}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Source : saisie terrain manuelle, horodatée et auditée.
              </p>
              <Button
                className="w-full"
                disabled={!canWrite || promotionPending}
                type="submit"
              >
                {promotionPending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Megaphone aria-hidden="true" />
                )}
                {promotionPending ? "Enregistrement…" : "Enregistrer le constat"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <CloudSun aria-hidden="true" className="size-5 text-primary" />
              Météo observée
            </CardTitle>
            <CardDescription>
              La saisie la plus récente devient la preuve retenue pour la date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitWeather}>
              {weatherError ? (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Enregistrement impossible</AlertTitle>
                  <AlertDescription>{weatherError}</AlertDescription>
                </Alert>
              ) : null}
              {weatherNotice ? (
                <Alert>
                  <CheckCircle2 aria-hidden="true" className="text-primary" />
                  <AlertTitle>Météo enregistrée</AlertTitle>
                  <AlertDescription>{weatherNotice}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="weather-date">Date métier</Label>
                  <Input
                    id="weather-date"
                    max={initialDate}
                    min={initialView.from}
                    onChange={(event) => setWeatherDate(event.target.value)}
                    required
                    type="date"
                    value={weatherDate}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weather-condition">Condition</Label>
                  <Select
                    onValueChange={(value) =>
                      setCondition(weatherConditionSchema.parse(value))
                    }
                    value={condition}
                  >
                    <SelectTrigger className="w-full" id="weather-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {weatherConditionSchema.options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {weatherConditionLabels[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="weather-min">Minimum (°C)</Label>
                  <Input
                    id="weather-min"
                    max="60"
                    min="-50"
                    onChange={(event) => setMinimumTemperature(event.target.value)}
                    step="0.1"
                    type="number"
                    value={minimumTemperature}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weather-max">Maximum (°C)</Label>
                  <Input
                    id="weather-max"
                    max="60"
                    min="-50"
                    onChange={(event) => setMaximumTemperature(event.target.value)}
                    step="0.1"
                    type="number"
                    value={maximumTemperature}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weather-rain">Précipitations (mm)</Label>
                  <Input
                    id="weather-rain"
                    max="500"
                    min="0"
                    onChange={(event) => setPrecipitation(event.target.value)}
                    step="0.1"
                    type="number"
                    value={precipitation}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weather-notes">Notes (facultatif)</Label>
                <Textarea
                  id="weather-notes"
                  maxLength={1_000}
                  onChange={(event) => setWeatherNotes(event.target.value)}
                  placeholder="Événement local ou précision utile…"
                  value={weatherNotes}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Source : saisie terrain manuelle. Les mesures laissées vides restent inconnues.
              </p>
              <Button
                className="w-full"
                disabled={!canWrite || weatherPending}
                type="submit"
              >
                {weatherPending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <CloudSun aria-hidden="true" />
                )}
                {weatherPending ? "Enregistrement…" : "Enregistrer la météo"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="context-coverage-title">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle id="context-coverage-title">Couverture quotidienne</CardTitle>
                <CardDescription>
                  Jointure magasin/date du {formattedDate(initialView.from)} au {formattedDate(initialView.to)}.
                </CardDescription>
              </div>
              <Badge variant={initialView.coverage.status === "complete" ? "default" : "secondary"}>
                {coverageLabels[initialView.coverage.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <EvidenceMetric
                label="Jours complets"
                value={`${initialView.coverage.completeDates.length} / ${initialView.coverage.expectedDates.length}`}
              />
              <EvidenceMetric
                label="Promotion manquante"
                value={`${initialView.coverage.missingPromotionDates.length} jour(s)`}
              />
              <EvidenceMetric
                label="Météo manquante"
                value={`${initialView.coverage.missingWeatherDates.length} jour(s)`}
              />
            </div>
            <ul className="mt-5 divide-y" aria-label="Contexte quotidien">
              {days.map((day) => (
                <li className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr_1fr]" key={day.businessDate}>
                  <p className="font-medium">{formattedDate(day.businessDate)}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Promotion : </span>
                    {day.promotion.status === "missing"
                      ? "non renseignée"
                      : day.promotion.active
                        ? `${day.promotion.observationIds.length} active(s)${day.promotion.maximumDiscountRate === null ? "" : ` · remise max ${Math.round(day.promotion.maximumDiscountRate * 100)} %`}`
                        : "aucune, constatée"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Météo : </span>
                    {day.weather.status === "missing" || day.weather.condition === null
                      ? "non renseignée"
                      : weatherConditionLabels[day.weather.condition]}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">
              Vue {initialView.calculationVersion} · révision données {initialView.dataRevision}. Ces éléments ne modifient aucun fait métier ni aucune prévision.
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-label="Provenance des observations" className="grid gap-6 xl:grid-cols-2">
        <EvidenceHistory
          empty="Aucune observation promotionnelle sur cette plage."
          entries={promotions.map((observation) => (
            <li
              className="py-3 first:pt-0 last:pb-0"
              data-context-history-item
              key={observation.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {observation.state === "none" ? "Aucune promotion" : observation.label}
                </p>
                <Badge variant="outline">{formattedDate(observation.businessDate)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {observation.provenance.kind === "manual"
                  ? "Saisie terrain"
                  : `Opération liée ${observation.provenance.commercialEventId}`}
                {observation.productIds.length > 0
                  ? ` · ${observation.productIds.map((id) => productById.get(id) ?? "Produit indisponible").join(", ")}`
                  : ""}
              </p>
            </li>
          ))}
          testId="promotion"
          title="Preuves promotionnelles"
        />
        <EvidenceHistory
          empty="Aucune observation météo sur cette plage."
          entries={weather.map((observation) => (
            <li
              className="py-3 first:pt-0 last:pb-0"
              data-context-history-item
              key={observation.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{weatherConditionLabels[observation.condition]}</p>
                <Badge variant="outline">{formattedDate(observation.businessDate)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {observation.provenance.kind === "manual"
                  ? "Saisie terrain"
                  : `${observation.provenance.provider} · ${observation.provenance.reference}`}
                {observation.minimumTemperatureC === null && observation.maximumTemperatureC === null
                  ? " · températures inconnues"
                  : ` · ${observation.minimumTemperatureC ?? "?"} à ${observation.maximumTemperatureC ?? "?"} °C`}
              </p>
            </li>
          ))}
          testId="weather"
          title="Preuves météo"
        />
      </section>
    </div>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function EvidenceHistory({
  empty,
  entries,
  testId,
  title,
}: {
  empty: string;
  entries: ReactNode[];
  testId: "promotion" | "weather";
  title: string;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(entries.length / contextHistoryPageSize));
  const safePage = Math.min(page, pageCount);
  const visibleEntries = entries.slice(
    (safePage - 1) * contextHistoryPageSize,
    safePage * contextHistoryPageSize,
  );
  return (
    <Card data-context-history={testId}>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>Historique immuable avec provenance explicite.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length > 0 ? (
          <>
            <BoundedListPagination
              ariaLabel={`Pagination — ${title}`}
              currentPage={safePage}
              itemLabel="preuve(s)"
              onPageChange={setPage}
              pageSize={contextHistoryPageSize}
              totalItems={entries.length}
            />
            <ul
              className="divide-y"
              data-context-history-page-size={contextHistoryPageSize}
            >
              {visibleEntries}
            </ul>
            <div className="border-t pt-4">
              <BoundedListPagination
                ariaLabel={`Pagination en bas — ${title}`}
                currentPage={safePage}
                itemLabel="preuve(s)"
                onPageChange={setPage}
                pageSize={contextHistoryPageSize}
                totalItems={entries.length}
              />
            </div>
          </>
        ) : (
          <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
            {empty}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
