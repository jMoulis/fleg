# Documentation F&L Cockpit

Ce portail indique quel document lire selon le besoin. La documentation
utilisateur décrit l'interface livrée au 10 septembre 2026. Les spécifications
numérotées conservent la vision et l'historique de conception ; elles ne
constituent pas toutes une promesse de fonctionnalité déjà disponible.

Dans l'application, la même documentation utilisateur est accessible depuis
**Aide** dans la navigation du magasin, avec une recherche par terme métier.

## Utiliser l'application

Commencer par le [guide de prise en main](./user/00_START_HERE.md), puis suivre
le parcours correspondant au travail à réaliser :

1. [Importer et contrôler les données](./user/01_IMPORTS_AND_DATA_QUALITY.md)
2. [Réaliser le stock du matin et préparer la commande](./user/02_MORNING_STOCK_AND_ORDER.md)
3. [Lire les produits, prévisions et recommandations](./user/03_PRODUCTS_FORECASTS_AND_RECOMMENDATIONS.md)
4. [Gérer l'espace, les TG, la démarque et les tests](./user/04_SPACE_TG_MARKDOWN_AND_EXPERIMENTS.md)
5. [Tracer les décisions et utiliser le Copilote](./user/05_DECISIONS_AND_COPILOT.md)
6. [Administrer l'organisation et les magasins](./user/06_ADMINISTRATION.md)
7. [Consulter le glossaire et résoudre un problème](./user/07_GLOSSARY_AND_TROUBLESHOOTING.md)

Cette première édition est volontairement textuelle. Les captures d'écran
seront ajoutées avec les données du pilote réel afin de ne pas documenter des
écrans vides ou des chiffres synthétiques comme s'ils étaient représentatifs.

## Comprendre le produit

- [PRD et objectifs](./01_PRD.md)
- [Fonctionnalités](./02_FEATURES.md)
- [Principes UX/UI](./03_UX_UI.md)
- [Analytics et calculs](./08_ANALYTICS.md)
- [Moteur d'espace](./09_SPACE_ENGINE.md)
- [Imports Mercalys](./10_MERCALYS_IMPORT.md)
- [Multi-magasin](./15_MULTI_STORE.md)
- [Magasin de référence](./16_REFERENCE_STORE.md)
- [Moteur d'expérimentation](./17_EXPERIMENT_ENGINE.md)
- [Pièces jointes et observations](./21_MEDIA_ATTACHMENTS.md)
- [Opérations granulaires V3](./22_GRANULAR_OPERATIONS_V3.md)

## Développer et sécuriser

- [Tenancy et authentification](./00_TENANCY_AUTH.md)
- [Architecture](./04_ARCHITECTURE.md)
- [Modèle de données](./05_DATA_MODEL.md)
- [Contrats API](./06_API_CONTRACTS.md)
- [Copilote OpenAI](./07_AI_AGENT.md)
- [Sécurité](./11_SECURITY.md)
- [Stratégie de tests](./12_TESTING.md)
- [Plan de construction historique](./14_BUILD_PLAN.md)
- [Instructions impératives du dépôt](../AGENTS.md)

## Exploiter et déployer

- [Exploitation](./18_OPERATIONS.md)
- [Déploiement Vercel](./19_VERCEL_DEPLOYMENT.md)
- [Socle DevOps](./20_DEVOPS_BASELINE.md)

## Roadmap et statut

- [Roadmap produit](./13_ROADMAP.md)
- [Consolidation post-V3](../implementation/18_POST_V3_CONSOLIDATION.md)
- [Audit de cohérence documentaire DOC-01](../implementation/20_DOCUMENTATION_AUDIT.md)

## Règle de lecture

Pour la sécurité et l'autorisation, `AGENTS.md` et le code serveur priment. Pour
le comportement de l'interface actuellement disponible, le guide utilisateur
prime sur les anciennes formulations prospectives. Toute évolution future doit
mettre à jour le guide et ses critères d'acceptation dans la même livraison.
