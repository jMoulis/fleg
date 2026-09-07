import {
  enumerateBusinessDates,
  isoWeekBounds,
  isoWeekKeyFromBusinessDate,
  periodBounds,
} from "@/domain/imports/daily-dates";
import type { DailyCoverage } from "@/domain/imports/daily-schemas";
import type {
  GranularSalesTotals,
  GranularSalesWarning,
} from "@/domain/analytics/granular-sales-schemas";

export interface GranularDailyFactValue {
  productId: string;
  businessDate: string;
  isoWeekKey: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
  version: number;
}

export interface GranularMonthlyFactValue {
  productId: string;
  quantity: number;
  revenueCents: number;
  marginCents: number;
}

const emptyTotals = (): GranularSalesTotals => ({
  quantity: 0,
  revenueCents: 0,
  marginCents: 0,
});

function addSafeInteger(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error("Le cumul monétaire dépasse la précision autorisée");
  }
  return result;
}

function sumFacts(
  facts: Array<Pick<GranularDailyFactValue, "quantity" | "revenueCents" | "marginCents">>,
): GranularSalesTotals {
  return facts.reduce<GranularSalesTotals>(
    (totals, fact) => ({
      quantity: totals.quantity + fact.quantity,
      revenueCents: addSafeInteger(totals.revenueCents, fact.revenueCents),
      marginCents: addSafeInteger(totals.marginCents, fact.marginCents),
    }),
    emptyTotals(),
  );
}

function sumMonthlyFacts(facts: GranularMonthlyFactValue[]): GranularSalesTotals {
  return facts.reduce<GranularSalesTotals>(
    (totals, fact) => ({
      quantity: totals.quantity + fact.quantity,
      revenueCents: addSafeInteger(totals.revenueCents, fact.revenueCents),
      marginCents: addSafeInteger(totals.marginCents, fact.marginCents),
    }),
    emptyTotals(),
  );
}

function sumTotals(values: GranularSalesTotals[]): GranularSalesTotals {
  return values.reduce<GranularSalesTotals>(
    (totals, value) => ({
      quantity: totals.quantity + value.quantity,
      revenueCents: addSafeInteger(totals.revenueCents, value.revenueCents),
      marginCents: addSafeInteger(totals.marginCents, value.marginCents),
    }),
    emptyTotals(),
  );
}

export function assessDailyCoverage(input: {
  from: string;
  to: string;
  observedDates: string[];
}): DailyCoverage {
  const expectedDates = enumerateBusinessDates(input.from, input.to);
  const expectedSet = new Set(expectedDates);
  const observedDates = [...new Set(input.observedDates)]
    .filter((date) => expectedSet.has(date))
    .sort();
  const observedSet = new Set(observedDates);
  const missingDates = expectedDates.filter((date) => !observedSet.has(date));

  if (observedDates.length === 0) {
    return {
      status: "unknown",
      expectedDates,
      observedDates,
      missingDates,
      reasons: ["Aucune observation journalière n’est disponible sur cette plage."],
    };
  }

  if (missingDates.length > 0) {
    return {
      status: "partial",
      expectedDates,
      observedDates,
      missingDates,
      reasons: [
        `${missingDates.length} jour(s) sans observation restent inconnus et ne sont pas assimilés à zéro.`,
      ],
    };
  }

  return {
    status: "complete",
    expectedDates,
    observedDates,
    missingDates: [],
    reasons: [],
  };
}

function factWarnings(input: {
  coverage: DailyCoverage;
  correctedFactCount: number;
  quantity: number;
}): GranularSalesWarning[] {
  const warnings: GranularSalesWarning[] = [];
  if (input.coverage.status === "unknown") {
    warnings.push({
      code: "NO_DAILY_OBSERVATIONS",
      message: "Aucune observation journalière n’est disponible.",
    });
  } else if (input.coverage.status === "partial") {
    warnings.push({
      code: "PARTIAL_COVERAGE",
      message: `${input.coverage.missingDates.length} jour(s) sont manquants ; la période ne doit pas être présentée comme complète.`,
    });
  }
  if (input.correctedFactCount > 0) {
    warnings.push({
      code: "CORRECTED_FACTS",
      message: `${input.correctedFactCount} fait(s) actif(s) proviennent d’une correction versionnée.`,
    });
  }
  if (input.quantity <= 0 && input.coverage.observedDates.length > 0) {
    warnings.push({
      code: "NON_POSITIVE_NET_DEMAND",
      message: "La demande nette observée est nulle ou négative.",
    });
  }
  return warnings;
}

export function calculateDailySalesView(input: {
  from: string;
  to: string;
  facts: GranularDailyFactValue[];
}) {
  const factsByDate = new Map<string, GranularDailyFactValue[]>();
  for (const fact of input.facts) {
    const group = factsByDate.get(fact.businessDate) ?? [];
    group.push(fact);
    factsByDate.set(fact.businessDate, group);
  }

  const coverage = assessDailyCoverage({
    from: input.from,
    to: input.to,
    observedDates: [...factsByDate.keys()],
  });
  const days = [...factsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([businessDate, facts]) => {
      const totals = sumFacts(facts);
      const correctedFactCount = facts.filter((fact) => fact.version > 1).length;
      return {
        businessDate,
        totals,
        productCount: new Set(facts.map((fact) => fact.productId)).size,
        correctedFactCount,
        warnings: factWarnings({
          coverage: assessDailyCoverage({
            from: businessDate,
            to: businessDate,
            observedDates: [businessDate],
          }),
          correctedFactCount,
          quantity: totals.quantity,
        }),
      };
    });
  const totals = sumFacts(input.facts);
  const correctedFactCount = input.facts.filter((fact) => fact.version > 1).length;

  return {
    totals,
    coverage,
    days,
    warnings: factWarnings({
      coverage,
      correctedFactCount,
      quantity: totals.quantity,
    }),
  };
}

export function calculateWeeklySalesView(input: {
  from: string;
  to: string;
  facts: GranularDailyFactValue[];
}) {
  const weekKeys = [
    ...new Set(
      enumerateBusinessDates(input.from, input.to).map(
        isoWeekKeyFromBusinessDate,
      ),
    ),
  ];
  const factsByWeek = new Map<string, GranularDailyFactValue[]>();
  for (const fact of input.facts) {
    const group = factsByWeek.get(fact.isoWeekKey) ?? [];
    group.push(fact);
    factsByWeek.set(fact.isoWeekKey, group);
  }

  const weeks = weekKeys.map((isoWeekKey) => {
    const bounds = isoWeekBounds(isoWeekKey);
    const facts = factsByWeek.get(isoWeekKey) ?? [];
    const totals = sumFacts(facts);
    const coverage = assessDailyCoverage({
      from: bounds.startsOn,
      to: bounds.endsOn,
      observedDates: facts.map((fact) => fact.businessDate),
    });
    const correctedFactCount = facts.filter((fact) => fact.version > 1).length;
    return {
      isoWeekKey,
      ...bounds,
      totals,
      coverage,
      productCount: new Set(facts.map((fact) => fact.productId)).size,
      correctedFactCount,
      warnings: factWarnings({
        coverage,
        correctedFactCount,
        quantity: totals.quantity,
      }),
    };
  });

  return {
    totals: sumTotals(weeks.map((week) => week.totals)),
    weeks,
    warnings: weeks.flatMap((week) =>
      week.warnings.map((warning) => ({
        ...warning,
        message: `${week.isoWeekKey} — ${warning.message}`,
      })),
    ),
  };
}

function ratioDelta(delta: number, reference: number): number | null {
  return reference === 0 ? null : delta / reference;
}

export function calculateMonthlySalesReconciliation(input: {
  periodKey: string;
  dailyFacts: GranularDailyFactValue[];
  monthlyFacts: GranularMonthlyFactValue[];
}) {
  const { startsOn, endsOn } = periodBounds(input.periodKey);
  const dailyTotals = sumFacts(input.dailyFacts);
  const dailyCoverage = assessDailyCoverage({
    from: startsOn,
    to: endsOn,
    observedDates: input.dailyFacts.map((fact) => fact.businessDate),
  });
  const monthly =
    input.monthlyFacts.length === 0
      ? null
      : {
          totals: sumMonthlyFacts(input.monthlyFacts),
          productCount: new Set(input.monthlyFacts.map((fact) => fact.productId)).size,
        };
  const warnings: GranularSalesWarning[] = [];

  if (dailyCoverage.status === "unknown") {
    warnings.push({
      code: "NO_DAILY_OBSERVATIONS",
      message: "Aucune observation journalière n’est disponible pour ce mois.",
    });
  } else if (dailyCoverage.status === "partial") {
    warnings.push({
      code: "PARTIAL_COVERAGE",
      message: `${dailyCoverage.missingDates.length} jour(s) du mois restent sans observation.`,
    });
  }
  if (!monthly) {
    warnings.push({
      code: "MONTHLY_OBSERVATION_MISSING",
      message: "Aucune synthèse mensuelle observée n’est disponible pour comparaison.",
    });
  }

  if (dailyCoverage.status !== "complete" || !monthly) {
    return {
      startsOn,
      endsOn,
      status:
        dailyCoverage.status === "unknown"
          ? ("daily_missing" as const)
          : dailyCoverage.status === "partial"
            ? ("incomplete_daily" as const)
            : ("monthly_missing" as const),
      daily: {
        totals: dailyTotals,
        coverage: dailyCoverage,
        productCount: new Set(input.dailyFacts.map((fact) => fact.productId)).size,
      },
      monthly,
      deltas: null,
      warnings,
    };
  }

  const quantity = dailyTotals.quantity - monthly.totals.quantity;
  const revenueCents = dailyTotals.revenueCents - monthly.totals.revenueCents;
  const marginCents = dailyTotals.marginCents - monthly.totals.marginCents;
  const deltas = {
    quantity,
    quantityRatio: ratioDelta(quantity, monthly.totals.quantity),
    revenueCents,
    revenueRatio: ratioDelta(revenueCents, monthly.totals.revenueCents),
    marginCents,
    marginRatio: ratioDelta(marginCents, monthly.totals.marginCents),
  };
  if (
    deltas.quantityRatio === null ||
    deltas.revenueRatio === null ||
    deltas.marginRatio === null
  ) {
    warnings.push({
      code: "RATIO_UNAVAILABLE_ZERO_BASE",
      message: "Au moins un ratio d’écart est indisponible car sa base mensuelle vaut zéro.",
    });
  }

  return {
    startsOn,
    endsOn,
    status:
      quantity === 0 && revenueCents === 0 && marginCents === 0
        ? ("matched" as const)
        : ("mismatch" as const),
    daily: {
      totals: dailyTotals,
      coverage: dailyCoverage,
      productCount: new Set(input.dailyFacts.map((fact) => fact.productId)).size,
    },
    monthly,
    deltas,
    warnings,
  };
}
