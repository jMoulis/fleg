# UX-STOCK-01 — stock terrain, same product experience

Approved on 2026-09-11 after the user tested TECH-03 / merged PR #31.
The user explicitly chooses focused inventory UX over making every screen offline.
Physical-device acceptance remains required; PILOT-01 is not closed.

Merged via PR #32. Subsequent manager feedback confirmed that presentation alone
does not unify the two stock workflows. The planned
[UX-STOCK-02 contract](./37_UNIFIED_MORNING_INVENTORY.md) addresses that product
gap; this delivery record does not claim its implementation or device acceptance.

## Scope and invariants

- Preserve the static public `/offline` entry and its cold-launch cache boundary.
  No new authenticated HTML/RSC/API caching; no new permissions or schema migration.
- Reuse application branding, stock terminology, store/date context and visual
  components. Connected Stocks links to **Compter avec ou sans réseau**.
- A usable reference is collapsed under **Catalogue prêt**; missing/expired
  preparation remains open. Refreshing the reference does not replace a draft.
- Show reserve/shelf counting first, bounded lists, search and compact family /
  progress filters. Keep packaging editable, and missing family/unit visible.
  Existing configured family/unit and observation metadata use disclosures.
- Fixed action bar separates durable local save, remote acknowledgement and the
  still-required online stock commitment. Network detection is not proof of either.
- Preserve explicit synchronization opt-in. Keep failures/conflicts actionable,
  with links from the fixed bar to their visible explanation/resolution controls.
- Put draft deletion in **Options du comptage**, with existing confirmation and
  unknown-upload guards intact. Reference deletion remains a separate operation.
- Local **Aide et détails** contains installation/storage and business guidance;
  errors and expiry never depend on reading documentation. No unavailable offline
  destination is presented as working. Returning to connected stores is guarded
  while offline or a local write is pending/failed.

## Acceptance

- The product, prepared store and date remain identifiable on mobile and desktop.
- With a prepared, configured catalogue, the first quantity field is above the
  fixed bar on the tested mobile viewport; actions remain reachable after scrolling.
- Preparation controls, secondary article fields and destructive actions can be
  deliberately reopened. No forced scrolling, reloading or dropping pending input.
- Offline help opens without any network request; connected navigation is blocked
  offline and during failed local persistence.
- Existing local durability, partial input, packaging, expiry, identity isolation,
  lost-ACK retry, conflicting-device and server commitment tests remain required.
- Add presentation-unit tests for stale acknowledgements / saving / failures and
  E2E for the connected entry, disclosures, mobile layout, help and offline reload.
- Inspect screenshots from the actual app with a real Mercalys fixture. Browser
  emulation is not physical iOS/Android installed-PWA acceptance.

## Verification

Verified on 2026-09-11 against disposable local MongoDB (replica set, port 27131),
never Atlas business data and without live OpenAI requests:

- `STORAGE_TEST_MONGODB_URI=<local-replica-uri> npm run check`: ESLint,
  TypeScript, Knip and **342/342 tests passed** (87 test files, no skips).
- `E2E_MONGODB_URI=<local-replica-uri> npm run test:e2e`: production webpack
  build and **66 browser tests passed** on mobile-390 and desktop-1440;
  the 4 live-AI cases were intentionally skipped.
- The complete suite preserves actual browser-process restart, lost server ACK,
  conflicting-device resolution, quota denial, expired reference recovery,
  account/store isolation and connected stock commitment coverage.
- New UX acceptance checks keyboard disclosure activation, an access recheck
  held pending without expanding preparation, first-field/footer reachability,
  horizontal overflow, local help and a preserved quantity after offline reload.
- Actual-app screenshots using the Mercalys fixture were inspected at 390 px and
  1440 px. This review led to compact two-column filters and removal of a redundant
  network-check block above the count. No mock UI was used as evidence.
- `git diff --check`: passed.

Physical installed-PWA acceptance on the target iOS/Android device, with its
software keyboard and cold-room connectivity, remains open. The beta checklist
now includes these UX checks; neither TECH-03 rollout nor PILOT-01 is closed here.
