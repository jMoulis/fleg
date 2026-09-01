# Authorization & active store context

## Identity model
`organizationId -> storeId -> departmentId`

Better Auth owns user/session and organization membership. Application collections own store membership.

## Server context
```ts
export type StorePermission =
  | 'stores.read'
  | 'stores.manage'
  | 'analytics.read'
  | 'analytics.compare_stores'
  | 'imports.create'
  | 'imports.commit'
  | 'targets.write'
  | 'layouts.write'
  | 'allocations.write'
  | 'markdown.write'
  | 'recommendations.approve'
  | 'tg.publish'
  | 'settings.write'
  | 'ai.use';

export interface AuthorizedStoreContext {
  userId: string;
  organizationId: string;
  storeId: string;
  role: 'organization_admin' | 'store_director' | 'department_manager' | 'employee' | 'viewer';
  permissions: StorePermission[];
}
```

## Required functions
```ts
requireSession()
requireOrganizationMembership(organizationId)
requireStoreContext(storeId, permissions?)
requireAuthorizedStoreSet(storeIds, permission)
```

## Store selector
The client may persist a preferred store for convenience, but selection is never authorization. `/api/stores` returns only stores authorized for the current user.

## Adversarial tests
- User from Org A guesses Store B id from Org B -> 404/403 without leaking existence.
- Manager Store A guesses Store B id in same organization -> denied unless membership permits.
- Viewer calls mutation -> denied.
- Network request includes unauthorized `storeIds` -> entire request rejected; never silently drop IDs.
- Changing cookie/localStorage store id cannot grant access.
