import { z } from "zod";
import {
  inventoryCountLineSchema,
  inventoryFamilyCodeSchema,
  stockUnitSchema,
} from "@/domain/inventory/schemas";
import { prepareStockObservations } from "@/domain/inventory/calculations";
import {
  businessTimeZoneSchema,
  offlineIdentitySchema,
  type PreparedWorkspace,
} from "./schemas";

const rawNumber = z.string().max(40);
export const localCountLineSchema = z
  .object({
    productId: z.string().regex(/^[a-f\d]{24}$/i),
    label: z.string().min(1),
    familyCode: inventoryFamilyCodeSchema.nullable(),
    stockUnit: stockUnitSchema.nullable(),
    packSize: rawNumber,
    reserveCaseCount: rawNumber,
    shelfQuantity: rawNumber,
    // Null means imported reference, not an observation made on this device.
    observedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type LocalCountLine = z.infer<typeof localCountLineSchema>;

export const localViewSchema = z
  .object({
    search: z.string().max(200),
    family: z.enum(["", "3400", "3402"]),
    progress: z.enum(["all", "remaining", "complete"]),
    area: z.enum(["reserve", "shelf"]),
    page: z.number().int().min(1).max(2_000),
  })
  .strict();
export type LocalView = z.infer<typeof localViewSchema>;
export const initialLocalView: LocalView = {
  search: "",
  family: "",
  progress: "all",
  area: "reserve",
  page: 1,
};

export const localInventoryDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    owner: offlineIdentitySchema.omit({ sessionBinding: true }),
    businessDate: z.iso.date(),
    timeZone: businessTimeZoneSchema,
    storeName: z.string().min(1),
    serverCountId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .nullable(),
    baseRevision: z.number().int().nonnegative().nullable(),
    dataRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lines: z.array(localCountLineSchema).max(2_000),
    view: localViewSchema,
    status: z.literal("local_only"),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.lines.map((line) => line.productId)).size ===
      value.lines.length,
    "Articles dupliqués",
  );
export type LocalInventoryDraft = z.infer<typeof localInventoryDraftSchema>;

export const localOperationSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    draftId: z.uuid(),
    revision: z.number().int().nonnegative(),
    kind: z.enum(["start", "line"]),
    line: localCountLineSchema.nullable(),
    savedAt: z.iso.datetime(),
    status: z.literal("local_only"),
  })
  .strict();

export function draftScope(
  workspace: Pick<PreparedWorkspace, "identity" | "businessDate">,
) {
  const { userId, organizationId, storeId } = workspace.identity;
  return JSON.stringify([
    userId,
    organizationId,
    storeId,
    workspace.businessDate,
  ]);
}

export function createLocalInventoryDraft(
  workspace: PreparedWorkspace,
  now: string,
  id: string,
): LocalInventoryDraft {
  return localInventoryDraftSchema.parse({
    schemaVersion: 1,
    id,
    owner: {
      userId: workspace.identity.userId,
      organizationId: workspace.identity.organizationId,
      storeId: workspace.identity.storeId,
    },
    businessDate: workspace.businessDate,
    timeZone: workspace.timeZone,
    storeName: workspace.storeName,
    serverCountId:
      workspace.countReference?.status === "draft"
        ? workspace.countReference.id
        : null,
    baseRevision:
      workspace.countReference?.status === "draft"
        ? workspace.countReference.revision
        : null,
    dataRevision: workspace.dataRevision,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    status: "local_only",
    view: initialLocalView,
    lines: workspace.products.map((product) => {
      const line = product.countLine;
      return {
        productId: product.id,
        label: product.label,
        familyCode: line
          ? line.familyCode
          : (product.profile?.familyCode ?? null),
        stockUnit: line ? line.stockUnit : (product.profile?.stockUnit ?? null),
        packSize: String(
          (line ? line.packSize : product.profile?.lastPackSize) ?? "",
        ),
        reserveCaseCount: String(line?.reserveCaseCount ?? ""),
        shelfQuantity: String(line?.shelfQuantity ?? ""),
        observedAt: null,
      };
    }),
  });
}

function parseRaw(value: string): number | null {
  if (value.trim() === "") return null;
  // Deliberately do not coerce "1," / "-" / exponent notation into a quantity.
  if (!/^-?\d+(?:[.,]\d+)?$/.test(value.trim()))
    throw new Error("Saisie numérique incomplète ou invalide");
  return Number(value.trim().replace(",", "."));
}

export function inspectLocalLine(line: LocalCountLine) {
  try {
    const parsed = inventoryCountLineSchema.parse({
      productId: line.productId,
      familyCode: line.familyCode,
      stockUnit: line.stockUnit,
      packSize: parseRaw(line.packSize),
      reserveCaseCount: parseRaw(line.reserveCaseCount),
      shelfQuantity: parseRaw(line.shelfQuantity),
    });
    if (parsed.reserveCaseCount === null && parsed.shelfQuantity === null)
      return { state: "blank" as const, total: null, message: "Non compté" };
    const [observation] = prepareStockObservations([parsed]);
    return {
      state: "complete" as const,
      total: observation.onHandQuantity,
      message:
        observation.onHandQuantity < 0
          ? "Total négatif à vérifier"
          : "Complet localement",
    };
  } catch (error) {
    return {
      state: "incomplete" as const,
      total: null,
      message:
        error instanceof z.ZodError
          ? error.issues[0].message
          : error instanceof Error
            ? error.message
            : "Saisie à compléter",
    };
  }
}

export function businessDateAt(now: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
