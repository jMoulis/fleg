import type { LayoutVersion, StoreFixture } from "@/domain/space/schemas";

export function LayoutPlan({ layout }: { layout: LayoutVersion }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/25 p-3 sm:p-5">
      <svg
        aria-labelledby="layout-plan-title layout-plan-description"
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${layout.canvas.widthM} ${layout.canvas.depthM}`}
      >
        <title id="layout-plan-title">Aperçu du plan Fruits et Légumes</title>
        <desc id="layout-plan-description">
          Plan indicatif comprenant deux îlots et trois têtes de gondole. Les
          positions doivent être confirmées sur site.
        </desc>
        <rect
          className="fill-background stroke-border"
          height={layout.canvas.depthM}
          rx="0.15"
          strokeWidth="0.04"
          vectorEffect="non-scaling-stroke"
          width={layout.canvas.widthM}
          x="0"
          y="0"
        />
        <text
          className="fill-muted-foreground text-[0.28px] font-semibold"
          textAnchor="middle"
          x={layout.canvas.widthM / 2}
          y="0.45"
        >
          ENTRÉE MAGASIN
        </text>
        {layout.fixtures.map((fixture) => {
          const fixtureColor = {
            island: "fill-emerald-50 stroke-emerald-700 dark:fill-emerald-950",
            endcap: "fill-amber-100 stroke-amber-600 dark:fill-amber-950",
            wall: "fill-sky-100 stroke-sky-700 dark:fill-sky-950",
            bin: "fill-violet-100 stroke-violet-700 dark:fill-violet-950",
          }[fixture.type];
          return (
            <g key={fixture.id}>
              <rect
                className={fixtureColor}
                height={fixture.depthM}
                rx="0.08"
                strokeWidth="0.05"
                vectorEffect="non-scaling-stroke"
                width={fixture.widthM}
                x={fixture.position.xM}
                y={fixture.position.yM}
              />
              <IslandModuleGuides fixture={fixture} />
              <text
                className="fill-foreground text-[0.22px] font-semibold"
                textAnchor="middle"
                x={fixture.position.xM + fixture.widthM / 2}
                y={fixture.position.yM + fixture.depthM / 2}
              >
                {fixture.name.split(" - ")[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function IslandModuleGuides({ fixture }: { fixture: StoreFixture }) {
  if (fixture.type !== "island") {
    return null;
  }

  const moduleCount = fixture.faces[0]?.modules.length ?? 0;

  return (
    <g aria-hidden="true" className="pointer-events-none stroke-emerald-700/45">
      <line
        vectorEffect="non-scaling-stroke"
        strokeWidth="0.025"
        x1={fixture.position.xM + fixture.widthM / 2}
        x2={fixture.position.xM + fixture.widthM / 2}
        y1={fixture.position.yM}
        y2={fixture.position.yM + fixture.depthM}
      />
      {Array.from({ length: Math.max(0, moduleCount - 1) }, (_, index) => {
        const y =
          fixture.position.yM +
          (fixture.depthM * (index + 1)) / moduleCount;
        return (
          <line
            key={`${fixture.id}-module-guide-${index + 1}`}
            vectorEffect="non-scaling-stroke"
            strokeWidth="0.025"
            x1={fixture.position.xM}
            x2={fixture.position.xM + fixture.widthM}
            y1={y}
            y2={y}
          />
        );
      })}
    </g>
  );
}
