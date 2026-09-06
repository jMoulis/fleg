import "server-only";

import { createHash } from "node:crypto";

import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type {
  FunctionTool,
  ResponseInput,
} from "openai/resources/responses/responses";
import * as z from "zod";

import {
  STORE_COPILOT_PROMPT_VERSION,
  copilotModelFunctionCallSchema,
  networkCopilotRequestSchema,
  orchestrateNetworkCopilot,
  orchestrateStoreCopilot,
  storeCopilotReadToolNames,
  storeCopilotRequestSchema,
  storeCopilotToolRequestSchema,
  type CopilotModelRequest,
  type CopilotModelTurn,
} from "@/domain/ai/copilot";
import { buildAuthorizedAiNetworkScope } from "@/domain/ai/authorization";
import { createDraftActionPlanToolDefinition } from "@/domain/ai/action-plans";
import { aiReadToolDefinitions } from "@/domain/ai/tools";
import { NetworkStoreSetError } from "@/domain/network/store-scope";
import type { AuthorizedStoreContext } from "@/domain/stores/schemas";
import { getCopilotEnv, type CopilotEnv } from "@/server/env";
import {
  executeNetworkAiReadTool,
  executeStoreAiReadTool,
} from "@/server/services/ai-read-tool-service";
import { createAiActionPlanDraft } from "@/server/services/ai-action-plan-service";

export class CopilotConfigurationError extends Error {
  constructor() {
    super("Le fournisseur IA du Copilote n’est pas configuré");
    this.name = "CopilotConfigurationError";
  }
}

export class CopilotProviderResponseError extends Error {
  constructor(status: string, reason?: string) {
    super(
      `Le fournisseur IA a renvoyé une réponse ${status}${reason ? ` (${reason})` : ""}`,
    );
    this.name = "CopilotProviderResponseError";
  }
}

function toJsonSchema(inputSchema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(inputSchema, {
    target: "draft-7",
    unrepresentable: "any",
  });
}

function buildStoreTools(): FunctionTool[] {
  const readTools: FunctionTool[] = storeCopilotReadToolNames.map((name) => {
    const definition = aiReadToolDefinitions[name];
    return {
      type: "function",
      name,
      description: definition.description,
      parameters: toJsonSchema(definition.inputSchema),
      strict: false,
    };
  });
  return [
    ...readTools,
    {
      type: "function",
      name: "createDraftActionPlan",
      description: createDraftActionPlanToolDefinition.description,
      parameters: toJsonSchema(createDraftActionPlanToolDefinition.inputSchema),
      strict: false,
    },
  ];
}

function buildNetworkTools(): FunctionTool[] {
  const definition = aiReadToolDefinitions.compareAuthorizedStores;
  return [
    {
      type: "function",
      name: "compareAuthorizedStores",
      description: definition.description,
      parameters: toJsonSchema(definition.inputSchema),
      strict: false,
    },
  ];
}

function buildSafetyIdentifier(context: AuthorizedStoreContext): string {
  return createHash("sha256")
    .update(`${context.organizationId}:${context.userId}`)
    .digest("hex");
}

function createOpenAiTurnFactory(input: {
  client: OpenAI;
  model: string;
  tools: FunctionTool[];
  reasoningEffort: CopilotEnv["OPENAI_REASONING_EFFORT"];
}) {
  return async function createModelTurn(
    request: CopilotModelRequest,
  ): Promise<CopilotModelTurn> {
    const response = await input.client.responses.create({
      model: input.model,
      instructions: request.instructions,
      input: request.input as ResponseInput,
      tools: input.tools,
      tool_choice: request.toolChoice,
      parallel_tool_calls: false,
      max_output_tokens: request.maxOutputTokens,
      reasoning: { effort: input.reasoningEffort },
      safety_identifier: request.safetyIdentifier,
      include: ["reasoning.encrypted_content"],
      store: false,
    });

    if (response.status !== "completed") {
      throw new CopilotProviderResponseError(
        response.status ?? "sans statut",
        response.incomplete_details?.reason,
      );
    }

    const functionCalls = response.output.flatMap((item) => {
      if (item.type !== "function_call") return [];
      const call = copilotModelFunctionCallSchema.parse(item);
      return [
        {
          callId: call.call_id,
          name: call.name,
          arguments: call.arguments,
        },
      ];
    });

    return {
      outputText: response.output_text,
      continuationItems: toResponseInputItems(response.output),
      functionCalls,
    };
  };
}

export async function runStoreCopilot(input: {
  context: AuthorizedStoreContext;
  request: unknown;
  requestId: string;
}) {
  const request = storeCopilotRequestSchema.parse(input.request);
  const environment = getCopilotEnv();
  if (!environment.OPENAI_API_KEY) {
    throw new CopilotConfigurationError();
  }

  const client = new OpenAI({
    apiKey: environment.OPENAI_API_KEY,
    maxRetries: 1,
    timeout: environment.OPENAI_TIMEOUT_MS,
  });
  const createModelTurn = createOpenAiTurnFactory({
    client,
    model: environment.OPENAI_MODEL,
    tools: buildStoreTools(),
    reasoningEffort: environment.OPENAI_REASONING_EFFORT,
  });

  return orchestrateStoreCopilot({
    request,
    model: environment.OPENAI_MODEL,
    maxOutputTokens: environment.OPENAI_MAX_OUTPUT_TOKENS,
    maxToolRounds: environment.OPENAI_MAX_TOOL_ROUNDS,
    safetyIdentifier: buildSafetyIdentifier(input.context),
    createModelTurn,
    executeTool: async (rawRequest, execution) => {
      const toolRequest = storeCopilotToolRequestSchema.parse(rawRequest);
      if (toolRequest.tool === "createDraftActionPlan") {
        return createAiActionPlanDraft({
          context: input.context,
          draft: toolRequest.input,
          groundingResults: execution.groundingResults,
          sourceQuestion: request.messages.at(-1)!.content,
          model: environment.OPENAI_MODEL,
          promptVersion: STORE_COPILOT_PROMPT_VERSION,
          idempotencyKey: createHash("sha256")
            .update(`${input.requestId}:${execution.callId}`)
            .digest("hex"),
          requestId: input.requestId,
        });
      }
      return executeStoreAiReadTool({
        context: input.context,
        request: toolRequest,
      });
    },
  });
}

export async function runNetworkCopilot(input: {
  contexts: AuthorizedStoreContext[];
  request: unknown;
}) {
  const request = networkCopilotRequestSchema.parse(input.request);
  const scope = buildAuthorizedAiNetworkScope(input.contexts);
  const requestedStoreIds = [...request.storeIds].sort();
  if (
    requestedStoreIds.length !== scope.storeIds.length ||
    requestedStoreIds.some((storeId, index) => storeId !== scope.storeIds[index])
  ) {
    throw new NetworkStoreSetError();
  }

  const environment = getCopilotEnv();
  if (!environment.OPENAI_API_KEY) {
    throw new CopilotConfigurationError();
  }

  const client = new OpenAI({
    apiKey: environment.OPENAI_API_KEY,
    maxRetries: 1,
    timeout: environment.OPENAI_TIMEOUT_MS,
  });
  const createModelTurn = createOpenAiTurnFactory({
    client,
    model: environment.OPENAI_MODEL,
    tools: buildNetworkTools(),
    reasoningEffort: environment.OPENAI_REASONING_EFFORT,
  });

  return orchestrateNetworkCopilot({
    request,
    model: environment.OPENAI_MODEL,
    maxOutputTokens: environment.OPENAI_MAX_OUTPUT_TOKENS,
    maxToolRounds: environment.OPENAI_MAX_TOOL_ROUNDS,
    safetyIdentifier: buildSafetyIdentifier(input.contexts[0]!),
    createModelTurn,
    executeTool: (toolRequest) =>
      executeNetworkAiReadTool({
        contexts: input.contexts,
        request: toolRequest,
      }),
  });
}
