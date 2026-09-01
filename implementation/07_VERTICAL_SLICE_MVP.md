# Vertical Slice MVP

## Goal
One deployable path that turns a raw Mercalys file into an explainable manager decision.

## User flow
1. User signs in.
2. User sees only authorized stores.
3. User selects store and period.
4. User uploads Mercalys workbook.
5. Preview shows mapped columns, detected period, aggregate rows excluded and unresolved aliases.
6. User resolves aliases and commits.
7. Dashboard reconciles source totals.
8. Product Matrix displays product metrics and recommendation status.
9. Product Detail explains trend, margin, seasonality and recommendation evidence.
10. Manager accepts/modifies/rejects recommendation.
11. Decision log records exact recommendation snapshot + rationale.

## Seed validation data
Use the supplied August 2025, September 2025 and August 2026 files as fixtures. The import implementation must correctly exclude the aggregate/total row and reconcile true totals.

## MVP acceptance
- no double-counting total row
- idempotent re-import
- no unauthorized store access
- dashboard totals reconcile with committed facts
- product metrics are deterministic
- recommendation states why it was generated
- manager decision is immutable/auditable except through explicit correction flow
- mobile dashboard/product/action flows work at 390px reference width
- desktop product matrix works at 1440px reference width
