# 09 — Physical layout & space engine

## Known reference store
Two main islands:
- Island 1: vegetables.
- Island 2: fruits.
- Approx. 4.10m x 1.77m each from supplied sketch; dimensions MUST remain editable.
- Each island is one physical fixture composed of two main selling faces.
- Each main face contains four connected, ordered modules in the reference store.
- Each module is approximately 1.025m wide when the 4.10m face is divided equally; the module count and dimensions remain editable.
- Each module has an upper shelf 0.45m deep.
- TG1 = entrance.
- TG2 = end of Island 1.
- TG3 = end of Island 2.
- Approx TG footprint seen on plan: 1.77m x 0.83m; confirm in UI.

## Capacity concepts
Do not confuse:
- floor area,
- selling-face width,
- module width within a face,
- shelf display area,
- effective commercial capacity.

Capacity hierarchy:
`fixture -> main selling face -> ordered module -> shelf level`

For shelf:
`displayArea = width * depth`

Effective width:
`effectiveWidth = facingWidth * faceTrafficWeight * faceVisibilityWeight * shelfWeight`

Initial coefficients are manager-configurable hypotheses, not truths:
- main level default 1.00
- upper shelf default 0.80
- entrance TG default >1.00
They must be calibrated from realized data.

## Allocation objective
Maximize expected post-markdown margin subject to:
- physical capacity,
- minimum facing,
- must-stock products,
- locked allocations,
- fixture suitability,
- operational simplicity,
- traffic-product constraints.

MVP optimizer can be heuristic and explainable. Later replace with constrained optimization if useful.

## Desktop allocation planner V1
- An allocation plan is an immutable draft tied to one exact layout version.
- Allocation lines target a shelf-level identifier and reference an authorized store product.
- The server validates minimum facing and total physical width for every shelf before persistence.
- Locked lines are preserved by the heuristic proposal.
- The configurable V1 inputs are minimum facing, target products per shelf and facing adjustment increment.
- The heuristic ranks products by forecast revenue multiplied by observed margin rate when those inputs exist.
- Its model version, data period, analytics calculation version, input revision and limitations are persisted as evidence.
- Missing markdown and product-fixture suitability data are disclosed; the proposal remains a draft until explicit manager save.
- Every saved allocation version is idempotent and audited with its before/after snapshot.

## PREV3-03 constraints and economics
- Product rules are stored as a versioned, store-scoped policy set. A rule records `mustStock` and either unknown suitability or an explicit list of allowed fixture types.
- Unknown suitability is never treated as proven compatibility: the heuristic may propose it, but the limitation remains visible and frozen with the draft.
- Explicitly incompatible fixtures are rejected by the server. Locked lines and existing must-stock lines are preserved; missing must-stock products are placed first on compatible capacity or reported as invalid.
- The V2 heuristic ranks known post-markdown margin using `projected gross margin - observed markdown × markdownPenaltyWeight`.
- `markdownPenaltyWeight` defaults to `1`, is manager-configurable from `0` to `2`, and is persisted with the allocation version. Missing markdown stays `null`; theoretical margin may guide ranking but is never presented as a complete post-markdown value.
- Every allocation draft freezes the layout version, data/settings/policy revisions, product-rule snapshot, economics coverage, coefficients, evidence and limitations.

## Learning
When allocation changes, create DecisionLog. Compare pre/post normalized performance after adequate observation window. Use evidence to calibrate location weights.
