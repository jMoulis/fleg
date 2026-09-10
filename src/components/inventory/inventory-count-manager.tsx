"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardPenLine,
  LoaderCircle,
  PackageCheck,
  PencilLine,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Store as StoreIcon,
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
type StatusFilter = "all" | "todo" | "done" | "stockout";
type InventoryStep = "reserve" | "shelf" | "review" | "configuration";

const pageSize = 25;

const stepContent = {
  reserve: {
    label: "Réserve",
    description:
      "Comptez les colis présents en réserve et vérifiez le colisage utilisé aujourd’hui.",
    icon: Warehouse,
  },
  shelf: {
    label: "Rayon",
    description:
      "Ajoutez la quantité restante en rayon, dans l’unité propre à chaque article.",
    icon: StoreIcon,
  },
  review: {
    label: "Vérifier",
    description:
      "Contrôlez les lignes complètes, les ruptures explicites et les saisies à terminer.",
    icon: ClipboardCheck,
  },
  configuration: {
    label: "Configurer",
    description:
      "Renseignez la famille, l’unité et le colisage des articles à intégrer au comptage.",
    icon: Settings2,
  },
} satisfies Record<
  InventoryStep,
  { label: string; description: string; icon: typeof Warehouse }
>;

const workflowSteps: InventoryStep[] = [
  "reserve",
  "shelf",
  "review",
  "configuration",
];

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

function reserveTotal(line: EditableLine): number | null {
  const packSize = parseOptionalNumber(line.packSize);
  const reserveCaseCount = parseOptionalNumber(line.reserveCaseCount);
  if (
    packSize === null ||
    packSize === undefined ||
    reserveCaseCount === null ||
    reserveCaseCount === undefined
  ) {
    return null;
  }
  return calculateOnHandQuantity({
    reserveCaseCount,
    packSize,
    shelfQuantity: 0,
  });
}

function isConfigured(line: EditableLine): boolean {
  return Boolean(line.familyCode && line.stockUnit && line.packSize.trim());
}

function hasCountStarted(line: EditableLine): boolean {
  return (
    line.reserveCaseCount.trim() !== "" || line.shelfQuantity.trim() !== ""
  );
}

function isCompleteCount(line: EditableLine): boolean {
  return (
    isConfigured(line) &&
    line.reserveCaseCount.trim() !== "" &&
    line.shelfQuantity.trim() !== ""
  );
}

function isDoneForStep(step: InventoryStep, line: EditableLine): boolean {
  switch (step) {
    case "configuration":
      return isConfigured(line);
    case "reserve":
      return isConfigured(line) && line.reserveCaseCount.trim() !== "";
    case "shelf":
      return isConfigured(line) && line.shelfQuantity.trim() !== "";
    case "review":
      return isCompleteCount(line);
  }
}

function matchesStatusFilter(
  step: InventoryStep,
  statusFilter: StatusFilter,
  line: EditableLine,
): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "stockout") {
    return isCompleteCount(line) && lineTotal(line) === 0;
  }
  const done = isDoneForStep(step, line);
  return statusFilter === "done" ? done : !done;
}

function statusLabels(step: InventoryStep) {
  if (step === "configuration") {
    return { todo: "À configurer", done: "Configurés" };
  }
  if (step === "review") {
    return { todo: "À compléter", done: "Complets" };
  }
  return { todo: "À saisir", done: "Saisis" };
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
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState<InventoryStep>("reserve");
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());
  const [saveKey, setSaveKey] = useState(() => crypto.randomUUID());
  const [commitKey, setCommitKey] = useState(() => crypto.randomUUID());
  const editable = canWrite && count?.status === "draft";

  const summary = useMemo(() => {
    let configured = 0;
    let reserve = 0;
    let shelf = 0;
    let complete = 0;
    let partial = 0;
    let stockouts = 0;
    for (const product of products) {
      const line = lines[product.id] ?? emptyLine();
      if (isConfigured(line)) configured += 1;
      if (isConfigured(line) && line.reserveCaseCount.trim() !== "") reserve += 1;
      if (isConfigured(line) && line.shelfQuantity.trim() !== "") shelf += 1;
      if (isCompleteCount(line)) {
        complete += 1;
        if (lineTotal(line) === 0) stockouts += 1;
      } else if (hasCountStarted(line)) {
        partial += 1;
      }
    }
    return { configured, reserve, shelf, complete, partial, stockouts };
  }, [lines, products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    return products.filter((product) => {
      const line = lines[product.id] ?? emptyLine();
      const matchesStep = step === "configuration" || isConfigured(line);
      const matchesQuery =
        !normalizedQuery ||
        product.label.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
      const matchesFamily =
        familyFilter === "all" ||
        (familyFilter === "unconfigured"
          ? !isConfigured(line)
          : line.familyCode === familyFilter);
      return (
        matchesStep &&
        matchesQuery &&
        matchesFamily &&
        matchesStatusFilter(step, statusFilter, line)
      );
    });
  }, [familyFilter, lines, products, query, statusFilter, step]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function updateLine(productId: string, update: Partial<EditableLine>) {
    setLines((current) => ({
      ...current,
      [productId]: { ...(current[productId] ?? emptyLine()), ...update },
    }));
    setDirty(true);
    setSaveKey(crypto.randomUUID());
    setError(null);
    setNotice(null);
  }

  function selectStep(nextStep: InventoryStep) {
    setStep(nextStep);
    setQuery("");
    setFamilyFilter("all");
    setStatusFilter("all");
    setPage(1);
  }

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function changeFamilyFilter(value: FamilyFilter) {
    setFamilyFilter(value);
    setPage(1);
  }

  function changeStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  function editProduct(product: InventoryWorkspaceProduct, nextStep: InventoryStep) {
    setStep(nextStep);
    setQuery(product.label);
    setFamilyFilter("all");
    setStatusFilter("all");
    setPage(1);
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
      setDirty(false);
      setCreateKey(crypto.randomUUID());
      setStep("reserve");
      setNotice(
        created.version > 1
          ? `Correction ${created.version} ouverte. Le relevé validé reste inchangé jusqu’à la prochaine validation.`
          : "Brouillon ouvert. Commencez par la réserve, puis passez en rayon.",
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
    setDirty(false);
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

  async function saveAndSelectStep(nextStep: InventoryStep) {
    if (!dirty) {
      selectStep(nextStep);
      return;
    }
    if (!editable || pendingAction) return;
    setPendingAction("save");
    setError(null);
    setNotice(null);
    try {
      await persistDraft();
      selectStep(nextStep);
      setNotice("Brouillon enregistré. Vous pouvez poursuivre le comptage.");
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
    if (!editable || pendingAction || summary.partial > 0) return;
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
      setDirty(false);
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

  const nextStep =
    step === "reserve"
      ? "shelf"
      : step === "shelf"
        ? "review"
        : step === "configuration"
          ? "reserve"
          : null;

  return (
    <div className="mt-6 space-y-6">
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Progression du comptage"
      >
        <ProgressCard label="Configurés" value={summary.configured} total={products.length} />
        <ProgressCard label="Réserve saisie" value={summary.reserve} total={summary.configured} />
        <ProgressCard label="Rayon saisi" value={summary.shelf} total={summary.configured} />
        <ProgressCard label="Prêts à valider" value={summary.complete} total={summary.configured} />
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
        <CardContent className={cn("space-y-5", editable && "pb-28 md:pb-4")}>
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

              <WorkflowNavigation
                activeStep={step}
                productCount={products.length}
                summary={summary}
                onSelect={selectStep}
              />

              {editable ? (
                <ActionDock
                  completeCount={summary.complete}
                  dirty={dirty}
                  partialCount={summary.partial}
                  pendingAction={pendingAction}
                  step={step}
                  onAdvance={nextStep ? () => saveAndSelectStep(nextStep) : commitDraft}
                  onSave={saveDraft}
                />
              ) : null}

              {step !== "configuration" && summary.configured === 0 ? (
                <Alert>
                  <Settings2 aria-hidden="true" />
                  <AlertTitle>Aucun article configuré</AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      Configurez les articles F&amp;L avant de commencer le passage en réserve.
                    </span>
                    <Button onClick={() => selectStep("configuration")} size="sm" type="button">
                      Configurer les articles
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              <section aria-labelledby="inventory-step-title" className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {step === "configuration" ? "Préparation" : "Comptage du matin"}
                  </p>
                  <h2 id="inventory-step-title" className="mt-1 text-xl font-semibold">
                    {stepContent[step].label}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {stepContent[step].description}
                  </p>
                </div>

                <div className="grid gap-3 rounded-xl border bg-muted/20 p-3">
                  <div className="relative min-w-0 sm:max-w-xl">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      aria-label="Rechercher un article"
                      className="pl-9"
                      onChange={(event) => changeQuery(event.target.value)}
                      placeholder="Rechercher un article…"
                      value={query}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label="Filtrer par famille">
                    {([
                      ["all", "Toutes familles"],
                      ["3400", "Fruits · 3400"],
                      ["3402", "Légumes · 3402"],
                      ...(step === "configuration"
                        ? ([["unconfigured", "Sans configuration"]] as const)
                        : []),
                    ] as const).map(([value, label]) => (
                      <Button
                        aria-pressed={familyFilter === value}
                        key={value}
                        onClick={() => changeFamilyFilter(value)}
                        size="sm"
                        type="button"
                        variant={familyFilter === value ? "default" : "outline"}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label="Filtrer par avancement">
                    {([
                      ["all", "Tous"],
                      ["todo", statusLabels(step).todo],
                      ["done", statusLabels(step).done],
                      ...(step === "review"
                        ? ([["stockout", "Ruptures"]] as const)
                        : []),
                    ] as const).map(([value, label]) => (
                      <Button
                        aria-pressed={statusFilter === value}
                        key={value}
                        onClick={() => changeStatusFilter(value)}
                        size="sm"
                        type="button"
                        variant={statusFilter === value ? "secondary" : "ghost"}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <ListPosition
                  currentPage={currentPage}
                  pageCount={pageCount}
                  resultCount={filteredProducts.length}
                  onPageChange={setPage}
                />

                <div className="space-y-3" data-inventory-page-size={pageSize}>
                  {pageProducts.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                      <p className="font-medium">Aucun article ne correspond au filtre</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Modifiez la recherche, la famille ou le filtre d’avancement.
                      </p>
                    </div>
                  ) : (
                    pageProducts.map((product) => (
                      <InventoryProductCard
                        editable={editable}
                        key={product.id}
                        line={lines[product.id] ?? emptyLine()}
                        product={product}
                        step={step}
                        onEditProduct={editProduct}
                        onUpdate={updateLine}
                      />
                    ))
                  )}
                </div>

                {pageCount > 1 ? (
                  <ListPosition
                    currentPage={currentPage}
                    pageCount={pageCount}
                    resultCount={filteredProducts.length}
                    onPageChange={setPage}
                  />
                ) : null}
              </section>
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

function ProgressCard({ label, total, value }: { label: string; total: number; value: number }) {
  const ratio = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <Card size="sm">
      <CardContent>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xl font-semibold tabular-nums">
            {value}<span className="text-sm font-normal text-muted-foreground">/{total}</span>
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">{ratio} %</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${ratio}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function WorkflowNavigation({
  activeStep,
  onSelect,
  productCount,
  summary,
}: {
  activeStep: InventoryStep;
  onSelect: (step: InventoryStep) => void;
  productCount: number;
  summary: { configured: number; reserve: number; shelf: number; complete: number };
}) {
  const counts: Record<InventoryStep, string> = {
    reserve: `${summary.reserve}/${summary.configured}`,
    shelf: `${summary.shelf}/${summary.configured}`,
    review: `${summary.complete}/${summary.configured}`,
    configuration: `${summary.configured}/${productCount}`,
  };
  return (
    <nav aria-label="Étapes du comptage">
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {workflowSteps.map((candidate, index) => {
          const content = stepContent[candidate];
          const Icon = content.icon;
          const operationalIndex = candidate === "configuration" ? null : index + 1;
          return (
            <li key={candidate}>
              <button
                aria-current={activeStep === candidate ? "step" : undefined}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  activeStep === candidate
                    ? "border-primary bg-primary/[0.06] text-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/50",
                )}
                onClick={() => onSelect(candidate)}
                type="button"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                  {operationalIndex ?? <Icon aria-hidden="true" className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{content.label}</span>
                  <span className="block text-xs tabular-nums">{counts[candidate]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ActionDock({
  completeCount,
  dirty,
  onAdvance,
  onSave,
  partialCount,
  pendingAction,
  step,
}: {
  completeCount: number;
  dirty: boolean;
  onAdvance: () => void;
  onSave: () => void;
  partialCount: number;
  pendingAction: PendingAction;
  step: InventoryStep;
}) {
  const review = step === "review";
  const primaryLabel = review
    ? "Valider le comptage"
    : step === "reserve"
      ? "Passer au rayon"
      : step === "shelf"
        ? "Vérifier"
        : "Revenir au comptage";
  const blockedCommit = review && (completeCount === 0 || partialCount > 0);
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 flex items-center justify-between gap-2 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur md:sticky md:inset-auto md:top-20 md:bottom-auto">
      <p className="min-w-0 text-xs text-muted-foreground sm:text-sm" aria-live="polite">
        <span className="block font-medium text-foreground">
          {dirty ? "Modifications non enregistrées" : "Brouillon enregistré"}
        </span>
        <span className="block">
          {completeCount} prêt{completeCount === 1 ? "" : "s"}
          {partialCount > 0 ? ` · ${partialCount} à compléter` : " · aucune saisie partielle"}
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button
          aria-label="Enregistrer le brouillon"
          disabled={pendingAction !== null || !dirty}
          onClick={onSave}
          size="sm"
          type="button"
          variant="outline"
        >
          {pendingAction === "save" ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Enregistrer</span>
        </Button>
        <Button
          disabled={pendingAction !== null || blockedCommit}
          onClick={onAdvance}
          size="sm"
          type="button"
        >
          {pendingAction === "commit" || (pendingAction === "save" && !review) ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : review ? (
            <PackageCheck aria-hidden="true" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}

function ListPosition({
  currentPage,
  onPageChange,
  pageCount,
  resultCount,
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  pageCount: number;
  resultCount: number;
}) {
  const first = resultCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, resultCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" role="status">
        {resultCount} résultat{resultCount === 1 ? "" : "s"} · {first}–{last} affichés
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2" aria-label="Pagination des articles">
          <Button
            aria-label="Page précédente"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="text-sm tabular-nums">Page {currentPage}/{pageCount}</span>
          <Button
            aria-label="Page suivante"
            disabled={currentPage === pageCount}
            onClick={() => onPageChange(currentPage + 1)}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function InventoryProductCard({
  editable,
  line,
  onEditProduct,
  onUpdate,
  product,
  step,
}: {
  editable: boolean;
  line: EditableLine;
  onEditProduct: (product: InventoryWorkspaceProduct, step: InventoryStep) => void;
  onUpdate: (productId: string, update: Partial<EditableLine>) => void;
  product: InventoryWorkspaceProduct;
  step: InventoryStep;
}) {
  const total = lineTotal(line);
  const reserveQuantity = reserveTotal(line);
  const shelfQuantity = parseOptionalNumber(line.shelfQuantity);
  const partial = hasCountStarted(line) && !isCompleteCount(line);
  return (
    <article
      className="rounded-xl border bg-card p-4 shadow-sm"
      data-inventory-product={product.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium leading-5">{product.label}</h3>
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
                variant={product.latestAvailability.isStockout ? "destructive" : "outline"}
              >
                Dernier stock : {formatQuantity(
                  product.latestAvailability.snapshot.onHandQuantity,
                  product.latestAvailability.snapshot.stockUnit,
                )} · {product.latestAvailability.observationAgeHours} h
              </Badge>
            ) : null}
          </div>
        </div>
        {step === "review" ? (
          <Badge
            variant={
              isCompleteCount(line)
                ? total === 0
                  ? "destructive"
                  : "default"
                : partial
                  ? "secondary"
                  : "outline"
            }
          >
            {isCompleteCount(line)
              ? total === 0
                ? "Rupture confirmée"
                : "Complet"
              : partial
                ? "À compléter"
                : "Non compté"}
          </Badge>
        ) : null}
      </div>

      {step === "configuration" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`family-${product.id}`}>Famille</Label>
            <select
              aria-label={`Famille de ${product.label}`}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!editable}
              id={`family-${product.id}`}
              onChange={(event) =>
                onUpdate(product.id, {
                  familyCode: event.target.value as "" | InventoryFamilyCode,
                })
              }
              value={line.familyCode}
            >
              <option value="">Non renseignée</option>
              {Object.entries(inventoryFamilyLabels).map(([value, label]) => (
                <option key={value} value={value}>{value} · {label}</option>
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
                onUpdate(product.id, { stockUnit: event.target.value as "" | StockUnit })
              }
              value={line.stockUnit}
            >
              <option value="">Non renseignée</option>
              {Object.entries(stockUnitLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <PackSizeField editable={editable} line={line} onUpdate={onUpdate} product={product} />
        </div>
      ) : null}

      {step === "reserve" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <PackSizeField editable={editable} line={line} onUpdate={onUpdate} product={product} />
          <div className="space-y-1.5">
            <Label htmlFor={`reserve-${product.id}`}>Réserve (colis)</Label>
            <Input
              aria-label={`Colis en réserve pour ${product.label}`}
              disabled={!editable}
              id={`reserve-${product.id}`}
              inputMode="numeric"
              min="0"
              onChange={(event) => onUpdate(product.id, { reserveCaseCount: event.target.value })}
              placeholder="Vide = non compté"
              step="1"
              type="number"
              value={line.reserveCaseCount}
            />
          </div>
          <Evidence
            label="Quantité réserve"
            value={
              reserveQuantity === null || !line.stockUnit
                ? "—"
                : formatQuantity(reserveQuantity, line.stockUnit)
            }
          />
        </div>
      ) : null}

      {step === "shelf" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
          <Evidence
            label="Déjà en réserve"
            value={
              reserveQuantity === null || !line.stockUnit
                ? "Non compté"
                : formatQuantity(reserveQuantity, line.stockUnit)
            }
          />
          <div className="space-y-1.5">
            <Label htmlFor={`shelf-${product.id}`}>
              Rayon ({line.stockUnit === "kg" ? "kg" : "pièces"})
            </Label>
            <Input
              aria-label={`Quantité en rayon pour ${product.label}`}
              disabled={!editable}
              id={`shelf-${product.id}`}
              inputMode="decimal"
              onChange={(event) => onUpdate(product.id, { shelfQuantity: event.target.value })}
              placeholder="Vide = non compté"
              step={line.stockUnit === "piece" ? "1" : "0.001"}
              type="number"
              value={line.shelfQuantity}
            />
          </div>
          <Evidence
            label="Stock total"
            value={total === null || !line.stockUnit ? "—" : formatQuantity(total, line.stockUnit)}
            destructive={total !== null && total < 0}
          />
        </div>
      ) : null}

      {step === "review" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Evidence
              label="Réserve"
              value={
                line.reserveCaseCount.trim() && reserveQuantity !== null && line.stockUnit
                  ? `${line.reserveCaseCount} colis · ${formatQuantity(reserveQuantity, line.stockUnit)}`
                  : "Non compté"
              }
            />
            <Evidence
              label="Rayon"
              value={
                shelfQuantity !== null && shelfQuantity !== undefined && line.stockUnit
                  ? formatQuantity(shelfQuantity, line.stockUnit)
                  : "Non compté"
              }
            />
            <Evidence
              label="Stock total"
              value={total === null || !line.stockUnit ? "—" : formatQuantity(total, line.stockUnit)}
              destructive={total !== null && total < 0}
            />
          </div>
          {editable ? (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button
                onClick={() => onEditProduct(product, "reserve")}
                size="sm"
                type="button"
                variant="outline"
              >
                <PencilLine aria-hidden="true" />
                Modifier la réserve
              </Button>
              <Button
                onClick={() => onEditProduct(product, "shelf")}
                size="sm"
                type="button"
                variant="outline"
              >
                <PencilLine aria-hidden="true" />
                Modifier le rayon
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {total !== null && total < 0 ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          Stock négatif conservé comme anomalie : vérifiez la saisie avant validation.
        </p>
      ) : null}
    </article>
  );
}

function PackSizeField({
  editable,
  line,
  onUpdate,
  product,
}: {
  editable: boolean;
  line: EditableLine;
  onUpdate: (productId: string, update: Partial<EditableLine>) => void;
  product: InventoryWorkspaceProduct;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`pack-${product.id}`}>Colisage du jour (CDT)</Label>
      <Input
        aria-label={`Colisage de ${product.label}`}
        disabled={!editable}
        id={`pack-${product.id}`}
        inputMode="decimal"
        min="0.001"
        onChange={(event) => onUpdate(product.id, { packSize: event.target.value })}
        placeholder={line.stockUnit === "kg" ? "Ex. 18,5" : "Ex. 9"}
        step={line.stockUnit === "piece" ? "1" : "0.001"}
        type="number"
        value={line.packSize}
      />
    </div>
  );
}

function Evidence({
  destructive = false,
  label,
  value,
}: {
  destructive?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-32 rounded-lg bg-muted/45 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-medium tabular-nums", destructive && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}
