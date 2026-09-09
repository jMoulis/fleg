"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  PackageCheck,
  PackageOpen,
  RefreshCw,
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
  const cycle = initialWorkspace.cycle;

  function replaceSuggestion(next: OrderSuggestionDraft) {
    setSuggestion(next);
    setCaseCounts(initialCaseCounts(next));
    setReasons({});
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
        <form className="space-y-6" onSubmit={approveSuggestion}>
          <SuggestionSummary suggestion={suggestion} />
          <div className="grid gap-4">
            {suggestion.lines.map((line) => (
              <SuggestionLineCard
                approvedCaseCount={caseCounts[line.productId] ?? ""}
                disabled={
                  suggestion.status === "approved" || !canApprove || pending !== null
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
            ))}
          </div>

          {suggestion.status === "draft" && orderableLines.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
                  Validation manager
                </CardTitle>
                <CardDescription>
                  La validation fige votre décision, mais ne transmet rien au fournisseur.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="approval-note">Note générale facultative</Label>
                  <Textarea
                    disabled={!canApprove || pending !== null}
                    id="approval-note"
                    maxLength={1_000}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Contexte utile pour relire la décision…"
                    value={note}
                  />
                </div>
                <Button
                  disabled={!canApprove || pending !== null}
                  type="submit"
                >
                  {pending === "approve" ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <ClipboardCheck aria-hidden="true" />
                  )}
                  Valider la proposition
                </Button>
              </CardContent>
            </Card>
          ) : null}
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
