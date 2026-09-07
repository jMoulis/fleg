import * as z from "zod";

import { fixtureTypeSchema } from "@/domain/space/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";

const mongoIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const fixtureTypeLabels = {
  island: "Îlot",
  endcap: "Tête de gondole",
  wall: "Mur",
  bin: "Bac",
} satisfies Record<z.infer<typeof fixtureTypeSchema>, string>;
export const configurableFixtureTypes = [...fixtureTypeSchema.options];

export const productSpacePolicySchema = z
  .object({
    productId: mongoIdSchema,
    mustStock: z.boolean(),
    suitability: z.enum(["unknown", "restricted"]),
    allowedFixtureTypes: z.array(fixtureTypeSchema).max(4),
  })
  .superRefine((policy, context) => {
    if (
      new Set(policy.allowedFixtureTypes).size !==
      policy.allowedFixtureTypes.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowedFixtureTypes"],
        message: "Un type de mobilier ne peut être sélectionné qu’une fois",
      });
    }

    if (
      policy.suitability === "restricted" &&
      policy.allowedFixtureTypes.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowedFixtureTypes"],
        message: "Choisissez au moins un mobilier compatible",
      });
    }

    if (
      policy.suitability === "unknown" &&
      policy.allowedFixtureTypes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowedFixtureTypes"],
        message: "Une compatibilité inconnue ne peut pas contenir de mobilier",
      });
    }
  });
export type ProductSpacePolicy = z.infer<typeof productSpacePolicySchema>;

function addDuplicateProductIssues(
  policies: ProductSpacePolicy[],
  context: z.RefinementCtx,
) {
  const productIds = new Set<string>();

  for (const [index, policy] of policies.entries()) {
    if (productIds.has(policy.productId)) {
      context.addIssue({
        code: "custom",
        path: ["policies", index, "productId"],
        message: "Un produit ne peut avoir qu’une règle d’espace",
      });
    }
    productIds.add(policy.productId);
  }
}

export const productSpacePolicySetSchema = z
  .object({
    organizationId: z.string().min(1),
    storeId: storeIdSchema,
    revision: z.number().int().nonnegative(),
    policies: z.array(productSpacePolicySchema).max(2_000),
    updatedBy: z.string().min(1).nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .superRefine((set, context) =>
    addDuplicateProductIssues(set.policies, context),
  );
export type ProductSpacePolicySet = z.infer<
  typeof productSpacePolicySetSchema
>;

export const productSpacePolicySetUpdateInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    basedOnRevision: z.number().int().nonnegative(),
    policies: z.array(productSpacePolicySchema).max(2_000),
  })
  .superRefine((input, context) =>
    addDuplicateProductIssues(input.policies, context),
  );
export type ProductSpacePolicySetUpdateInput = z.infer<
  typeof productSpacePolicySetUpdateInputSchema
>;

export const productSpacePolicySetResponseSchema = z.object({
  policySet: productSpacePolicySetSchema,
  requestId: z.uuid(),
});
