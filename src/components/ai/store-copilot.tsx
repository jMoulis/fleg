"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  BookOpenCheck,
  Bot,
  Check,
  ClipboardList,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  aiActionPlanDecisionResponseSchema,
  type AiActionPlan,
} from "@/domain/ai/action-plans";
import {
  networkCopilotResponseSchema,
  storeCopilotResponseSchema,
  type CopilotMessage,
  type CopilotToolTrace,
  type NetworkCopilotToolTrace,
  type StoreCopilotToolName,
} from "@/domain/ai/copilot";
import type { AiEvidenceRef } from "@/domain/ai/tools";
import { apiErrorSchema } from "@/domain/api/schemas";
import { cn } from "@/lib/utils";

const storeSuggestedQuestions = [
  "Pourquoi la marge a-t-elle évolué sur cette période ?",
  "Quels produits devrais-je prioriser le mois prochain ?",
  "Que devrait quitter la TG1 ?",
  "Prépare un plan d’action priorisé pour le mois prochain.",
] as const;

const networkSuggestedQuestions = [
  "Quel magasin a la productivité normalisée la plus forte ?",
  "Quel magasin présente une démarque anormale ?",
  "Où les objectifs sont-ils les moins bien couverts ?",
] as const;

type VisibleToolName = StoreCopilotToolName | "compareAuthorizedStores";
type VisibleToolTrace = CopilotToolTrace | NetworkCopilotToolTrace;

const toolLabels: Record<VisibleToolName, string> = {
  getStoreKpis: "Indicateurs magasin",
  getProductMetrics: "Métriques produits",
  getProductHistory: "Historique produit",
  getMarkdownDrivers: "Facteurs de démarque",
  getSpaceAllocations: "Allocations d’espace",
  getCommercialEvents: "Opérations commerciales",
  explainRecommendation: "Explication de recommandation",
  createDraftActionPlan: "Brouillon de plan d’action",
  compareAuthorizedStores: "Comparaison réseau autorisée",
};

const sourceLabels: Record<AiEvidenceRef["source"], string> = {
  salesFacts: "Ventes",
  products: "Produits",
  markdownFacts: "Démarque",
  layoutVersions: "Plan magasin",
  allocationPlans: "Allocations",
  commercialEvents: "Opérations commerciales",
  recommendations: "Recommandations",
  periodTargets: "Objectifs",
};

interface ConversationItem extends CopilotMessage {
  id: string;
  toolCalls?: VisibleToolTrace[];
  model?: string;
}

interface StoreCopilotProps {
  storeId: string;
  initialPeriod?: string;
  providerConfigured: boolean;
  model: string;
  initialActionPlans: AiActionPlan[];
  canApprove: boolean;
}

interface NetworkCopilotProps {
  storeIds: string[];
  initialPeriod?: string;
  providerConfigured: boolean;
  model: string;
}

interface CopilotWorkspaceProps {
  scope: "store" | "network";
  storeId?: string;
  endpoint: string;
  requestScope: Record<string, unknown>;
  initialPeriod?: string;
  providerConfigured: boolean;
  model: string;
  initialActionPlans?: AiActionPlan[];
  canApprove?: boolean;
}

function newConversationItem(input: Omit<ConversationItem, "id">) {
  return { ...input, id: crypto.randomUUID() };
}

function evidenceDescription(evidence: AiEvidenceRef): string {
  const parts = [sourceLabels[evidence.source]];
  if (evidence.periodKeys.length > 0) {
    parts.push(evidence.periodKeys.join(", "));
  }
  if (evidence.dataRevision !== null) {
    parts.push(`révision ${evidence.dataRevision}`);
  }
  if (evidence.calculationVersion) {
    parts.push(`calcul ${evidence.calculationVersion}`);
  }
  if (evidence.recordCount !== null) {
    parts.push(`${evidence.recordCount} enregistrement${evidence.recordCount > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}

function EvidencePanel({ toolCalls }: { toolCalls: VisibleToolTrace[] }) {
  const evidenceCount = toolCalls.reduce(
    (total, toolCall) => total + toolCall.evidence.length,
    0,
  );
  const limitationCount = toolCalls.reduce(
    (total, toolCall) => total + toolCall.limitations.length,
    0,
  );

  return (
    <details className="mt-4 rounded-xl border bg-background/70 text-left">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-foreground">
        <BookOpenCheck aria-hidden="true" className="size-4 text-primary" />
        Preuves consultées ({evidenceCount})
        {limitationCount > 0 ? (
          <Badge variant="outline" className="ml-auto">
            {limitationCount} limite{limitationCount > 1 ? "s" : ""}
          </Badge>
        ) : null}
      </summary>
      <div className="space-y-3 border-t px-3 py-3">
        {toolCalls.map((toolCall, index) => (
          <div key={`${toolCall.tool}-${index}`} className="rounded-lg bg-muted/55 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold">{toolLabels[toolCall.tool]}</p>
              <Badge variant="secondary">
                Observé {toolCall.semantics.observed.length}
              </Badge>
              <Badge variant="secondary">
                Calculé {toolCall.semantics.calculated.length}
              </Badge>
              {toolCall.semantics.inferred.length > 0 ? (
                <Badge variant="outline">
                  Interprété {toolCall.semantics.inferred.length}
                </Badge>
              ) : null}
            </div>

            {toolCall.evidence.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                {toolCall.evidence.map((evidence, evidenceIndex) => (
                  <li key={`${evidence.source}-${evidence.storeId}-${evidenceIndex}`}>
                    {evidenceDescription(evidence)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Aucune donnée correspondante n’a été trouvée.
              </p>
            )}

            {toolCall.limitations.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800 dark:text-amber-300">
                {toolCall.limitations.map((limitation) => (
                  <li key={limitation.code}>{limitation.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

const actionKindLabels: Record<
  AiActionPlan["actions"][number]["kind"],
  string
> = {
  product_priority: "Priorité produit",
  markdown_investigation: "Analyse démarque",
  space_review: "Revue espace",
  commercial_event: "Opération commerciale",
  experiment: "Test terrain",
  other: "Autre action",
};

const confidenceLabels: Record<AiActionPlan["confidence"], string> = {
  low: "Confiance faible",
  medium: "Confiance moyenne",
  high: "Confiance élevée",
};

function ActionPlanCard({
  plan,
  canApprove,
  pending,
  decisionLocked,
  rationale,
  onRationaleChange,
  onDecision,
}: {
  plan: AiActionPlan;
  canApprove: boolean;
  pending: boolean;
  decisionLocked: boolean;
  rationale: string;
  onRationaleChange: (value: string) => void;
  onDecision: (decision: "approved" | "rejected") => void;
}) {
  const statusLabel =
    plan.status === "draft"
      ? "Brouillon"
      : plan.status === "approved"
        ? "Approuvé"
        : "Refusé";

  return (
    <article className="rounded-xl border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold leading-5">{plan.title}</p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            {plan.periodKey ?? "Période non fixée"} · {confidenceLabels[plan.confidence]}
          </p>
        </div>
        <Badge variant={plan.status === "draft" ? "secondary" : "outline"}>
          {statusLabel}
        </Badge>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {plan.objective}
      </p>
      <ol className="mt-3 space-y-2">
        {plan.actions.map((action, index) => (
          <li key={action.id} className="rounded-lg bg-muted/55 p-2.5">
            <p className="text-xs font-semibold">
              {index + 1}. {action.title}
            </p>
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              {actionKindLabels[action.kind]} · {confidenceLabels[action.confidence]}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {action.rationale}
            </p>
            {action.expectedEffect ? (
              <p className="mt-1 text-xs leading-5">
                Effet attendu : {action.expectedEffect}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[0.68rem] leading-4 text-muted-foreground">
        {plan.evidence.length} preuve{plan.evidence.length > 1 ? "s" : ""} enregistrée{plan.evidence.length > 1 ? "s" : ""} · aucune exécution automatique
      </p>

      {plan.status === "draft" && canApprove ? (
        <div className="mt-3 border-t pt-3">
          <label htmlFor={`action-plan-rationale-${plan.id}`} className="text-xs font-medium">
            Motif de la décision
          </label>
          <Textarea
            id={`action-plan-rationale-${plan.id}`}
            value={rationale}
            onChange={(event) => onRationaleChange(event.target.value)}
            maxLength={1_000}
            rows={2}
            disabled={decisionLocked}
            placeholder="Expliquez votre validation ou votre refus…"
            className="mt-1.5 min-h-16 text-xs"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              disabled={decisionLocked || rationale.trim().length < 10}
              onClick={() => onDecision("approved")}
            >
              {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
              Approuver
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={decisionLocked || rationale.trim().length < 10}
              onClick={() => onDecision("rejected")}
            >
              <X aria-hidden="true" />
              Refuser
            </Button>
          </div>
        </div>
      ) : null}

      {plan.status === "draft" && !canApprove ? (
        <p className="mt-3 rounded-lg bg-muted/60 p-2 text-[0.68rem] leading-4 text-muted-foreground">
          Une personne disposant du droit d’approbation doit décider de ce brouillon.
        </p>
      ) : null}

      {plan.decision ? (
        <p className="mt-3 rounded-lg bg-muted/60 p-2 text-xs leading-5">
          {plan.decision.rationale}
        </p>
      ) : null}
    </article>
  );
}

function CopilotWorkspace({
  scope,
  storeId,
  endpoint,
  requestScope,
  initialPeriod,
  providerConfigured,
  model,
  initialActionPlans = [],
  canApprove = false,
}: CopilotWorkspaceProps) {
  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionPlans, setActionPlans] = useState(initialActionPlans);
  const [decisionPendingId, setDecisionPendingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionRationales, setDecisionRationales] = useState<Record<string, string>>({});
  const decisionKeysRef = useRef<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [messages, pending]);

  async function submitQuestion(question: string) {
    const content = question.trim();
    if (!content || pending || !providerConfigured) return;

    const userMessage = newConversationItem({ role: "user", content });
    const conversation = [...messages, userMessage];
    const apiMessages = conversation
      .map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }))
      .slice(-20);

    setMessages(conversation);
    setDraft("");
    setPending(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...requestScope,
          messages: apiMessages,
          ...(initialPeriod ? { period: initialPeriod } : {}),
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const apiError = apiErrorSchema.safeParse(payload);
        throw new Error(
          apiError.success
            ? `${apiError.data.message} · référence ${apiError.data.requestId}`
            : "Le Copilote n’a pas pu répondre",
        );
      }

      if (scope === "store") {
        const result = storeCopilotResponseSchema.parse(payload);
        if (result.actionPlan) {
          const newActionPlan = result.actionPlan;
          setActionPlans((current) => [
            newActionPlan,
            ...current.filter((plan) => plan.id !== newActionPlan.id),
          ]);
        }
        setMessages((current) => [
          ...current,
          newConversationItem({
            role: "assistant",
            content: result.answer,
            toolCalls: result.toolCalls,
            model: result.model,
          }),
        ]);
      } else {
        const result = networkCopilotResponseSchema.parse(payload);
        setMessages((current) => [
          ...current,
          newConversationItem({
            role: "assistant",
            content: result.answer,
            toolCalls: result.toolCalls,
            model: result.model,
          }),
        ]);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le Copilote n’a pas pu répondre",
      );
    } finally {
      setPending(false);
    }
  }

  async function decideActionPlan(
    plan: AiActionPlan,
    decision: "approved" | "rejected",
  ) {
    const rationale = decisionRationales[plan.id]?.trim() ?? "";
    if (!storeId || rationale.length < 10 || decisionPendingId) return;

    const decisionKey = `${plan.id}:${decision}`;
    const idempotencyKey =
      decisionKeysRef.current[decisionKey] ?? crypto.randomUUID();
    decisionKeysRef.current[decisionKey] = idempotencyKey;
    setDecisionPendingId(plan.id);
    setDecisionError(null);
    try {
      const response = await fetch(
        `/api/stores/${storeId}/ai/action-plans/${plan.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey,
            decision,
            rationale,
          }),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const apiError = apiErrorSchema.safeParse(payload);
        throw new Error(
          apiError.success
            ? `${apiError.data.message} · référence ${apiError.data.requestId}`
            : "La décision n’a pas pu être enregistrée",
        );
      }
      const result = aiActionPlanDecisionResponseSchema.parse(payload);
      delete decisionKeysRef.current[decisionKey];
      setActionPlans((current) =>
        current.map((item) =>
          item.id === result.actionPlan.id ? result.actionPlan : item,
        ),
      );
    } catch (caught) {
      setDecisionError(
        caught instanceof Error
          ? caught.message
          : "La décision n’a pas pu être enregistrée",
      );
    } finally {
      setDecisionPendingId(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitQuestion(draft);
    }
  }

  return (
    <div className="grid min-h-[calc(100svh-13rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <Card className="min-h-[38rem]">
        <CardContent className="flex min-h-[35rem] flex-1 flex-col px-0">
          <div
            className="flex-1 space-y-5 overflow-y-auto px-4 pb-4 sm:px-6"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!providerConfigured ? (
              <Alert>
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Configuration IA requise</AlertTitle>
                <AlertDescription>
                  Ajoutez la variable serveur OPENAI_API_KEY puis redémarrez l’application. La clé n’est jamais envoyée au navigateur.
                </AlertDescription>
              </Alert>
            ) : null}

            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center sm:py-16">
                <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles aria-hidden="true" className="size-7" />
                </span>
                <h2 className="mt-5 text-xl font-semibold">
                  Que voulez-vous comprendre ?
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {scope === "store"
                    ? "Le Copilote interroge uniquement les données autorisées de ce magasin et joint les preuves utilisées à chaque réponse."
                    : "Le Copilote compare uniquement l’ensemble de magasins préautorisé et joint les preuves utilisées à chaque réponse."}
                </p>
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  {(scope === "store"
                    ? storeSuggestedQuestions
                    : networkSuggestedQuestions
                  ).map((question) => (
                      <button
                        key={question}
                        type="button"
                        disabled={!providerConfigured || pending}
                        onClick={() => void submitQuestion(question)}
                        className="rounded-xl border bg-background p-3 text-left text-sm leading-5 transition-colors hover:border-primary/35 hover:bg-primary/[0.035] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {question}
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" && "justify-end",
                  )}
                >
                  {message.role === "assistant" ? (
                    <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Bot aria-hidden="true" className="size-4" />
                    </span>
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[78%]",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-muted/45",
                    )}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {message.content}
                    </p>
                    {message.toolCalls && message.toolCalls.length > 0 ? (
                      <EvidencePanel toolCalls={message.toolCalls} />
                    ) : null}
                    {message.role === "assistant" && message.model ? (
                      <p className="mt-2 text-[0.68rem] text-muted-foreground">
                        Modèle {message.model} · analyse fondée sur les outils autorisés
                      </p>
                    ) : null}
                  </div>
                  {message.role === "user" ? (
                    <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <UserRound aria-hidden="true" className="size-4" />
                    </span>
                  ) : null}
                </article>
              ))
            )}

            {pending ? (
              <div
                className="flex items-center gap-3 text-sm text-muted-foreground"
                role="status"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                </span>
                Analyse des données autorisées…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="border-t px-4 pt-4 sm:px-6">
            {error ? (
              <Alert variant="destructive" className="mb-3">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Réponse indisponible</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <label htmlFor="copilot-question" className="sr-only">
                Question au Copilote
              </label>
              <Textarea
                id="copilot-question"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={4_000}
                rows={2}
                disabled={!providerConfigured || pending}
                placeholder="Demandez une analyse du magasin…"
                className="max-h-40 min-h-12 resize-none"
              />
              <Button
                type="submit"
                size="icon-lg"
                disabled={!draft.trim() || !providerConfigured || pending}
                aria-label="Envoyer la question"
              >
                {pending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Send aria-hidden="true" />
                )}
              </Button>
            </form>
            <p className="py-3 text-center text-[0.68rem] leading-4 text-muted-foreground">
              Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne
            </p>
          </div>
        </CardContent>
      </Card>

      <aside className="space-y-4" aria-label="Cadre du Copilote">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              Périmètre protégé
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {scope === "store"
                ? "Le magasin est fixé par le serveur. Une question ne peut ni changer ce périmètre ni ouvrir un autre magasin."
                : "L’ensemble exact des magasins est réautorisé par le serveur. Une question ne peut pas étendre ce périmètre."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <BookOpenCheck aria-hidden="true" className="size-4 text-primary" />
              {scope === "store" ? "Brouillons contrôlés" : "Lecture seule"}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {scope === "store"
                ? "Le Copilote peut enregistrer un plan en brouillon, mais ne modifie ni espace, ni TG, ni stock. Une approbation séparée reste managériale."
                : "Le Copilote explique les faits et recommandations, mais ne modifie ni espace, ni TG, ni décision."}
            </p>
          </CardContent>
        </Card>
        {scope === "store" ? (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 font-semibold">
                <ClipboardList aria-hidden="true" className="size-4 text-primary" />
                Plans d’action
              </div>
              {decisionError ? (
                <Alert variant="destructive">
                  <TriangleAlert aria-hidden="true" />
                  <AlertTitle>Décision non enregistrée</AlertTitle>
                  <AlertDescription>{decisionError}</AlertDescription>
                </Alert>
              ) : null}
              {actionPlans.length === 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Demandez explicitement au Copilote de préparer un plan. Il apparaîtra ici comme brouillon à contrôler.
                </p>
              ) : (
                <div className="space-y-3">
                  {actionPlans.map((plan) => (
                    <ActionPlanCard
                      key={plan.id}
                      plan={plan}
                      canApprove={canApprove}
                      pending={decisionPendingId === plan.id}
                      decisionLocked={decisionPendingId !== null}
                      rationale={decisionRationales[plan.id] ?? ""}
                      onRationaleChange={(value) =>
                        setDecisionRationales((current) => ({
                          ...current,
                          [plan.id]: value,
                        }))
                      }
                      onDecision={(decision) =>
                        void decideActionPlan(plan, decision)
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
        <div className="rounded-xl border border-dashed px-4 py-3 text-xs leading-5 text-muted-foreground">
          {initialPeriod ? `Période active : ${initialPeriod}` : "Dernière période disponible"}
          <br />
          Modèle configuré : {model}
        </div>
      </aside>
    </div>
  );
}

export function StoreCopilot({
  storeId,
  initialPeriod,
  providerConfigured,
  model,
  initialActionPlans,
  canApprove,
}: StoreCopilotProps) {
  return (
    <CopilotWorkspace
      scope="store"
      storeId={storeId}
      endpoint={`/api/stores/${storeId}/ai/chat`}
      requestScope={{}}
      initialPeriod={initialPeriod}
      providerConfigured={providerConfigured}
      model={model}
      initialActionPlans={initialActionPlans}
      canApprove={canApprove}
    />
  );
}

export function NetworkCopilot({
  storeIds,
  initialPeriod,
  providerConfigured,
  model,
}: NetworkCopilotProps) {
  return (
    <CopilotWorkspace
      scope="network"
      endpoint="/api/network/ai/chat"
      requestScope={{ storeIds }}
      initialPeriod={initialPeriod}
      providerConfigured={providerConfigured}
      model={model}
    />
  );
}
