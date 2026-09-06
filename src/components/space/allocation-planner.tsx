"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calculator,
  CheckCircle2,
  Lock,
  LockOpen,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { apiErrorSchema } from "@/domain/api/schemas";
import {
  allocationConfigSchema,
  allocationPlanCreateInputSchema,
  allocationPlanResponseSchema,
  type AllocationBasis,
  type AllocationConfig,
  type AllocationLine,
  type AllocationPlan,
  type AllocationProduct,
  type ShelfCapacity,
} from "@/domain/space/allocation-schemas";
import {
  buildHeuristicAllocationDraft,
  summarizeAllocations,
  validateAllocationDraft,
} from "@/domain/space/allocations";
import { formatMoney, formatRatio } from "@/lib/formatting";
import { cn } from "@/lib/utils";

interface AllocationPlannerProps {
  storeId: string;
  layoutVersionId: string;
  layoutVersion: number;
  capacities: ShelfCapacity[];
  products: AllocationProduct[];
  basis: AllocationBasis;
  defaultConfig: AllocationConfig;
  initialPlan: AllocationPlan | null;
  canWrite: boolean;
}

const meterFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const ratioFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

const manualEvidence = [
  "Répartition saisie ou ajustée manuellement par le manager.",
];
const heuristicEvidence = [
  "Brouillon classé sur la marge prévisionnelle disponible, puis réparti dans l'ordre physique du plan.",
  "Les allocations verrouillées sont conservées.",
  "La démarque et la compatibilité produit-mobilier ne sont pas encore disponibles : validation manager obligatoire.",
];

export function AllocationPlanner({
  storeId,
  layoutVersionId,
  layoutVersion,
  capacities,
  products,
  basis,
  defaultConfig,
  initialPlan,
  canWrite,
}: AllocationPlannerProps) {
  const router = useRouter();
  const [allocations, setAllocations] = useState<AllocationLine[]>(
    initialPlan?.allocations ?? [],
  );
  const [config, setConfig] = useState<AllocationConfig>(
    initialPlan?.config ?? defaultConfig,
  );
  const [source, setSource] = useState<"manager" | "heuristic">(
    initialPlan?.source ?? "manager",
  );
  const [evidence, setEvidence] = useState(
    initialPlan?.evidence ?? manualEvidence,
  );
  const [selectedShelfId, setSelectedShelfId] = useState(
    capacities[0]?.shelfId ?? "",
  );
  const [selectedProductId, setSelectedProductId] = useState(
    products[0]?.id ?? "",
  );
  const [search, setSearch] = useState("");
  const [planName, setPlanName] = useState(
    initialPlan?.name ?? `Allocation du plan ${layoutVersion}`,
  );
  const [note, setNote] = useState(initialPlan?.note ?? "");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const authorizedProductIds = useMemo(
    () => new Set(products.map((product) => product.id)),
    [products],
  );
  const summary = useMemo(
    () => summarizeAllocations({ capacities, allocations }),
    [allocations, capacities],
  );
  const validationIssues = useMemo(
    () =>
      validateAllocationDraft({
        capacities,
        allocations,
        config,
        authorizedProductIds,
      }),
    [allocations, authorizedProductIds, capacities, config],
  );
  const selectedCapacity = capacities.find(
    (capacity) => capacity.shelfId === selectedShelfId,
  );
  const selectedAllocations = allocations.filter(
    (allocation) => allocation.shelfId === selectedShelfId,
  );
  const selectedAllocatedWidthM = selectedAllocations.reduce(
    (total, allocation) => total + allocation.facingWidthM,
    0,
  );
  const selectedRemainingWidthM = Math.max(
    0,
    (selectedCapacity?.capacityWidthM ?? 0) - selectedAllocatedWidthM,
  );
  const availableProducts = products.filter(
    (product) =>
      !selectedAllocations.some(
        (allocation) => allocation.productId === product.id,
      ),
  );
  const productToAddId = availableProducts.some(
    (product) => product.id === selectedProductId,
  )
    ? selectedProductId
    : (availableProducts[0]?.id ?? "");
  const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
  const filteredProducts = products
    .filter(
      (product) =>
        !normalizedSearch ||
        product.label.toLocaleLowerCase("fr-FR").includes(normalizedSearch),
    )
    .sort(
      (first, second) =>
        (second.forecastRevenueCents ?? second.revenueCents ?? -1) -
          (first.forecastRevenueCents ?? first.revenueCents ?? -1) ||
        first.label.localeCompare(second.label, "fr"),
    );
  const groupedCapacities = groupCapacities(capacities);

  function markManagerEdit() {
    setSource("manager");
    setEvidence(
      source === "heuristic"
        ? [
            "Proposition heuristique ajustée manuellement par le manager.",
            ...heuristicEvidence,
          ]
        : manualEvidence,
    );
    setError(null);
  }

  function addProduct() {
    if (!selectedCapacity || !productToAddId) {
      return;
    }

    if (selectedRemainingWidthM + 0.000_1 < config.minimumFacingWidthM) {
      setError("La capacité restante est inférieure au facing minimum.");
      return;
    }

    const facingWidthM = Math.min(
      selectedRemainingWidthM,
      Math.max(config.minimumFacingWidthM, config.facingIncrementM),
    );
    setAllocations((current) => [
      ...current,
      {
        productId: productToAddId,
        shelfId: selectedCapacity.shelfId,
        facingWidthM,
        locked: false,
      },
    ]);
    const nextProduct = availableProducts.find(
      (product) => product.id !== productToAddId,
    );
    setSelectedProductId(nextProduct?.id ?? "");
    markManagerEdit();
  }

  function updateAllocation(
    productId: string,
    update: Partial<Pick<AllocationLine, "facingWidthM" | "locked">>,
  ) {
    if (
      update.facingWidthM !== undefined &&
      !Number.isFinite(update.facingWidthM)
    ) {
      return;
    }

    setAllocations((current) =>
      current.map((allocation) =>
        allocation.shelfId === selectedShelfId &&
        allocation.productId === productId
          ? { ...allocation, ...update }
          : allocation,
      ),
    );
    markManagerEdit();
  }

  function removeAllocation(productId: string) {
    setAllocations((current) =>
      current.filter(
        (allocation) =>
          allocation.shelfId !== selectedShelfId ||
          allocation.productId !== productId,
      ),
    );
    markManagerEdit();
  }

  function calculateSuggestion() {
    const validatedConfig = allocationConfigSchema.safeParse(config);

    if (!validatedConfig.success) {
      setError(
        validatedConfig.error.issues[0]?.message ??
          "Les règles du brouillon sont invalides.",
      );
      return;
    }

    const next = buildHeuristicAllocationDraft({
      capacities,
      products,
      currentAllocations: allocations,
      config: validatedConfig.data,
    });
    setAllocations(next);
    setSource("heuristic");
    setEvidence(heuristicEvidence);
    setError(null);
  }

  function updateConfig<Key extends keyof AllocationConfig>(
    key: Key,
    value: AllocationConfig[Key],
  ) {
    if (!Number.isFinite(value)) {
      return;
    }
    setConfig((current) => ({ ...current, [key]: value }));
    markManagerEdit();
  }

  async function savePlan() {
    setError(null);

    if (validationIssues.length > 0) {
      setError(validationIssues[0]?.message ?? "L'allocation est invalide.");
      return;
    }

    const validation = allocationPlanCreateInputSchema.safeParse({
      idempotencyKey,
      basedOnPlanVersion: initialPlan?.version ?? 0,
      layoutVersionId,
      name: planName,
      source,
      modelVersion:
        source === "heuristic"
          ? "space-allocation-heuristic-v1"
          : "manual-allocation-v1",
      config,
      basis,
      evidence,
      allocations,
      note,
    });

    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ??
          "Le plan d'allocation est invalide.",
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/stores/${storeId}/allocations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const apiError = apiErrorSchema.safeParse(body);
        throw new Error(
          apiError.success
            ? apiError.data.message
            : "Le plan d'allocation n'a pas pu être enregistré.",
        );
      }

      const result = allocationPlanResponseSchema.parse(body);
      setIdempotencyKey(crypto.randomUUID());
      setSaving(false);
      router.replace(
        `?savedPlanVersion=${result.plan?.version ?? initialPlan?.version ?? 1}`,
      );
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Le plan d'allocation n'a pas pu être enregistré.",
      );
      setSaving(false);
    }
  }

  if (capacities.length === 0) {
    return (
      <Card className="mt-8">
        <CardContent className="py-12 text-center">
          <h2 className="text-xl font-semibold">Aucune capacité commerciale</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ajoutez au moins un niveau au plan avant de répartir les produits.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <section
        aria-label="Synthèse de l'allocation"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          label="Capacité physique"
          value={`${meterFormatter.format(summary.capacityWidthM)} m`}
          helper={`${capacities.length} niveaux disponibles`}
        />
        <SummaryCard
          label="Facing alloué"
          value={`${meterFormatter.format(summary.allocatedWidthM)} m`}
          helper={ratioFormatter.format(summary.utilizationRatio)}
        />
        <SummaryCard
          label="Reste à répartir"
          value={`${meterFormatter.format(summary.remainingWidthM)} m`}
          helper={`${summary.allocationCount} allocations`}
        />
        <SummaryCard
          label="Largeur effective"
          value={`${meterFormatter.format(summary.effectiveAllocatedWidthM)} m`}
          helper={`${summary.lockedCount} allocations verrouillées`}
        />
      </section>

      {validationIssues.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Allocation à corriger</AlertTitle>
          <AlertDescription>{validationIssues[0]?.message}</AlertDescription>
        </Alert>
      ) : summary.allocationCount > 0 ? (
        <Alert className="border-emerald-500/25 bg-emerald-500/[0.04]">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Capacité respectée</AlertTitle>
          <AlertDescription>
            Aucune allocation ne dépasse la largeur de son niveau.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <Card className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
          <CardHeader>
            <CardTitle>Plan et modules</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choisissez le niveau à répartir.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 overflow-y-auto">
            {groupedCapacities.map((fixture) => (
              <div key={fixture.fixtureId}>
                <p className="font-medium">{fixture.fixtureName}</p>
                <div className="mt-2 space-y-3 border-l pl-3">
                  {fixture.faces.map((face) => (
                    <div key={face.faceId}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {face.faceLabel}
                      </p>
                      <div className="mt-1 grid gap-1">
                        {face.capacities.map((capacity) => {
                          const allocated = allocations
                            .filter(
                              (allocation) =>
                                allocation.shelfId === capacity.shelfId,
                            )
                            .reduce(
                              (total, allocation) =>
                                total + allocation.facingWidthM,
                              0,
                            );
                          return (
                            <button
                              aria-current={
                                selectedShelfId === capacity.shelfId
                                  ? "true"
                                  : undefined
                              }
                              className={cn(
                                "rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                                selectedShelfId === capacity.shelfId &&
                                  "bg-primary text-primary-foreground hover:bg-primary",
                              )}
                              key={capacity.shelfId}
                              onClick={() => {
                                setSelectedShelfId(capacity.shelfId);
                                setError(null);
                              }}
                              type="button"
                            >
                              <span className="block font-medium">
                                {capacity.moduleLabel}
                              </span>
                              <span
                                className={cn(
                                  "mt-0.5 block text-xs text-muted-foreground",
                                  selectedShelfId === capacity.shelfId &&
                                    "text-primary-foreground/75",
                                )}
                              >
                                {meterFormatter.format(allocated)} / {meterFormatter.format(capacity.capacityWidthM)} m
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-primary">
                  {selectedCapacity?.fixtureName}
                </p>
                <CardTitle className="mt-1 text-xl">
                  {selectedCapacity?.faceLabel} · {selectedCapacity?.moduleLabel}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedCapacity?.shelfLabel} · coefficient effectif {meterFormatter.format(selectedCapacity?.effectiveFactor ?? 0)}
                </p>
              </div>
              <Badge variant="secondary">
                {meterFormatter.format(selectedRemainingWidthM)} m libres
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <CapacityMeter
              allocated={selectedAllocatedWidthM}
              capacity={selectedCapacity?.capacityWidthM ?? 0}
            />

            {selectedAllocations.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center">
                <p className="font-medium">Aucun produit sur ce niveau</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajoutez un produit ou préparez une proposition globale.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Produit</th>
                      <th className="px-3 py-2 font-medium">Facing</th>
                      <th className="px-3 py-2 text-center font-medium">Verrou</th>
                      <th className="px-3 py-2"><span className="sr-only">Retirer</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAllocations.map((allocation) => {
                      const product = productById.get(allocation.productId);
                      return (
                        <tr className="border-t" key={allocation.productId}>
                          <th className="px-3 py-3 text-left font-medium">
                            {product?.label ?? "Produit indisponible"}
                          </th>
                          <td className="w-32 px-3 py-2">
                            <div className="flex items-center gap-1">
                              <Input
                                aria-label={`Facing de ${product?.label ?? "ce produit"}`}
                                className="h-9 tabular-nums"
                                disabled={!canWrite || allocation.locked}
                                min={config.minimumFacingWidthM}
                                onChange={(event) =>
                                  updateAllocation(allocation.productId, {
                                    facingWidthM: event.currentTarget.valueAsNumber,
                                  })
                                }
                                step={config.facingIncrementM}
                                type="number"
                                value={allocation.facingWidthM}
                              />
                              <span className="text-xs text-muted-foreground">m</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Button
                              aria-label={
                                allocation.locked
                                  ? `Déverrouiller ${product?.label ?? "le produit"}`
                                  : `Verrouiller ${product?.label ?? "le produit"}`
                              }
                              disabled={!canWrite}
                              onClick={() =>
                                updateAllocation(allocation.productId, {
                                  locked: !allocation.locked,
                                })
                              }
                              size="icon-sm"
                              type="button"
                              variant={allocation.locked ? "secondary" : "ghost"}
                            >
                              {allocation.locked ? (
                                <Lock aria-hidden="true" />
                              ) : (
                                <LockOpen aria-hidden="true" />
                              )}
                            </Button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              aria-label={`Retirer ${product?.label ?? "le produit"}`}
                              disabled={!canWrite || allocation.locked}
                              onClick={() =>
                                removeAllocation(allocation.productId)
                              }
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {canWrite ? (
              <div className="grid gap-2 rounded-xl border bg-muted/25 p-3 sm:grid-cols-[1fr_auto]">
                <Select
                  onValueChange={(value) => setSelectedProductId(value ?? "")}
                  value={productToAddId}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Choisir un produit">
                      {productById.get(productToAddId)?.label ??
                        "Choisir un produit"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!productToAddId || availableProducts.length === 0}
                  onClick={addProduct}
                  type="button"
                >
                  <Plus aria-hidden="true" />
                  Ajouter
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5 xl:sticky xl:top-4">
          <Card>
            <CardHeader>
              <CardTitle>Règles du brouillon</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberSetting
                disabled={!canWrite}
                id="minimum-facing"
                label="Facing minimum (m)"
                min={0.05}
                onChange={(value) =>
                  updateConfig("minimumFacingWidthM", value)
                }
                step={0.05}
                value={config.minimumFacingWidthM}
              />
              <NumberSetting
                disabled={!canWrite}
                id="products-per-shelf"
                label="Produits cibles par niveau"
                min={1}
                onChange={(value) =>
                  updateConfig("targetProductsPerShelf", value)
                }
                step={1}
                value={config.targetProductsPerShelf}
              />
              <NumberSetting
                disabled={!canWrite}
                id="facing-increment"
                label="Pas de réglage (m)"
                min={0.01}
                onChange={(value) => updateConfig("facingIncrementM", value)}
                step={0.01}
                value={config.facingIncrementM}
              />
              <Button
                className="w-full"
                disabled={!canWrite || products.length === 0}
                onClick={calculateSuggestion}
                type="button"
                variant="outline"
              >
                <Calculator aria-hidden="true" />
                Calculer une proposition
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                Calcul déterministe, sans IA. La proposition reste un brouillon
                et conserve les lignes verrouillées.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Catalogue produits</CardTitle>
              <p className="text-sm text-muted-foreground">
                {basis.periodKey ? `Signaux ${basis.periodKey}` : "Sans métriques importées"}
              </p>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Rechercher un produit"
                  className="pl-9"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher…"
                  value={search}
                />
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                {filteredProducts.slice(0, 100).map((product) => (
                  <button
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {product.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        CA {formatMoney(product.revenueCents)} · marge {formatRatio(product.marginRatio)}
                      </span>
                    </span>
                    {product.abcClass ? (
                      <Badge variant="outline">{product.abcClass}</Badge>
                    ) : null}
                  </button>
                ))}
                {filteredProducts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucun produit trouvé.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enregistrer une version d’allocation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Le plan précédent reste conservé. Cette action sera auditée.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="allocation-name">Nom</Label>
            <Input
              disabled={!canWrite}
              id="allocation-name"
              maxLength={160}
              onChange={(event) => setPlanName(event.target.value)}
              value={planName}
            />
          </div>
          <div className="space-y-2 lg:row-span-2">
            <Label htmlFor="allocation-note">Note</Label>
            <Textarea
              disabled={!canWrite}
              id="allocation-note"
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ex. Répartition préparée avec le responsable de rayon"
              value={note}
            />
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            Source : {source === "heuristic" ? "proposition heuristique" : "saisie manager"} · version du plan {layoutVersion}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Enregistrement impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {canWrite ? (
        <div className="sticky bottom-[4.35rem] z-20 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur md:bottom-3">
          <div className="flex items-center justify-between gap-4">
            <p className="hidden text-sm text-muted-foreground sm:block">
              Version suivante : {initialPlan ? initialPlan.version + 1 : 1}
            </p>
            <Button
              className="ml-auto min-w-52"
              disabled={saving || validationIssues.length > 0}
              onClick={savePlan}
              size="lg"
              type="button"
            >
              <Save aria-hidden="true" />
              {saving ? "Enregistrement…" : "Enregistrer le brouillon"}
            </Button>
          </div>
        </div>
      ) : (
        <Alert>
          <AlertTitle>Consultation uniquement</AlertTitle>
          <AlertDescription>
            Votre rôle ne permet pas de modifier les allocations.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function groupCapacities(capacities: ShelfCapacity[]) {
  const fixtureGroups = new Map<
    string,
    {
      fixtureId: string;
      fixtureName: string;
      faces: Map<
        string,
        {
          faceId: string;
          faceLabel: string;
          capacities: ShelfCapacity[];
        }
      >;
    }
  >();

  for (const capacity of capacities) {
    const fixture = fixtureGroups.get(capacity.fixtureId) ?? {
      fixtureId: capacity.fixtureId,
      fixtureName: capacity.fixtureName,
      faces: new Map(),
    };
    const face = fixture.faces.get(capacity.faceId) ?? {
      faceId: capacity.faceId,
      faceLabel: capacity.faceLabel,
      capacities: [],
    };
    face.capacities.push(capacity);
    fixture.faces.set(capacity.faceId, face);
    fixtureGroups.set(capacity.fixtureId, fixture);
  }

  return [...fixtureGroups.values()].map((fixture) => ({
    fixtureId: fixture.fixtureId,
    fixtureName: fixture.fixtureName,
    faces: [...fixture.faces.values()].map((face) => ({
      ...face,
      capacities: face.capacities.sort(
        (first, second) => first.modulePosition - second.modulePosition,
      ),
    })),
  }));
}

function CapacityMeter({
  allocated,
  capacity,
}: {
  allocated: number;
  capacity: number;
}) {
  const ratio = capacity === 0 ? 0 : allocated / capacity;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{meterFormatter.format(allocated)} m alloués</span>
        <span>{meterFormatter.format(capacity)} m disponibles</span>
      </div>
      <div
        aria-label="Utilisation du niveau"
        aria-valuemax={capacity}
        aria-valuemin={0}
        aria-valuenow={allocated}
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width]",
            ratio > 1 && "bg-destructive",
          )}
          style={{ width: `${Math.min(Math.max(ratio * 100, 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function NumberSetting({
  id,
  label,
  value,
  min,
  step,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        disabled={disabled}
        id={id}
        min={min}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        step={step}
        type="number"
        value={value}
      />
    </div>
  );
}
