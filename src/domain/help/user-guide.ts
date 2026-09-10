import * as z from "zod";

const userGuideSectionSlugValues = [
  "start-here",
  "imports-data-quality",
  "morning-stock-order",
  "products-forecasts-recommendations",
  "space-tg-markdown-experiments",
  "decisions-copilot",
  "administration",
  "glossary-troubleshooting",
  "pilot-beta-checklist",
] as const;

export const userGuideSectionSlugSchema = z.enum(
  userGuideSectionSlugValues,
);
export type UserGuideSectionSlug = z.infer<
  typeof userGuideSectionSlugSchema
>;

export interface UserGuideSection {
  slug: UserGuideSectionSlug;
  fileName: `${string}.md`;
  eyebrow: string;
  title: string;
  summary: string;
  keywords: readonly string[];
}

const userGuideSectionBySlug = {
  "start-here": {
    slug: "start-here",
    fileName: "00_START_HERE.md",
    eyebrow: "Prise en main",
    title: "Commencer ici",
    summary:
      "Comprendre le rôle de l’application, les accès, la navigation et les règles essentielles de lecture.",
    keywords: [
      "connexion",
      "magasin",
      "organisation",
      "navigation",
      "rôle",
      "permission",
      "zéro",
      "inconnu",
    ],
  },
  "imports-data-quality": {
    slug: "imports-data-quality",
    fileName: "01_IMPORTS_AND_DATA_QUALITY.md",
    eyebrow: "Données",
    title: "Imports et qualité des données",
    summary:
      "Prévisualiser les exports Mercalys, résoudre les articles et valider sans créer de doublons.",
    keywords: [
      "mercalys",
      "xlsx",
      "csv",
      "journalier",
      "mensuel",
      "itm8",
      "ean",
      "article",
      "révision",
    ],
  },
  "morning-stock-order": {
    slug: "morning-stock-order",
    fileName: "02_MORNING_STOCK_AND_ORDER.md",
    eyebrow: "Rituel du matin",
    title: "Stock du matin et commande",
    summary:
      "Configurer unités et colisages, compter réserve et rayon, puis contrôler la proposition de commande.",
    keywords: [
      "stock",
      "commande",
      "colis",
      "colisage",
      "pièce",
      "kilogramme",
      "3400",
      "3402",
      "vendredi",
      "samedi",
      "dimanche",
      "lundi",
      "flux tendu",
    ],
  },
  "products-forecasts-recommendations": {
    slug: "products-forecasts-recommendations",
    fileName: "03_PRODUCTS_FORECASTS_AND_RECOMMENDATIONS.md",
    eyebrow: "Analyse",
    title: "Produits, prévisions et recommandations",
    summary:
      "Lire les indices ABC et XYZ, comprendre la confiance et prendre une décision explicite.",
    keywords: [
      "produit",
      "abc",
      "xyz",
      "prévision",
      "confiance",
      "wape",
      "mae",
      "recommandation",
      "action",
    ],
  },
  "space-tg-markdown-experiments": {
    slug: "space-tg-markdown-experiments",
    fileName: "04_SPACE_TG_MARKDOWN_AND_EXPERIMENTS.md",
    eyebrow: "Terrain",
    title: "Espace, TG, démarque et tests",
    summary:
      "Versionner le plan, préparer les allocations, suivre les TG, la casse et les expériences commerciales.",
    keywords: [
      "espace",
      "îlot",
      "allocation",
      "facing",
      "tg",
      "tête de gondole",
      "démarque",
      "casse",
      "test",
      "expérience",
    ],
  },
  "decisions-copilot": {
    slug: "decisions-copilot",
    fileName: "05_DECISIONS_AND_COPILOT.md",
    eyebrow: "Décision",
    title: "Décisions et Copilote",
    summary:
      "Conserver les arbitrages, mesurer leurs effets et utiliser le Copilote sans exécution automatique.",
    keywords: [
      "décision",
      "suivi",
      "copilote",
      "openai",
      "plan d'action",
      "preuve",
      "approbation",
      "réponse indisponible",
    ],
  },
  administration: {
    slug: "administration",
    fileName: "06_ADMINISTRATION.md",
    eyebrow: "Gestion",
    title: "Administration",
    summary:
      "Créer les magasins, inviter les utilisateurs, attribuer les droits et régler les coefficients.",
    keywords: [
      "administration",
      "invitation",
      "utilisateur",
      "rôle",
      "permission",
      "paramètre",
      "objectif",
      "coefficient",
    ],
  },
  "glossary-troubleshooting": {
    slug: "glossary-troubleshooting",
    fileName: "07_GLOSSARY_AND_TROUBLESHOOTING.md",
    eyebrow: "Référence",
    title: "Glossaire et dépannage",
    summary:
      "Retrouver la définition des termes métier et les premières vérifications en cas de problème.",
    keywords: [
      "définition",
      "indice",
      "abc",
      "xyz",
      "colisage",
      "dépannage",
      "erreur",
      "aide",
      "problème",
    ],
  },
  "pilot-beta-checklist": {
    slug: "pilot-beta-checklist",
    fileName: "08_PILOT_BETA_CHECKLIST.md",
    eyebrow: "Pilote terrain",
    title: "Checklist du bêta-testeur",
    summary:
      "Répéter le parcours réel, consigner les écarts et produire un compte rendu utile pour PILOT-01.",
    keywords: [
      "pilote",
      "bêta",
      "terrain",
      "checklist",
      "compte rendu",
      "test",
      "friction",
      "override",
      "fraîcheur",
      "validation",
    ],
  },
} satisfies Record<UserGuideSectionSlug, UserGuideSection>;

export const userGuideSections = userGuideSectionSlugValues.map(
  (slug) => userGuideSectionBySlug[slug],
);

export function getUserGuideSection(
  input: string,
): UserGuideSection | null {
  const result = userGuideSectionSlugSchema.safeParse(input);
  return result.success ? userGuideSectionBySlug[result.data] : null;
}

export function resolveUserGuideHref(
  href: string | undefined,
  baseHref: string,
): string | undefined {
  if (!href || href.startsWith("#") || href.startsWith("/")) {
    return href;
  }

  if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) {
    return href;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    return undefined;
  }

  const [relativePath, fragment] = href.split("#", 2);
  const suffix = fragment ? `#${fragment}` : "";

  if (relativePath === "../README.md") {
    return `${baseHref}${suffix}`;
  }

  const fileName = relativePath?.replace(/^\.\//, "");
  const section = userGuideSections.find(
    (candidate) => candidate.fileName === fileName,
  );

  return section ? `${baseHref}/${section.slug}${suffix}` : undefined;
}
