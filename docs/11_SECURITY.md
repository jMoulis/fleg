# 11 — Security & audit

Authentication: Better Auth.

Authorization layers:
1. authenticated session,
2. organization membership,
3. store membership,
4. permission.

Permissions:
`stores.read`, `stores.manage`, `analytics.read`, `analytics.compare_stores`, `imports.create`, `imports.commit`, `targets.write`, `layouts.write`, `allocations.write`, `attachments.write`, `markdown.write`, `recommendations.approve`, `tg.publish`, `settings.write`, `ai.use`.

Every business Mongo filter includes authorized store scope.

Audit:
- memberships,
- imports,
- targets,
- layout versions,
- allocations,
- photo creation and permanent deletion,
- markdown edits,
- TG publication,
- recommendation approval/rejection,
- AI action-plan draft creation and approval/rejection,
- AI-created drafts.

Audit record: organizationId, storeId, actorId, action, entityType/id, before/after, timestamp, requestId.

## HTTP and operational safeguards

- browser responses send anti-framing, MIME sniffing, referrer and unused-feature restrictions;
- application APIs are marked `Cache-Control: no-store`;
- photo content uses a private authorized route, `Content-Type` verified from
  bytes and `X-Content-Type-Options: nosniff`;
- unexpected server failures are emitted as structured, request-correlated logs;
- known secrets and credentials are redacted before logging;
- the public readiness endpoint never exposes connection strings or exception details.

Operational runbook: `docs/18_OPERATIONS.md`.
