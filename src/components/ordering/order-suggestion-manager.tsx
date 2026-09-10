"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LoaderCircle,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  orderSuggestionApprovalInputSchema,
  orderSuggestionResponseSchema,
  type OrderSuggestionDraft,
  type OrderSuggestionLine,
  type OrderSuggestionWorkspace,
} from "@/domain/ordering/schemas";
import { cn } from "@/lib/utils";

interface OrderSuggestionManagerProps {
  canApprove: boolean;
  initialWorkspace: OrderSuggestionWorkspace;
  organizationSlug: string;
  storeId: string;
}

type OrderLineStatusFilter =
  | "calculated"
  | "ready"
  | "no_order"
  | "unavailable"
  | "modified"
  | "all";
type OrderLineFamilyFilter = "all" | "3400" | "3402" | "unknown";

const orderLinePageSize = 25;

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function quantity(value: number | null, unit: string | null = null) {
  if (value === null) return "Indisponible";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value)}${unit ? ` ${unit === "piece" ? "pièce(s)" : "kg"}` : ""}`;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new Error(
      parsed.success ? parsed.data.message : "La requête n’a pas abouti",
    );
  }
  return payload;
}

function initialCaseCounts(suggestion: OrderSuggestionDraft | null) {
  return Object.fromEntries(
    (suggestion?.lines ?? [])
      .filter((line) => line.suggestedCaseCount !== null)
      .map((line) => [line.productId, String(line.suggestedCaseCount)]),
  );
}

function approvedCaseCount(
  suggestion: OrderSuggestionDraft,
  line: OrderSuggestionLine,
  caseCounts: Record<string, string>,
): number | null {
  if (suggestion.status === "approved") {
    return (
      suggestion.decision?.lines.find(
        ({ productId }) => productId === line.productId,
      )?.approvedCaseCount ?? null
    );
  }
  const rawValue = caseCounts[line.productId];
  if (rawValue === undefined || rawValue.trim() === "") return null;
  const value = Number(rawValue);
  return Number.isInteger(value) && value >= 0 && value <= 100_000
    ? value
    : null;
}

function isModifiedLine(
  suggestion: OrderSuggestionDraft,
  line: OrderSuggestionLine,
  caseCounts: Record<string, string>,
): boolean {
  if (line.suggestedCaseCount === null) return false;
  return approvedCaseCount(suggestion, line, caseCounts) !== line.suggestedCaseCount;
}

export function OrderSuggestionManager({
  canApprove,
  initialWorkspace,
  organizationSlug,
  storeId,
}: OrderSuggestionManagerProps) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState(
    initialWorkspace.latestSuggestion,
  );
  const [caseCounts, setCaseCounts] = useState(() =>
    initialCaseCounts(initialWorkspace.latestSuggestion),
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"create" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<OrderLineStatusFilter>("calculated");
  const [familyFilter, setFamilyFilter] =
    useState<OrderLineFamilyFilter>("all");
  const [page, setPage] = useState(1);
  const listStartRef = useRef<HTMLDivElement>(null);
  const cycle = initialWorkspace.cycle;

  function replaceSuggestion(next: OrderSuggestionDraft) {
    setSuggestion(next);
    setCaseCounts(initialCaseCounts(next));
    setReasons({});
    setQuery("");
    setStatusFilter("calculated");
    setFamilyFilter("all");
    setPage(1);
  }

  function changeOrderDate(orderDate: string) {
    router.push(
      `/${organizationSlug}/stores/${storeId}/orders?orderDate=${encodeURIComponent(orderDate)}`,
    );
  }

  async function createSuggestion() {
    setPending("create");
    setError(null);
    setNotice(null);
    try {
      const result = orderSuggestionResponseSchema.parse(
        await requestJson(`/api/stores/${storeId}/order-suggestions`, {
          method: "POST",
          body: JSON.stringify({
            orderDate: cycle.orderDate,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      );
      replaceSuggestion(result.suggestion);
      setNotice(
        `Proposition préparée pour la livraison du ${dateLabel(result.suggestion.deliveryDate)}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La proposition n’a pas pu être préparée",
      );
    } finally {
      setPending(null);
    }
  }

  async function approveSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!suggestion) return;
    setPending("approve");
    setError(null);
    setNotice(null);
    const orderableLines = suggestion.lines.filter(
      (line) => line.suggestedCaseCount !== null,
    );
    const parsed = orderSuggestionApprovalInputSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      basedOnGeneratedAt: suggestion.generatedAt,
      note: note.trim() || null,
      lines: orderableLines.map((line) => ({
        productId: line.productId,
        approvedCaseCount: Number(caseCounts[line.productId]),
        overrideReason: reasons[line.productId]?.trim() || null,
      })),
    });
    if (!parsed.success) {
      setPending(null);
      setError(parsed.error.issues[0]?.message ?? "Décision invalide");
      return;
    }

    try {
      const result = orderSuggestionResponseSchema.parse(
        await requestJson(
          `/api/stores/${storeId}/order-suggestions/${suggestion.id}/approve`,
          { method: "POST", body: JSON.stringify(parsed.data) },
        ),
      );
      replaceSuggestion(result.suggestion);
      setNotice(
        "Proposition validée et auditée. Aucune commande fournisseur n’a été transmise.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La validation n’a pas pu être enregistrée",
      );
    } finally {
      setPending(null);
    }
  }

  const orderableLines =
    suggestion?.lines.filter((line) => line.suggestedCaseCount !== null) ?? [];
  const modifiedLineCount =
    suggestion?.lines.filter((line) =>
      isModifiedLine(suggestion, line, caseCounts),
    ).length ?? 0;
  const invalidCaseCount = suggestion
    ? orderableLines.filter(
        (line) => approvedCaseCount(suggestion, line, caseCounts) === null,
      ).length
    : 0;
  const missingOverrideReasonCount =
    suggestion?.status === "draft"
      ? orderableLines.filter(
          (line) => {
            const approvedCount = approvedCaseCount(
              suggestion,
              line,
              caseCounts,
            );
            return (
              approvedCount !== null &&
              approvedCount !== line.suggestedCaseCount &&
              (reasons[line.productId]?.trim().length ?? 0) < 3
            );
          },
        ).length
      : 0;
  const filteredLines = useMemo(() => {
    if (!suggestion) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    return suggestion.lines.filter((line) => {
      const matchesQuery =
        !normalizedQuery ||
        line.productLabel.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
      const matchesFamily =
        familyFilter === "all" ||
        (familyFilter === "unknown"
          ? line.familyCode === null
          : line.familyCode === familyFilter);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "calculated"
          ? line.suggestedCaseCount !== null
          : statusFilter === "modified"
            ? isModifiedLine(suggestion, line, caseCounts)
            : line.status === statusFilter);
      return matchesQuery && matchesFamily && matchesStatus;
    });
  }, [caseCounts, familyFilter, query, statusFilter, suggestion]);
  const pageCount = Math.max(
    1,
    Math.ceil(filteredLines.length / orderLinePageSize),
  );
  const currentPage = Math.min(page, pageCount);
  const pageLines = filteredLines.slice(
    (currentPage - 1) * orderLinePageSize,
    currentPage * orderLinePageSize,
  );

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function changeStatusFilter(value: OrderLineStatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  function changeFamilyFilter(value: OrderLineFamilyFilter) {
    setFamilyFilter(value);
    setPage(1);
  }

  function changePage(value: number) {
    listStartRef.current?.scrollIntoView({ block: "start" });
    setPage(value);
  }

  return (
    <div className="mt-8 space-y-6">
      <MorningWorkflow />

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Commande impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert role="status" className="border-primary/20 bg-primary/[0.04]">
          <CheckCircle2 aria-hidden="true" className="text-primary" />
          <AlertTitle>Étape enregistrée</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock aria-hidden="true" className="size-5 text-primary" />
            Cycle de livraison
          </CardTitle>
          <CardDescription>
            Calendrier A pour B · aucune livraison le dimanche
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[16rem_1fr_auto] lg:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="order-date">Date de commande</Label>
            <Input
              id="order-date"
              onChange={(event) => changeOrderDate(event.target.value)}
              type="date"
              value={cycle.orderDate}
            />
          </div>
          <div>
            <p className="text-sm font-medium">
              {cycle.deliveryDate
                ? `Livraison ${dateLabel(cycle.deliveryDate)}`
                : "Aucune commande le dimanche"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {cycle.explanation}
            </p>
            {cycle.coverageDates.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Ventes couvertes : {cycle.coverageDates.map(dateLabel).join(" + ")}
              </p>
            ) : null}
          </div>
          <Button
            disabled={
              !canApprove || !cycle.orderingAllowed || pending !== null
            }
            onClick={createSuggestion}
            type="button"
          >
            {pending === "create" ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : suggestion ? (
              <RefreshCw aria-hidden="true" />
            ) : (
              <Calculator aria-hidden="true" />
            )}
            {suggestion ? "Recalculer" : "Préparer la proposition"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Warehouse aria-hidden="true" className="size-5 text-primary" />
            Stock du matin
          </CardTitle>
          <CardDescription>
            {initialWorkspace.exactStockSnapshotCount} article(s) compté(s) et
            validé(s) aujourd’hui sur {initialWorkspace.productCount}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/${organizationSlug}/stores/${storeId}/inventory?businessDate=${cycle.orderDate}`}
          >
            <Warehouse aria-hidden="true" />
            Ouvrir le comptage
          </Link>
        </CardContent>
      </Card>

      {!suggestion ? (
        <Alert>
          <PackageOpen aria-hidden="true" />
          <AlertTitle>Aucune proposition pour cette date</AlertTitle>
          <AlertDescription>
            Validez d’abord le stock du matin, puis préparez la proposition. Les
            données manquantes resteront signalées comme indisponibles.
          </AlertDescription>
        </Alert>
      ) : (
        <form
          className={cn(
            "space-y-6",
            suggestion.status === "draft" &&
              orderableLines.length > 0 &&
              "pb-28 md:pb-0",
          )}
          onSubmit={approveSuggestion}
        >
          <SuggestionSummary suggestion={suggestion} />

          {suggestion.status === "draft" && orderableLines.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck
                      aria-hidden="true"
                      className="size-5 text-primary"
                    />
                    Validation manager
                  </CardTitle>
                  <CardDescription>
                    La validation fige votre décision, mais ne transmet rien au
                    fournisseur.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-1.5">
                    <Label htmlFor="approval-note">
                      Note générale facultative
                    </Label>
                    <Textarea
                      disabled={!canApprove || pending !== null}
                      id="approval-note"
                      maxLength={1_000}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Contexte utile pour relire la décision…"
                      value={note}
                    />
                  </div>
                </CardContent>
              </Card>
              <OrderActionDock
                canApprove={canApprove}
                invalidCaseCount={invalidCaseCount}
                missingOverrideReasonCount={missingOverrideReasonCount}
                modifiedLineCount={modifiedLineCount}
                orderableLineCount={orderableLines.length}
                pending={pending}
              />
            </>
          ) : null}

          <section aria-labelledby="order-lines-title" className="space-y-4">
            <div className="scroll-mt-36" ref={listStartRef}>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Revue article par article
              </p>
              <h2 id="order-lines-title" className="mt-1 text-xl font-semibold">
                Lignes de la proposition
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Commencez par les lignes calculées, puis contrôlez séparément
                les indisponibilités.
              </p>
            </div>

            <div className="grid gap-3 rounded-xl border bg-muted/20 p-3">
              <div className="relative min-w-0 sm:max-w-xl">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Rechercher une ligne de commande"
                  className="pl-9"
                  onChange={(event) => changeQuery(event.target.value)}
                  placeholder="Rechercher un article…"
                  value={query}
                />
              </div>
              <div
                aria-label="Filtrer les lignes de commande par statut"
                className="flex flex-wrap gap-2"
              >
                {([
                  ["calculated", `Calculées · ${orderableLines.length}`],
                  ["ready", `À commander · ${suggestion.readyLineCount}`],
                  ["no_order", `Sans commande · ${suggestion.noOrderLineCount}`],
                  [
                    "unavailable",
                    `Indisponibles · ${suggestion.unavailableLineCount}`,
                  ],
                  ["modified", `Modifiées · ${modifiedLineCount}`],
                  ["all", `Toutes les lignes · ${suggestion.lines.length}`],
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
              <div
                aria-label="Filtrer les lignes de commande par famille"
                className="flex flex-wrap gap-2"
              >
                {([
                  ["all", "Toutes familles"],
                  ["3400", "Fruits · 3400"],
                  ["3402", "Légumes · 3402"],
                  ["unknown", "Sans famille"],
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
            </div>

            <OrderListPosition
              ariaLabel="Pagination des lignes de commande avant la liste"
              currentPage={currentPage}
              onPageChange={changePage}
              pageCount={pageCount}
              resultCount={filteredLines.length}
            />

            <div
              className="grid gap-4"
              data-order-page-size={orderLinePageSize}
            >
              {pageLines.length === 0 ? (
                <div className="rounded-xl border border-dashed px-6 py-12 text-center">
                  <p className="font-medium">
                    Aucune ligne ne correspond à ces filtres
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Modifiez la recherche, le statut ou la famille affichée.
                  </p>
                </div>
              ) : (
                pageLines.map((line) => (
                  <SuggestionLineCard
                    approvedCaseCount={caseCounts[line.productId] ?? ""}
                    disabled={
                      suggestion.status === "approved" ||
                      !canApprove ||
                      pending !== null
                    }
                    key={line.productId}
                    line={line}
                    onApprovedCaseCountChange={(value) =>
                      setCaseCounts((current) => ({
                        ...current,
                        [line.productId]: value,
                      }))
                    }
                    onReasonChange={(value) =>
                      setReasons((current) => ({
                        ...current,
                        [line.productId]: value,
                      }))
                    }
                    reason={reasons[line.productId] ?? ""}
                    suggestion={suggestion}
                  />
                ))
              )}
            </div>

            {pageCount > 1 ? (
              <OrderListPosition
                ariaLabel="Pagination des lignes de commande après la liste"
                currentPage={currentPage}
                onPageChange={changePage}
                pageCount={pageCount}
                resultCount={filteredLines.length}
              />
            ) : null}
          </section>
        </form>
      )}
    </div>
  );
}

function MorningWorkflow() {
  const steps = [
    { label: "Faire le tri", icon: PackageOpen },
    { label: "Traiter le stock", icon: Warehouse },
    { label: "Passer la commande", icon: ClipboardCheck, active: true },
    { label: "Traiter l’arrivage", icon: PackageCheck },
  ];
  return (
    <section aria-labelledby="morning-workflow-title">
      <h2 id="morning-workflow-title" className="text-lg font-semibold">
        Le matin, dans l’ordre
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map(({ active, icon: Icon, label }, index) => (
          <li
            className={cn(
              "rounded-xl border bg-card p-4",
              active && "border-primary/40 bg-primary/[0.04]",
            )}
            key={label}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="grid size-7 place-items-center rounded-full bg-muted text-xs">
                {index + 1}
              </span>
              <Icon aria-hidden="true" className="size-4 text-primary" />
              {label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SuggestionSummary({ suggestion }: { suggestion: OrderSuggestionDraft }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Proposition du {dateLabel(suggestion.orderDate)}</CardTitle>
          <Badge variant={suggestion.status === "approved" ? "default" : "secondary"}>
            {suggestion.status === "approved" ? "Validée" : "Brouillon"}
          </Badge>
        </div>
        <CardDescription>
          {suggestion.readyLineCount} à commander · {suggestion.noOrderLineCount} sans commande · {suggestion.unavailableLineCount} indisponible(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <Evidence label="Livraison" value={dateLabel(suggestion.deliveryDate)} />
          <Evidence label="Heure limite" value={suggestion.config.cutoffLocalTime} />
          <Evidence label="Stock final cible" value={`${suggestion.config.targetClosingStockRatio * 100} %`} />
        </div>
        <div>
          <p className="font-medium">Hypothèses visibles</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {suggestion.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Aucune transmission fournisseur</AlertTitle>
          <AlertDescription>{suggestion.limitations.join(" · ")}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function OrderActionDock({
  canApprove,
  invalidCaseCount,
  missingOverrideReasonCount,
  modifiedLineCount,
  orderableLineCount,
  pending,
}: {
  canApprove: boolean;
  invalidCaseCount: number;
  missingOverrideReasonCount: number;
  modifiedLineCount: number;
  orderableLineCount: number;
  pending: "create" | "approve" | null;
}) {
  const issueCount = invalidCaseCount + missingOverrideReasonCount;
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 flex items-center justify-between gap-2 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur md:sticky md:inset-auto md:top-20 md:bottom-auto">
      <p
        aria-live="polite"
        className="min-w-0 text-xs text-muted-foreground sm:text-sm"
      >
        <span className="block font-medium text-foreground">
          {orderableLineCount} ligne{orderableLineCount === 1 ? "" : "s"} à
          valider
        </span>
        <span className="block">
          {modifiedLineCount} modifiée{modifiedLineCount === 1 ? "" : "s"}
          {issueCount > 0
            ? ` · ${issueCount} saisie${issueCount === 1 ? "" : "s"} à compléter`
            : " · prête pour validation"}
        </span>
      </p>
      <Button
        className="shrink-0"
        disabled={!canApprove || pending !== null || issueCount > 0}
        size="sm"
        type="submit"
      >
        {pending === "approve" ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ClipboardCheck aria-hidden="true" />
        )}
        Valider la proposition
      </Button>
    </div>
  );
}

function OrderListPosition({
  ariaLabel,
  currentPage,
  onPageChange,
  pageCount,
  resultCount,
}: {
  ariaLabel: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageCount: number;
  resultCount: number;
}) {
  const first =
    resultCount === 0 ? 0 : (currentPage - 1) * orderLinePageSize + 1;
  const last = Math.min(currentPage * orderLinePageSize, resultCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" role="status">
        {first}–{last} sur {resultCount} ligne{resultCount === 1 ? "" : "s"}
      </p>
      {pageCount > 1 ? (
        <div aria-label={ariaLabel} className="flex items-center gap-2" role="navigation">
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
          <span aria-current="page" className="text-sm tabular-nums">
            Page {currentPage}/{pageCount}
          </span>
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

function SuggestionLineCard({
  approvedCaseCount,
  disabled,
  line,
  onApprovedCaseCountChange,
  onReasonChange,
  reason,
  suggestion,
}: {
  approvedCaseCount: string;
  disabled: boolean;
  line: OrderSuggestionLine;
  onApprovedCaseCountChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  reason: string;
  suggestion: OrderSuggestionDraft;
}) {
  const changed =
    line.suggestedCaseCount !== null &&
    Number(approvedCaseCount) !== line.suggestedCaseCount;
  const decision = suggestion.decision?.lines.find(
    ({ productId }) => productId === line.productId,
  );
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{line.productLabel}</CardTitle>
            <CardDescription>
              {line.familyCode ?? "Famille inconnue"} · {line.stockUnit ?? "Unité inconnue"}
            </CardDescription>
          </div>
          <Badge variant={line.status === "unavailable" ? "destructive" : "secondary"}>
            {line.status === "ready"
              ? "À commander"
              : line.status === "no_order"
                ? "Pas de commande"
                : "Indisponible"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Evidence label="Demande couverte" value={quantity(line.coveredDemandQuantity, line.stockUnit)} />
          <Evidence label="Stock du matin" value={quantity(line.morningOnHandQuantity, line.stockUnit)} />
          <Evidence label="Besoin net" value={quantity(line.netNeedQuantity, line.stockUnit)} />
          <Evidence label="Colisage" value={quantity(line.packSize, line.stockUnit)} />
          <Evidence label="Stock final projeté" value={quantity(line.projectedClosingStockQuantity, line.stockUnit)} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {line.forecastDays.map((day) => (
            <Badge key={day.businessDate} variant="outline">
              {dateLabel(day.businessDate)} · {quantity(day.predictedQuantity, line.stockUnit)}
            </Badge>
          ))}
          {line.forecastConfidence ? (
            <Badge variant="outline">Confiance {line.forecastConfidence}</Badge>
          ) : null}
        </div>

        {line.warnings.length > 0 ? (
          <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300">
            {line.warnings.map((warning) => (
              <li className="flex gap-2" key={warning.code}>
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {warning.message}
              </li>
            ))}
          </ul>
        ) : null}

        {line.suggestedCaseCount !== null ? (
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <Evidence
              label="Suggestion calculée"
              value={`${line.suggestedCaseCount} colis · ${quantity(line.suggestedOrderQuantity, line.stockUnit)}`}
            />
            {suggestion.status === "approved" ? (
              <div className="space-y-2">
                <Evidence
                  label="Décision validée"
                  value={`${decision?.approvedCaseCount ?? 0} colis · ${quantity(decision?.approvedOrderQuantity ?? 0, line.stockUnit)}`}
                />
                {decision?.overrideReason ? (
                  <p className="text-sm text-muted-foreground">
                    Motif de l’écart : {decision.overrideReason}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={`cases-${line.productId}`}>Colis validés</Label>
                  <Input
                    disabled={disabled}
                    id={`cases-${line.productId}`}
                    min="0"
                    onChange={(event) => onApprovedCaseCountChange(event.target.value)}
                    required
                    step="1"
                    type="number"
                    value={approvedCaseCount}
                  />
                </div>
                {changed ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`reason-${line.productId}`}>
                      Motif de l’écart
                    </Label>
                    <Input
                      disabled={disabled}
                      id={`reason-${line.productId}`}
                      minLength={3}
                      onChange={(event) => onReasonChange(event.target.value)}
                      placeholder="Qualité, opération locale, prudence…"
                      required
                      value={reason}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
