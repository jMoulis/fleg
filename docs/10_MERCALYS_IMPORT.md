# 10 — Mercalys import

## Observed columns
- Libellé
- Année/Mois
- Quantité
- Valeur prix vente
- Val Marge
- % Marge

Monthly exports may also contain `ITM8 Prio` and `EAN Prio`. Both are optional
for backward compatibility. When present, product identity resolution tries
ITM8, then EAN, then the normalized label. Identifiers remain strings so their
leading zeroes are preserved.

## Daily export profile

The observed daily workbook uses metadata rows before the table:

- row 1 contains `PDV: <code>`;
- row 4 contains `Sélection de données : Du DD/MM/YYYY Au DD/MM/YYYY`;
- row 8 contains `ITM8 Prio`, `EAN Prio`, `Libellé`, `Quantité`,
  `Valeur prix achat`, `Valeur RCE`, `Valeur prix vente`, `Valeur TVA`,
  `Val Marge` and `% Marge`;
- the reconciled total has no product identity and is excluded;
- the `Nombre de Lignes` footer is not a business row.

For a non-detailed export covering one day, the metadata date applies to every
article row. A multi-day export without a date column per row is rejected
because it cannot create honest daily facts. The PDV code is checked against
the authorized target store; it never selects the authorization scope.

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
ITM8, EAN and the normalized label are stored as source aliases for the same
canonical product when available. Existing label-only aliases remain valid.
