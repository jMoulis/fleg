# 03 — UX/UI

## Design language
Professional retail operations, dense but calm. Desktop-first with tablet support. shadcn/ui. Tailwind. Avoid decorative dashboards.

## App shell
Navigation magasin livrée :

Accueil / Actions / Produits / Stocks / Commande / Espace / Contexte / TG /
Tests / Démarque / Imports / Aide / Décisions / Paramètres / Copilote

Sur mobile, les entrées opérationnelles sont accessibles dans une barre
horizontale. Aide, Paramètres et Copilote sont accessibles par les actions
d'en-tête afin de conserver de la place. Décisions ne possède pas encore
d'entrée directe dans la navigation mobile. Une autre entrée peut être absente
lorsque l'utilisateur ne possède pas la permission requise.

Forecast is not a separate route in the delivered product. Monthly and daily
forecasts are presented in the product matrix, product detail and order flow.

Top bar:
Organization administration when authorized / Network when authorized / Store
selector / Current section / User

## Interaction rules
- Store and period always visible.
- Critical KPI cards link to underlying products.
- Red/green never sole meaning; use badges/text.
- Dense tables provide task-relevant search, filters and sorting.
- AI evidence opens source metric/product.
- Recommendations are decided from their product detail.
- An order override requires a reason. Destructive changes require confirmation.

## Long operational lists

Inventory uses bounded pages of 25 product cards rather than rendering the
complete product reference. Its progressive workflow follows the physical
reserve pass, shelf pass and final review; article configuration remains a
separate view. Draft actions stay reachable from the viewport and edits remain
in the full persisted draft when filters, steps or pages change.

The product matrix also uses URL-backed pages of 25 results after applying its
search, ABC/XYZ filters and sort. Its mobile cards and desktop analytical table
remain distinct responsive presentations, but neither renders the complete
filtered catalog at once. The result interval and page controls are available
above and below the list.

Order review defaults to calculated lines and separates ready, no-order,
unavailable and modified states. Search, family filters and pages of 25 evidence
cards preserve all draft quantities and reasons. The approval action remains
reachable in a persistent dock while the manager reviews the list.

## Delivered visualization approach

- Native responsive HTML/CSS for product and operational matrices.
- Native SVG/HTML for the store layout editor.
- Additional charting or grid dependencies are introduced only when a measured
  user need justifies their bundle and maintenance cost.
