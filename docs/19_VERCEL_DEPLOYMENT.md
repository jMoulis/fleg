# 19 — Déploiement Vercel

## Architecture cible

Vercel doit déployer le projet avec son intégration Next.js native, pas à partir du `Dockerfile`. Les Route Handlers et Server Components s’exécutent avec le runtime Node.js 24 ; `vercel.json` place les fonctions à Paris (`cdg1`). Si le cluster Atlas est hébergé hors d’Europe, rapprocher la région Vercel de la région Atlas avant l’ouverture aux utilisateurs.

Le client MongoDB est partagé dans chaque instance de fonction. `@vercel/functions` attache son pool au cycle de vie Fluid Compute et `MONGODB_MAX_IDLE_TIME_MS` libère les connexions inactives. Le pool reste borné par `MONGODB_MAX_POOL_SIZE`.

## Création du projet

1. Importer le dépôt GitHub `jMoulis/fleg` dans Vercel.
2. Conserver le preset **Next.js**, la racine du dépôt et la commande de build détectée automatiquement.
3. Vérifier dans **Settings → Build and Deployment** que Node.js `24.x` est sélectionné.
4. Activer l’exposition des variables système Vercel et Fluid Compute.
5. Utiliser un domaine stable pour chaque environnement : par exemple `preprod.example.com` pour Preview et le domaine métier pour Production.

`BETTER_AUTH_URL` doit être exactement l’origine HTTPS visitée par les utilisateurs. Pour une Preview, utiliser son URL de branche stable et ouvrir l’application avec cette URL ; une URL immuable de commit différente n’est pas une origine d’authentification autorisée.

## Variables Vercel

Créer les variables suivantes séparément pour Preview et Production. Les valeurs sensibles ne doivent jamais être préfixées par `NEXT_PUBLIC_`.

- `MONGODB_URI`
- `MONGODB_AUTH_DB`
- `MONGODB_APP_DB`
- `MONGODB_MAX_POOL_SIZE` — commencer à `10`, puis ajuster selon le nombre d’instances et la limite Atlas
- `MONGODB_MAX_IDLE_TIME_MS=5000`
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000`
- `MONGODB_CONNECT_TIMEOUT_MS=10000`
- `HEALTH_CHECK_TIMEOUT_MS=8000`
- `BETTER_AUTH_SECRET` — valeur aléatoire différente par environnement
- `BETTER_AUTH_URL`
- `AUTH_ALLOW_SIGN_UP=false`
- `INVITATION_EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `INVITATION_EMAIL_FROM`
- `INVITATION_EMAIL_REPLY_TO` si nécessaire
- `INVITATION_EMAIL_TIMEOUT_MS=10000`
- `IMPORT_MAX_BYTES=10000000`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-5-mini`
- `OPENAI_MAX_OUTPUT_TOKENS=2400`
- `OPENAI_MAX_TOOL_ROUNDS=4`
- `OPENAI_REASONING_EFFORT=low`
- `OPENAI_TIMEOUT_MS=30000`

Toute modification de variable nécessite un nouveau déploiement pour être prise en compte.

## Accès Atlas

Réutiliser le cluster Atlas existant et créer un utilisateur applicatif dédié avec `readWrite` uniquement sur `MONGODB_AUTH_DB` et `MONGODB_APP_DB`. Ne pas utiliser un compte administrateur global dans `MONGODB_URI`.

Les sorties réseau Vercel utilisent des adresses dynamiques. Deux options sont acceptables :

1. **Recommandée sur Vercel Pro** : activer Static IPs dans la même région que les fonctions, puis autoriser uniquement ces adresses dans Atlas.
2. **Démarrage/Hobby** : autoriser temporairement `0.0.0.0/0` dans Atlas, avec TLS, mot de passe aléatoire dédié et privilèges minimaux. Cette ouverture doit être enregistrée comme risque et remplacée par des IP statiques avant de manipuler des données sensibles réelles.

L’intégration Atlas du Marketplace Vercel peut automatiser la connexion, mais elle peut aussi créer un utilisateur disposant de `readWriteAnyDatabase` et ouvrir `0.0.0.0/0`. Pour ce projet, la configuration manuelle ci-dessus respecte mieux le moindre privilège.

## Preview puis Production

1. Pousser une branche non productive et attendre la Preview Vercel.
2. Exécuter `npm run verify:preprod` avec les variables Preview récupérées par la CLI Vercel.
3. Contrôler l’URL immuable du déploiement avec `DEPLOYMENT_URL=https://... npm run verify:deployment`.
4. Exécuter la recette de `docs/18_OPERATIONS.md`, notamment l’isolation magasin, l’invitation, l’import et le Copilote.
5. Promouvoir seulement le déploiement validé vers Production.
6. Réexécuter `/api/health` et les contrôles critiques sur le domaine de production.

Références : [déploiement Next.js sur Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [versions Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [gestion des pools](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#database-connection-pool-management), [régions](https://vercel.com/docs/functions/configuring-functions/region), [variables d’environnement](https://vercel.com/docs/environment-variables) et [intégration Atlas](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/).
