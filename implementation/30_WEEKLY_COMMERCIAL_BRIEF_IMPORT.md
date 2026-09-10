# V4-01 — Weekly commercial brief import

## Status and delivery gate

This ticket is framed but not scheduled for implementation. `PILOT-01` remains
the product gate for V4 prioritization, and implementation also requires at
least one representative original PDF. The seven photographs reviewed during
framing show one week-32 edition photographed from a screen; they are useful
domain evidence, but they do not prove that the source template is stable.

The photographs are confidential working material. They must not be copied into
the repository, test fixtures, logs or public documentation. Automated tests
must use purpose-built, sanitized fixtures.

## Problem

The weekly central document is not a simple promotion list. A single edition
mixes several business semantics:

- current-week and advance-order offers;
- sale, delivery and order-deadline dates;
- product identifiers, descriptions, origins, calibres and units;
- purchase prices, selling prices, margins and promotional mechanics;
- TG, mass-table, cross-selling and signage recommendations;
- radio, prospectus and dramatization instructions;
- commercial-policy notes and qualitative market-supply alerts.

Manual transcription is slow and can collapse distinct dates or mistake a
central recommendation for an observed store action. The application needs a
reviewable extraction boundary before any of this material can influence local
planning.

## Objective

Allow an authorized store user to upload a weekly commercial brief, review a
structured extraction with page-level provenance, resolve products, and
confirm a versioned source brief. A confirmed brief becomes planning evidence
from which the user may separately prepare TG, promotion, space or order
drafts. Confirmation never means that the store adopted or executed the
central recommendation.

## Source contract

The preferred input is the original PDF. JPEG and PNG page images are accepted
as a degraded fallback. Upload validation must inspect the binary signature,
MIME type, size and bounded page/image count rather than trusting the filename.

For PDFs, extraction uses the embedded text layer when usable and OCR only for
scanned regions. Image-only sources always expose their degraded extraction
quality. The source fingerprint, original filename, page count, extraction
method and processing version are frozen with the import.

Uploading the same source fingerprint again in the same authorized store
returns the existing import. A corrected source is a new version and never
silently overwrites the earlier evidence.

## Extracted semantics

Every candidate section keeps its raw source text, page number and optional
page region. It is classified into a bounded kind such as:

- `promotion`;
- `tg_recommendation`;
- `mass_display_recommendation`;
- `advance_order_offer`;
- `commercial_policy`;
- `market_alert`;
- `communication_campaign`;
- `other`.

The section also records the source action label when present: implant,
order, animate or information. These labels describe the central document;
they are not application commands.

Dates remain separate nullable fields:

- publication week and document coverage;
- sale start and end;
- delivery start and end;
- order deadline;
- target or anticipation week.

An extractor must not manufacture one date from another. Contradictory,
partial or ambiguous dates require review.

Product candidates preserve:

- raw label;
- PLU, EAN or Gencod when present;
- variety, calibre, category, origin, format and unit text;
- purchase price, selling-price expression and stated margin when present;
- promotional mechanics, thresholds, lot or card advantage;
- the matched canonical product, match method and match confidence.

Prices distinguish exact, starting-from and maximum/public-price expressions.
Money uses integer cents and ratios use decimals. The raw price phrase remains
available because a phrase such as “moins de 2,30 €” is not an exact price.

Product resolution follows stable identifiers before normalized labels and
uses the existing source-alias approach. Ambiguous and unmatched candidates
remain unresolved; extraction never creates or merges a canonical product
silently.

## Trust and evidence model

The uploaded document is untrusted business input. Text that tells a reader to
“order”, “implant” or change a setting is evidence contained in the source,
not an instruction to the application, model or agent. Provider-assisted
extraction receives only the bounded extraction task and must return a strict
validated structure.

Every extracted field carries:

- source page and raw excerpt;
- extraction method and model/version when applicable;
- confidence or an explicit unknown state;
- review state and reviewer correction where applicable.

Confirming extraction validates the transcription only. Adoption is a second,
explicit manager decision. Market alerts remain attributed qualitative claims;
they do not become observed availability facts or change a forecast in
`V4-01`.

## Review and downstream workflow

The responsive review presents the source page beside, or directly before, the
structured candidate. It prioritizes missing dates, conflicting values,
unresolved products and low-confidence fields. The user can correct, exclude
or confirm candidates without losing the source text.

After confirmation, the application may offer explicit downstream actions:

- prepare a TG or commercial-event draft;
- prepare promotion-context records for later store confirmation;
- attach a central recommendation to a future space scenario;
- expose the brief as evidence to a later coaching or order-review service.

Each downstream action uses its existing authorization, validation,
idempotency, lifecycle and audit boundary. Publishing a TG, recording a store
promotion, approving an allocation or approving an order remains separate.
The brief never supplies order quantities and never transmits a supplier order.

## Authorization, confidentiality and retention

- Every upload, preview, confirmation and read derives `organizationId` and
  `storeId` from the authenticated server context.
- Upload/preview use the import creation boundary; confirmation requires the
  import commit boundary. Downstream operations keep their own permissions.
- An unauthorized store id fails the complete request and cannot reveal source
  metadata, thumbnails, extracted text or product matches.
- Raw files live in private object storage behind short-lived authorized
  access; they never enter browser bundles, application logs or Git.
- Retention and permanent deletion are explicit, audited policies.
- If an external AI provider processes raw pages or extracted text, the
  deployment must explicitly allow it, provider-side response storage remains
  disabled, and the UI identifies that processing before upload.
- Logs and diagnostics contain request ids, counts and redacted error details,
  never page contents, product tables or credentials.

## Acceptance criteria

- original PDFs are preferred and validated image pages are supported with a
  visible degraded-quality warning;
- one store-scoped, fingerprinted import cannot create duplicate brief
  versions on retry;
- sections, source action labels, identifiers, commercial values and the five
  distinct date semantics are extracted through strict bounded schemas;
- every field remains traceable to a page and raw excerpt with extraction
  version, confidence and review state;
- exact, starting-from and maximum price expressions cannot be confused;
- canonical product matching prioritizes PLU/EAN/Gencod aliases and leaves
  ambiguous or unmatched products unresolved;
- extraction confirmation is distinct from adoption, publication, execution
  and observed promotion evidence;
- no import, confirmation or AI extraction can publish a TG, modify an
  allocation, change a forecast, approve an order or contact a supplier;
- market alerts remain attributed qualitative evidence and missing values stay
  unknown;
- confidential source files and text are absent from Git, public docs and
  logs, and provider processing follows the explicit deployment policy;
- unit tests cover date and price semantics, product resolution and confidence
  guards; integration tests cover idempotency and adversarial store isolation;
- responsive browser acceptance covers upload, uncertain-field correction,
  product resolution, confirmation and preparation of one non-executed draft
  using sanitized fixtures.

## Non-goals

- deriving supplier order quantities from the central document;
- automatically adopting or publishing a central recommendation;
- treating a planned promotion as observed store execution;
- analyzing fixture photos or checking planogram compliance;
- learning merchandising coefficients or external best practices;
- supplier, tablet or StoreLine integration;
- assuming that one photographed edition defines every future source layout.

## Exit and follow-up boundary

`V4-01` ends with a trusted, confirmed and traceable commercial brief plus
explicit non-executed draft handoffs. A later ticket may combine that brief
with local sales, seasonality, forecasts, stock, layout and weather to generate
alternative TG and island scenarios. Computer-vision execution checks remain a
V5 concern.
