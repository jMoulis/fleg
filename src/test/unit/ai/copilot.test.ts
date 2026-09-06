import { describe, expect, it, vi } from "vitest";

import {
  CopilotToolLoopError,
  buildNetworkCopilotInstructions,
  buildStoreCopilotInstructions,
  networkCopilotRequestSchema,
  orchestrateNetworkCopilot,
  orchestrateStoreCopilot,
  storeCopilotReadToolNames,
  storeCopilotRequestSchema,
} from "@/domain/ai/copilot";
import {
  compareAuthorizedStoresResultSchema,
  getStoreKpisResultSchema,
} from "@/domain/ai/tools";
import { createDraftActionPlanResultSchema } from "@/domain/ai/action-plans";

const emptyKpisResult = getStoreKpisResultSchema.parse({
  tool: "getStoreKpis",
  readOnly: true,
  storeIds: ["66d000000000000000000001"],
  evidence: [],
  semantics: {
    observed: ["data.revenueCents"],
    calculated: ["data.marginRatio"],
    inferred: [],
  },
  limitations: [
    {
      code: "NO_DATA",
      message: "Aucune donnée disponible.",
    },
  ],
  data: null,
});

const emptyNetworkResult = compareAuthorizedStoresResultSchema.parse({
  tool: "compareAuthorizedStores",
  readOnly: true,
  storeIds: ["66d000000000000000000001"],
  evidence: [],
  semantics: {
    observed: ["data.stores[].revenueCents"],
    calculated: ["data.stores[].normalizedRank"],
    inferred: [],
  },
  limitations: [
    {
      code: "SINGLE_STORE_COMPARISON",
      message: "Une comparaison réseau nécessite au moins deux magasins.",
    },
  ],
  data: null,
});

describe("store Copilot contract", () => {
  it("rejects tenant identifiers and requires a final user message", () => {
    expect(
      storeCopilotRequestSchema.safeParse({
        storeId: "66d000000000000000000001",
        messages: [{ role: "user", content: "Analyse la marge" }],
      }).success,
    ).toBe(false);
    expect(
      storeCopilotRequestSchema.safeParse({
        messages: [{ role: "assistant", content: "Réponse précédente" }],
      }).success,
    ).toBe(false);
    expect(
      storeCopilotRequestSchema.safeParse({
        messages: [{ role: "user", content: "Prépare un plan" }],
        intent: "execute_actions",
      }).success,
    ).toBe(false);
  });

  it("makes the read-only and evidence boundaries explicit in the prompt", () => {
    const prompt = buildStoreCopilotInstructions("2026-08");

    expect(prompt).toContain("2026-08");
    expect(prompt).toContain("outils de lecture");
    expect(prompt).toContain("N’invente aucun chiffre");
    expect(prompt).toContain("ne peux rien appliquer");
    expect(prompt).toContain("comparaison entre magasins");

    const draftPrompt = buildStoreCopilotInstructions(
      "2026-08",
      "draft_action_plan",
    );
    expect(draftPrompt).toContain("sans demander une confirmation supplémentaire");
  });

  it("executes a typed tool call and returns its visible evidence trace", async () => {
    const createModelTurn = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: "",
        continuationItems: [
          {
            type: "function_call",
            call_id: "call-1",
            name: "getStoreKpis",
            arguments: "{}",
          },
        ],
        functionCalls: [
          {
            callId: "call-1",
            name: "getStoreKpis",
            arguments: "{}",
          },
        ],
      })
      .mockResolvedValueOnce({
        outputText: "Aucune donnée n’est disponible sur la période.",
        continuationItems: [],
        functionCalls: [],
      });
    const executeTool = vi.fn().mockResolvedValue(emptyKpisResult);

    const result = await orchestrateStoreCopilot({
      request: {
        messages: [{ role: "user", content: "Quel est le chiffre d’affaires ?" }],
        period: "2026-08",
      },
      model: "model-test",
      maxOutputTokens: 500,
      maxToolRounds: 2,
      safetyIdentifier: "anonymous-hash",
      createModelTurn,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith(
      {
        tool: "getStoreKpis",
        input: {},
      },
      { callId: "call-1", groundingResults: [] },
    );
    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        tool: "getStoreKpis",
        limitations: [expect.objectContaining({ code: "NO_DATA" })],
      }),
    ]);
    expect(result.answer).toContain("Aucune donnée");
    expect(createModelTurn.mock.calls[1]?.[0].input).toContainEqual(
      expect.objectContaining({
        type: "function_call_output",
        call_id: "call-1",
      }),
    );
  });

  it("stops a model that keeps requesting tools", async () => {
    const createModelTurn = vi.fn().mockResolvedValue({
      outputText: "",
      continuationItems: [],
      functionCalls: [
        {
          callId: "call-loop",
          name: "getStoreKpis",
          arguments: "{}",
        },
      ],
    });

    await expect(
      orchestrateStoreCopilot({
        request: {
          messages: [{ role: "user", content: "Continue sans fin" }],
        },
        model: "model-test",
        maxOutputTokens: 500,
        maxToolRounds: 1,
        safetyIdentifier: "anonymous-hash",
        createModelTurn,
        executeTool: vi.fn().mockResolvedValue(emptyKpisResult),
      }),
    ).rejects.toBeInstanceOf(CopilotToolLoopError);
    expect(createModelTurn.mock.calls[0]?.[0].toolChoice).toEqual({
      type: "allowed_tools",
      mode: "required",
      tools: storeCopilotReadToolNames.map((name) => ({
        type: "function",
        name,
      })),
    });
    expect(createModelTurn.mock.calls[1]?.[0].toolChoice).toBe("none");
  });

  it("forces a final synthesis from collected evidence at the round limit", async () => {
    const createModelTurn = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: "",
        continuationItems: [
          {
            type: "function_call",
            call_id: "call-final",
            name: "getStoreKpis",
            arguments: "{}",
          },
        ],
        functionCalls: [
          {
            callId: "call-final",
            name: "getStoreKpis",
            arguments: "{}",
          },
        ],
      })
      .mockResolvedValueOnce({
        outputText: "Voici la synthèse fondée sur les indicateurs disponibles.",
        continuationItems: [],
        functionCalls: [],
      });

    const result = await orchestrateStoreCopilot({
      request: {
        messages: [{ role: "user", content: "Analyse la performance" }],
      },
      model: "model-test",
      maxOutputTokens: 500,
      maxToolRounds: 1,
      safetyIdentifier: "anonymous-hash",
      createModelTurn,
      executeTool: vi.fn().mockResolvedValue(emptyKpisResult),
    });

    expect(createModelTurn.mock.calls[0]?.[0].toolChoice).toEqual({
      type: "allowed_tools",
      mode: "required",
      tools: storeCopilotReadToolNames.map((name) => ({
        type: "function",
        name,
      })),
    });
    expect(createModelTurn.mock.calls[1]?.[0].toolChoice).toBe("none");
    expect(result.answer).toContain("synthèse");
    expect(result.toolCalls).toHaveLength(1);
  });

  it("creates at most a non-executed draft after grounded read tools", async () => {
    const groundedKpis = getStoreKpisResultSchema.parse({
      ...emptyKpisResult,
      evidence: [
        {
          source: "salesFacts",
          storeId: "66d000000000000000000001",
          periodKeys: ["2026-08"],
          recordCount: 12,
          dataRevision: 3,
          calculationVersion: "analytics-v1",
        },
      ],
    });
    const actionPlanResult = createDraftActionPlanResultSchema.parse({
      tool: "createDraftActionPlan",
      readOnly: false,
      storeIds: ["66d000000000000000000001"],
      evidence: groundedKpis.evidence,
      semantics: groundedKpis.semantics,
      limitations: [],
      data: {
        id: "66d000000000000000000099",
        organizationId: "org-a",
        storeId: "66d000000000000000000001",
        title: "Priorités septembre",
        objective: "Concentrer les actions sur les signaux disponibles.",
        periodKey: "2026-08",
        confidence: "medium",
        actions: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            kind: "product_priority",
            title: "Revoir les produits prioritaires",
            rationale: "Les métriques observées justifient une revue ciblée.",
            expectedEffect: "Confirmer les priorités avant mise en œuvre.",
            confidence: "medium",
          },
        ],
        status: "draft",
        executionStatus: "not_executed",
        evidence: groundedKpis.evidence,
        semantics: groundedKpis.semantics,
        limitations: [],
        sourceQuestion: "Prépare un plan d’action",
        model: "model-test",
        promptVersion: "store-copilot-v4",
        createdByUserId: "manager-a",
        createdAt: "2026-09-05T10:00:00.000Z",
        updatedAt: "2026-09-05T10:00:00.000Z",
        decision: null,
      },
    });
    const createModelTurn = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: "",
        continuationItems: [],
        functionCalls: [
          { callId: "read-1", name: "getStoreKpis", arguments: "{}" },
        ],
      })
      .mockResolvedValueOnce({
        outputText: "",
        continuationItems: [],
        functionCalls: [
          {
            callId: "draft-1",
            name: "createDraftActionPlan",
            arguments: JSON.stringify({
              title: "Priorités septembre",
              objective: "Concentrer les actions sur les signaux disponibles.",
              periodKey: "2026-08",
              confidence: "medium",
              actions: [
                {
                  kind: "product_priority",
                  title: "Revoir les produits prioritaires",
                  rationale:
                    "Les métriques observées justifient une revue ciblée.",
                  expectedEffect:
                    "Confirmer les priorités avant mise en œuvre.",
                  confidence: "medium",
                },
              ],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        outputText: "Le plan a été enregistré comme brouillon.",
        continuationItems: [],
        functionCalls: [],
      });
    const executeTool = vi
      .fn()
      .mockResolvedValueOnce(groundedKpis)
      .mockResolvedValueOnce(actionPlanResult);

    const result = await orchestrateStoreCopilot({
      request: {
        messages: [{ role: "user", content: "Prépare un plan d’action" }],
        period: "2026-08",
        intent: "draft_action_plan",
      },
      model: "model-test",
      maxOutputTokens: 500,
      maxToolRounds: 3,
      safetyIdentifier: "anonymous-hash",
      createModelTurn,
      executeTool,
    });

    expect(executeTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tool: "createDraftActionPlan" }),
      {
        callId: "draft-1",
        groundingResults: [groundedKpis],
      },
    );
    expect(result.actionPlan).toMatchObject({
      status: "draft",
      executionStatus: "not_executed",
    });
    expect(result.toolCalls.map(({ tool }) => tool)).toEqual([
      "getStoreKpis",
      "createDraftActionPlan",
    ]);
    expect(createModelTurn.mock.calls[0]?.[0].toolChoice).toEqual({
      type: "function",
      name: "getStoreKpis",
    });
    expect(createModelTurn.mock.calls[1]?.[0].toolChoice).toEqual({
      type: "function",
      name: "createDraftActionPlan",
    });
    expect(createModelTurn.mock.calls[2]?.[0].toolChoice).toBe("none");
  });

  it("refuses a draft tool call when no read evidence was collected", async () => {
    const createModelTurn = vi.fn().mockResolvedValue({
      outputText: "",
      continuationItems: [],
      functionCalls: [
        {
          callId: "draft-without-proof",
          name: "createDraftActionPlan",
          arguments: "{}",
        },
      ],
    });
    const executeTool = vi.fn();

    await expect(
      orchestrateStoreCopilot({
        request: {
          messages: [{ role: "user", content: "Prépare un plan d’action" }],
        },
        model: "model-test",
        maxOutputTokens: 500,
        maxToolRounds: 1,
        safetyIdentifier: "anonymous-hash",
        createModelTurn,
        executeTool,
      }),
    ).rejects.toBeInstanceOf(CopilotToolLoopError);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("keeps the exact network store set outside model-controlled inputs", async () => {
    const storeIds = [
      "66d000000000000000000001",
      "66d000000000000000000002",
    ];
    expect(
      networkCopilotRequestSchema.safeParse({
        storeIds: [storeIds[0], storeIds[0]],
        messages: [{ role: "user", content: "Compare les magasins" }],
      }).success,
    ).toBe(false);
    expect(buildNetworkCopilotInstructions({ storeCount: 2 })).toContain(
      "exactement 2 magasins",
    );

    const createModelTurn = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: "",
        continuationItems: [],
        functionCalls: [
          {
            callId: "call-network",
            name: "compareAuthorizedStores",
            arguments: '{"period":"2026-08"}',
          },
        ],
      })
      .mockResolvedValueOnce({
        outputText: "La comparaison est limitée par la couverture disponible.",
        continuationItems: [],
        functionCalls: [],
      });
    const executeTool = vi.fn().mockResolvedValue(emptyNetworkResult);

    const result = await orchestrateNetworkCopilot({
      request: {
        storeIds,
        messages: [{ role: "user", content: "Compare les magasins" }],
        period: "2026-08",
      },
      model: "model-test",
      maxOutputTokens: 500,
      maxToolRounds: 2,
      safetyIdentifier: "anonymous-hash",
      createModelTurn,
      executeTool,
    });

    expect(JSON.stringify(createModelTurn.mock.calls[0]?.[0].input)).not.toContain(
      storeIds[0],
    );
    expect(executeTool).toHaveBeenCalledWith({
      tool: "compareAuthorizedStores",
      input: { period: "2026-08" },
    });
    expect(result.toolCalls[0]?.tool).toBe("compareAuthorizedStores");
  });
});
