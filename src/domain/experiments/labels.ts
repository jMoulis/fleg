import type {
  BaselineMethod,
  ExperimentMetric,
  ExperimentStatus,
  ExperimentType,
} from "@/domain/experiments/schemas";
import type {
  ExperimentManagerDecision,
  ExperimentVerdict,
} from "@/domain/experiments/conclusion";

export const experimentStatusLabels: Record<ExperimentStatus, string> = {
  draft: "Brouillon",
  planned: "Planifié",
  running: "En cours",
  awaiting_data: "À analyser",
  analyzed: "Analysé",
  concluded: "Terminé",
  archived: "Archivé",
  cancelled: "Annulé",
};

export const experimentTypeLabels: Record<ExperimentType, string> = {
  tg_placement: "Placement en TG",
  space_change: "Changement d’espace",
  layout_change: "Changement de plan",
  price_change: "Changement de prix",
  promotion: "Promotion",
  assortment: "Assortiment",
  presentation: "Présentation",
  custom: "Test personnalisé",
};

export const experimentMetricLabels: Record<ExperimentMetric, string> = {
  revenue: "Chiffre d’affaires",
  quantity: "Quantité vendue",
  gross_margin_cents: "Marge brute €",
  gross_margin_rate: "Taux de marge",
  markdown_cents: "Démarque €",
  revenue_per_effective_meter: "CA par mètre effectif",
  margin_per_effective_meter: "Marge par mètre effectif",
  department_revenue: "CA du rayon",
  family_revenue: "CA de la famille",
};

export const baselineMethodLabels: Record<BaselineMethod, string> = {
  prior_comparable_periods: "Périodes comparables précédentes",
  prior_year: "Même période de l’année précédente",
  internal_category_control: "Catégorie interne de contrôle",
  control_store: "Magasin contrôle",
  difference_in_differences: "Différence de différences",
};

export const baselineMethodDescriptions: Record<BaselineMethod, string> = {
  prior_comparable_periods:
    "Compare le test à plusieurs périodes récentes de même durée.",
  prior_year:
    "Compare à la même fenêtre de l’année précédente lorsque les données existent.",
  internal_category_control:
    "Utilise le reste de la catégorie pour corriger la tendance du rayon.",
  control_store:
    "Compare à un magasin similaire explicitement autorisé.",
  difference_in_differences:
    "Compare l’évolution du magasin testé à celle d’un magasin contrôle.",
};

export const experimentVerdictLabels: Record<ExperimentVerdict, string> = {
  winner: "Gagnant",
  promising: "Prometteur",
  neutral: "Neutre",
  loser: "Défavorable",
  inconclusive: "Non concluant",
};

export const experimentManagerDecisionLabels: Record<
  ExperimentManagerDecision,
  string
> = {
  roll_out: "Généraliser",
  repeat: "Retester",
  modify_and_repeat: "Modifier et retester",
  stop: "Arrêter",
  no_action: "Ne rien changer",
};
