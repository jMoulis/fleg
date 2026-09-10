# F&L Cockpit

F&L Cockpit est une application multi-magasins d'aide au pilotage d'un rayon
fruits et légumes. Elle relie les exports Mercalys, le stock du matin, les
prévisions, l'implantation, la démarque, les opérations commerciales et les
décisions du manager.

Le cycle produit est :

**Importer → comprendre → prévoir → décider → implanter → exécuter → mesurer → apprendre**

## État du produit

Le socle V3 est livré et prêt pour un pilote mono-magasin instrumenté. La
prochaine étape métier dépend de données Mercalys réelles : elles permettront
de mesurer le rituel du matin, de contrôler les prévisions quotidiennes et de
calibrer les propositions de commande sans inventer de preuve.

En attendant ces données, le travail de consolidation porte sur la qualité du
dépôt et la documentation utilisateur. Voir
[`implementation/18_POST_V3_CONSOLIDATION.md`](./implementation/18_POST_V3_CONSOLIDATION.md).

## Démarrer

Prérequis : Node.js compatible avec Next.js 16 et une base MongoDB.

```bash
npm ci
npm run dev
```

Les commandes de validation principales sont :

```bash
npm run check
npm run build
npm run test:e2e
```

Copier les variables nécessaires depuis `.env.example` dans `.env.local`. Les
secrets, notamment `OPENAI_API_KEY`, restent exclusivement côté serveur.

## Documentation

- [Portail documentaire](./docs/README.md)
- [Guide utilisateur — commencer ici](./docs/user/00_START_HERE.md)
- [Architecture et règles de sécurité](./docs/04_ARCHITECTURE.md)
- [Exploitation](./docs/18_OPERATIONS.md)
- [Déploiement Vercel](./docs/19_VERCEL_DEPLOYMENT.md)
- [Point de départ des agents de développement](./implementation/START_HERE_FOR_AGENT.md)

## Principes structurants

- une organisation Better Auth représente une entreprise ou un groupe, jamais
  un magasin ;
- l'accès à chaque magasin est autorisé côté serveur par le domaine métier ;
- toute donnée métier est limitée à un `storeId` autorisé ;
- les faits observés restent distincts des prévisions et recommandations ;
- les calculs déterministes sont versionnés et explicables ;
- une recommandation ou un plan du Copilote reste un brouillon jusqu'à une
  décision explicite et auditée ;
- aucune proposition de commande n'est envoyée automatiquement au fournisseur.

## Socle technique livré

- Next.js 16 App Router, React et TypeScript strict ;
- MongoDB avec le pilote Node.js officiel ;
- Better Auth avec l'adaptateur MongoDB et le plugin Organization ;
- Zod aux frontières externes ;
- Tailwind CSS et composants shadcn/ui ;
- SDK OpenAI officiel avec l'API Responses pour le Copilote ;
- tableaux, visualisations et éditeur d'espace en HTML, CSS et SVG natifs ;
- Vitest pour les tests automatisés et Playwright pour la recette navigateur.

La spécification produit initiale et les décisions d'architecture sont
conservées dans `docs/`. Lorsque le plan historique et l'interface livrée
diffèrent, le portail documentaire signale explicitement le statut du document.
Le même guide utilisateur est disponible après connexion dans la rubrique
**Aide** de chaque magasin autorisé.
