# 00 — Multi-store tenancy & Better Auth

## Identity hierarchy
`organizationId -> storeId -> departmentId`

Better Auth owns identity/session and organization membership. The application owns store membership.

### Why stores are not Better Auth organizations
A director can supervise multiple stores; cross-store benchmarks need a common parent; roles can differ per store; future regions/peer groups should not distort identity.

## Better Auth target
Use:
- Better Auth
- MongoDB adapter
- Organization plugin
- server-side session validation

Conceptual configuration:
```ts
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  database: mongodbAdapter(authDb, { client: mongoClient }),
  plugins: [organization()],
});
```
Agent must validate exact current API against installed Better Auth version.

## Domain store membership
```ts
interface StoreMembership {
  organizationId: string;
  storeId: ObjectId;
  userId: string;
  role: StoreRole;
  permissions: StorePermission[];
  active: boolean;
}
```

Roles:
- organization_admin
- store_director
- department_manager
- employee
- viewer

## Active context
Global header contains Organization selector (when relevant) and Store selector. Store selector only lists authorized stores.

A preferred store may be persisted for UX but is never an authorization source.

## Required server boundary
```ts
interface AuthorizedStoreContext {
  userId: string;
  organizationId: string;
  storeId: string;
  role: StoreRole;
  permissions: StorePermission[];
}

async function requireStoreContext(
  storeId: string,
  requiredPermissions?: StorePermission[],
): Promise<AuthorizedStoreContext>;
```

## Isolation tests
- Org A cannot read Org B.
- Store A manager cannot read Store B by guessing ID.
- Organization admin can access authorized organization stores.
- Viewer cannot mutate.
- Cross-store API rejects unauthorized store IDs.
