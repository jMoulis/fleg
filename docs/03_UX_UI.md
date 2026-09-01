# 03 — UX/UI

## Design language
Professional retail operations, dense but calm. Desktop-first with tablet support. shadcn/ui. Tailwind. Avoid decorative dashboards.

## App shell
Left nav:
Dashboard / Actions / Products / Forecast / Space / TG Planner / Markdown / Imports / Decisions / AI Copilot / Settings

Top bar:
Organization / Store / Period / Data freshness / Import / User

## Interaction rules
- Store and period always visible.
- Critical KPI cards link to underlying products.
- Red/green never sole meaning; use badges/text.
- Tables support saved filters.
- AI evidence opens source metric/product.
- Recommendations are actionable from drawer.
- Manager override requires optional note; destructive changes require confirmation.

## Recommended visualization libraries
- Recharts: KPI trends, Pareto, comparisons.
- AG Grid Community: product matrix.
- Native SVG/HTML for store layout editor first; consider React Flow/Konva only if interaction complexity justifies it.
