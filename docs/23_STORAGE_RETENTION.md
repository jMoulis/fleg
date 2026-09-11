# Stockage MongoDB : conservation et recettes isolées

## Incident du 11 septembre 2026

L’audit du cluster configuré localement a mesuré 479 239 888 octets logiques
(479,24 Mo décimaux), dont seulement 17,24 Mo d’index. Quatre collections
représentaient 97,1 % du volume : recommandations, audit, commandes
d’idempotence des propositions et propositions elles-mêmes.

46 propositions validées aux dates des fixtures E2E (12 et 19 mars 2027),
leurs 92 commandes techniques et leurs 92 événements d’audit représentaient
259 172 424 octets. La génération/validation conservait environ six copies
des mêmes lignes. Les faits de vente ne représentaient que 0,76 Mo.

Les exports compressés complets des bases application et authentification
ont été restaurés dans une instance locale indépendante : 119 177 et 585
documents respectivement, sans erreur. Les sauvegardes restent privées sous
`.local-backups/`, exclu de Git ; ne jamais les joindre à une PR.

Le nettoyage ciblé a été appliqué le 11 septembre 2026 : 230 documents retirés
et 46 petits événements de maintenance ajoutés. La mesure de contrôle à
13 h 51 (Paris) est de **219 582 148 octets logiques**, soit **219,58 Mo**,
contre 479,24 Mo avant intervention. Les 2 407 faits mensuels, 238 faits
journaliers, 107 snapshots de stock, 90 décisions et 79 expériences sont
inchangés ; les 107 534 recommandations historiques ont été conservées.
Ces valeurs mesurent la base configurée dans le projet, pas une généralisation
du coût par utilisateur. Le correctif de code doit être déployé séparément.

## Propositions de commande

`orderSuggestionDrafts` reste la preuve canonique : lignes, calculs, versions,
dates, auteur, limites et décision. Les lignes et métadonnées de génération
ne sont jamais modifiées après création. Seules la décision et le statut
sont ajoutés lors de la validation.

Les nouvelles commandes d’idempotence stockent une référence versionnée
`order-suggestion-evidence-v1` et une empreinte SHA-256, pas une copie des
lignes. Une répétition de la création reconstruit **le brouillon initial**,
même après validation ; une répétition de validation rend la réponse validée.
Les empreintes sont vérifiées et les lectures sont bornées au même magasin
et à la même organisation. Les anciens documents `snapshot` restent lisibles.

L’audit conserve le statut, la référence/empreinte et la décision du manager,
dans la même transaction que la mutation. Ne pas supprimer les propositions
métier canoniques tant que des commandes ou événements d’audit s’y réfèrent.
Toute future édition après approbation nécessitera une nouvelle version
immuable de preuve, pas une modification en place.

## Synchronisation des stocks TECH-03

`inventorySyncCommands` conserve un petit accusé de réception et l’empreinte du
contenu, jamais le catalogue complet. Son `_id` unique est dérivé de l’organisation,
du magasin, de l’utilisateur autorisé et de l’UUID d’opération. Il est inséré dans
la même transaction que le brouillon et son audit de lignes modifiées. Un réessai
réutilise ce reçu sans nouvelle écriture métier ni nouvel audit.

Pas de TTL sur ces reçus : ils rendent une réponse perdue rejouable sans doublon.
Les frappes locales coalescent avant envoi ; seules les lignes modifiées sont
transmises. Un envoi en cours reste immuable. Mesurer les lots acceptés/jour/magasin
et leur taille avant généralisation ; cette preuve de synchronisation croît avec
l’usage réel. Aucune purge historique n’est ajoutée par TECH-03.

## Recommandations recalculables et preuves métier

- Une lecture avec les mêmes entrées réutilise une génération complète déjà
  stockée. Un cache partiel, notamment pendant un passage TTL, est recalculé.
- Les nouvelles recommandations portent `retention: cache` et `expiresAt`.
  `RECOMMENDATION_CACHE_DAYS` vaut 7 par défaut (bornes : 1–30 jours).
- Lors d’une nouvelle génération, les caches antérieurs du même magasin et
  de la même période expirent au plus tard après
  `RECOMMENDATION_SUPERSEDED_GRACE_HOURS`, 24 h par défaut (bornes : 1–168 h).
  Cette fenêtre protège notamment les écrans déjà ouverts.
- Une décision ou une expérience liée transforme la recommandation en
  `retention: evidence` et retire `expiresAt`, **dans la transaction qui crée
  le lien**. Une écriture concurrente à une expiration produit un conflit,
  plutôt qu’une référence silencieusement orpheline.
- Aucun TTL sur les décisions, expériences, commandes d’idempotence, ventes,
  stocks ni journaux d’audit. Un ancien statut `draft` ne signifie pas que la
  recommandation n’a jamais donné lieu à une décision.
- Deux index TTL additifs : `recommendations_cache_expiry` et
  `recommendation_runs_cache_expiry`, sur `expiresAt`, expiration à la date
  portée par le document. MongoDB efface en arrière-plan, pas à la seconde près.

Les anciennes recommandations sans `expiresAt` ne sont **pas** automatiquement
purgeables par le déploiement. Leur reliquat historique reste conservé pour
éviter d’effacer les références de versions applicatives encore en service.
Une migration ultérieure devra inventorier les références des décisions,
suivis et expériences, y compris les anciens snapshots de commandes et d’audit,
après arrêt de tous les anciens writers. Ne pas exécuter `deleteMany({status:
"draft"})` ni ajouter un TTL sur `generatedAt`.

### Déploiement et retour arrière

Déployer cette version sur tous les writers avant toute migration de
conservation des données antérieures. Les index n’effacent rien sans champ
`expiresAt`. Les valeurs par défaut ne nécessitent pas de nouvelle variable
Vercel. En cas de retour prolongé à une version sans protection des preuves,
suspendre les deux index TTL avant le rollback : l’ancien code ne sait pas
retirer l’expiration lors d’une décision. Ne pas réécrire les commandes
compactes en anciens snapshots en place ; leur format reste versionné.

## E2E : jamais sur Atlas

`npm run test:e2e` crée un conteneur MongoDB 8 jetable si Docker est disponible.
Il alloue deux bases nommées à partir d’un identifiant aléatoire de session,
les initialise, construit Next, démarre le serveur de test, puis lance
Playwright. Les bases sont supprimées à la fin, même si un test échoue ; le
conteneur créé par le lanceur est arrêté. Aucun serveur existant n’est réutilisé.

Un replica set **local jetable** déjà lancé peut être fourni explicitement :

```sh
E2E_MONGODB_URI='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=flegStorage' npm run test:e2e
```

Les URI distantes/SRV, les bases non générées par cette exécution et les URL
web externes sont refusées. Les gardes s’appliquent au démarrage du serveur
et avant l’authentification Playwright, y compris en cas d’appel direct au CLI.
Les identifiants MongoDB et les services actifs de `.env.local` ne sont pas
utilisés par ces recettes. Les tests IA restent opt-in et exigent une clé
explicitement fournie au processus ; les tests ordinaires désactivent l’IA.

La CI possède déjà son replica set Docker 8. Elle fournit explicitement
`E2E_MONGODB_URI` au même lanceur et exécute aussi les tests transactionnels
de persistance. Les tests MongoDB réels peuvent être lancés séparément :

```sh
STORAGE_TEST_MONGODB_URI='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=flegStorage' npm run test -- src/test/integration/storage-persistence.test.ts
```

## Nettoyage opérationnel des fixtures

`npm run maintenance:cleanup-e2e-orders -- --organization ORG --store STORE
--restore-uri URI_LOCALE --restore-db fleg_restore_DATE_app --backup-archive
CHEMIN_ARCHIVE` produit uniquement un plan.

L’application nécessite en plus `--apply --confirm-database NOM_EXACT`.
L’opérateur doit avoir sauvegardé avec `mongodump --archive --gzip` et restauré
**cette archive** avec `mongorestore` dans une base locale indépendante.
Le script vérifie chaque BSON source contre sa copie restaurée avant la
première suppression, puis revérifie avant chaque transaction. Il exige le
magasin DEMO-01, les dates, produits, quantités et motifs exacts du scénario.
Toute divergence, opération inattendue ou référence connue bloque l’action.

Seuls les cinq documents explicitement liés à chaque proposition sont
supprimés ; un petit événement de maintenance conserve l’identifiant, les
compteurs et l’empreinte de la sauvegarde. Une reprise ignore les propositions
déjà retirées. Les ventes, produits, stocks, expériences, décisions et accès
utilisateur ne sont pas purgés. Aucun nettoyage par nom de collection ou
préfixe de magasin seul n’est autorisé.

Pour récupérer un lot, restaurer l’archive dans une autre base locale, extraire
les identifiants enregistrés par le plan et réinsérer uniquement leurs
documents manquants après vérification du magasin et des versions. **Ne pas
restaurer avec `--drop` sur la base active.** Tester la reprise hors production.

## Limites et capacité

Ce correctif borne la conservation des caches et évite l’amplification des
copies, mais ne rend pas les données métier sans coût. Les preuves canoniques,
ventes quotidiennes et décisions croissent légitimement avec les magasins et
le temps. Avant généralisation : mesurer Mo/jour/magasin, tester la charge,
choisir les sauvegardes et dimensionner le palier. L’archivage des anciennes
preuves métier et la compression des messages répétés restent des pistes
distinctes ; aucun gain sur ces postes n’est revendiqué ici.

Références : [quota Free](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/),
[TTL MongoDB](https://www.mongodb.com/docs/manual/tutorial/expire-data/),
[mongodump](https://www.mongodb.com/docs/database-tools/mongodump/),
[mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/).
