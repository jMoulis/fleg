"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Save,
  Send,
  X,
} from "lucide-react";

import { BoundedProductPicker } from "@/components/products/bounded-product-picker";
import { BoundedListPagination } from "@/components/ui/bounded-list-pagination";
import {
  addDays,
  eventCoversDate,
  formatCalendarDate,
  getIsoWeekDays,
  startOfIsoWeek,
  toDateOnly,
} from "@/domain/commercial-events/calendar";
import {
  commercialEventResponseSchema,
  type CommercialEvent,
} from "@/domain/commercial-events/schemas";
import type { EndcapOption } from "@/domain/commercial-events/schemas";
import type { ProductOption } from "@/domain/products/schemas";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TgPlannerProps {
  canPublish: boolean;
  endcaps: EndcapOption[];
  initialEvents: CommercialEvent[];
  layoutVersionId: string;
  products: ProductOption[];
  storeId: string;
}

interface EditorState {
  eventId: string | null;
  basedOnUpdatedAt: string | null;
  status: CommercialEvent["status"] | "new";
  fixtureId: string;
  title: string;
  theme: string;
  startsOn: string;
  endsOn: string;
  productIds: string[];
  targetRevenueEuros: string;
  targetMarginEuros: string;
  actualRevenueEuros: string;
  actualMarginEuros: string;
  notes: string;
}

const statusLabels: Record<CommercialEvent["status"], string> = {
  draft: "Brouillon",
  published: "Publiée",
  completed: "Terminée",
  cancelled: "Annulée",
};
const cancelledEventPageSize = 25;

function moneyInputValue(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

function eurosToCents(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Les montants doivent être des nombres positifs");
  }

  return Math.round(amount * 100);
}

function createEditor(endcaps: EndcapOption[], weekStart: string): EditorState {
  return {
    eventId: null,
    basedOnUpdatedAt: null,
    status: "new",
    fixtureId: endcaps[0]?.id ?? "",
    title: "",
    theme: "",
    startsOn: weekStart,
    endsOn: addDays(weekStart, 6),
    productIds: [],
    targetRevenueEuros: "",
    targetMarginEuros: "",
    actualRevenueEuros: "",
    actualMarginEuros: "",
    notes: "",
  };
}

function editorFromEvent(event: CommercialEvent): EditorState {
  return {
    eventId: event.id,
    basedOnUpdatedAt: event.updatedAt,
    status: event.status,
    fixtureId: event.fixtureId,
    title: event.title,
    theme: event.theme,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    productIds: event.productIds,
    targetRevenueEuros: moneyInputValue(event.targetRevenueCents),
    targetMarginEuros: moneyInputValue(event.targetMarginCents),
    actualRevenueEuros: moneyInputValue(event.actualRevenueCents),
    actualMarginEuros: moneyInputValue(event.actualMarginCents),
    notes: event.notes ?? "",
  };
}

function getApiMessage(payload: unknown): string | null {
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

export function TgPlanner({
  canPublish,
  endcaps,
  initialEvents,
  layoutVersionId,
  products,
  storeId,
}: TgPlannerProps) {
  const initialWeek = startOfIsoWeek(toDateOnly(new Date()));
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [events, setEvents] = useState(initialEvents);
  const [editor, setEditor] = useState(() =>
    createEditor(endcaps, initialWeek),
  );
  const [cancelledEventPage, setCancelledEventPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const weekDays = useMemo(() => getIsoWeekDays(weekStart), [weekStart]);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const endcapById = useMemo(
    () => new Map(endcaps.map((endcap) => [endcap.id, endcap])),
    [endcaps],
  );
  const editable = editor.status === "new" || editor.status === "draft";
  const canComplete = editor.status === "published";
  const canEditDraft = canPublish && editable;
  const canEnterActual = canPublish && canComplete;
  const availableProducts = useMemo(
    () =>
      products.filter((product) => !editor.productIds.includes(product.id)),
    [editor.productIds, products],
  );
  const cancelledEvents = useMemo(
    () =>
      events
        .filter((event) => event.status === "cancelled")
        .sort((left, right) =>
          (right.cancelledAt ?? right.updatedAt).localeCompare(
            left.cancelledAt ?? left.updatedAt,
          ),
        ),
    [events],
  );
  const cancelledEventPageCount = Math.max(
    1,
    Math.ceil(cancelledEvents.length / cancelledEventPageSize),
  );
  const safeCancelledEventPage = Math.min(
    cancelledEventPage,
    cancelledEventPageCount,
  );
  const visibleCancelledEvents = cancelledEvents.slice(
    (safeCancelledEventPage - 1) * cancelledEventPageSize,
    safeCancelledEventPage * cancelledEventPageSize,
  );

  function beginNew() {
    setEditor(createEditor(endcaps, weekStart));
    setError(null);
    setNotice(null);
  }

  function selectEvent(event: CommercialEvent) {
    setEditor(editorFromEvent(event));
    setError(null);
    setNotice(null);
  }

  function updateEditor<K extends keyof EditorState>(
    key: K,
    value: EditorState[K],
  ) {
    setEditor((current) => ({ ...current, [key]: value }));
    setError(null);
    setNotice(null);
  }

  async function submit(
    action: "save" | "publish" | "complete" | "cancel",
  ) {
    if (!canPublish || pending) {
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const body = {
        idempotencyKey: crypto.randomUUID(),
        layoutVersionId,
        fixtureId: editor.fixtureId,
        title: editor.title,
        theme: editor.theme,
        startsOn: editor.startsOn,
        endsOn: editor.endsOn,
        productIds: editor.productIds,
        targetRevenueCents: eurosToCents(editor.targetRevenueEuros),
        targetMarginCents: eurosToCents(editor.targetMarginEuros),
        actualRevenueCents:
          action === "complete" ? eurosToCents(editor.actualRevenueEuros) : null,
        actualMarginCents:
          action === "complete" ? eurosToCents(editor.actualMarginEuros) : null,
        notes: editor.notes.trim() || null,
        action,
        ...(editor.eventId
          ? { basedOnUpdatedAt: editor.basedOnUpdatedAt }
          : {}),
      };
      const url = editor.eventId
        ? `/api/stores/${storeId}/commercial-events/${editor.eventId}`
        : `/api/stores/${storeId}/commercial-events`;
      const response = await fetch(url, {
        method: editor.eventId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getApiMessage(payload) ?? "L'opération n'a pas pu être enregistrée",
        );
      }

      const parsed = commercialEventResponseSchema.parse(payload);
      setEvents((current) => {
        const withoutUpdated = current.filter(
          (event) => event.id !== parsed.event.id,
        );
        return [...withoutUpdated, parsed.event].sort((left, right) =>
          left.startsOn.localeCompare(right.startsOn),
        );
      });
      setEditor(editorFromEvent(parsed.event));
      setNotice(
        action === "save"
          ? "Brouillon enregistré."
          : action === "publish"
            ? "Opération publiée."
            : action === "complete"
              ? "Résultats enregistrés et opération terminée."
              : "Opération annulée.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "L'opération n'a pas pu être enregistrée",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-labelledby="tg-calendar-title" className="min-w-0">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle id="tg-calendar-title">Calendrier hebdomadaire</CardTitle>
                <CardDescription>
                  Du {formatCalendarDate(weekDays[0], { day: "numeric", month: "long" })} au {formatCalendarDate(weekDays[6], { day: "numeric", month: "long", year: "numeric" })}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  aria-label="Semaine précédente"
                  onClick={() => setWeekStart((current) => addDays(current, -7))}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  onClick={() => setWeekStart(initialWeek)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Aujourd’hui
                </Button>
                <Button
                  aria-label="Semaine suivante"
                  onClick={() => setWeekStart((current) => addDays(current, 7))}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-4">
            <div className="grid min-w-[58rem] grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dayEvents = events.filter(
                  (event) =>
                    event.status !== "cancelled" && eventCoversDate(event, day),
                );
                const isToday = day === toDateOnly(new Date());

                return (
                  <div
                    className={cn(
                      "min-h-72 rounded-xl border bg-muted/20 p-2",
                      isToday && "border-primary/45 bg-primary/[0.035]",
                    )}
                    key={day}
                  >
                    <div className="border-b pb-2 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {formatCalendarDate(day, { weekday: "short" })}
                      </p>
                      <p className={cn("mt-1 text-lg font-semibold", isToday && "text-primary")}>
                        {formatCalendarDate(day, { day: "numeric" })}
                      </p>
                    </div>
                    <div className="mt-2 space-y-2">
                      {dayEvents.map((event) => (
                        <button
                          aria-pressed={editor.eventId === event.id}
                          className={cn(
                            "w-full rounded-lg border bg-background p-2 text-left shadow-sm transition-colors hover:border-primary/50",
                            editor.eventId === event.id && "border-primary ring-2 ring-primary/15",
                          )}
                          key={event.id}
                          onClick={() => selectEvent(event)}
                          type="button"
                        >
                          <span className="block truncate text-xs font-semibold text-primary">
                            {event.fixtureName}
                          </span>
                          <span className="mt-1 block text-sm font-medium leading-4">
                            {event.title}
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {event.theme}
                          </span>
                          <Badge className="mt-2" variant={event.status === "draft" ? "secondary" : event.status === "completed" ? "outline" : "default"}>
                            {statusLabels[event.status]}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {cancelledEvents.length > 0 ? (
          <details className="mt-4 rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Opérations annulées ({cancelledEvents.length})
            </summary>
            <div className="mt-4 space-y-3">
              <BoundedListPagination
                ariaLabel="Pagination des opérations annulées"
                currentPage={safeCancelledEventPage}
                itemLabel="opération(s) annulée(s)"
                onPageChange={setCancelledEventPage}
                pageSize={cancelledEventPageSize}
                totalItems={cancelledEvents.length}
              />
              <div
                className="flex flex-wrap gap-2"
                data-cancelled-event-page-size={cancelledEventPageSize}
              >
                {visibleCancelledEvents.map((event) => (
                  <Button
                    data-cancelled-event-item
                    key={event.id}
                    onClick={() => selectEvent(event)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {event.fixtureName} · {event.title}
                  </Button>
                ))}
              </div>
            </div>
          </details>
        ) : null}
      </section>

      <aside aria-label="Configuration de l'opération">
        <Card className="xl:sticky xl:top-6">
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {editor.status === "new" ? "Nouvelle opération" : editor.title}
                </CardTitle>
                <CardDescription>
                  {editor.status === "new"
                    ? "Planifiez une tête de gondole."
                    : statusLabels[editor.status]}
                </CardDescription>
              </div>
              <Button
                aria-label="Créer une autre opération"
                onClick={beginNew}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <CirclePlus aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            {!canPublish ? (
              <Alert>
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Consultation uniquement</AlertTitle>
                <AlertDescription>
                  Le droit de publication TG est requis pour enregistrer.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="tg-fixture">Tête de gondole</Label>
              <Select
                disabled={!canEditDraft}
                onValueChange={(value) => updateEditor("fixtureId", value ?? "")}
                value={editor.fixtureId}
              >
                <SelectTrigger className="h-10 w-full" id="tg-fixture">
                  <SelectValue placeholder="Choisir une TG">
                    {endcapById.get(editor.fixtureId)?.label ?? "Choisir une TG"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {endcaps.map((endcap) => (
                    <SelectItem key={endcap.id} value={endcap.id}>
                      {endcap.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tg-title">Nom de l’opération</Label>
              <Input
                disabled={!canEditDraft}
                id="tg-title"
                maxLength={160}
                onChange={(event) => updateEditor("title", event.target.value)}
                placeholder="Ex. Semaine italienne"
                value={editor.title}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tg-theme">Thème commercial</Label>
              <Input
                disabled={!canEditDraft}
                id="tg-theme"
                maxLength={120}
                onChange={(event) => updateEditor("theme", event.target.value)}
                placeholder="Ex. Tomates et antipasti"
                value={editor.theme}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tg-start">Début</Label>
                <Input
                  disabled={!canEditDraft}
                  id="tg-start"
                  onChange={(event) => updateEditor("startsOn", event.target.value)}
                  type="date"
                  value={editor.startsOn}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tg-end">Fin</Label>
                <Input
                  disabled={!canEditDraft}
                  id="tg-end"
                  onChange={(event) => updateEditor("endsOn", event.target.value)}
                  type="date"
                  value={editor.endsOn}
                />
              </div>
            </div>

            <div className="space-y-2">
              {canEditDraft ? (
                <BoundedProductPicker
                  actionLabel="Ajouter"
                  collapseOnSelect={false}
                  id="tg-product"
                  label="Ajouter un produit"
                  onSelect={(productId) =>
                    updateEditor("productIds", [
                      ...editor.productIds,
                      productId,
                    ])
                  }
                  products={availableProducts}
                  selectedProductId=""
                />
              ) : null}
              <p className="text-sm font-medium">Produits sélectionnés</p>
              <div className="flex flex-wrap gap-2">
                {editor.productIds.map((productId) => (
                  <Badge key={productId} variant="secondary">
                    {productById.get(productId)?.label ?? "Produit indisponible"}
                    {canEditDraft ? (
                      <button
                        aria-label={`Retirer ${productById.get(productId)?.label ?? "le produit"}`}
                        onClick={() =>
                          updateEditor(
                            "productIds",
                            editor.productIds.filter((id) => id !== productId),
                          )
                        }
                        type="button"
                      >
                        <X aria-hidden="true" className="size-3" />
                      </button>
                    ) : null}
                  </Badge>
                ))}
                {editor.productIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun produit sélectionné.</p>
                ) : null}
              </div>
            </div>

            <fieldset className="rounded-xl border p-3" disabled={!canEditDraft}>
              <legend className="px-1 text-sm font-medium">Objectifs</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="tg-target-revenue">CA (€)</Label>
                  <Input
                    id="tg-target-revenue"
                    min="0"
                    onChange={(event) => updateEditor("targetRevenueEuros", event.target.value)}
                    step="0.01"
                    type="number"
                    value={editor.targetRevenueEuros}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tg-target-margin">Marge (€)</Label>
                  <Input
                    id="tg-target-margin"
                    min="0"
                    onChange={(event) => updateEditor("targetMarginEuros", event.target.value)}
                    step="0.01"
                    type="number"
                    value={editor.targetMarginEuros}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Au moins un objectif est requis avant publication.
              </p>
            </fieldset>

            {canComplete || editor.status === "completed" ? (
              <fieldset className="rounded-xl border border-primary/25 bg-primary/[0.035] p-3" disabled={!canEnterActual}>
                <legend className="px-1 text-sm font-medium">Résultats réalisés</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="tg-actual-revenue">CA (€)</Label>
                    <Input
                      id="tg-actual-revenue"
                      min="0"
                      onChange={(event) => updateEditor("actualRevenueEuros", event.target.value)}
                      step="0.01"
                      type="number"
                      value={editor.actualRevenueEuros}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tg-actual-margin">Marge (€)</Label>
                    <Input
                      id="tg-actual-margin"
                      min="0"
                      onChange={(event) => updateEditor("actualMarginEuros", event.target.value)}
                      step="0.01"
                      type="number"
                      value={editor.actualMarginEuros}
                    />
                  </div>
                </div>
              </fieldset>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="tg-notes">Notes</Label>
              <Textarea
                disabled={!canPublish || (!editable && !canComplete)}
                id="tg-notes"
                maxLength={1_000}
                onChange={(event) => updateEditor("notes", event.target.value)}
                placeholder="Consignes de montage, mise en avant, suivi…"
                value={editor.notes}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Enregistrement impossible</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {notice ? (
              <Alert className="border-primary/25 bg-primary/[0.035]">
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>{notice}</AlertTitle>
              </Alert>
            ) : null}

            {editable ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={!canPublish || pending}
                  onClick={() => submit("save")}
                  type="button"
                  variant="outline"
                >
                  <Save aria-hidden="true" />
                  Enregistrer
                </Button>
                <Button
                  disabled={!canPublish || pending}
                  onClick={() => submit("publish")}
                  type="button"
                >
                  <Send aria-hidden="true" />
                  Publier
                </Button>
              </div>
            ) : null}

            {canComplete ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={!canPublish || pending}
                  onClick={() => submit("cancel")}
                  type="button"
                  variant="destructive"
                >
                  Annuler
                </Button>
                <Button
                  disabled={!canPublish || pending}
                  onClick={() => submit("complete")}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" />
                  Terminer
                </Button>
              </div>
            ) : null}

            {editor.status === "draft" ? (
              <Button
                className="w-full"
                disabled={!canPublish || pending}
                onClick={() => submit("cancel")}
                type="button"
                variant="destructive"
              >
                Annuler ce brouillon
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
