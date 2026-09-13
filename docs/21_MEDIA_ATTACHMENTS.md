# 21 — Manual photo attachments

## Scope

`PREV3-04` adds private manual photos to four explicit store-scoped targets:

- the authorized store;
- one immutable layout version;
- one fixture inside an immutable layout version;
- one commercial event.

A fixture photo includes both `layoutVersionId` and `fixtureId`. Reusing the
same fixture identifier in a later layout version therefore never moves or
relabels an earlier photo.

## Authorization

Metadata and binary reads require `stores.read`. Creation and permanent
deletion require `attachments.write`. Every repository filter contains the
authorized `organizationId` and `storeId`; a valid attachment identifier cannot
be read by substituting another store route.

## File policy

- accepted MIME types: `image/jpeg`, `image/png`, `image/webp`;
- maximum file size: 4 Mio;
- maximum count: 20 photos per target;
- retention: until explicit manual deletion;
- deletion: permanent removal of metadata and binary object;
- audit and idempotency command: retained after deletion.

The application checks both the declared MIME type and the binary signature.
Original file names are reduced to a basename, stripped of control characters
and capped at 180 characters.

## Storage and delivery

New photos use private Vercel Blob through the same upload-intent lifecycle as
Documents. `attachments` contains metadata and a verified immutable Blob
reference; no new photo bytes are written to MongoDB by the application.
Historical photos in `attachmentObjects` remain readable/deletable as BSON.
There is no implicit migration and no fallback to BSON when Blob is unavailable.

Photo content has no public object URL. The authorized content route returns
`Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

The connected library uses store-scoped upload admission, SHA-256, server-side
type/size verification, target reauthorization, atomic quota/linking and audit.
The legacy multipart POST is refused before reading its body. Old tabs must
refresh. Downloads and deletion remain available for historical records.
The public metadata exposes only the backend discriminator, never a provider
URL or token. Blob removal uses the durable source-removal route: immediate
loss of visibility, then physical cleanup. Legacy BSON deletion remains immediate.

Only an opaque recovery ID is kept in sessionStorage, scoped to user/store.
Reloading the same tab verifies the same intent; it never resends the file.
This immediate connected mode does not persist image bytes. An optional,
explicitly consented queue is now available in the same photothèque and the
existing `/offline#offline-photos` field workspace. It stores original bytes and
frozen user/organization/store/target/version metadata transactionally in the
new IndexedDB v4 `photos` table. Inventory drafts/operations/sync tables are
unchanged; auth invalidation clears disposable references, never pending bytes.

The global origin/device ceiling is 10 photos / 40 MiB, including all accounts;
only the current owner's count is visible. No automatic eviction or expiration
of pending images. Prepared targets expire at the earlier of the auth session
expiry or the existing offline maximum age (12 h by default). Same-owner
reconnection and renewed preparation unlock older pending images. The opaque
session hash is a fence, not a credential or an offline authorization grant.

Only a foreground open application resumes work. A live access check precedes
sending; all offline commands carry the expected user/session binding and the
server refuses mismatched cookies. Local transactional leases serialize tabs.
Interrupted attempts only check/replay the existing metadata reservation; no
automatic second PUT, and no multipart-resume promise. Verification retries
respect server deadlines, have a 30-second minimum backoff and stop after five
attempts. Manual verification remains available. A rejected/abandoned upload
keeps its local bytes until explicit removal; export is available beforehand.
If reception cannot be recovered, keep a copy, explicitly abandon the old
attempt, then add the file again. Linking is never inferred from a successful PUT.

Only a durable verified linked receipt, or explicit reconciled abandonment,
allows local deletion. Removing from the queue never removes a photo already
linked in the remote gallery. Migration of historical MongoDB images remains
a separate [TECH-04](../implementation/38_TECH_04_PRIVATE_OBJECT_STORAGE.md) lot.

## Interface

La cible courante et sa description restent visibles dans la photothèque.
Utiliser **Changer** pour rechercher une opération TG, un plan ou un mobilier
par son nom ou sa description. La recherche est appliquée avant des pages de 10
cibles ; seules les photos de la cible retenue sont affichées. La galerie reste
bornée par la limite serveur de 20 photos par cible.

## Product boundary

Photos are observations only. Upload, display or deletion never changes layout
geometry, fixture dimensions, allocation inputs or commercial-event status.
Computer-vision interpretation remains a later V5 capability and must not
silently overwrite manager-owned data.
