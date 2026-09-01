# 10 — Mercalys import

## Observed columns
- Libellé
- Année/Mois
- Quantité
- Valeur prix vente
- Val Marge
- % Marge

## Pipeline
1. Upload.
2. Parse.
3. Header mapping.
4. Normalize strings/numbers.
5. Detect period.
6. Detect aggregate/total rows.
7. Resolve aliases.
8. Preview validation.
9. User resolves unknown products if needed.
10. Commit transactionally/idempotently.
11. Increment store data revision.
12. Recompute analytics.

## Duplicate protection
Fingerprint source file + store + period. A second identical commit must not duplicate facts.

## Aggregate row issue
Provided exports contained a row labelled `6` whose CA matched the total department and would double-count facts. Build generic aggregate detection and a preview warning; do not hardcode only label `6`.

## Product aliases
Never assume label is permanent SKU identity. Mapping UI supports merge/create/ignore with audit.
