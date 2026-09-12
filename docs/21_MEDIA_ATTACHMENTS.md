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

`attachments` contains validated metadata. `attachmentObjects` stores the
private BSON binary under the same `_id` and tenant scope. This split prevents
list queries and audit snapshots from carrying image bytes.

Photo content has no public object URL. The authorized content route returns
`Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

TECH-04 lot 1 adds a disabled foundation; it does not change the available
photo workflow. The repository can read a verified, linked private Blob
reference without falling back to BSON, but no application route creates such
a link yet. New intent routes only reserve metadata/quotas, require explicit
configuration and never issue a token. BSON creation and deletion remain
available; a remote reference cannot be erased through the legacy delete path.
See [the TECH-04 record](../implementation/38_TECH_04_PRIVATE_OBJECT_STORAGE.md)
for the remaining transport, deletion, queue and migration gates.

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
