"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  decisionResponseSchema,
  managerDecisionSchema,
  recommendationDecisionInputSchema,
} from "@/domain/decisions/schemas";
import {
  recommendationTypeSchema,
  type RecommendationType,
} from "@/domain/recommendations/schemas";

interface RecommendationDecisionFormProps {
  storeId: string;
  recommendationId: string;
  currentType: RecommendationType;
  decisionLogHref: string;
}

export function RecommendationDecisionForm({
  storeId,
  recommendationId,
  currentType,
  decisionLogHref,
}: RecommendationDecisionFormProps) {
  const [decision, setDecision] = useState("accepted");
  const [modifiedType, setModifiedType] = useState<RecommendationType>(currentType);
  const [rationale, setRationale] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);

  const sendDecision = useCallback(async (input: unknown) => {
    const validated = recommendationDecisionInputSchema.parse(input);
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/stores/${storeId}/recommendations/${recommendationId}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validated),
        },
      );

      if (!response.ok) {
        throw new Error("DECISION_FAILED");
      }

      const result = decisionResponseSchema.safeParse(await response.json());
      if (!result.success) {
        throw new Error("INVALID_DECISION_RESPONSE");
      }

      setDecisionId(result.data.decision.id);
      return {
        decisionId: result.data.decision.id,
        status: result.data.decision.decision,
      };
    } catch {
      setError("La décision n’a pas pu être enregistrée. Réessayez sans modifier le contexte magasin.");
      throw new Error("DECISION_FAILED");
    } finally {
      setPending(false);
    }
  }, [recommendationId, storeId]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) {
      return;
    }

    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: "complete_recommendation_decision",
          title: "Enregistrer la décision manager",
          description:
            "Enregistre explicitement une décision sur la recommandation affichée et met à jour son journal visible.",
          inputSchema: {
            type: "object",
            properties: {
              decision: {
                type: "string",
                enum: ["accepted", "modified", "rejected", "deferred"],
              },
              modifiedType: {
                type: "string",
                enum: [
                  "PUSH",
                  "REDUCE",
                  "HOLD",
                  "MARGIN_WATCH",
                  "TRAFFIC_PROTECT",
                ],
              },
              rationale: { type: "string", maxLength: 1000 },
            },
            required: ["decision"],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          async execute(input) {
            const toolInput = input as Record<string, unknown>;
            return sendDecision({
              ...toolInput,
              idempotencyKey: crypto.randomUUID(),
            });
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [sendDecision]);

  async function submitDecision() {
    const input = recommendationDecisionInputSchema.safeParse({
      idempotencyKey: crypto.randomUUID(),
      decision,
      modifiedType: decision === "modified" ? modifiedType : undefined,
      rationale: rationale || undefined,
    });

    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Décision invalide");
      return;
    }

    try {
      await sendDecision(input.data);
    } catch {
      // The visible error state is set by sendDecision.
    }
  }

  if (decisionId) {
    return (
      <Alert>
        <CheckCircle2 aria-hidden="true" />
        <AlertTitle>Décision enregistrée</AlertTitle>
        <AlertDescription>
          Le journal immuable a été créé sous la référence {decisionId.slice(-8)}.
          <Link className="ml-1 font-semibold underline underline-offset-4" href={decisionLogHref}>
            Ouvrir le journal
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Décision impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Décision manager</FieldLabel>
          <Select
            value={decision}
            onValueChange={(value) => {
              const parsed = managerDecisionSchema.safeParse(value);
              if (parsed.success) setDecision(parsed.data);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accepted">Accepter</SelectItem>
              <SelectItem value="modified">Modifier</SelectItem>
              <SelectItem value="rejected">Rejeter</SelectItem>
              <SelectItem value="deferred">Différer</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {decision === "modified" ? (
          <Field>
            <FieldLabel>Nouvelle recommandation</FieldLabel>
            <Select
              value={modifiedType}
              onValueChange={(value) => {
                const parsed = recommendationTypeSchema.safeParse(value);
                if (parsed.success) setModifiedType(parsed.data);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUSH">Pousser</SelectItem>
                <SelectItem value="REDUCE">Réduire</SelectItem>
                <SelectItem value="HOLD">Maintenir</SelectItem>
                <SelectItem value="MARGIN_WATCH">Surveiller la marge</SelectItem>
                <SelectItem value="TRAFFIC_PROTECT">Protéger le trafic</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </div>
      <Field>
        <FieldLabel htmlFor="decision-rationale">Note</FieldLabel>
        <Textarea
          id="decision-rationale"
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          maxLength={1000}
          placeholder="Contexte terrain, contrainte fournisseur ou raison de l’arbitrage…"
        />
        <FieldDescription>
          Recommandée pour expliquer un rejet ou une modification.
        </FieldDescription>
      </Field>
      <Button onClick={submitDecision} disabled={pending} size="lg">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        Enregistrer la décision
      </Button>
    </div>
  );
}
