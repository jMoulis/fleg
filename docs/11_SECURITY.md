# 11 — Security & audit

Authentication: Better Auth.

Authorization layers:
1. authenticated session,
2. organization membership,
3. store membership,
4. permission.

Permissions:
`stores.read`, `stores.manage`, `analytics.read`, `analytics.compare_stores`, `imports.create`, `imports.commit`, `targets.write`, `layouts.write`, `allocations.write`, `markdown.write`, `recommendations.approve`, `tg.publish`, `settings.write`, `ai.use`.

Every business Mongo filter includes authorized store scope.

Audit:
- memberships,
- imports,
- targets,
- layout versions,
- allocations,
- markdown edits,
- TG publication,
- recommendation approval/rejection,
- AI-created drafts.

Audit record: organizationId, storeId, actorId, action, entityType/id, before/after, timestamp, requestId.
