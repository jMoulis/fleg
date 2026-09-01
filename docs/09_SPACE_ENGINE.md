# 09 — Physical layout & space engine

## Known reference store
Two main islands:
- Island 1: vegetables.
- Island 2: fruits.
- Approx. 4.10m x 1.77m each from supplied sketch; dimensions MUST remain editable.
- Each island has four selling faces.
- Each face has an upper shelf 0.45m deep.
- TG1 = entrance.
- TG2 = end of Island 1.
- TG3 = end of Island 2.
- Approx TG footprint seen on plan: 1.77m x 0.83m; confirm in UI.

## Capacity concepts
Do not confuse:
- floor area,
- selling-face width,
- shelf display area,
- effective commercial capacity.

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

## Learning
When allocation changes, create DecisionLog. Compare pre/post normalized performance after adequate observation window. Use evidence to calibrate location weights.
