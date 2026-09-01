# Repository structure

```text
src/
  app/
    (auth)/
      sign-in/
      invite/
    (app)/
      [organizationSlug]/
        layout.tsx
        network/
          page.tsx
        stores/
          [storeId]/
            layout.tsx
            dashboard/
            actions/
            products/
              page.tsx
              [productId]/page.tsx
            forecast/
            space/
            tg/
            markdown/
            imports/
            decisions/
            copilot/
            settings/
    api/
      auth/[...all]/route.ts
      stores/
      network/
  components/
    ui/                    # shadcn primitives only
    app-shell/
    mobile/
    desktop/
    charts/
    data-table/
    filters/
    product/
    space/
  domain/
    auth/
    stores/
    products/
    sales/
    imports/
    analytics/
    forecasting/
    recommendations/
    space/
    markdown/
    tg/
    decisions/
    ai/
  server/
    auth/
    db/
      mongo-client.ts
      indexes.ts
    repositories/
    services/
    jobs/
    observability/
  lib/
    money/
    dates/
    csv-xlsx/
    validation/
  test/
    fixtures/
    unit/
    integration/
    e2e/
```

## Rules
- React components never query MongoDB directly.
- Route handlers call services; services call scoped repositories.
- Calculation modules are pure whenever possible.
- Shared UI primitives contain no store/business authorization logic.
- Server Components by default; Client Components only for interaction/visualization that requires them.
- Never duplicate a domain calculation inside a chart or table component.
