"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorSchema } from "@/domain/api/schemas";
import {
  recommendationFollowUpCompleteInputSchema,
  recommendationFollowUpResponseSchema,
  recommendationFollowUpScheduleInputSchema,
  type ObservedPeriodResult,
  type RecommendationFollowUp,
} from "@/domain/decisions/follow-up-schemas";
import { formatMoney, formatQuantity, formatRatio } from "@/lib/formatting";

interface RecommendationFollowUpManagerProps {
  canManage: boolean;
  decisionId: string;
  defaultAfterPeriodKey: string;
  defaultDueOn: string;
  initialFollowUp: RecommendationFollowUp | null;
  storeId: string;
}

async function responseError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(payload);
  return parsed.success
    ? parsed.data.message
    : "Le suivi n’a pas pu être enregistré";
}

export function RecommendationFollowUpManager({
  canManage,
  decisionId,
  defaultAfterPeriodKey,
  defaultDueOn,
  initialFollowUp,
  storeId,
}: RecommendationFollowUpManagerProps) {
  const router = useRouter();
  const [followUp, setFollowUp] =
    useState<RecommendationFollowUp | null>(initialFollowUp);
  const [afterPeriodKey, setAfterPeriodKey] = useState(defaultAfterPeriodKey);
  const [dueOn, setDueOn] = useState(defaultDueOn);
  const [interpretation, setInterpretation] = useState("");
  const [limitations, setLimitations] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduleKeyRef = useRef(crypto.randomUUID());
  const completeKeyRef = useRef(crypto.randomUUID());

  async function schedule() {
    const parsed = recommendationFollowUpScheduleInputSchema.safeParse({
      idempotencyKey: scheduleKeyRef.current,
      afterPeriodKey,
      dueOn,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Planification invalide");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/stores/${storeId}/decisions/${decisionId}/follow-ups`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = recommendationFollowUpResponseSchema.parse(
        await response.json(),
      );
      scheduleKeyRef.current = crypto.randomUUID();
      setFollowUp(result.followUp);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le suivi n’a pas pu être planifié",
      );
    } finally {
      setPending(false);
    }
  }

  async function complete() {
    if (!followUp || followUp.status !== "scheduled") return;
    const parsed = recommendationFollowUpCompleteInputSchema.safeParse({
      idempotencyKey: completeKeyRef.current,
      basedOnVersion: followUp.version,
      interpretation,
      limitations: limitations
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Résultat invalide");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/stores/${storeId}/decisions/${decisionId}/follow-ups/${followUp.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      const result = recommendationFollowUpResponseSchema.parse(
        await response.json(),
      );
      completeKeyRef.current = crypto.randomUUID();
      setFollowUp(result.followUp);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le résultat n’a pas pu être enregistré",
      );
    } finally {
      setPending(false);
    }
  }

  if (followUp?.status === "completed") {
    const observed = followUp.observedResult;
    return (
      <section
        aria-label="Résultat observé de la recommandation"
        className="mt-5 rounded-xl border bg-muted/25 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
            Résultat observé
          </div>
          <Badge variant="outline">Suivi terminé</Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ObservedPeriod
            label={`Avant · ${observed.before.periodKey}`}
            period={observed.before}
          />
          <ObservedPeriod
            label={`Après · ${observed.after.periodKey}`}
            period={observed.after}
          />
        </div>
        <div className="mt-3 grid gap-2 rounded-lg bg-background p-3 text-sm sm:grid-cols-3">
          <p>Δ CA <strong>{formatMoney(observed.revenueDeltaCents)}</strong> ({formatRatio(observed.revenueDeltaRatio)})</p>
          <p>Δ marge <strong>{formatMoney(observed.marginDeltaCents)}</strong> ({formatRatio(observed.marginDeltaRatio)})</p>
          <p>Δ quantité <strong>{formatQuantity(observed.quantityDelta)}</strong> ({formatRatio(observed.quantityDeltaRatio)})</p>
        </div>
        <div className="mt-3 rounded-lg bg-background p-3 text-sm">
          <p className="font-medium">Interprétation manager</p>
          <p className="mt-1 leading-6 text-muted-foreground">
            {followUp.interpretation}
          </p>
        </div>
        <div className="mt-3 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Limites de lecture</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {followUp.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          <p className="mt-2">
            Calcul {observed.calculationVersion} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(observed.calculatedAt))}
          </p>
        </div>
      </section>
    );
  }

  if (followUp?.status === "scheduled") {
    return (
      <section
        aria-label="Suivi planifié de la recommandation"
        className="mt-5 rounded-xl border bg-muted/25 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <CalendarClock aria-hidden="true" className="size-4 text-primary" />
            Suivi {followUp.beforePeriodKey} → {followUp.afterPeriodKey}
          </div>
          <Badge variant="outline">Échéance {followUp.dueOn}</Badge>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          La période avant reste figée depuis la recommandation. Le réalisé sera
          lu dans les données importées de {followUp.afterPeriodKey}.
        </p>
        {canManage ? (
          <div className="mt-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Résultat indisponible</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`follow-up-interpretation-${decisionId}`}>
                Interprétation du résultat
              </FieldLabel>
              <Textarea
                id={`follow-up-interpretation-${decisionId}`}
                maxLength={2_000}
                onChange={(event) => setInterpretation(event.target.value)}
                placeholder="Ce que le résultat observé change dans la décision…"
                value={interpretation}
              />
              <FieldDescription>
                Au moins 10 caractères. Cette analyse reste séparée des faits.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`follow-up-limitations-${decisionId}`}>
                Limites complémentaires
              </FieldLabel>
              <Textarea
                id={`follow-up-limitations-${decisionId}`}
                maxLength={2_000}
                onChange={(event) => setLimitations(event.target.value)}
                placeholder="Une limite par ligne : promotion, rupture, météo…"
                value={limitations}
              />
            </Field>
            <Button disabled={pending} onClick={complete} type="button">
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
              Enregistrer le réalisé
            </Button>
          </div>
        ) : null}
      </section>
    );
  }

  if (!canManage) return null;

  return (
    <section
      aria-label="Planifier le suivi de la recommandation"
      className="mt-5 rounded-xl border border-dashed p-4"
    >
      <div className="flex items-center gap-2 font-semibold">
        <CalendarClock aria-hidden="true" className="size-4 text-primary" />
        Planifier le résultat réel
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        La période avant est celle de la recommandation. Choisissez la période
        après qui servira à figer les faits observés.
      </p>
      {error ? (
        <Alert className="mt-3" variant="destructive">
          <AlertTitle>Planification impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`follow-up-period-${decisionId}`}>
            Période après
          </FieldLabel>
          <Input
            id={`follow-up-period-${decisionId}`}
            onChange={(event) => setAfterPeriodKey(event.target.value)}
            type="month"
            value={afterPeriodKey}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`follow-up-due-${decisionId}`}>
            Échéance de contrôle
          </FieldLabel>
          <Input
            id={`follow-up-due-${decisionId}`}
            onChange={(event) => setDueOn(event.target.value)}
            type="date"
            value={dueOn}
          />
        </Field>
      </div>
      <Button className="mt-4" disabled={pending} onClick={schedule} type="button" variant="outline">
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
        Planifier le suivi
      </Button>
    </section>
  );
}

function ObservedPeriod({
  label,
  period,
}: {
  label: string;
  period: ObservedPeriodResult;
}) {
  return (
    <div className="rounded-lg bg-background p-3 text-sm">
      <p className="font-medium">{label}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        <dt>CA</dt>
        <dd className="text-right text-foreground">
          {formatMoney(period.revenueCents)}
        </dd>
        <dt>Marge</dt>
        <dd className="text-right text-foreground">
          {formatMoney(period.marginCents)} · {formatRatio(period.marginRatio)}
        </dd>
        <dt>Quantité</dt>
        <dd className="text-right text-foreground">
          {formatQuantity(period.quantity)}
        </dd>
        <dt>Source</dt>
        <dd className="text-right text-foreground">
          {period.source === "salesFacts"
            ? "Ventes importées"
            : "Snapshot de recommandation"}
        </dd>
        <dt>Révision</dt>
        <dd className="text-right text-foreground">{period.dataRevision}</dd>
      </dl>
    </div>
  );
}
