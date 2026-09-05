# 18 — Exploitation, performance et déploiement

## Runtime supporté

L’application nécessite un runtime Node.js capable d’ouvrir une connexion TCP vers MongoDB Atlas. Le driver MongoDB officiel et Better Auth partagent la même connexion mise en cache par processus.

Le déploiement doit fournir les variables décrites dans `.env.example`, en particulier `MONGODB_URI`, `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL`. Les bornes opérationnelles restent configurables :

- `MONGODB_MAX_POOL_SIZE` limite le nombre de connexions MongoDB par processus ;
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS` borne la découverte d’un serveur ;
- `MONGODB_CONNECT_TIMEOUT_MS` borne l’ouverture d’une connexion ;
- `HEALTH_CHECK_TIMEOUT_MS` borne le contrôle de disponibilité.

Avant une mise en production :

1. exécuter `npm ci` puis `npm run check` ;
2. construire avec `npm run build` ;
3. démarrer avec `npm run start` ;
4. appeler `GET /api/health` avant d’envoyer du trafic.

Le runtime Sites basé sur Cloudflare Workers ne prend pas en charge la connexion TCP directe exigée par le driver MongoDB. L’application doit donc rester sur un hébergeur Node.js compatible, ou sa couche MongoDB doit être remplacée par une interface HTTP avant un déploiement Sites.

## Disponibilité

`GET /api/health` est une sonde de readiness, sans donnée métier. Elle renvoie `200` seulement si :

- MongoDB répond à un `ping` ;
- l’ensemble des index applicatifs a été créé ou vérifié.

La réponse inclut `services.database`, `services.indexes`, `metrics.databaseLatencyMs`, `metrics.readinessLatencyMs`, un `requestId` et `checkedAt`. Un dépassement du délai ou un échec renvoie `503`. La sonde déclenche également la préparation des index au démarrage ; elle doit donc être appelée pendant la phase de warm-up.

## Connexion et index MongoDB

La promesse de connexion est partagée dans le processus. Une tentative rejetée est retirée du cache afin qu’une requête ultérieure puisse reprendre après une indisponibilité transitoire.

Les index sont idempotents et préparés une fois par processus avant la première utilisation de la base applicative. Les index de lecture couvrent notamment :

- magasins actifs par organisation et nom ;
- appartenances actives par utilisateur ;
- produits actifs par périmètre magasin ;
- faits de vente par organisation, magasin et période ;
- réglages uniques par organisation et magasin ;
- recommandations réseau par période, statut, magasin et révision.

Toute nouvelle requête métier doit être accompagnée d’une vérification de son filtre tenant et de son plan d’index. En production, confirmer avec `explain("executionStats")` sur un jeu de données représentatif avant d’ajuster un index.

## Logs et alertes

Les erreurs inattendues des routes applicatives et du rendu Next.js sont écrites sur `stderr` au format JSON. Le contrat contient `timestamp`, `severity`, `event`, `message`, `requestId`, la route, la méthode, le statut et les informations d’erreur. Les URI MongoDB, jetons Bearer, clés OpenAI et valeurs portant un nom sensible sont masqués avant émission.

La plateforme d’hébergement peut collecter `stdout`/`stderr` sans SDK supplémentaire. Les règles d’alerte doivent au minimum surveiller :

- toute série de réponses `503` de `/api/health` ;
- l’événement `application.readiness.failed` ;
- l’événement `api.request.failed` ;
- l’événement `next.request.unhandled_error` ;
- une latence de readiness durablement proche de `HEALTH_CHECK_TIMEOUT_MS`.

Les `requestId` renvoyés par les API permettent de corréler une erreur affichée au manager avec son log serveur. Aucun contenu d’import, conversation IA ou donnée métier n’est ajouté au journal opérationnel.

## Sécurité HTTP et accessibilité

Next.js compresse les réponses, retire l’en-tête d’identification du framework, interdit l’encapsulation en iframe, désactive les API navigateur non utilisées et force `no-store` sur les routes `/api`. Une Content Security Policy n’est pas simulée avec une politique permissive : elle devra être ajoutée avec des nonces lors du durcissement de l’hébergeur.

L’interface fournit un lien d’évitement vers le contenu principal, des focus visibles, des régions dynamiques annoncées et respecte `prefers-reduced-motion`. Les parcours clavier et lecteurs d’écran doivent rester dans la recette de chaque nouvel écran.

## Sauvegarde et reprise

Activer les sauvegardes et la restauration ponctuelle dans MongoDB Atlas selon la criticité du réseau de magasins. Tester une restauration dans un environnement isolé avant la production, puis vérifier la sonde de readiness et les index. Les secrets ne doivent jamais être copiés dans les journaux ni dans les artefacts de build.
