# 18 — Exploitation, performance et déploiement

## Runtime supporté

L’application nécessite un runtime Node.js capable d’ouvrir une connexion TCP vers MongoDB Atlas. Le driver MongoDB officiel et Better Auth partagent la même connexion mise en cache par processus.

Le déploiement doit fournir les variables décrites dans `.env.example`, en particulier `MONGODB_URI`, `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL`. Les bornes opérationnelles restent configurables :

- `MONGODB_MAX_POOL_SIZE` limite le nombre de connexions MongoDB par processus ;
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS` borne la découverte d’un serveur ;
- `MONGODB_CONNECT_TIMEOUT_MS` borne l’ouverture d’une connexion ;
- `HEALTH_CHECK_TIMEOUT_MS` borne le contrôle de disponibilité.

Avant une mise en production :

1. charger les variables de l’environnement cible et exécuter `npm run verify:preprod` ;
2. exécuter `npm ci` puis `npm run check` ;
3. construire avec `npm run build` ou produire l’image Docker décrite plus bas ;
4. démarrer l’application puis exécuter `npm run verify:deployment` avant d’envoyer du trafic ;
5. effectuer la recette utilisateur de ce document.

Les deux commandes de vérification chargent `.env.local` si le fichier existe. Pour contrôler un fichier cible sans le renommer, définir par exemple `DEPLOYMENT_ENV_FILE=.env.preproduction`.

Le runtime Sites basé sur Cloudflare Workers ne prend pas en charge la connexion TCP directe exigée par le driver MongoDB. L’application doit donc rester sur un hébergeur Node.js compatible, ou sa couche MongoDB doit être remplacée par une interface HTTP avant un déploiement Sites.

## Configuration des invitations

Le développement local conserve `INVITATION_EMAIL_PROVIDER=manual` et affiche un lien à copier. En préproduction et production, configurer :

- `INVITATION_EMAIL_PROVIDER=resend` ;
- une `RESEND_API_KEY` limitée à l’envoi ;
- `INVITATION_EMAIL_FROM` avec une adresse appartenant à un domaine vérifié ;
- éventuellement `INVITATION_EMAIL_REPLY_TO` ;
- `BETTER_AUTH_URL` avec l’origine HTTPS exacte de l’environnement.

Better Auth appelle le transport lors de la création ou du renvoi d’une invitation. Chaque tentative utilise une clé d’idempotence liée à l’invitation et à sa nouvelle expiration. Le résultat `sent` ou `failed` est conservé dans `notificationDeliveries`; un échec laisse l’invitation valide et l’interface propose toujours de copier son lien. Le destinataire sans compte peut créer ses identifiants uniquement depuis une invitation opaque, valide et en attente. L’adresse du compte est dérivée côté serveur de l’invitation et l’accès à un magasin reste une opération administrative séparée.

Références fournisseur : [e-mails d’organisation Better Auth](https://better-auth.com/docs/plugins/organization#setup-invitation-email) et [idempotence Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Image de déploiement

Le `Dockerfile` multi-étage utilise Node.js 24 LTS et la sortie autonome officielle de Next.js. Aucun fichier `.env` n’entre dans l’image : les secrets sont injectés exclusivement au runtime.

```bash
docker build -t fleg-cockpit:release .
docker run --env-file .env.production -p 3000:3000 fleg-cockpit:release
```

La plateforme doit conserver un unique processus applicatif par conteneur, autoriser les connexions TCP sortantes vers Atlas et HTTPS sortantes vers OpenAI/Resend, puis utiliser `/api/health` comme sonde de readiness. Pour plusieurs réplicas, limiter `MONGODB_MAX_POOL_SIZE` en tenant compte du nombre total d’instances.

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

Activer Cloud Backup sur le cluster Atlas et définir explicitement la fréquence, la rétention et la fenêtre de restauration ponctuelle. Pour un environnement critique éligible, évaluer une Backup Compliance Policy avant son activation : sa réduction ou sa désactivation nécessite ensuite l’intervention du support MongoDB.

Exercice de restauration obligatoire avant ouverture :

1. noter un instant de restauration et les volumes des bases d’authentification et métier ;
2. restaurer le snapshot ou le point dans le temps vers un cluster isolé, jamais par-dessus la préproduction active ;
3. créer des identifiants temporaires en lecture seule et pointer une instance éphémère de l’application vers ce cluster ;
4. exécuter `/api/health`, vérifier les index, se connecter, ouvrir un magasin et contrôler un import, une décision et un audit connus ;
5. consigner l’heure de départ, le retour au service obtenu, les écarts de volume et la date du prochain exercice ;
6. supprimer les identifiants temporaires et le cluster restauré après validation.

Références : [politique Cloud Backup Atlas](https://www.mongodb.com/docs/atlas/backup/cloud-backup/configure-backup-policy/) et [restauration depuis un snapshot](https://www.mongodb.com/docs/atlas/backup/cloud-backup/restore-from-snapshot/).

Les secrets ne doivent jamais être copiés dans les journaux ni dans les artefacts de build.

## Recette utilisateur préproduction

- créer une organisation et son premier magasin avec un compte neuf ;
- inviter un destinataire sans compte et confirmer la réception de l’e-mail ;
- créer ses identifiants depuis le lien, se connecter puis accepter l’invitation ;
- confirmer qu’aucun magasin n’est visible avant attribution explicite ;
- attribuer un seul magasin, puis vérifier l’accès positif et le refus sur un second magasin ;
- importer un fichier Mercalys, contrôler les totaux, générer une recommandation et tracer une décision ;
- créer une version de plan, une allocation, une opération TG et une expérience ;
- vérifier le Copilote configuré, ses preuves et la frontière brouillon/approbation ;
- désactiver puis réactiver un magasin et vérifier la persistance de l’audit ;
- exécuter l’exercice de restauration ci-dessus et archiver le compte rendu.
