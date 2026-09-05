"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  PackageX,
  ReceiptEuro,
} from "lucide-react";

import {
  markdownReasonLabels,
  markdownReasonSchema,
  markdownResponseSchema,
  type MarkdownFact,
  type MarkdownReason,
} from "@/domain/markdown/schemas";
import { summarizeMarkdownFacts } from "@/domain/markdown/calculations";
import type { ProductOption } from "@/domain/products/schemas";
import { formatMoney, formatQuantity } from "@/lib/formatting";
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

interface MarkdownManagerProps {
  canWrite: boolean;
  initialDate: string;
  initialMarkdown: MarkdownFact[];
  products: ProductOption[];
  storeId: string;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

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

function eurosToCents(value: string): number | null {
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function parseQuantity(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const quantity = Number(value.replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
}

export function MarkdownManager({
  canWrite,
  initialDate,
  initialMarkdown,
  products,
  storeId,
}: MarkdownManagerProps) {
  const [facts, setFacts] = useState(initialMarkdown);
  const [productId, setProductId] = useState("");
  const [occurredOn, setOccurredOn] = useState(initialDate);
  const [amountEuros, setAmountEuros] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<MarkdownReason>("quality");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product.label])),
    [products],
  );
  const summary = useMemo(() => summarizeMarkdownFacts(facts), [facts]);
  const sortedFacts = useMemo(
    () =>
      [...facts].sort((left, right) => {
        const byDate = right.occurredOn.localeCompare(left.occurredOn);
        return byDate !== 0 ? byDate : right.createdAt.localeCompare(left.createdAt);
      }),
    [facts],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending) return;

    const amountCents = eurosToCents(amountEuros);
    const parsedQuantity = parseQuantity(quantity);
    if (!productId) {
      setError("Sélectionnez un produit.");
      return;
    }
    if (!occurredOn) {
      setError("Renseignez la date de constat.");
      return;
    }
    if (amountCents === null) {
      setError("Le montant doit être supérieur à zéro.");
      return;
    }
    if (parsedQuantity === undefined) {
      setError("La quantité doit être supérieure à zéro, ou rester vide.");
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/stores/${storeId}/markdown`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          productId,
          occurredOn,
          amountCents,
          quantity: parsedQuantity,
          reason,
          notes: notes.trim() || null,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          apiMessage(payload) ?? "La démarque n’a pas pu être enregistrée.",
        );
      }

      const created = markdownResponseSchema.parse(payload).markdown;
      setFacts((current) => [created, ...current]);
      setAmountEuros("");
      setQuantity("");
      setNotes("");
      setNotice("Démarque enregistrée. La révision des données du magasin a été mise à jour.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La démarque n’a pas pu être enregistrée.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]">
      <section aria-labelledby="markdown-entry-title">
        <Card>
          <CardHeader className="border-b">
            <CardTitle id="markdown-entry-title">Nouvelle saisie</CardTitle>
            <CardDescription>
              Une saisie est un fait daté et audité. Elle ne remplace pas les
              ventes importées.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canWrite ? (
              <Alert>
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Consultation uniquement</AlertTitle>
                <AlertDescription>
                  Votre rôle ne permet pas d’enregistrer de démarque.
                </AlertDescription>
              </Alert>
            ) : products.length === 0 ? (
              <Alert>
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Aucun produit disponible</AlertTitle>
                <AlertDescription>
                  Importez d’abord des ventes pour créer le référentiel produit.
                </AlertDescription>
              </Alert>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertTitle>Enregistrement impossible</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                {notice ? (
                  <Alert>
                    <CheckCircle2 aria-hidden="true" className="text-primary" />
                    <AlertTitle>Saisie enregistrée</AlertTitle>
                    <AlertDescription>{notice}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="markdown-product">Produit</Label>
                  <Select
                    onValueChange={(value) => setProductId(value ?? "")}
                    value={productId}
                  >
                    <SelectTrigger className="w-full" id="markdown-product">
                      <SelectValue placeholder="Sélectionner un produit" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="markdown-date">Date du constat</Label>
                    <Input
                      id="markdown-date"
                      max={initialDate}
                      onChange={(event) => setOccurredOn(event.target.value)}
                      required
                      type="date"
                      value={occurredOn}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="markdown-amount">Montant de perte (€)</Label>
                    <Input
                      id="markdown-amount"
                      inputMode="decimal"
                      min="0.01"
                      onChange={(event) => setAmountEuros(event.target.value)}
                      placeholder="0,00"
                      required
                      step="0.01"
                      type="number"
                      value={amountEuros}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="markdown-quantity">Quantité (facultatif)</Label>
                    <Input
                      id="markdown-quantity"
                      inputMode="decimal"
                      min="0.001"
                      onChange={(event) => setQuantity(event.target.value)}
                      placeholder="Ex. 3,5"
                      step="0.001"
                      type="number"
                      value={quantity}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="markdown-reason">Motif</Label>
                    <Select
                      onValueChange={(value) =>
                        setReason(markdownReasonSchema.parse(value))
                      }
                      value={reason}
                    >
                      <SelectTrigger className="w-full" id="markdown-reason">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {markdownReasonSchema.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {markdownReasonLabels[option]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="markdown-notes">Notes (facultatif)</Label>
                  <Textarea
                    id="markdown-notes"
                    maxLength={1_000}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Contexte utile pour expliquer cette perte…"
                    value={notes}
                  />
                </div>

                <Button className="w-full" disabled={pending} type="submit">
                  {pending ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <ReceiptEuro aria-hidden="true" />
                  )}
                  {pending ? "Enregistrement…" : "Enregistrer la démarque"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="markdown-history-title" className="min-w-0">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle id="markdown-history-title">Historique</CardTitle>
                <CardDescription>
                  Faits du magasin utilisés dans les analyses économiques.
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold tabular-nums">
                  {formatMoney(summary.amountCents)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary.factCount} saisie{summary.factCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sortedFacts.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
                <PackageX aria-hidden="true" className="size-8 text-muted-foreground" />
                <p className="mt-3 font-medium">Aucune démarque saisie</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Les analyses resteront partielles tant que la couverture des
                  périodes du test et de référence n’est pas complète.
                </p>
              </div>
            ) : (
              <ul className="divide-y" aria-label="Historique des démarques">
                {sortedFacts.map((fact) => (
                  <li
                    className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                    key={fact.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">
                          {productById.get(fact.productId) ?? "Produit indisponible"}
                        </p>
                        <Badge variant="secondary">
                          {markdownReasonLabels[fact.reason]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {dateFormatter.format(
                          new Date(`${fact.occurredOn}T00:00:00.000Z`),
                        )}
                        {fact.quantity === null
                          ? " · quantité non renseignée"
                          : ` · ${formatQuantity(fact.quantity)} unité${fact.quantity > 1 ? "s" : ""}`}
                      </p>
                      {fact.notes ? (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {fact.notes}
                        </p>
                      ) : null}
                    </div>
                    <p className="font-semibold tabular-nums sm:text-right">
                      {formatMoney(fact.amountCents)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {summary.quantity !== null && summary.factCount > 0 ? (
              <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
                Quantité totale renseignée : {formatQuantity(summary.quantity)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
