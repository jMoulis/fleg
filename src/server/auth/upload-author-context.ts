import "server-only";
import { ObjectId, type Db, type ClientSession } from "mongodb";
import * as z from "zod";
import {
  authorizeStoreAccess,
  StoreAccessDeniedError,
} from "@/domain/stores/authorization";
import {
  storePermissionSchema,
  storeRoleSchema,
} from "@/domain/stores/schemas";

const membershipSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  role: storeRoleSchema.exclude(["organization_admin"]),
  permissions: z.array(storePermissionSchema),
  active: z.boolean(),
});
const idCandidates = (id: string) =>
  ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id];

// A callback carries no user session. Reconstruct the original author's live
// Better Auth membership AND domain store permissions, never a stored role.
export async function authorizeUploadAuthor(input: {
  db: Db;
  authDb: Db;
  organizationId: string;
  storeId: ObjectId;
  ownerId: string;
  session?: ClientSession;
}) {
  const { db, authDb, organizationId, storeId, ownerId, session } = input;
  const user = await authDb
    .collection<{ _id: string | ObjectId }>("user")
    .findOne(
      { _id: { $in: idCandidates(ownerId) } },
      { session, projection: { _id: 1 } },
    );
  const organization = await authDb
    .collection<{ _id: string | ObjectId }>("organization")
    .findOne(
      { _id: { $in: idCandidates(organizationId) } },
      { session, projection: { _id: 1 } },
    );
  const member = await authDb.collection("member").findOne(
    {
      organizationId: { $in: idCandidates(organizationId) },
      userId: { $in: idCandidates(ownerId) },
    },
    { session },
  );
  const store = await db
    .collection("stores")
    .findOne({ _id: storeId, organizationId, active: true }, { session });
  if (!user || !organization || !member || !store)
    throw new StoreAccessDeniedError();
  const organizationRole = z.string().min(1).parse(member.role);
  const rawMembership = await db
    .collection("storeMemberships")
    .findOne(
      { organizationId, storeId, userId: ownerId, active: true },
      { session },
    );
  const membership = rawMembership
    ? membershipSchema.parse(rawMembership)
    : null;
  return authorizeStoreAccess({
    userId: ownerId,
    organizationRole,
    store: { id: storeId.toHexString(), organizationId, active: true },
    membership: membership
      ? { ...membership, storeId: storeId.toHexString() }
      : null,
    requiredPermissions: ["attachments.write"],
  });
}
