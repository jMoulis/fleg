"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPenLine,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { apiErrorSchema } from "@/domain/api/schemas";
import { calculateOnHandQuantity } from "@/domain/inventory/calculations";
import {
  inventoryCommitResponseSchema,
  inventoryCountResponseSchema,
  inventoryCountUpdateInputSchema,
  inventoryFamilyLabels,
  stockUnitLabels,
  type InventoryCount,
  type InventoryCountLine,
  type InventoryFamilyCode,
  type InventoryWorkspace,
  type InventoryWorkspaceProduct,
  type StockUnit,
} from "@/domain/inventory/schemas";
import { cn } from "@/lib/utils";

interface EditableLine {
  familyCode: "" | InventoryFamilyCode;
  stockUnit: "" | StockUnit;
  packSize: string;
  reserveCaseCount: string;
  shelfQuantity: string;
}

type EditableLines = Record<string, EditableLine>;
type PendingAction = "create" | "save" | "commit" | null;
type FamilyFilter = "all" | "3400" | "3402" | "unconfigured";

function emptyLine(): EditableLine {
  return {
    familyCode: "",
    stockUnit: "",
    packSize: "",
    reserveCaseCount: "",
    shelfQuantity: "",
  };
}

function lineToEditable(line: InventoryCountLine): EditableLine {
  return {
    familyCode: line.familyCode ?? "",
    stockUnit: line.stockUnit ?? "",
    packSize: line.packSize === null ? "" : String(line.packSize),
    reserveCaseCount:
      line.reserveCaseCount === null ? "" : String(line.reserveCaseCount),
    shelfQuantity:
      line.shelfQuantity === null ? "" : String(line.shelfQuantity),
  };
}

function buildEditableLines(
  products: InventoryWorkspaceProduct[],
  count: InventoryCount | null,
): EditableLines {
  const countLineByProduct = new Map(
    count?.lines.map((line) => [line.productId, line]) ?? [],
  );
  return Object.fromEntries(
    products.map((product) => {
      const countLine = countLineByProduct.get(product.id);
      if (countLine) return [product.id, lineToEditable(countLine)];
      if (product.profile) {
        return [
          product.id,
          {
            familyCode: product.profile.familyCode,
            stockUnit: product.profile.stockUnit,
            packSize: String(product.profile.lastPackSize),
            reserveCaseCount: "",
            shelfQuantity: "",
          } satisfies EditableLine,
        ];
      }
      return [product.id, emptyLine()];
    }),
  );
}

function parseOptionalNumber(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function serializeLines(
  products: InventoryWorkspaceProduct[],
  editable: EditableLines,
): InventoryCountLine[] {
  return products.flatMap((product) => {
    const line = editable[product.id] ?? emptyLine();
    const packSize = parseOptionalNumber(line.packSize);
    const reserveCaseCount = parseOptionalNumber(line.reserveCaseCount);
    const shelfQuantity = parseOptionalNumber(line.shelfQuantity);
    if (
      packSize === undefined ||
      reserveCaseCount === undefined ||
      shelfQuantity === undefined
    ) {
      throw new Error(`Une valeur numérique est invalide pour ${product.label}.`);
    }
    const hasValue =
      line.familyCode !== "" ||
      line.stockUnit !== "" ||
      packSize !== null ||
      reserveCaseCount !== null ||
      shelfQuantity !== null;
    if (!hasValue) return [];
    return [
      {
        productId: product.id,
        familyCode: line.familyCode || null,
        stockUnit: line.stockUnit || null,
        packSize,
        reserveCaseCount,
        shelfQuantity,
      },
    ];
  });
}

function fingerprint(lines: EditableLines): string {
  return JSON.stringify(lines);
}

function responseMessage(payload: unknown, fallback: string): string {
  const parsed = apiErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.message : fallback;
}

function formatQuantity(value: number, unit: StockUnit): string {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 3,
  }).format(value)} ${unit === "kg" ? "kg" : value > 1 ? "pièces" : "pièce"}`;
}

function lineTotal(line: EditableLine): number | null {
  const packSize = parseOptionalNumber(line.packSize);
  const reserveCaseCount = parseOptionalNumber(line.reserveCaseCount);
  const shelfQuantity = parseOptionalNumber(line.shelfQuantity);
  if (
    packSize === null ||
    packSize === undefined ||
    reserveCaseCount === null ||
    reserveCaseCount === undefined ||
    shelfQuantity === null ||
    shelfQuantity === undefined
  ) {
    return null;
  }
  return calculateOnHandQuantity({
    reserveCaseCount,
    packSize,
    shelfQuantity,
  });
}

function isConfigured(line: EditableLine): boolean {
  return Boolean(line.familyCode && line.stockUnit && line.packSize.trim());
}

function isCompleteCount(line: EditableLine): boolean {
  return (
    isConfigured(line) &&
    line.reserveCaseCount.trim() !== "" &&
    line.shelfQuantity.trim() !== ""
  );
}

export function InventoryCountManager({
  canWrite,
  initialWorkspace,
  storeId,
}: {
  canWrite: boolean;
  initialWorkspace: InventoryWorkspace;
  storeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [products, setProducts] = useState(initialWorkspace.products);
  const [count, setCount] = useState(initialWorkspace.count);
  const initialLines = useMemo(
    () => buildEditableLines(initialWorkspace.products, initialWorkspace.count),
    [initialWorkspace],
  );
  const [lines, setLines] = useState<EditableLines>(initialLines);
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    fingerprint(initialLines),
  );
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("all");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());
  const [saveKey, setSaveKey] = useState(() => crypto.randomUUID());
  const [commitKey, setCommitKey] = useState(() => crypto.randomUUID());
  const dirty = fingerprint(lines) !== savedFingerprint;
  const editable = canWrite && count?.status === "draft";

  const summary = useMemo(() => {
    let configured = 0;
    let complete = 0;
    let stockouts = 0;
    for (const product of products) {
      const line = lines[product.id] ?? emptyLine();
      if (isConfigured(line)) configured += 1;
      if (isCompleteCount(line)) {
        complete += 1;
        if (lineTotal(line) === 0) stockouts += 1;
      }
    }
    return { configured, complete, stockouts };
  }, [lines, products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    return products.filter((product) => {
      const line = lines[product.id] ?? emptyLine();
      const matchesQuery =
        !normalizedQuery ||
        product.label.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
      const matchesFamily =
        familyFilter === "all" ||
        (familyFilter === "unconfigured"
          ? !isConfigured(line)
          : line.familyCode === familyFilter);
      return matchesQuery && matchesFamily;
    });
  }, [familyFilter, lines, products, query]);

  function updateLine(productId: string, update: Partial<EditableLine>) {
    setLines((current) => ({
      ...current,
      [productId]: { ...(current[productId] ?? emptyLine()), ...update },
    }));
    setSaveKey(crypto.randomUUID());
    setError(null);
    setNotice(null);
  }

  async function startDraft() {
    if (!canWrite || pendingAction) return;
    setPendingAction("create");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/stores/${storeId}/inventory/counts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessDate: initialWorkspace.businessDate,
          idempotencyKey: createKey,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          responseMessage(payload, "Le brouillon n’a pas pu être créé."),
        );
      }
      const created = inventoryCountResponseSchema.parse(payload).count;
      const nextLines = buildEditableLines(products, created);
      setCount(created);
      setLines(nextLines);
      setSavedFingerprint(fingerprint(nextLines));
      setCreateKey(crypto.randomUUID());
      setNotice(
        created.version > 1
          ? `Correction ${created.version} ouverte. Le relevé validé reste inchangé jusqu’à la prochaine validation.`
          : "Brouillon ouvert. Vous pouvez commencer par la réserve puis compléter en rayon.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le brouillon n’a pas pu être créé.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function persistDraft(): Promise<InventoryCount> {
    if (!count || count.status !== "draft") {
      throw new Error("Aucun brouillon modifiable n’est ouvert.");
    }
    const parsed = inventoryCountUpdateInputSchema.safeParse({
      idempotencyKey: saveKey,
      basedOnRevision: count.revision,
      lines: serializeLines(products, lines),
    });
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Le brouillon contient une erreur.",
      );
    }
    const response = await fetch(
      `/api/stores/${storeId}/inventory/counts/${count.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      },
    );
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        responseMessage(payload, "Le brouillon n’a pas pu être enregistré."),
      );
    }
    const saved = inventoryCountResponseSchema.parse(payload).count;
    setCount(saved);
    setSavedFingerprint(fingerprint(lines));
    setSaveKey(crypto.randomUUID());
    return saved;
  }

  async function saveDraft() {
    if (!editable || pendingAction) return;
    setPendingAction("save");
    setError(null);
    setNotice(null);
    try {
      const saved = await persistDraft();
      setNotice(`Brouillon enregistré · révision ${saved.revision}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le brouillon n’a pas pu être enregistré.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function commitDraft() {
    if (!editable || pendingAction) return;
    setPendingAction("commit");
    setError(null);
    setNotice(null);
    try {
      const saved = dirty ? await persistDraft() : count;
      if (!saved) throw new Error("Aucun brouillon à valider.");
      const response = await fetch(
        `/api/stores/${storeId}/inventory/counts/${saved.id}/commit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: commitKey,
            basedOnRevision: saved.revision,
          }),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          responseMessage(payload, "Le comptage n’a pas pu être validé."),
        );
      }
      const result = inventoryCommitResponseSchema.parse(payload).result;
      const snapshotByProduct = new Map(
        result.snapshots.map((snapshot) => [snapshot.productId, snapshot]),
      );
      setProducts((current) =>
        current.map((product) => {
          const snapshot = snapshotByProduct.get(product.id);
          if (!snapshot) return product;
          return {
            ...product,
            daySnapshot: snapshot,
            latestAvailability: {
              snapshot,
              observationAgeHours: 0,
              isStockout: snapshot.onHandQuantity === 0,
            },
          };
        }),
      );
      setCount(result.count);
      setSavedFingerprint(fingerprint(lines));
      setCommitKey(crypto.randomUUID());
      setNotice(
        `Comptage validé : ${result.changedSnapshotCount} observation${result.changedSnapshotCount === 1 ? "" : "s"} versionnée${result.changedSnapshotCount === 1 ? "" : "s"}` +
          (result.unchangedSnapshotCount > 0
            ? `, ${result.unchangedSnapshotCount} inchangée${result.unchangedSnapshotCount === 1 ? "" : "s"}.`
            : "."),
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le comptage n’a pas pu être validé.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  function changeBusinessDate(value: string) {
    if (!value || value === initialWorkspace.businessDate) return;
    if (dirty) {
      setError("Enregistrez le brouillon avant de changer de date.");
      return;
    }
    router.push(`${pathname}?businessDate=${encodeURIComponent(value)}`);
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Résumé du comptage">
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold tabular-nums">{summary.configured}</p>
            <p className="text-sm text-muted-foreground">articles configurés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold tabular-nums">{summary.complete}</p>
            <p className="text-sm text-muted-foreground">articles comptés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-2xl font-semibold tabular-nums">{summary.stockouts}</p>
            <p className="text-sm text-muted-foreground">ruptures explicites</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardPenLine aria-hidden="true" className="size-5 text-primary" />
                Feuille de comptage
              </CardTitle>
              <CardDescription className="mt-1">
                Vide signifie non compté. Saisissez 0 pour confirmer une rupture.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="inventory-business-date">Date métier</Label>
                <Input
                  className="w-40"
                  id="inventory-business-date"
                  onChange={(event) => changeBusinessDate(event.target.value)}
                  type="date"
                  value={initialWorkspace.businessDate}
                />
              </div>
              {count ? (
                <Badge variant={count.status === "committed" ? "default" : "secondary"}>
                  {count.status === "committed" ? "Validé" : "Brouillon"} · v{count.version}
                </Badge>
              ) : (
                <Badge variant="outline">Aucun relevé</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!canWrite ? (
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>Consultation uniquement</AlertTitle>
              <AlertDescription>
                Votre rôle permet de consulter les observations, mais pas de saisir un comptage.
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Opération impossible</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {notice ? (
            <Alert role="status">
              <CheckCircle2 aria-hidden="true" className="text-primary" />
              <AlertTitle>Comptage à jour</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}

          {products.length === 0 ? (
            <Alert>
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Aucun article disponible</AlertTitle>
              <AlertDescription>
                Importez d’abord les ventes Mercalys pour créer le référentiel article.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="relative min-w-0 flex-1 sm:max-w-md">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    aria-label="Rechercher un article"
                    className="pl-9"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Rechercher un article…"
                    value={query}
                  />
                </div>
                <div className="flex flex-wrap gap-2" aria-label="Filtrer les articles">
                  {([
                    ["all", "Tous"],
                    ["3400", "Fruits · 3400"],
                    ["3402", "Légumes · 3402"],
                    ["unconfigured", "À configurer"],
                  ] as const).map(([value, label]) => (
                    <Button
                      aria-pressed={familyFilter === value}
                      key={value}
                      onClick={() => setFamilyFilter(value)}
                      size="sm"
                      type="button"
                      variant={familyFilter === value ? "default" : "outline"}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {!count || count.status === "committed" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
                  <div>
                    <p className="font-medium">
                      {count ? "Le relevé est verrouillé" : "Prêt pour le comptage"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {count
                        ? "Une correction créera une nouvelle version sans effacer les observations validées."
                        : "Ouvrez un brouillon persistant avant de saisir les quantités."}
                    </p>
                  </div>
                  {canWrite ? (
                    <Button disabled={pendingAction !== null} onClick={startDraft} type="button">
                      {pendingAction === "create" ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : count ? (
                        <RotateCcw aria-hidden="true" />
                      ) : (
                        <ClipboardPenLine aria-hidden="true" />
                      )}
                      {count ? "Créer une correction" : "Démarrer le comptage"}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3">
                {filteredProducts.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                    <p className="font-medium">Aucun article ne correspond au filtre</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Modifiez la recherche ou affichez toutes les familles.
                    </p>
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const line = lines[product.id] ?? emptyLine();
                    const total = lineTotal(line);
                    const partial =
                      (line.reserveCaseCount.trim() !== "" ||
                        line.shelfQuantity.trim() !== "") &&
                      !isCompleteCount(line);
                    return (
                      <article
                        className="rounded-xl border bg-card p-4 shadow-sm"
                        key={product.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="font-medium leading-5">{product.label}</h2>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {isConfigured(line) ? (
                                <Badge variant="secondary">
                                  {line.familyCode} · {line.stockUnit === "kg" ? "kg" : "pièce"}
                                </Badge>
                              ) : (
                                <Badge variant="outline">À configurer</Badge>
                              )}
                              {product.latestAvailability ? (
                                <Badge
                                  variant={
                                    product.latestAvailability.isStockout
                                      ? "destructive"
                                      : "outline"
                                  }
                                >
                                  Dernier stock : {formatQuantity(
                                    product.latestAvailability.snapshot.onHandQuantity,
                                    product.latestAvailability.snapshot.stockUnit,
                                  )} · {product.latestAvailability.observationAgeHours} h
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Stock calculé</p>
                            <p
                              className={cn(
                                "mt-1 text-lg font-semibold tabular-nums",
                                total !== null && total < 0 && "text-destructive",
                              )}
                            >
                              {total === null || !line.stockUnit
                                ? "—"
                                : formatQuantity(total, line.stockUnit)}
                            </p>
                            {partial ? (
                              <p className="text-xs text-amber-700">À compléter</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <div className="space-y-1.5">
                            <Label htmlFor={`family-${product.id}`}>Famille</Label>
                            <select
                              aria-label={`Famille de ${product.label}`}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!editable}
                              id={`family-${product.id}`}
                              onChange={(event) =>
                                updateLine(product.id, {
                                  familyCode: event.target.value as "" | InventoryFamilyCode,
                                })
                              }
                              value={line.familyCode}
                            >
                              <option value="">Non renseignée</option>
                              {Object.entries(inventoryFamilyLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {value} · {label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`unit-${product.id}`}>Unité de stock</Label>
                            <select
                              aria-label={`Unité de ${product.label}`}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!editable}
                              id={`unit-${product.id}`}
                              onChange={(event) =>
                                updateLine(product.id, {
                                  stockUnit: event.target.value as "" | StockUnit,
                                })
                              }
                              value={line.stockUnit}
                            >
                              <option value="">Non renseignée</option>
                              {Object.entries(stockUnitLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`pack-${product.id}`}>Colisage (CDT)</Label>
                            <Input
                              aria-label={`Colisage de ${product.label}`}
                              disabled={!editable}
                              id={`pack-${product.id}`}
                              inputMode="decimal"
                              min="0.001"
                              onChange={(event) =>
                                updateLine(product.id, { packSize: event.target.value })
                              }
                              placeholder={line.stockUnit === "kg" ? "Ex. 18,5" : "Ex. 9"}
                              step={line.stockUnit === "piece" ? "1" : "0.001"}
                              type="number"
                              value={line.packSize}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`reserve-${product.id}`}>Réserve (colis)</Label>
                            <Input
                              aria-label={`Colis en réserve pour ${product.label}`}
                              disabled={!editable}
                              id={`reserve-${product.id}`}
                              inputMode="numeric"
                              min="0"
                              onChange={(event) =>
                                updateLine(product.id, {
                                  reserveCaseCount: event.target.value,
                                })
                              }
                              placeholder="Vide = inconnu"
                              step="1"
                              type="number"
                              value={line.reserveCaseCount}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`shelf-${product.id}`}>
                              Rayon ({line.stockUnit === "kg" ? "kg" : "pièces"})
                            </Label>
                            <Input
                              aria-label={`Quantité en rayon pour ${product.label}`}
                              disabled={!editable}
                              id={`shelf-${product.id}`}
                              inputMode="decimal"
                              onChange={(event) =>
                                updateLine(product.id, { shelfQuantity: event.target.value })
                              }
                              placeholder="Vide = inconnu"
                              step={line.stockUnit === "piece" ? "1" : "0.001"}
                              type="number"
                              value={line.shelfQuantity}
                            />
                          </div>
                        </div>

                        {total !== null && total < 0 ? (
                          <p className="mt-3 text-sm text-destructive" role="alert">
                            Stock négatif conservé comme anomalie : vérifiez la saisie avant validation.
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>

              {editable ? (
                <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur md:bottom-4">
                  <p className="text-sm text-muted-foreground">
                    {dirty ? "Modifications non enregistrées" : "Brouillon enregistré"} · {summary.complete} article{summary.complete === 1 ? "" : "s"} compté{summary.complete === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pendingAction !== null || !dirty}
                      onClick={saveDraft}
                      type="button"
                      variant="outline"
                    >
                      {pendingAction === "save" ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : (
                        <Save aria-hidden="true" />
                      )}
                      Enregistrer le brouillon
                    </Button>
                    <Button
                      disabled={pendingAction !== null || summary.complete === 0}
                      onClick={commitDraft}
                      type="button"
                    >
                      {pendingAction === "commit" ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : (
                        <PackageCheck aria-hidden="true" />
                      )}
                      Valider le comptage
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Warehouse aria-hidden="true" />
        <AlertTitle>Source manuelle et datée</AlertTitle>
        <AlertDescription>
          Le stock à commander et le stock réservé restent inconnus pour cette première version. Ils ne sont ni inventés ni déduits des ventes.
        </AlertDescription>
      </Alert>
    </div>
  );
}
