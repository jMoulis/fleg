import {
  baselineAggregateSchema,
  experimentBaselineSchema,
  type BaselineAggregate,
  type BaselineSalesFact,
  type ExperimentBaseline,
} from "@/domain/experiments/baseline";

export interface ControlStoreBaselineInput {
  storeId: string;
  storeName: string;
  dataRevision: number;
  requestedProductCount: number;
  matchedProductIds: string[];
  facts: BaselineSalesFact[];
}

function roundedQuantity(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function aggregateFacts(input: {
  facts: BaselineSalesFact[];
  periodKeys: string[];
  productIds: string[];
}): BaselineAggregate {
  const periods = new Set(input.periodKeys);
  const products = new Set(input.productIds);

  return baselineAggregateSchema.parse(
    input.facts.reduce<BaselineAggregate>(
      (aggregate, fact) => {
        if (!periods.has(fact.periodKey)) return aggregate;
        aggregate.departmentRevenueCents += fact.revenueCents;
        if (products.has(fact.productId)) {
          aggregate.revenueCents += fact.revenueCents;
          aggregate.marginCents += fact.marginCents;
          aggregate.quantity += fact.quantity;
        }
        return aggregate;
      },
      {
        revenueCents: 0,
        marginCents: 0,
        quantity: 0,
        departmentRevenueCents: 0,
      },
    ),
  );
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function centralValue(
  values: number[],
  aggregation: "mean" | "median",
): number {
  return aggregation === "median" ? median(values) : mean(values);
}

function centralAggregate(
  values: BaselineAggregate[],
  aggregation: "mean" | "median",
): BaselineAggregate {
  return baselineAggregateSchema.parse({
    revenueCents: Math.round(
      centralValue(values.map(({ revenueCents }) => revenueCents), aggregation),
    ),
    marginCents: Math.round(
      centralValue(values.map(({ marginCents }) => marginCents), aggregation),
    ),
    quantity: roundedQuantity(
      centralValue(values.map(({ quantity }) => quantity), aggregation),
    ),
    departmentRevenueCents: Math.round(
      centralValue(
        values.map(({ departmentRevenueCents }) => departmentRevenueCents),
        aggregation,
      ),
    ),
  });
}

function subtract(
  left: BaselineAggregate,
  right: BaselineAggregate,
): BaselineAggregate {
  return baselineAggregateSchema.parse({
    revenueCents: left.revenueCents - right.revenueCents,
    marginCents: left.marginCents - right.marginCents,
    quantity: roundedQuantity(left.quantity - right.quantity),
    departmentRevenueCents:
      left.departmentRevenueCents - right.departmentRevenueCents,
  });
}

function add(
  left: BaselineAggregate,
  right: BaselineAggregate,
): BaselineAggregate {
  return baselineAggregateSchema.parse({
    revenueCents: left.revenueCents + right.revenueCents,
    marginCents: left.marginCents + right.marginCents,
    quantity: roundedQuantity(left.quantity + right.quantity),
    departmentRevenueCents:
      left.departmentRevenueCents + right.departmentRevenueCents,
  });
}

function applyControlGrowth(input: {
  treatmentBefore: BaselineAggregate;
  controlBefore: BaselineAggregate;
  controlAfter: BaselineAggregate;
}): BaselineAggregate | null {
  if (
    input.controlBefore.revenueCents === 0 ||
    input.controlBefore.marginCents === 0 ||
    input.controlBefore.quantity === 0 ||
    input.controlBefore.departmentRevenueCents === 0
  ) {
    return null;
  }

  return baselineAggregateSchema.parse({
    revenueCents: Math.round(
      input.treatmentBefore.revenueCents *
        (input.controlAfter.revenueCents /
          input.controlBefore.revenueCents),
    ),
    marginCents: Math.round(
      input.treatmentBefore.marginCents *
        (input.controlAfter.marginCents / input.controlBefore.marginCents),
    ),
    quantity: roundedQuantity(
      input.treatmentBefore.quantity *
        (input.controlAfter.quantity / input.controlBefore.quantity),
    ),
    departmentRevenueCents: Math.round(
      input.treatmentBefore.departmentRevenueCents *
        (input.controlAfter.departmentRevenueCents /
          input.controlBefore.departmentRevenueCents),
    ),
  });
}

function relativeComparisonEligible(
  expected: BaselineAggregate | null,
  baseline: ExperimentBaseline,
) {
  if (!expected) {
    return { revenue: false, grossMargin: false, quantity: false };
  }

  return {
    revenue:
      Math.abs(expected.revenueCents) >=
      baseline.configSnapshot.minimumRelativeRevenueCents,
    grossMargin:
      Math.abs(expected.marginCents) >=
      baseline.configSnapshot.minimumRelativeMarginCents,
    quantity:
      Math.abs(expected.quantity) >=
      baseline.configSnapshot.minimumRelativeQuantity,
  };
}

export function buildControlStoreBaseline(input: {
  method: "control_store" | "difference_in_differences";
  primaryBaseline: ExperimentBaseline;
  treatmentFacts: BaselineSalesFact[];
  treatmentProductIds: string[];
  controls: ControlStoreBaselineInput[];
}): ExperimentBaseline {
  const baseline = input.primaryBaseline;
  const aggregation = baseline.aggregation;
  const completeWindows = baseline.windows.filter(({ complete }) => complete);
  const treatmentBefore = baseline.baseline;
  const requiredPeriodKeys = [
    ...new Set([
      ...baseline.testPeriodKeys,
      ...completeWindows.flatMap(({ periodKeys }) => periodKeys),
    ]),
  ];
  const treatmentPeriods = new Set(
    input.treatmentFacts.map(({ periodKey }) => periodKey),
  );
  const treatmentAfter = baseline.testPeriodKeys.every((periodKey) =>
    treatmentPeriods.has(periodKey),
  )
    ? aggregateFacts({
        facts: input.treatmentFacts,
        periodKeys: baseline.testPeriodKeys,
        productIds: input.treatmentProductIds,
      })
    : null;

  const stores = input.controls.map((control) => {
    const warnings: string[] = [];
    const matchedAllProducts =
      control.matchedProductIds.length === control.requestedProductCount;
    if (!matchedAllProducts) {
      warnings.push(
        `${control.requestedProductCount - control.matchedProductIds.length} produit(s) n’ont pas de correspondance canonique dans ce magasin.`,
      );
    }
    const coveredPeriods = new Set(
      control.facts.map(({ periodKey }) => periodKey),
    );
    const missingPeriodKeys = requiredPeriodKeys.filter(
      (periodKey) => !coveredPeriods.has(periodKey),
    );
    if (missingPeriodKeys.length > 0) {
      warnings.push(
        `Données mensuelles manquantes : ${missingPeriodKeys.join(", ")}.`,
      );
    }
    const eligible =
      aggregation !== null &&
      treatmentBefore !== null &&
      treatmentAfter !== null &&
      matchedAllProducts &&
      missingPeriodKeys.length === 0 &&
      completeWindows.length > 0;
    const windowAggregates = eligible
      ? completeWindows.map((window) =>
          aggregateFacts({
            facts: control.facts,
            periodKeys: window.periodKeys,
            productIds: control.matchedProductIds,
          }),
        )
      : [];
    const before =
      eligible && aggregation && windowAggregates.length > 0
        ? centralAggregate(windowAggregates, aggregation)
        : null;
    const after = eligible
      ? aggregateFacts({
          facts: control.facts,
          periodKeys: baseline.testPeriodKeys,
          productIds: control.matchedProductIds,
        })
      : null;

    return {
      storeId: control.storeId,
      storeName: control.storeName,
      dataRevision: control.dataRevision,
      requestedProductCount: control.requestedProductCount,
      matchedProductCount: control.matchedProductIds.length,
      recordCount: control.facts.length,
      eligible,
      warnings,
      before,
      after,
      change: before && after ? subtract(after, before) : null,
      evidencePeriodKeys: eligible ? requiredPeriodKeys : [],
    };
  });
  const eligibleStores = stores.filter(
    (
      store,
    ): store is typeof store & {
      before: BaselineAggregate;
      after: BaselineAggregate;
      change: BaselineAggregate;
    } =>
      store.eligible &&
      store.before !== null &&
      store.after !== null &&
      store.change !== null,
  );
  const controlAverageBefore =
    aggregation && eligibleStores.length > 0
      ? centralAggregate(
          eligibleStores.map((store) => store.before),
          "mean",
        )
      : null;
  const controlAverageAfter =
    aggregation && eligibleStores.length > 0
      ? centralAggregate(
          eligibleStores.map((store) => store.after),
          "mean",
        )
      : null;
  const controlAverageChange =
    aggregation && eligibleStores.length > 0
      ? centralAggregate(
          eligibleStores.map((store) => store.change),
          "mean",
        )
      : null;
  const expectedWithoutTest =
    input.method === "control_store"
      ? treatmentBefore && controlAverageBefore && controlAverageAfter
        ? applyControlGrowth({
            treatmentBefore,
            controlBefore: controlAverageBefore,
            controlAfter: controlAverageAfter,
          })
        : null
      : treatmentBefore && controlAverageChange
        ? add(treatmentBefore, controlAverageChange)
        : null;
  const effectEstimate =
    treatmentAfter && expectedWithoutTest
      ? subtract(treatmentAfter, expectedWithoutTest)
      : null;
  const warnings = [...baseline.warnings];
  const excludedStores = stores.filter(({ eligible }) => !eligible);

  if (treatmentAfter === null) {
    warnings.push({
      code: "CONTROL_DATA_PENDING",
      severity: "info",
      message:
        "La période après test du magasin testé doit être importée avant la comparaison avec les témoins.",
    });
  }
  if (
    stores.some(
      (store) => store.matchedProductCount < store.requestedProductCount,
    )
  ) {
    warnings.push({
      code: "CONTROL_PRODUCT_MAPPING_INCOMPLETE",
      severity: "warning",
      message:
        "Au moins un magasin témoin est exclu car tous les produits testés n’y ont pas de correspondance canonique.",
    });
  }
  if (
    stores.some((store) =>
      store.warnings.some((warning) =>
        warning.startsWith("Données mensuelles manquantes"),
      ),
    )
  ) {
    warnings.push({
      code: "CONTROL_PERIOD_DATA_INCOMPLETE",
      severity: "warning",
      message:
        "Au moins un magasin témoin est exclu faute de couverture mensuelle complète avant et après le test.",
    });
  }
  if (eligibleStores.length === 0) {
    warnings.push({
      code: "NO_ELIGIBLE_CONTROL_STORE",
      severity: "blocking",
      message:
        "Aucun magasin témoin sélectionné ne possède actuellement toutes les données requises.",
    });
  }
  if (
    input.method === "control_store" &&
    eligibleStores.length > 0 &&
    expectedWithoutTest === null
  ) {
    warnings.push({
      code: "NO_ELIGIBLE_CONTROL_STORE",
      severity: "blocking",
      message:
        "La référence témoin contient un dénominateur nul ; son évolution relative ne peut pas être appliquée au magasin testé.",
    });
  }

  const readiness =
    expectedWithoutTest === null
      ? "unavailable"
      : baseline.readiness === "limited" || excludedStores.length > 0
        ? "limited"
        : "ready";

  return experimentBaselineSchema.parse({
    ...baseline,
    method: input.method,
    engineVersion: `${baseline.engineVersion}+control-comparison-v1`,
    readiness,
    expectedWithoutTest,
    trendNormalization: {
      requested: false,
      applied: false,
      factor: null,
      baselineControlRevenueCents: null,
      testControlRevenueCents: null,
      controlCoefficientOfVariation: null,
    },
    relativeComparisonEligible: relativeComparisonEligible(
      expectedWithoutTest,
      baseline,
    ),
    warnings,
    controlComparison: {
      method: input.method,
      requestedStoreIds: input.controls.map(({ storeId }) => storeId),
      includedStoreCount: eligibleStores.length,
      treatmentBefore,
      treatmentAfter,
      controlAverageBefore,
      controlAverageAfter,
      controlAverageChange,
      expectedWithoutTest,
      effectEstimate,
      stores,
    },
  });
}

export function buildControlRevisionKey(
  controls: Array<{ storeId: string; dataRevision: number }>,
): string {
  if (controls.length === 0) return "none";
  return [...controls]
    .sort((left, right) => left.storeId.localeCompare(right.storeId))
    .map(({ storeId, dataRevision }) => `${storeId}:${dataRevision}`)
    .join("|");
}
