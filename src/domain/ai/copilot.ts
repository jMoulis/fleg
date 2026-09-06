import * as z from "zod";

import {
  aiActionPlanSchema,
  createDraftActionPlanToolRequestSchema,
  type AiActionPlan,
  type CreateDraftActionPlanResult,
} from "@/domain/ai/action-plans";
import {
  aiDataSemanticsSchema,
  aiEvidenceRefSchema,
  aiToolLimitationSchema,
  storeAiReadToolRequestSchema,
  type NetworkAiReadToolResult,
  type StoreAiReadToolResult,
} from "@/domain/ai/tools";
import { periodKeySchema } from "@/domain/imports/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

export const storeCopilotReadToolNames = [
  "getStoreKpis",
  "getProductMetrics",
  "getProductHistory",
  "getMarkdownDrivers",
  "getSpaceAllocations",
  "getCommercialEvents",
  "explainRecommendation",
] as const;

export const storeCopilotToolNames = [
  ...storeCopilotReadToolNames,
  "createDraftActionPlan",
] as const;

export const storeCopilotToolNameSchema = z.enum(storeCopilotToolNames);
export type StoreCopilotToolName = z.infer<
  typeof storeCopilotToolNameSchema
>;

export const copilotMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(4_000),
  })
  .strict();
export type CopilotMessage = z.infer<typeof copilotMessageSchema>;

export const storeCopilotIntentSchema = z.enum([
  "analysis",
  "draft_action_plan",
]);
export type StoreCopilotIntent = z.infer<typeof storeCopilotIntentSchema>;

export const storeCopilotRequestSchema = z
  .object({
    messages: z.array(copilotMessageSchema).min(1).max(20),
    period: periodKeySchema.optional(),
    intent: storeCopilotIntentSchema.default("analysis"),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.messages.at(-1)?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages", input.messages.length - 1, "role"],
        message: "Le dernier message doit provenir de l’utilisateur",
      });
    }
  });
export type StoreCopilotRequest = z.infer<typeof storeCopilotRequestSchema>;

export const networkCopilotRequestSchema = z
  .object({
    storeIds: z
      .array(storeIdSchema)
      .min(1)
      .max(50)
      .refine((storeIds) => new Set(storeIds).size === storeIds.length, {
        message: "Un magasin ne peut être sélectionné qu’une fois",
      }),
    messages: z.array(copilotMessageSchema).min(1).max(20),
    period: periodKeySchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.messages.at(-1)?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages", input.messages.length - 1, "role"],
        message: "Le dernier message doit provenir de l’utilisateur",
      });
    }
  });
export type NetworkCopilotRequest = z.infer<
  typeof networkCopilotRequestSchema
>;

export const copilotToolTraceSchema = z
  .object({
    tool: storeCopilotToolNameSchema,
    evidence: z.array(aiEvidenceRefSchema),
    semantics: aiDataSemanticsSchema,
    limitations: z.array(aiToolLimitationSchema),
  })
  .strict();
export type CopilotToolTrace = z.infer<typeof copilotToolTraceSchema>;

export const networkCopilotToolTraceSchema = z
  .object({
    tool: z.literal("compareAuthorizedStores"),
    evidence: z.array(aiEvidenceRefSchema),
    semantics: aiDataSemanticsSchema,
    limitations: z.array(aiToolLimitationSchema),
  })
  .strict();
export type NetworkCopilotToolTrace = z.infer<
  typeof networkCopilotToolTraceSchema
>;

export const storeCopilotResultSchema = z
  .object({
    answer: z.string().trim().min(1).max(20_000),
    model: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(100),
    toolCalls: z.array(copilotToolTraceSchema).max(8),
    actionPlan: aiActionPlanSchema.nullable(),
  })
  .strict();
export type StoreCopilotResult = z.infer<typeof storeCopilotResultSchema>;

export const storeCopilotResponseSchema = storeCopilotResultSchema.extend({
  requestId: z.uuid(),
});
export type StoreCopilotResponse = z.infer<
  typeof storeCopilotResponseSchema
>;

export const networkCopilotResultSchema = z
  .object({
    answer: z.string().trim().min(1).max(20_000),
    model: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(100),
    toolCalls: z.array(networkCopilotToolTraceSchema).max(8),
  })
  .strict();
export type NetworkCopilotResult = z.infer<typeof networkCopilotResultSchema>;

export const networkCopilotResponseSchema = networkCopilotResultSchema.extend({
  requestId: z.uuid(),
});
export type NetworkCopilotResponse = z.infer<
  typeof networkCopilotResponseSchema
>;

export const copilotModelFunctionCallSchema = z
  .object({
    type: z.literal("function_call"),
    call_id: z.string().min(1).max(200),
    name: z.string().min(1).max(100),
    arguments: z.string().max(20_000),
  })
  .passthrough();

export const STORE_COPILOT_PROMPT_VERSION = "store-copilot-v3";
export const NETWORK_COPILOT_PROMPT_VERSION = "network-copilot-v1";

export function buildStoreCopilotInstructions(
  period?: string,
  intent: StoreCopilotIntent = "analysis",
): string {
  const periodInstruction = period
    ? `La période sélectionnée dans l’interface est ${period}. Utilise-la par défaut pour les outils qui acceptent une période.`
    : "Aucune période n’est imposée par l’interface. Laisse les outils résoudre la dernière période disponible si la question ne précise rien.";
  const intentInstruction =
    intent === "draft_action_plan"
      ? "L’utilisateur a explicitement demandé la création d’un plan d’action en brouillon. Consulte les preuves nécessaires puis appelle createDraftActionPlan dans cette réponse, sans demander une confirmation supplémentaire."
      : "Ne crée un plan d’action que si la formulation de l’utilisateur le demande explicitement.";

  return [
    "Tu es le Copilote analytique F&L d’un seul magasin.",
    "Réponds en français, de façon concise, opérationnelle et compréhensible par un manager de rayon.",
    periodInstruction,
    "Le magasin et l’utilisateur autorisés sont injectés côté serveur. Ne demande jamais d’identifiant magasin et ne prétends jamais changer de périmètre.",
    "Pour toute affirmation propre au magasin, utilise les outils fournis. N’invente aucun chiffre, produit, opération commerciale, allocation ou recommandation.",
    "Distingue explicitement ce qui est observé, calculé et interprété. Associe chaque conclusion chiffrée à sa période et signale les limites retournées par les outils.",
    "Les montants reçus sont stockés en centimes mais doivent être présentés en euros. Les ratios reçus sont décimaux et doivent être présentés en pourcentage.",
    "Si les preuves sont insuffisantes, dis-le clairement et propose la donnée manquante à collecter.",
    "Tu disposes d’outils de lecture et d’un unique outil d’écriture limité, createDraftActionPlan.",
    intentInstruction,
    "N’appelle createDraftActionPlan que si l’utilisateur demande explicitement de préparer, créer ou enregistrer un plan d’action. Consulte d’abord au moins un outil de lecture pertinent et ne crée aucun plan sans preuve retournée par ces outils.",
    "Le plan créé reste un brouillon non exécuté. Tu ne peux ni l’approuver, ni le refuser, ni appliquer ses actions. Après création, indique clairement qu’une décision managériale séparée est requise.",
    "Pour toute autre demande de modification, publication ou validation, explique que tu peux analyser ou préparer un brouillon, mais que tu ne peux rien appliquer directement.",
    "Une comparaison entre magasins n’est pas disponible dans ce contexte magasin. Oriente l’utilisateur vers la vue réseau autorisée.",
    "N’affiche pas les identifiants techniques internes. Utilise les libellés métier disponibles dans les résultats.",
  ].join("\n");
}

export function buildCopilotToolTrace(
  result: StoreAiReadToolResult | CreateDraftActionPlanResult,
): CopilotToolTrace {
  return copilotToolTraceSchema.parse({
    tool: result.tool,
    evidence: result.evidence,
    semantics: result.semantics,
    limitations: result.limitations,
  });
}

export function buildNetworkCopilotInstructions(input: {
  period?: string;
  storeCount: number;
}): string {
  const periodInstruction = input.period
    ? `La période sélectionnée dans l’interface est ${input.period}. Utilise-la par défaut.`
    : "Aucune période n’est imposée par l’interface. Laisse l’outil résoudre la dernière période commune disponible.";

  return [
    `Tu es le Copilote analytique réseau F&L. Le serveur a préautorisé exactement ${input.storeCount} magasin${input.storeCount > 1 ? "s" : ""}.`,
    "Réponds en français, de façon concise, opérationnelle et compréhensible par un responsable réseau.",
    periodInstruction,
    "L’ensemble des magasins est injecté côté serveur. Ne demande jamais d’identifiant magasin et ne prétends jamais ajouter, retirer ou remplacer un magasin.",
    "Pour toute affirmation propre au réseau, utilise compareAuthorizedStores. N’invente aucun chiffre, classement ou niveau de couverture.",
    "Compare la productivité à partir du chiffre d’affaires par mètre commercial effectif lorsqu’il est disponible ; n’utilise pas le chiffre d’affaires brut seul comme classement.",
    "Distingue explicitement ce qui est observé, calculé et interprété. Associe chaque conclusion chiffrée à sa période et signale toutes les limites retournées par l’outil.",
    "Les montants reçus sont stockés en centimes mais doivent être présentés en euros. Les ratios reçus sont décimaux et doivent être présentés en pourcentage.",
    "Si un seul magasin est autorisé ou si la géométrie manque, explique précisément pourquoi la comparaison est limitée.",
    "Tu n’as que des outils de lecture. Si l’utilisateur demande une modification, une publication ou une validation, explique que tu peux analyser ou proposer une marche à suivre, mais que tu ne peux rien appliquer.",
    "N’affiche pas les identifiants techniques internes. Utilise les noms de magasins disponibles dans les résultats.",
  ].join("\n");
}

export function buildNetworkCopilotToolTrace(
  result: NetworkAiReadToolResult,
): NetworkCopilotToolTrace {
  return networkCopilotToolTraceSchema.parse({
    tool: result.tool,
    evidence: result.evidence,
    semantics: result.semantics,
    limitations: result.limitations,
  });
}

export interface CopilotModelTurn {
  outputText: string;
  continuationItems: readonly unknown[];
  functionCalls: ReadonlyArray<{
    callId: string;
    name: string;
    arguments: string;
  }>;
}

export interface CopilotModelRequest {
  input: readonly unknown[];
  instructions: string;
  maxOutputTokens: number;
  safetyIdentifier: string;
  toolChoice:
    | "auto"
    | "none"
    | { type: "function"; name: StoreCopilotToolName };
}

export class CopilotToolLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotToolLoopError";
  }
}

export const storeCopilotToolRequestSchema = z.union([
  createDraftActionPlanToolRequestSchema,
  storeAiReadToolRequestSchema,
]);

export type StoreCopilotToolExecution = {
  callId: string;
  groundingResults: readonly StoreAiReadToolResult[];
};

function parseFunctionArguments(input: string): unknown {
  try {
    const parsed: unknown = JSON.parse(input);
    return parsed;
  } catch {
    throw new CopilotToolLoopError(
      "Le modèle a produit des arguments d’outil invalides",
    );
  }
}

export async function orchestrateStoreCopilot(input: {
  request: unknown;
  model: string;
  maxOutputTokens: number;
  maxToolRounds: number;
  safetyIdentifier: string;
  createModelTurn: (request: CopilotModelRequest) => Promise<CopilotModelTurn>;
  executeTool: (
    request: unknown,
    execution: StoreCopilotToolExecution,
  ) => Promise<StoreAiReadToolResult | CreateDraftActionPlanResult>;
}): Promise<StoreCopilotResult> {
  const request = storeCopilotRequestSchema.parse(input.request);
  const instructions = buildStoreCopilotInstructions(
    request.period,
    request.intent,
  );
  const conversation: unknown[] = request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const toolCalls: CopilotToolTrace[] = [];
  const groundingResults: StoreAiReadToolResult[] = [];
  let actionPlan: AiActionPlan | null = null;

  for (let round = 0; round <= input.maxToolRounds; round += 1) {
    const hasGroundingEvidence = groundingResults.some(
      (result) => result.evidence.length > 0,
    );
    const forcedDraftToolChoice =
      request.intent === "draft_action_plan" && !actionPlan
        ? {
            type: "function" as const,
            name: hasGroundingEvidence
              ? ("createDraftActionPlan" as const)
              : ("getStoreKpis" as const),
          }
        : null;
    const turn = await input.createModelTurn({
      input: [...conversation],
      instructions,
      maxOutputTokens: input.maxOutputTokens,
      safetyIdentifier: input.safetyIdentifier,
      toolChoice:
        round === input.maxToolRounds || actionPlan
          ? "none"
          : (forcedDraftToolChoice ?? "auto"),
    });

    if (turn.functionCalls.length === 0) {
      return storeCopilotResultSchema.parse({
        answer: turn.outputText,
        model: input.model,
        promptVersion: STORE_COPILOT_PROMPT_VERSION,
        toolCalls,
        actionPlan,
      });
    }

    if (round === input.maxToolRounds) {
      throw new CopilotToolLoopError(
        "Le nombre maximal d’appels aux outils a été atteint",
      );
    }

    conversation.push(...turn.continuationItems);

    for (const call of turn.functionCalls) {
      if (toolCalls.length >= 8) {
        throw new CopilotToolLoopError(
          "Le nombre maximal d’appels aux outils a été atteint",
        );
      }

      const tool = storeCopilotToolNameSchema.safeParse(call.name);
      if (!tool.success) {
        throw new CopilotToolLoopError(
          "Le modèle a demandé un outil non autorisé",
        );
      }

      if (tool.data === "createDraftActionPlan") {
        if (actionPlan) {
          throw new CopilotToolLoopError(
            "Un seul plan d’action peut être créé par réponse",
          );
        }
        if (
          groundingResults.flatMap((result) => result.evidence).length === 0
        ) {
          throw new CopilotToolLoopError(
            "Le modèle doit consulter des preuves avant de créer un plan d’action",
          );
        }
      }

      const result = await input.executeTool(
        {
          tool: tool.data,
          input: parseFunctionArguments(call.arguments),
        },
        {
          callId: call.callId,
          groundingResults: [...groundingResults],
        },
      );
      toolCalls.push(buildCopilotToolTrace(result));
      if (result.tool === "createDraftActionPlan") {
        actionPlan = result.data;
      } else {
        groundingResults.push(result);
      }
      conversation.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(result),
      });
    }
  }

  throw new CopilotToolLoopError("Le Copilote n’a pas produit de réponse");
}

export async function orchestrateNetworkCopilot(input: {
  request: unknown;
  model: string;
  maxOutputTokens: number;
  maxToolRounds: number;
  safetyIdentifier: string;
  createModelTurn: (request: CopilotModelRequest) => Promise<CopilotModelTurn>;
  executeTool: (request: unknown) => Promise<NetworkAiReadToolResult>;
}): Promise<NetworkCopilotResult> {
  const request = networkCopilotRequestSchema.parse(input.request);
  const instructions = buildNetworkCopilotInstructions({
    period: request.period,
    storeCount: request.storeIds.length,
  });
  const conversation: unknown[] = request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const toolCalls: NetworkCopilotToolTrace[] = [];

  for (let round = 0; round <= input.maxToolRounds; round += 1) {
    const turn = await input.createModelTurn({
      input: [...conversation],
      instructions,
      maxOutputTokens: input.maxOutputTokens,
      safetyIdentifier: input.safetyIdentifier,
      toolChoice: round === input.maxToolRounds ? "none" : "auto",
    });

    if (turn.functionCalls.length === 0) {
      return networkCopilotResultSchema.parse({
        answer: turn.outputText,
        model: input.model,
        promptVersion: NETWORK_COPILOT_PROMPT_VERSION,
        toolCalls,
      });
    }

    if (round === input.maxToolRounds) {
      throw new CopilotToolLoopError(
        "Le nombre maximal d’appels aux outils a été atteint",
      );
    }

    conversation.push(...turn.continuationItems);

    for (const call of turn.functionCalls) {
      if (toolCalls.length >= 8) {
        throw new CopilotToolLoopError(
          "Le nombre maximal d’appels aux outils a été atteint",
        );
      }
      if (call.name !== "compareAuthorizedStores") {
        throw new CopilotToolLoopError(
          "Le modèle a demandé un outil non autorisé",
        );
      }

      const result = await input.executeTool({
        tool: "compareAuthorizedStores",
        input: parseFunctionArguments(call.arguments),
      });
      toolCalls.push(buildNetworkCopilotToolTrace(result));
      conversation.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(result),
      });
    }
  }

  throw new CopilotToolLoopError("Le Copilote n’a pas produit de réponse");
}
