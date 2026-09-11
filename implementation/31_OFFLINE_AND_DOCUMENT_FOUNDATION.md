# Offline field work and document foundation

## Decision and status

Framed on 2026-09-11. `TECH-01` now has a read-only implementation and automated
production-build acceptance; physical device acceptance remains open. See
[the delivery record](./33_TECH_01_OFFLINE_WORKSPACE.md).
`TECH-02` local drafts are merged via #30.
`TECH-03` implements opt-in synchronization for review; physical-device acceptance
remains open. See [its delivery record](./35_TECH_03_INVENTORY_SYNCHRONIZATION.md).
`TECH-04` through `TECH-06` remain planned, not delivered.
The manager reports unreliable connectivity, particularly in the cold room.
This is sufficient field evidence to prioritize resilient stock capture before
new coaching features. No Mercalys data is needed to test technical recovery
with sanitized fixtures; real commercial validation still belongs to `PILOT-01`.

Retain Next.js, Better Auth, authorized store services and the official MongoDB
driver. Candidate additions are Serwist for the application shell, IndexedDB
with Dexie for local persistence, private Vercel Blob for objects and Atlas
Vector Search for retrieval. Check installed framework guides, compatibility,
hosting availability and costs before installing or enabling a service.

The browser owns pending work; the server owns accepted business facts. A local
save, successful synchronization, stock commitment and order approval are four
different states. An offline permission snapshot never authorizes a server write.

## Execution order

1. `TECH-01` prepares an installable, explicitly downloadable field workspace.
2. `TECH-02` makes inventory drafts persist locally after each edit.
3. `TECH-03` synchronizes drafts and proves recovery and isolation on the target
   devices. Complete this before claiming that cold-room counting is supported.
4. `TECH-04` adds private object storage and recoverable uploads.
5. `TECH-05` adds durable document-processing jobs.
6. `V4-01` delivers reviewed commercial-brief extraction after its pilot and
   representative-PDF gates; `TECH-06` then makes those sources searchable.

Connected pilot observations may start when real exports return; they do not
need to wait for the document track. Record the deployed version and distinguish
connected observations from offline acceptance. Do not make the pilot depend
on the entire V4 roadmap.

## TECH-01 — installable PWA and prepared field workspace

**Priority:** P0. **Depends on:** `AUTH-02`, `UX-LIST-01`.
**Value:** open the prepared inventory workspace even when the network fails.

Scope and acceptance:

- Add a manifest, install guidance and a versioned service worker. Keep Server
  Components by default; provide an offline-capable client entry point for the
  field workflow, including cold launch and full reload after preparation.
- A first online sign-in and explicit preparation download the authorized
  store's bounded inventory catalog, profiles and count reference. Preparation
  verifies completeness, so unvisited product pages remain searchable offline.
- Display the prepared store, preparation date, data revision and readiness;
  an incomplete download never appears ready. Define bounded local retention
  and maximum offline age as configuration before rollout.
- Cache static application assets separately from scoped domain data. Do not
  blanket-cache authenticated HTML, RSC responses, authentication endpoints or
  every `/api` request. Preserve server `no-store` defaults.
- No first-time login, discovery of an unprepared store or newly generated AI
  answer is promised offline. Existing cached evidence displays its age.
- Evaluate persistence support and available storage. Quota errors and denied
  persistence show an actionable state; installability alone is not durability.
- A service-worker update never forces a reload while unsynchronized work is
  present. Version local schemas and define compatible upgrade/rollback behavior.
- Record the actual browser/device matrix for the pilot, including installed
  and browser modes. Test the production build, not only the development server.

Tests: prepared versus unprepared cold launch; partial preparation; all catalog
pages available offline; stale data; storage unavailable; app update; account
and store cache isolation. `TECH-01` does not yet claim safe offline editing.

## TECH-02 — persistent local inventory drafts

**Priority:** P0. **Depends on:** `TECH-01`, `V3-02`.
**Value:** a count survives interrupted connectivity, navigation and app closure.

Scope and acceptance:

- Store the editable draft and its pending operation atomically in IndexedDB;
  show local-save success only after the transaction completes. Do not depend
  on page-unload handlers or React memory for recovery.
- Namespace records by user, organization, store and business date. Track a
  local draft id, optional server count id, base revision and schema version.
  Support starting a local count from an already prepared catalog.
- Freeze the counted unit and pack size with each line. Blank remains uncounted;
  explicit zero remains zero. Preserve raw unfinished numeric input until it
  can be validated; restoration must not silently drop an incomplete edit.
- Preserve observation time separately from upload time, with the store's
  business date/timezone. Synchronizing tomorrow never turns today's count into
  tomorrow's stock evidence. Flag implausible device clocks for review.
- Restore filters, reserve/shelf progress and unsynchronized values after
  reload/reopen. Keep the existing bounded lists and reachable actions.
- Until `TECH-03` is delivered, offline drafts remain local and cannot be
  committed or consumed as accepted stock by the order engine. State that
  boundary in the UI and guide.
- Never overwrite a newer local draft with a stale server refresh. Persist
  errors remain visible; local storage deletion or device loss cannot be
  represented as protected by a remote backup that does not exist.

Tests: reload and browser-context restart on the same profile; partial input;
blank/zero; changed pack size; midnight; quota/write failure; stale fetch racing
with an edit; account/store separation. No business coefficients change.

## TECH-03 — reliable synchronization and cold-room acceptance

**Priority:** P0. **Depends on:** `TECH-02`.
**Value:** the counted stock reaches the server once, without losing edits or
silently combining conflicting measurements.

Scope and acceptance:

- Persist immutable operation ids and payloads before sending. Reuse the same
  id and payload after a timeout; a different payload with the same id is a
  conflict. Atomically record accepted commands and their audit/business effect.
- Process each count's operations in order. Map local ids to server ids, use
  acknowledged revisions for subsequent saves and serialize multiple tabs.
  Do not enqueue full stale snapshots that can silently replace other edits.
- Retry transient failures with bounded backoff at reconnect and app reopen,
  and provide manual retry. Treat HTTP authorization/validation failures
  separately from connectivity. Do not rely solely on `navigator.onLine` or
  Background Sync; foreground recovery is required on every supported device.
- Stop on revision conflict and present local/server differences. Neither
  adding competing counts nor last-write-wins is a safe inventory default.
  The manager resolves the conflict before a new revision is submitted.
- Reauthenticate and reauthorize each upload using Better Auth and store
  permissions. Expiry/revocation stops synchronization; never replay user A's
  queue with user B's session. Bound offline access and document that a remote
  revocation cannot immediately erase an already offline device.
- Lock pending work on sign-out/account change. Offer authorized recovery or
  explicit discard; do not silently delete drafts or expose them to the next
  user of a shared tablet. Define local expiry and discard behavior explicitly.
- Distinguish local-only, pending, syncing, synchronized, failed and conflict
  states. Remove pending work only after a durable server acknowledgement.
- Initially require online, revision-checked stock commitment and order
  approval. Locally completed work is not remotely committed; no automatic
  recalculation or supplier transmission occurs during synchronization.
- Add French user guidance and the offline pilot checklist only when delivered.

Release evidence: count representative hundreds of products in airplane mode,
close/reopen, reconnect and compare server values. Exercise an acknowledged
write whose response is lost, repeated reconnects, duplicate submissions, two
devices, session expiry, revoked membership, another store/account and an app
upgrade. Record device/browser, time saved/lost, recovery outcome and remaining
limitations. Synthetic recovery tests are not commercial pilot evidence.

## TECH-04 — private Blob objects and recoverable uploads

**Priority:** P1. **Depends on:** `PREV3-04`, `TECH-03`.
**Value:** handle commercial PDFs and field photos without storing growing
binary payloads in business collections or blocking on poor connectivity.

Scope and acceptance:

- Add an object-storage boundary with private Vercel Blob as the initial
  candidate. MongoDB retains metadata, scope, ownership, version, checksum,
  lifecycle, retention and audit records. Separate development/preview and
  production resources; document region, quotas and estimated costs.
- Authorize an upload intent before issuing a narrowly bounded client token.
  Server-select the object path; never accept an arbitrary client path as proof
  of access. Keep provider credentials server-side.
- Upload directly from the browser with progress, retry and cancellation.
  Verify completion against the intent, size, MIME/binary signature, checksum
  and authorized target. Quarantine pending/rejected documents before processing.
- Reads authorize the stored object id and exact store scope before streaming
  or issuing any bounded access grant. An unguessable public URL is not private
  storage and a pathname prefix is not an authorization check.
- Keep pending field photos locally under explicit count/size budgets and send
  them on reconnection. Large PDF offline queuing is optional and must disclose
  device limits. Resumable transport support is verified, not assumed.
- Keep existing photo limits until separately reviewed. Limit PDF bytes/pages
  and processing cost explicitly. Defer prompt/OCR processing until validation.
- Blob and MongoDB do not share a transaction: model intent, uploaded, verified
  and linked states with idempotent callbacks, reconciliation and orphan cleanup.
- Continue serving existing BSON photos during transition. A migration copies
  and verifies each object before changing its storage reference; existing
  deletion semantics, immutable target links and audit records remain intact.
- Document deletion across source files, previews, derived text/vectors and any
  temporary provider files. Invalidate retrieval immediately; retry physical
  cleanup without claiming completion until all required removals succeed.

Tests: forged scope/path/token, foreign-store content, MIME mismatch, interrupted
upload, duplicate callback, missing callback reconciliation, orphan cleanup,
legacy photo reads and deletion recovery. No new paid storage is provisioned by
this planning ticket.

## TECH-05 — durable document-processing jobs

**Priority:** P1. **Depends on:** `TECH-04`.
**Value:** complete document processing even after the browser closes or a
provider step fails.

Scope and acceptance:

- Implement a persistent job boundary. Vercel Workflows is the initial option
  to evaluate; verify runtime compatibility, pricing and operational limits.
  A long HTTP request or an untracked `waitUntil` promise is insufficient.
- Jobs reference authorized document ids and versions, not raw file contents
  in queue messages. States expose queued, running, failed, ready and cancelled.
- Checkpoint validation, extraction and optional indexing separately. Retries
  do not duplicate sources or publish partially processed versions. Freeze
  extractor/prompt/model versions, usage and sanitized errors per attempt.
- Bound size, page count, concurrent jobs, attempts and provider spend; expose
  retries and manual recovery. Deletion/cancellation prevents a late job from
  recreating source content or embeddings.
- Recheck document availability and scope when workers run and before results
  are read. Keep uploads, jobs, derived records and diagnostics tenant-scoped.
- Treat every document instruction as untrusted source text. Jobs only extract
  data; they cannot publish a TG, mutate stock, approve an order or call a supplier.
- Keep the commercial schema and review UI in `V4-01`. Demonstrate the job
  lifecycle with sanitized fixtures without marking real-source extraction done.
- Provider handling must match the deployment's approved data policy. Response
  storage settings do not by themselves describe all file retention; track and
  clean up temporary provider artifacts and document actual policy separately.

Tests: interrupted worker, transient/permanent provider failures, repeated
delivery, deploy/restart, budget exhaustion, cancellation/deletion races and
foreign-store status/result access.

## TECH-06 — cited and scoped document retrieval

**Priority:** P1. **Depends on:** `TECH-05`, `V4-01`, `AI-01`.
**Value:** let the Copilot retrieve relevant approved source passages with
verifiable citations.

Scope and acceptance:

- Evaluate Atlas Vector Search on the actual cluster before activation; retain
  the official MongoDB driver. Use a versioned embedding model/dimension and
  explicit text chunks; changing either triggers versioned reindexing.
- Preserve document version, source page, section, raw excerpt, review state,
  dates and checksum alongside embeddings. Vectorization neither validates
  extraction nor trains the language model.
- Combine exact identifier/date filters with semantic retrieval. PLU/EAN, price
  and date answers use validated structured fields, not nearest-vector matches.
- Server-inject organization and authorized-store prefilters into every search.
  Check current visibility on results too; deletion, revocation or index lag
  cannot expose inaccessible sources. Model arguments never supply tenant scope.
- Use confirmed versions for operational evidence. An authorized source-review
  view may expose unconfirmed extraction, visibly separated from confirmed data.
- Cite the authorized document/page; abstain when retrieval is insufficient.
  Retrieval similarity is not a confidence percentage or proof of correctness.
- Retain traceability after reindexing and exclude deleted/superseded sources
  according to explicit as-of rules. A historical citation grants no new access.
- Evaluate recall, wrong-edition retrieval, exact identifiers, citation accuracy,
  isolation, adversarial instructions, latency and cost using sanitized fixtures
  and an approved representative corpus before rollout.

No separate vector vendor is required by this plan. Reconsider only if measured
Atlas capability, quality, cost or isolation requirements justify the change.

## References checked during framing

Recheck versions and terms at implementation time; these links are not a promise
that every service is enabled on this deployment.

- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
  and the installed `node_modules/next/dist/docs/` guides.
- [Serwist](https://serwist.pages.dev/docs/next) and [Dexie](https://dexie.org/docs).
- [Background Sync limitations](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
  and [browser persistence/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- [Private Vercel Blob](https://vercel.com/docs/vercel-blob/private-storage),
  [direct uploads](https://vercel.com/docs/vercel-blob/client-upload) and
  [durable processing](https://vercel.com/docs/queues).
- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
  and [embeddings](https://developers.openai.com/api/docs/guides/embeddings).
- [MongoDB vector-search tenant filters](https://www.mongodb.com/docs/vector-search/deployment/multi-tenant-architecture/).
