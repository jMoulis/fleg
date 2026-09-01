import {
  layoutVersionSchema,
  type LayoutVersion,
  type LayoutVersionCreateInput,
} from "@/domain/space/schemas";

export function buildNextLayoutVersion(input: {
  current: LayoutVersion;
  createInput: LayoutVersionCreateInput;
  id: string;
  actorUserId: string;
  createdAt: string;
}): LayoutVersion {
  const { current, createInput } = input;
  const versionNote = createInput.versionNote?.trim();

  return layoutVersionSchema.parse({
    modelVersion: 2,
    id: input.id,
    organizationId: current.organizationId,
    storeId: current.storeId,
    departmentId: current.departmentId,
    departmentKey: current.departmentKey,
    version: current.version + 1,
    name: createInput.name,
    status: "draft",
    source: "manager",
    sourceReference: null,
    geometryConfirmed: createInput.geometryConfirmed,
    canvas: createInput.canvas,
    fixtures: createInput.fixtures,
    notes: versionNote ? [...current.notes, versionNote] : current.notes,
    createdBy: input.actorUserId,
    createdAt: input.createdAt,
  });
}
