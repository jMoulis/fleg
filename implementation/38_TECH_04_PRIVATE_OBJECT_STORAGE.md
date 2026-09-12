# TECH-04 — stockage privé et uploads récupérables

## Statut et reprise du plan

Contrat de réalisation préparé le 2026-09-12. **Infrastructure configurée après
accord explicite ; lot 1 fusionné via PR #36, lot 2a fusionné via PR #37 et
lot 2b implémenté derrière le verrou de livraison du transport. TECH-04
reste ouvert : aucun envoi direct Blob n’est encore disponible.**
Il précise TECH-04 de la [PR #26](https://github.com/jMoulis/fleg/pull/26), sans
nouvel identifiant ni extension de la feuille de route.

Les PR #33/#34 ont livré le comptage unique. Le responsable rapporte l’avoir
testé et demande de reprendre le plan. Le détail appareil/scénarios est demandé ;
ne pas inventer une recette exhaustive ni clôturer PILOT-01. La préparation de
TECH-04 reprend sur cette instruction ; les preuves TECH-03 restent nécessaires
aux promesses de fonctionnement terrain sur les appareils concernés.

Ordre conservé : TECH-04 (objets), TECH-05 (traitements durables), V4-01
(extraction et revue du brief, avec PILOT-01 et PDF représentatif), puis TECH-06
(recherche citée). Pas d’OCR, d’embeddings, de vision ou de coach dans TECH-04.

## Existant vérifié dans le dépôt

- `attachments` porte les métadonnées ; `attachmentObjects` les binaires BSON.
  Les reçus idempotents et l’audit ne contiennent pas les octets des images.
- Lecture : `stores.read` ; création/suppression : `attachments.write`.
  Les cibles sont le magasin, une version de plan, un mobilier de cette version,
  ou une opération commerciale. Garder ces liens immuables.
- JPEG/PNG/WebP, 4 Mio par photo, 20 photos par cible ; conservation jusqu’à
  suppression manuelle. Lire le [contrat existant](../docs/21_MEDIA_ATTACHMENTS.md).
- Le SDK `@vercel/blob` 2.8.0 est verrouillé dans l’application pour le lecteur
  privé. Les deux variables Blob locales sont configurées pour le développement,
  sans secret versionné ; namespace et budgets applicatifs restent non activés.
- `vercel.json` déclare les fonctions à Paris (`cdg1`), comme les nouveaux stores.
  La région d’Atlas n’a pas été auditée ici.

## Ressources configurées — 2026-09-12

Le responsable confirme utiliser Vercel Pro puis autorise explicitement la
création et la configuration séparée de deux stores privés à Paris, en
conservant son premier store. Projet `fleg` :
`prj_DHYR165gAexmV6NC6qVndf2fmqFQ`.

- `fleg-blob-dev` — `store_5MOJSflf0L273Hz3` — privé, `cdg1`, connecté
  uniquement à **Development et Preview**.
- `fleg-blob-prod` — `store_k3DcIwSL9uBZuhhH` — privé, `cdg1`, connecté
  uniquement à **Production**.
- `fleg-blob` — `store_fAOO8lodC05HwRnl` — privé, `iad1`, vide au contrôle,
  **conservé et déconnecté** du projet. Ni suppression du store ni rotation
  de son token manuel ; une suppression ultérieure demande un accord distinct.

Les liaisons et leur séparation ont été relues via l’API Vercel. Le projet
possède `BLOB_READ_WRITE_TOKEN` et `BLOB_STORE_ID` pour chacun des deux groupes
d’environnements, sans override de branche. Les tokens restent chiffrés chez
Vercel ; aucune valeur de token ne figure dans ce dépôt ou dans le compte rendu.

`.env.local` conserve la configuration applicative existante ; seules ses
entrées `BLOB_READ_WRITE_TOKEN` et `BLOB_STORE_ID` ont été remplacées par celles
du store Development. La récupération Vercel s’est faite dans un dossier
temporaire, pas par écrasement global du fichier utilisateur. Le token local
a réussi une lecture de liste vide ; le fichier demeure ignoré par Git.

La CLI globale n’a pas été mise à jour. La CLI Vercel 59.16.0 temporaire et les
guides Storage/Environment Variables ont servi à créer puis vérifier ces
ressources. Aucun fichier envoyé, aucune migration MongoDB, aucun SDK applicatif
installé et aucun redéploiement déclenché pendant cette configuration. Les futurs
déploiements utiliseront les nouvelles variables ; les déploiements déjà émis
ne sont pas prétendus reconfigurés. Les tests d’upload, de callback, d’accès anonyme
et d’isolation effective par token restent à réaliser avec TECH-04.

## Configuration retenue et activation applicative

1. Deux stores Vercel Blob **privés**, l’un développement/preview, l’autre
   production. Aucun credential de production dans les tests ou previews.
   Séparer aussi les préfixes locaux/preview/déploiements choisis côté serveur.
2. Région Paris (`cdg1`), disponible et configurée. Le forfait Pro est confirmé
   par le responsable ; le budget d’usage avant ouverture reste à arrêter.
3. Authentification serveur selon le SDK retenu : évaluer OIDC lorsqu’il est
   disponible, sinon token serveur propre à l’environnement. Ne jamais publier
   un token lecture/écriture dans `NEXT_PUBLIC_*`, IndexedDB, logs ou captures.
   Vérifier le store attendu explicitement, pas un fallback vers la production.
4. Désactivation par défaut tant que la configuration et la recette ne sont
   pas prêtes. Sans Blob, les photos BSON restent lisibles ; une panne Blob
   n’entraîne pas de repli silencieux des nouveaux fichiers vers MongoDB.
5. Aucun déplacement/suppression des anciennes photos en production dans cette
   préparation. Une migration nécessite un inventaire et une autorisation séparés.

Le stockage privé impose une lecture authentifiée ; choisir le bon mode dès la
création. La route FLEG garde son propre contrôle d’accès avant de servir un
objet. [Modes de stockage Vercel](https://vercel.com/docs/vercel-blob).

### Budgets de démarrage proposés, non encore configurés

- Photos : limites actuelles inchangées (4 Mio, 20/cible).
- File locale : au plus 10 photos et 40 Mio **au total par origine/appareil**,
  tous comptes confondus, avec compteurs accessibles uniquement à leur propriétaire.
  Ce plafond évite une multiplication silencieuse par magasin ou compte.
- PDF : 25 Mio et 60 pages par source ; pas de file PDF hors ligne initialement.
  Ces seuils laissent une marge autour de l’exemple commercial de 40 pages,
  mais devront être confrontés au PDF original. Aucun seuil n’est une capacité
  constatée du fichier réel. PDF chiffré, corrompu ou non analysable : refus.
- Objets distants : enveloppe initiale proposée de 500 Mio par magasin, avec
  un plafond global par environnement à approuver selon le forfait. Réserver
  atomiquement les octets et places des intentions actives pour éviter que des
  uploads parallèles dépassent les plafonds. Inclure quarantaine et suppressions
  non achevées dans l’espace consommé ; ne pas purger des preuves pour faire place.
- Jeton d’envoi court (objectif 10 minutes), 5 reprises automatiques bornées
  avec backoff, puis action manuelle. Valeurs centralisées, validées et testées.
  Une nouvelle autorisation est nécessaire après expiration.
- Intentions abandonnées : éligibles au rapprochement/nettoyage après 24 h.
  Ce délai n’autorise jamais à supprimer une saisie locale non envoyée. Ne pas
  déclarer une suppression finale tant qu’un jeton/envoi encore valide pourrait
  recréer un objet ; vérifier le délai maximal du transport et refaire une passe.

L’estimation financière doit inclure volume moyen conservé, lectures, transferts,
opérations, reprises et coût des fonctions qui servent les objets privés.
Scénario de dimensionnement, **pas prévision d’usage** : 200 photos à 2 Mio et
8 PDF à 10 Mio = 480 Mio ; 5 lectures de chaque fichier représentent environ
2,34 Gio de contenu, avant vérification, reprises et éventuels caches.
52 PDF conservés à 10 Mio ajoutent à eux seuls 520 Mio : ne pas dimensionner
uniquement le premier mois. Les plafonds devront être ajustés explicitement,
pas par effacement automatique des originaux.

La documentation indique une facturation du stockage, des opérations et des
transferts, avec des coûts additionnels de livraison par fonction pour le privé.
Les quotas gratuits ne garantissent pas la disponibilité une fois dépassés.
Le forfait Pro et la région Paris sont confirmés. Le plafond mensuel accepté
reste à renseigner ; aucun devis ni plafond de facturation n’est déduit du
seul accord de création des ressources.
[Tarification Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing).

## Frontière applicative à construire

Une interface de stockage remplaçable sépare les services métier du SDK Vercel.
MongoDB garde seulement identité, scope, propriétaire, version, cible, hash,
référence exacte de stockage, état, rétention et journal compact des opérations.
Ni base64, ni octets PDF, ni copie intégrale des futurs textes dans l’audit.

Le cycle attendu est : intention autorisée, objet reçu en quarantaine, contenu
vérifié, liaison métier créée. Les sorties refusé/annulé/suppression en cours
restent explicites ; un fichier reçu n’est ni vérifié ni exploitable par l’IA.
La suppression logique prime sur toute callback ou tâche tardive.

### Intention, jeton et liaison

- Valider chaque frontière avec Zod et imposer le contexte serveur magasin,
  le propriétaire et les droits actuels. Vérifier aussi l’origine des mutations
  utilisateur ; la callback signée du fournisseur a un contrat distinct.
- Figer cible, taille, type annoncé, SHA-256 et clé idempotente. Même clé et
  contenu différent : conflit, jamais réutilisation aveugle d’un ancien reçu.
- Choisir un chemin unique côté serveur. Le jeton n’autorise que ce chemin,
  ces limites et cet usage ; pas de remplacement d’un objet validé.
  Vérifier ces restrictions sur la version installée du SDK avant livraison.
- Le client n’envoie jamais une URL libre que le serveur téléchargerait.
  Les références reçues de Vercel doivent correspondre au store, chemin et
  intention enregistrés. Ni préfixe ni UUID ne prouve une autorisation.
- À réception, lire l’objet de l’intention avec les credentials du store attendu,
  limiter strictement les octets consommés, recalculer le hash et contrôler
  signature/type/taille. `head()` ou un hash déclaré par le navigateur ne suffit pas.
- Vérifier réellement le nombre de pages PDF avec un parseur borné (mémoire,
  temps, pages) avant de rendre la source disponible ; `%PDF` seul ne suffit pas.
  Pas d’OCR ni d’exécution de contenu. Échec/timeout : garder la quarantaine,
  pas de validation permissive. Servir les PDF en téléchargement initialement.
- Recontrôler la cible, sa version et les droits avant la liaison ; pour une
  callback sans session utilisateur, vérifier les droits actuels de son auteur
  via un contexte serveur, et non le scope fourni par la callback.
- Transaction MongoDB pour état final, lien, libération/réservation des quotas,
  reçu et audit. Ne pas faire croire que Blob participe à cette transaction.
- Les nouvelles sources PDF sont des objets de magasin, non des briefs validés.
  Leur ajout utilise `attachments.write` ; la revue commerciale reste V4-01.

Le SDK propose un envoi direct, une callback et des contrôles avant émission du
jeton. Ils ne remplacent pas les vérifications FLEG ci-dessus.
[Uploads navigateur](https://vercel.com/docs/vercel-blob/client-upload).

### Reprise et file locale

- Progression, annulation et reprise dans la photothèque existante. Aucun
  nouvel éditeur de stock ni shell hors ligne concurrent.
- Stocker les octets et l’intention locale dans une transaction IndexedDB avant
  d’annoncer « enregistré sur cet appareil ». Scope utilisateur/organisation/
  magasin/cible/version ; les données de préparation doivent autoriser la cible
  à être choisie hors ligne sans transformer cette copie en droit serveur.
- Réutiliser les protections d’expiration, de session et de changement de compte
  du socle offline. Aucune queue A visible/envoyée sous B. Pas de purge des
  comptages ni d’éviction de photos en attente pour libérer la place.
- Au retour réseau/à la réouverture au premier plan, réautoriser puis reprendre.
  Ne promettre ni envoi application fermée ni reprise multipart au dernier octet
  sans preuve SDK/appareil. Une reprise depuis le début des octets locaux est
  acceptable aux tailles bornées, avec coût/progression explicités.
- ACK perdu : lire l’état de l’intention avant réémission. Ne retirer les octets
  locaux qu’après réception durable et vérifiée de la liaison, ou abandon explicite
  correctement rapproché. Annuler l’upload n’efface pas la copie locale par défaut.

### Lecture, suppression et rapprochement

- Résoudre l’objet par identifiant FLEG et contexte autorisé, puis vérifier son
  état/cible avant lecture. Conserver `private, no-store` et `nosniff` ; ne mettre
  ni HTML privé ni API ni PDF/photo distante dans le cache global du service worker.
- Garder le lecteur BSON. La nouvelle référence discriminée indique le backend ;
  une ancienne photo sans référence Blob reste BSON, sans migration implicite.
- Suppression : masquer immédiatement l’objet, enregistrer la demande et ses
  artefacts, puis supprimer physiquement avec reprises. L’UI distingue « accès
  retiré, suppression en cours » de « suppression terminée ».
- La liste d’artefacts couvre déjà l’original ; elle doit pouvoir référencer
  ultérieurement aperçus, texte, index et fichiers temporaires fournisseur.
  Ne pas annoncer aujourd’hui une suppression d’artefacts qui n’existent pas.
- Callbacks idempotentes et rapprochement serveur paginé/relançable : intention
  sans callback, objet sans liaison, envoi tardif après annulation, suppression
  partielle. Un timeout/5xx n’est jamais traité comme preuve d’absence.
- Pas de TTL supprimant le seul enregistrement de nettoyage avant son succès.
  Reçus/tombstones compacts conservés selon une politique garantissant le rejeu.
  Scanner uniquement les ressources/périmètres applicatifs validés ; aucun
  nettoyage global de bucket ou suppression fondée sur une seule liste périmée.
- Livrer une procédure de rapprochement durable/relançable et son déclenchement
  opérationnel avant activation. Ne pas attendre TECH-05 pour récupérer un upload
  orphelin ; TECH-05 concerne le traitement documentaire, pas la cohérence du stockage.

## Découpage de réalisation au sein de TECH-04

1. Schémas, adaptateur, intent/quotas, accès et lecteur hybride ; tests isolés,
   feature désactivée par défaut. Rien d’exposé comme fonction terminée.
2. Envoi direct, vérification, callbacks, récupération/nettoyage et consultation
   d’une source sans extraction ; recette sur la ressource privée non productive.
3. Intégration photothèque, file locale bornée, guide et recette navigateur/appareil.
4. Préparer la migration avec dry-run, inventaire, vérification des copies et
   rollback. Ne l’exécuter qu’après autorisation ; pas de double stockage permanent.

### Lot 1 — fondation applicative (2026-09-12)

Périmètre implémenté sur `codex/tech-04-storage-foundation` après fusion du
contrat via PR #35, sans modification des variables Vercel ou de `.env.local` :

- Schémas stricts d’intention photo/PDF : taille/type annoncés, cible, légende,
  fichier normalisé, SHA-256 et clé idempotente. Une intention PDF n’est pas une
  validation PDF : le parseur borné du lot 2 reste obligatoire avant liaison.
- `POST /api/stores/:storeId/attachments/upload-intents` et lecture individuelle
  pour retrouver un reçu. Droits `attachments.write`, auteur propriétaire,
  origine exacte pour la mutation, JSON limité à 4 Kio et délai de réception de
  5 secondes. Ni token, URL ni chemin Blob n’est accepté du client ou renvoyé.
- `uploadIntents` contient uniquement des métadonnées. Chemin serveur aléatoire
  sous `fleg/<namespace>/<hash organisation>/<magasin>/…` ; état `reserved`,
  `uploadAvailable: false`. Doublons et ACK perdus retournent le même reçu ;
  changement de contenu, propriétaire ou namespace provoque un conflit.
- Réservation transactionnelle des octets et du nombre d’objets dans
  `objectStorageQuotas` ; un compteur
  par magasin/ressource et un compteur partagé par **ressource Blob**, incluant
  tous ses namespaces (donc Development et Preview partagent le plafond).
  Les plafonds n’ont pas de valeur d’activation implicite. Pas de recalcul global
  depuis une liste fournisseur ni d’inventaire distant prétendu effectué.
- `attachmentTargetLocks` sérialise les admissions photo, BSON et Blob, avant
  de compter photos existantes et réservations. Les cibles forgées sont refusées
  avant création de verrous et recontrôlées en transaction. Les fichiers existants
  ne sont pas modifiés. Les reçus BSON bénéficient aussi d’un contrôle de contenu.
- Lecteur hybride : absence de référence ou `mongo_bson` conserve BSON ; une
  référence `vercel_blob` exige l’état `linked`, le scope/namespace/store attendus
  et une lecture privée bornée à 4 Mio. Taille, type, signature et hash sont
  vérifiés avant réponse. Suppression pendant la lecture : recontrôle final.
  Jamais de repli sur les octets BSON en cas de panne Blob.
  La règle Next spécifique aux pièces jointes maintient `private, no-store`
  jusque dans le serveur de production (la règle API générique était `no-store`).
- Aucune API ne peut encore créer une liaison Blob. La suppression BSON reste
  fonctionnelle ; une référence distante injectée pour test ne peut pas être
  supprimée par l’ancien chemin (503 explicite, métadonnées conservées), tant que
  le worker durable de suppression n’est pas livré. Ce garde-fou n’est pas une
  implémentation de la suppression distante.

Configuration serveur et limites de ce lot :

- `BLOB_INTENTS_ENABLED=false` par défaut. Le commutateur n’active que la
  réservation de métadonnées ; ne pas l’activer opérationnellement à ce stade.
- `BLOB_STORE_ID` et le store embarqué dans le token RW doivent correspondre à
  la ressource approuvée de l’environnement. `BLOB_NAMESPACE` est explicite,
  avec préfixe `local-`, `preview-` ou `production-` selon `VERCEL_ENV`.
  Le namespace doit rester stable pour retrouver les intentions de cette lignée
  de preview ; le token seul n’active rien. Nouvelle ressource = revue de la
  table de correspondance serveur, jamais fallback silencieux.
- `BLOB_STORE_QUOTA_BYTES`, `BLOB_ENV_QUOTA_BYTES`, `BLOB_STORE_QUOTA_OBJECTS`
  et `BLOB_ENV_QUOTA_OBJECTS` sont requis pour réserver, positifs,
  magasin ≤ environnement. Les places bornent aussi l’accumulation de métadonnées
  par de nombreuses intentions PDF minuscules. `BLOB_READ_TIMEOUT_MS` : 15 s par défaut,
  borné à 1–30 s. Ces budgets techniques ne sont pas un plafond de facturation.
- Choix provisoire RW explicite : le SDK installé supporte OIDC pour la lecture,
  mais `handleUpload` nécessite un token RW. Le futur lot transport doit comparer
  ce chemin au presigned/OIDC avant livraison ; aucune callback ou restriction
  de jeton réelle n’est prétendue testée ici. Le SDK reçoit toujours le credential
  explicite contrôlé ; aucune résolution implicite vers OIDC/production.
  [Contrat du SDK Blob](https://vercel.com/docs/vercel-blob/using-blob-sdk).
- Aucun compteur ne prouve l’occupation du bucket : ce sont les réservations de
  ce nouveau chemin. Les liaisons, la migration et le rapprochement devront
  maintenir ces compteurs avant toute activation. Les intentions abandonnées
  sont indexées après 24 h **sans TTL ni libération automatique de quota** ;
  callbacks, abandon, reprises et nettoyage restent le lot 2.
- L’E2E neutralise explicitement les credentials Blob/OIDC, le commutateur et
  les quotas avant le build Next pour empêcher `.env.local` de réintroduire les
  valeurs réelles. Aucun adaptateur fictif sélectionnable en production ; les
  simulations sont injectées uniquement depuis les tests.

Vérifications de ce lot : `npm run check` (385 tests unitaires/intégration dans
94 fichiers, dont les transactions sur MongoDB local jetable) est vert. La
recette complète E2E mobile/desktop passe : 66 réussis, 4 tests OpenAI réels
volontairement ignorés. Elle couvre aussi la désactivation des nouvelles routes
et les en-têtes privés des photos BSON. Après l’ajout final du plafond d’objets,
le build de production et le parcours REL-06 sont revérifiés séparément :
2 tests mobile/desktop réussis.
Pas de recette Blob réel, de fichier transmis, de migration ou d’activation.

### Lot 2a — autorisations et retours durables (2026-09-12)

Le lot 2 est subdivisé pour garder des PR relisibles. Cette première sous-partie
ne rend **aucun upload Blob utilisable**. `requireUploadTransportConfig()` refuse
inconditionnellement les routes d’autorisation et de callback, y compris avec
`BLOB_INTENTS_ENABLED=true`. Aucun sélecteur de faux stockage ou bypass de test
n’est livré. La configuration effective sera ajoutée seulement avec la chaîne
de vérification/nettoyage et ses preuves, au lot 2b.

Périmètre implémenté :

- Commande d’autorisation sans données de cible, URL, taille ou multipart : tout
  provient de l’intention autorisée, pour son propriétaire et son magasin.
  Recontrôle de session/droits/cible après l’appel fournisseur avant retour de l’URL.
- Plafond d’autorisation figé de 10 minutes, persisté **avant** l’appel fournisseur.
  Six émissions maximum par intention (première tentative + cinq reprises),
  même identifiant de corrélation et échéance inchangée. Une réponse perdue ne
  renouvelle ni quota ni durée. Après épuisement/expiration, pas de renouvellement
  automatique ; le parcours manuel et son backoff restent à intégrer au lot 3.
- Adaptateur `issueSignedToken` puis `presignUrl`, toujours avec le RW explicite
  correspondant à la ressource approuvée. Chemin exact, MIME, taille, expiration,
  absence d’écrasement/suffixe et destination de callback inclus dans les options
  signées. Clé de signature gardée serveur ; seule l’URL d’écriture pourrait être
  remise au client après levée du verrou. Pas de token ni URL dans Mongo/audit.
- Choix presigned par rapport à `handleUpload` RW : pas de clé permettant au
  client de signer d’autres opérations ; callbacks Ed25519 via clé publique
  distincte. L’authentification serveur OIDC est compatible avec ce SDK mais pas
  adoptée implicitement : la liaison des ressources approuvées reste explicite.
- Callback JSON bornée à 16 Kio / 5 secondes, signature vérifiée par le SDK sur
  le corps original sans réordonner/retirer ses propriétés. Corrélation serveur
  intention/tentative, ressource/namespace, chemin, URL privée exacte et MIME
  vérifiés avant persistance ; aucune URL reçue n’est téléchargée.
- Transaction MongoDB pour état `uploaded`, signal de rapprochement et audit,
  ACK seulement après succès. `uploaded` signifie **retour fournisseur reçu**,
  pas octets vérifiés : aucun lien photo/source/PDF n’est créé. Une notification
  n’établit ni les droits actuels de l’auteur ni la validité du contenu.
- Doublons compacts, annulation idempotente et prioritaire face aux callbacks
  concurrentes/tardives. Pas de suppression physique ni libération de quota :
  l’intention, son chemin et `cleanupRequired` restent durables, y compris sans
  callback. L’API d’annulation est réservée aux intentions autorisées par le
  commutateur existant ; la photothèque BSON reste inchangée.

**Limite fournisseur vérifiée, à ne pas contourner par une hypothèse :** dans
le SDK installé 2.8.0, l’opération signée `put` couvre le PUT et le multipart
`POST /mpu`. La signature porte `operation=put`, le chemin et les contraintes,
pas une interdiction distincte du multipart. Une URL n’est donc pas une capacité
« mono-envoi », même si le futur navigateur utilise un PUT simple.
[Contrat des URL signées Vercel](https://vercel.com/docs/vercel-blob/vercel-signed-urls).
L’analyse SDK n’établit pas la durée maximale d’un transfert déjà commencé,
la finalisation après expiration ni le nettoyage des parties multipart.
Ces points nécessitent une preuve fournisseur et une recette non productive
autorisée avant activation ; ne jamais assimiler « 10 minutes écoulées » ou
« pas de callback » à une preuve d’absence. Le nettoyage du lot 2b doit également
reconsidérer les nouveaux retours après une première tentative de nettoyage.

Recette hermétique : signature Ed25519 réellement vérifiée par le SDK avec une
clé de test, options signées par le SDK sans appeler son API, tests de frontières
HTTP et transactions/concurrence sur MongoDB local jetable. La recette navigateur
vérifie le verrou et la non-régression du CRUD BSON, pas un upload Blob réel.
`npm run check` passe : 410 tests dans 96 fichiers. Le build de production E2E
et la recette mobile/desktop passent : 66 réussis, 4 tests OpenAI réels
volontairement ignorés. Les résultats et limites sont consignés dans la PR du lot 2a.
Après le dernier ajustement de réarmement du nettoyage, le build et REL-06 sont
revérifiés : 2 tests mobile/desktop réussis.
Aucune variable locale/Vercel modifiée, aucun fichier envoyé, aucune migration.

Suite immédiate : **lot 2b** (lecture bornée et hash/signature des octets, parseur
PDF borné, réautorisation serveur de l’auteur avant liaison, consultation privée,
artefacts, suppression/réconciliation relançable et déclenchement opérationnel).
Définir explicitement la clé publique et l’origine de callback côté serveur,
sans les déduire d’un `Host` arbitraire. Ne pas ouvrir les routes tant que les
conditions ci-dessus et les budgets/recettes ne sont pas satisfaits.
Puis lot 3 (photothèque/file locale), lot 4 (outillage de migration).
Ne pas avancer à TECH-05 sur ce seul lot 2a.

La migration copie et relit chaque objet pour vérifier taille/hash avant un CAS
de la référence. Une suppression concurrente gagne ; elle ne peut être annulée
par une copie tardive. Supprimer le BSON après bascule vérifiée et autorisée.
Garder les lecteurs des deux backends lors d’un rollback, pas un retour vers une
ancienne version incapable de lire Blob. Une migration non exécutée n’est pas
une économie d’espace déjà obtenue.

### Lot 2b — vérification et cycle de vie privé (2026-09-12)

Branche `codex/tech-04-private-file-verification`. Le code de validation, de
liaison et de récupération est implémenté ; **ce n’est pas une ouverture des
uploads ni une clôture de TECH-04**. Le verrou inconditionnel d’autorisation et
de callback reste intact. Aucune variable locale/Vercel modifiée, aucun objet
envoyé à Blob, aucune migration ni donnée transmise à OpenAI.

- Adaptateur privé pour lire uniquement la référence persistée : taille annoncée
  bornée (4 Mio photo / 25 Mio PDF), MIME, chemin exact, octets limités et SHA-256.
  Une absence explicite du fournisseur est distincte d’un timeout, 304 ou 5xx.
- Parseur `@hyzyla/pdfium` **2.1.13** verrouillé, exécuté dans un worker Node
  jetable sans variables d’environnement. Signature PDF, table de références
  valide sans réparation, absence de chiffrement (même mot de passe utilisateur
  vide), 1–60 pages et chargement de chaque page exigés. Aucun rendu, OCR,
  formulaire ou JavaScript PDF exécuté. Ce n’est pas un antivirus ni une
  validation commerciale du brief.
- Budgets du parseur : 10 secondes, un parseur simultané par processus, heap JS
  ancien 96 Mio / jeune 16 Mio / pile 4 Mio, mémoire linéaire WASM 256 Mio.
  `worker.resourceLimits` ne borne pas les ArrayBuffers : le helper
  `pdf-memory.mjs` réduit donc **la déclaration mémoire du binaire WASM épinglé**
  avant compilation, sans modifier son code ni analyser la syntaxe PDF.
  Un seul espace mémoire 32 bits borné, non partagé, sans mémoire importée est
  accepté ; une disposition inattendue échoue. Le moteur WASM refuse ensuite
  toute croissance au-delà du plafond. Les buffers d’entrée/copie restent bornés
  à 25 Mio, le binaire chargé a une taille fixe ; ces budgets distincts ne sont
  pas présentés comme une limite RSS totale du processus Next.
  Chaque mise à jour du moteur exige de rejouer les tests de déclaration,
  compilation et croissance. Le worker et son binaire sont inclus explicitement
  dans la trace de déploiement de la route de maintenance.
- Reconstitution des droits actuels de l’auteur depuis `user`, `organization`
  et `member` Better Auth, puis magasin actif et `storeMemberships`. Contrôle
  avant lecture et à nouveau dans la transaction finale, avec la cible/version.
  La callback ne fournit aucun rôle utilisable comme autorisation.
- Liaison atomique : métadonnées photo existantes ou `documentSources`, preuve
  de vérification/version, source dans le reçu, état `linked`, artefact original
  et audit compact. Ni PDF, base64, URL signée ni token dans MongoDB. La réservation
  photo est transférée sans compter deux fois la vingtième place.
- Rapprochement indexé et relançable : un dossier éligible par appel, lease de
  2 minutes, nouvelle tentative après 5 minutes sur indisponibilité. Après
  expiration du lease, un autre appel peut reprendre. Une annulation invalide
  le lease ; un ancien worker ne peut pas rétablir une liaison.
  Sans callback, le serveur relit le chemin prévu après l’échéance de l’autorisation.
  Une absence non confirmée reste à reprendre, pas déclarée supprimée.
- Consultation API paginée de 20 sources, téléchargement PDF privé en flux
  **après vérification complète**, `Content-Disposition: attachment`, `nosniff`,
  `private, no-store`, sans URL fournisseur. Recontrôle de visibilité et droits
  avant réponse. Le lecteur photo hybride conserve BSON et recontrôle aussi la
  cible pour Blob. Aucun cache privé ajouté au service worker.
- Suppression explicite par identifiant de source : accès retiré immédiatement,
  état `deleting`, liste d’artefacts et audit transactionnels. Le worker supprime
  le chemin original et vérifie une absence fraîche ; erreur = reprise durable.
  Aucun nouvel aperçu, texte ou index n’existe encore. Leur registre devra être
  étendu avec TECH-05/06, sans prétendre les nettoyer aujourd’hui.

**Limite conservatrice importante :** une intention ayant eu une autorisation
reste facturée dans les quotas applicatifs, y compris après suppression physique
et absence observée. État/artefact/tombstone restent conservés avec
`AWAITING_TRANSPORT_PROOF`, sans TTL. Une callback tardive réarme le nettoyage.
Seule une réservation **jamais autorisée** et annulée/abandonnée peut être
finalisée et libérée, transactionnellement et une seule fois, sans appel Blob.
Cette protection n’est pas une solution d’exploitation définitive : elle peut
épuiser le budget et bloque toujours l’activation tant que les garanties de durée
des transferts/multipart ne sont pas obtenues (ou le transport remplacé).

#### Déclenchement et procédure de reprise

Routes de ce lot, sous `/api/stores/:storeId/attachments` :

- `POST /maintenance`, corps strict `{}` : une passe ; session actuelle avec
  `attachments.write`, origine exacte et configuration privée approuvée requises.
  **Indépendant de `BLOB_INTENTS_ENABLED`** : couper les nouvelles réservations
  ne doit pas empêcher le nettoyage. Aucun cron global, scan de bucket ni
  déclenchement fournisseur non authentifié n’est ajouté.
- `GET /documents?cursor=…` : liste bornée avec curseur d’identifiant FLEG.
- `GET /documents/:sourceId/content` : téléchargement privé ; lecture seule
  autorisée via `stores.read`, jamais de redirection vers Blob.
- `POST /sources/:sourceId/remove`, corps strict `{}` : HTTP 202,
  `{ state: "deleting", deletionComplete: false }`. Rejouable sans réexposer le
  fichier. Cette route couvre les nouvelles photos/PDF ; l’ancien DELETE BSON
  reste inchangé et refuse encore les références Blob. Le branchement des
  contrôles de la photothèque à cette route reste le lot 3.

Avant une activation, affecter un responsable de cette procédure et mesurer le
coût de lecture/suppression. Depuis une session autorisée sur le bon environnement,
déclencher **une** passe de maintenance, lire sa réponse, puis répéter seulement
pour les dossiers suivants éligibles. `processed: false` signifie « aucun travail
éligible maintenant », **pas** « tous les fichiers sont supprimés ». `retry` ou
`waiting` exige d’attendre l’échéance durable (ou le lease expiré), pas une boucle
serrée. `cleanup_pending` exige de conserver le tombstone et son quota ; ne pas
forcer `deleted` ni décrémenter les compteurs à la main. Une erreur de connexion
après un appel se résout en relançant la même procédure, pas par un nouvel upload.
Pour l’investigation, consulter uniquement les intentions du magasin/namespace
autorisé : état, lease, `reconcileAfter`, `lastMaintenanceCode`, artefacts et audit.
Ne jamais copier les credentials, URL d’envoi ou contenu dans un compte rendu.

Les tests hermétiques couvrent le parseur réel, son arrêt/mémoire, les frontières
HTTP, les callbacks perdues/tardives, concurrence, droits/cible retirés, annulation,
pagination, suppression pendant lecture, erreurs fournisseur et quotas sur MongoDB
local jetable. La CI exécute explicitement la nouvelle suite transactionnelle.
`npm run check` : **444 tests / 101 fichiers** réussis avec MongoDB local.
Build de production et recette E2E complète : **66 réussis, 4 tests OpenAI réels
volontairement ignorés**. Après les derniers ajustements de maintenance/streaming,
le build et REL-06 mobile/desktop sont rejoués : **2 réussis**. La trace Next
contient bien le worker, son helper et le binaire WASM. Cela ne prouve pas encore
l’exécution de cette chaîne sur une fonction Vercel déployée.
La recette Vercel privée, notamment PDF représentatif/25 Mio, coût mémoire/durée,
téléchargement streaming et restrictions réelles du transport, reste **à autoriser
et réaliser**, pas déduite des mocks ou du build local.

Prochain travail : lever ces preuves fournisseur/budget/recette du lot 2 avant
activation ; puis lot 3 (photothèque et file locale), lot 4 (outillage de migration).
Pas de TECH-05/V4-01 anticipé. PILOT-01 reste ouvert.

### Recette opérateur isolée — préparation du 2026-09-12

PR #38 fusionnée (`c6b4ca3`), contrôles Quality/build, E2E et Vercel réussis.
La branche `codex/tech-04-storage-acceptance` prépare le premier contrôle réel
du fournisseur **sans ouvrir les routes de l’application**. Ce n’est pas une
recette complète déployée ni un nouveau ticket. L’accord pour les écritures
synthétiques ci-dessous était alors demandé, pas encore reçu. Aucun appel Blob
réel, envoi de fichier, changement de variables ou de ressource n’avait été
effectué pendant cette préparation. L’autorisation et la première exécution
ultérieures sont consignées dans la section de preuve ci-dessous.

#### Simulation et autorisation séparée

`npm run verify:storage` produit un plan JSON et un `runId`, sans lire `.env.local`,
sans écrire de manifeste et sans contacter le réseau. Il prépare un PNG de
1 pixel, un PDF blanc structurellement valide de **25 Mio** et un troisième
chemin synthétique réservé au test de falsification de destination.

Avant l’exécution, obtenir l’accord explicite de l’opérateur : uniquement
`fleg-blob-dev` / `store_5MOJSflf0L273Hz3`, au plus **3 chemins**, **30 Mio de
corps de fichiers envoyés**, **100 tentatives d’opérations** par manifeste,
nettoyage compris. Cette limite technique ne remplace pas un budget mensuel
Vercel approuvé. La suite nominale réserve 21 opérations et environ 25 Mio
d’envoi ; les lectures privées et le trafic associé consomment aussi de l’usage.
Les compteurs réservés sont conservateurs, pas des relevés de facturation.

Après accord, depuis la racine du dépôt local avec Node 24, reprendre le UUID
affiché par la simulation :

```bash
npm run verify:storage -- --execute --run-id=<UUID> --confirm-store=store_5MOJSflf0L273Hz3
```

Le script refuse la CI, un déploiement Vercel, l’environnement de production,
un token d’une autre ressource, les substitutions d’API/proxy et les logs de
debug. Il lit `.env.local` sans la modifier ; seul le token RW de développement
est passé explicitement au SDK, jamais de repli OIDC. Les tentatives automatiques
du SDK épinglé **2.8.0** sont coupées dans ce processus (`VERCEL_BLOB_RETRIES=0`).
Aucune donnée métier, chemin de fichier utilisateur, écriture MongoDB,
callback applicative, requête multipart ou donnée OpenAI ne fait partie du test.

Le namespace `local-acceptance-<UUID>` contient un contexte **synthétique**, pas
un magasin existant. Les trois chemins doivent être absents avant toute émission
d’autorisation : collision ou lecture incertaine = arrêt sans suppression.
Le manifeste local privé `.local-backups/blob-acceptance/<UUID>/report.json`
(ignoré par Git) est remplacé atomiquement et synchronisé sur disque **avant**
chaque opération/capacité. Il conserve chemins, tailles, hash, échéances,
compteurs et résultats compacts, jamais le token RW, les clés, les URL signées
ou les erreurs brutes du fournisseur. Un même dossier ne peut pas réémettre les
uploads ; la reprise est uniquement un nettoyage explicite.

#### Contrôles et reprise

- MIME et taille excessifs, chemin signé modifié, réécriture d’un objet existant,
  lecture avec une signature PUT et lecture anonyme : refus attendus, avec code
  HTTP consigné. Un timeout/5xx n’est jamais compté comme un refus réussi.
- Contrôles positifs PNG/PDF : PUT privé, relecture via l’adaptateur applicatif
  avec taille/MIME/hash, puis validation du PDF téléchargé par le vrai worker
  **local**. Cela ne prouve pas encore son budget mémoire/durée sur Vercel.
- Nettoyage des trois chemins exacts en fin de test, y compris après une réponse
  perdue ; DELETE puis GET privé sans cache. Une erreur conserve `pending`.
  Aucun listing/suppression de bucket, migration BSON ni libération de quota.

Si un nettoyage reste à faire ou après interruption du processus :

```bash
npm run verify:storage -- --execute --cleanup --run-id=<UUID> --confirm-store=store_5MOJSflf0L273Hz3
```

La reprise valide le schéma, le store, chaque chemin/taille/hash et le budget
restant du manifeste. Elle ne réémet aucun droit d’upload et revérifie aussi une
absence déjà observée. Après un arrêt brutal, `operator.lock` peut subsister :
vérifier d’abord que le PID consigné n’est plus ce processus, puis retirer
**seulement ce verrou exact**, jamais le dossier/manifeste. Budget épuisé ou
manifeste invalide : arrêter, conserver les preuves et demander une nouvelle
autorisation d’intervention ; ne pas créer un nouveau run pour éluder le plafond.

`status: passed` signifie uniquement « contrôles de ce probe réussis ».
`absence_observed` constate une absence à cet instant, **pas** l’impossibilité
d’une écriture tardive. `releaseReady` reste toujours `false`. Conserver le
manifeste après nettoyage. Les routes, quotas/tombstones applicatifs et la
photothèque BSON restent inchangés. Ne pas déduire d’un résultat local une
validation des callbacks, du worker déployé, du streaming HTTP FLEG, de la file
photo mobile ou des garanties de durée multipart.

#### Questions fournisseur restant ouvertes

La documentation des [URL signées](https://vercel.com/docs/vercel-blob/vercel-signed-urls)
et du [SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), relue le
2026-09-12, décrit l’expiration et les contraintes mais ne fournit pas les
garanties nécessaires ci-dessous. Brouillon de demande au support, **non envoyé** :

1. Un PUT commencé avant l’échéance peut-il finir après ? Quelle durée maximale
   est garantie côté fournisseur pour ce transfert ?
2. Une délégation `put` autorisant aussi `/mpu`, l’expiration est-elle recontrôlée
   à la finalisation ? Quelle durée de conservation/nettoyage des parties ?
3. Peut-on révoquer une délégation individuelle, annuler ses multipart ou limiter
   cette capacité au PUT simple sans multipart ?
4. Après suppression et lecture d’absence, à quelle condition garantie peut-on
   exclure la recréation tardive et libérer le quota applicatif ?

Des essais ponctuels ne prouvent pas une borne universelle. Si ces garanties
ne sont pas disponibles, un changement de transport devra être arbitré avant
activation ; pas de délai arbitraire « 24 h = nettoyé ». Budget mensuel, origine
et clé publique de callback, recette Vercel et responsable de maintenance restent
également des gates. Ne pas passer à TECH-05 sur ce seul probe.

Vérifications de cette préparation : `npm run check` réussi, **455 tests dans
102 fichiers**, y compris 11 nouveaux tests hermétiques du probe et le vrai
parseur sur le PDF synthétique de 25 Mio. Build de production et **REL-06
mobile/desktop : 2 tests réussis**, MongoDB local jetable, credentials Blob/OpenAI
neutralisés. La suite E2E complète n’a pas été rejouée pour cet outillage seul.

### Première recette réelle autorisée — 2026-09-12

PR #39 fusionnée sur master (`23926ad`), Quality/build, E2E et Vercel réussis.
Après la demande précise « développement uniquement, 3 fichiers synthétiques
maximum, 30 Mio envoyés, 100 opérations, nettoyage compris », le manager a
répondu **« Oui vas-y »**. Cet accord ne constitue ni un budget mensuel ni une
autorisation de production, de migration ou d’ouverture des uploads applicatifs.

Commande exécutée avec le SDK 2.8.0 et le code `bf27d78` :

```bash
npm run verify:storage -- --execute --run-id=ad4be0a6-20c6-467a-91cb-53732b9d34d4 --confirm-store=store_5MOJSflf0L273Hz3
```

Manifeste local conservé et ignoré par Git :
`.local-backups/blob-acceptance/ad4be0a6-20c6-467a-91cb-53732b9d34d4/report.json`.
Création : `2026-09-12T15:18:38.835Z` (17:18, Paris).
Le fichier ne contient ni token RW, ni clé de signature, ni URL signée.
SHA-256 du manifeste après cette exécution :
`37381849aa310168776b0630cb71494c1c56882615a45817e127f65f2e6de60d`.

Résultat **`failed`, `releaseReady: false`**, sortie CLI 1 :

- Les trois chemins exacts étaient absents avant émission de capacité.
- Une autorisation PNG, limitée au chemin et à 68 octets / `image/png`, a été
  obtenue ; échéance enregistrée : `2026-09-12T15:28:39.150Z`.
- Le contrôle `mime_refused` envoie les 68 octets du PNG sous
  `Content-Type: text/plain`. Réponse observée : **HTTP 200**, au lieu d’un refus.
- Arrêt immédiat, sans passer aux autres contrôles. Le PDF de 25 Mio **n’a pas
  été envoyé** ; taille excessive, chemin forgé, réécriture, accès anonyme,
  lecture privée positive et validation PDF distante restent non testés.
- **11 opérations réservées**, **68 octets de corps de fichier** : sous les
  plafonds autorisés, sans assimiler ces compteurs à une mesure de facturation.
- Nettoyage exécuté sur les trois seuls chemins du manifeste : DELETE puis GET
  privé sans cache. Tous sont `absence_observed`, aucun `pending`. Le manifeste
  reste conservé ; cela n’établit pas une borne universelle de transfert tardif.

**Ce que ce résultat ne prouve pas :** le probe a annulé la lecture du corps de
réponse HTTP et n’a pas relu les métadonnées de l’objet avant nettoyage. Il ne
permet donc pas d’affirmer quel MIME a été effectivement stocké, ni même de
confondre le seul HTTP 200 avec une liaison de source FLEG. Aucune source ni
métadonnée métier n’a été écrite dans MongoDB.

Investigation en lecture seule après cet écart :

- La [documentation des URL signées](https://vercel.com/docs/vercel-blob/vercel-signed-urls#put---upload-a-blob)
  décrit le refus via `Content-Type` et montre un PUT avec cet en-tête.
- Dans le SDK installé 2.8.0, `putOptionHeaderMap.contentType` vaut
  **`x-content-type`** (`dist/chunk-YYMLUMXS.js`, fonction `createPutHeaders`).
  La [documentation du SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk#put)
  décrit aussi le type stocké déduit de l’extension lorsque `contentType` n’est
  pas fourni. Le probe avait un chemin `.png` et des octets réellement PNG.
- Cette différence est une **hypothèse explicative**, pas une preuve du
  comportement serveur observé ni une vulnérabilité fournisseur confirmée.
  Aucun appel supplémentaire, émission de capacité ou relance n’a été effectué.

Suite : compléter l’observation bornée/sans secrets des métadonnées effectives,
tester séparément les en-têtes HTTP et le type stocké déclaré par le SDK, puis
cadrer une nouvelle recette avec ses compteurs/chemins explicites. Conserver
l’échec initial ; ne pas rendre le test vert en acceptant simplement HTTP 200,
ne pas réinitialiser ce manifeste ni contourner le refus de rejouer un run.
Les 68 octets / 11 opérations déjà réservés ne redeviennent pas disponibles
dans le plafond global de l’autorisation initiale par création d’un nouveau UUID.

Cette exécution n’a changé ni les variables locales/Vercel, ni les ressources,
ni les routes applicatives, ni les quotas/tombstones métier. Aucune donnée
utilisateur ou OpenAI utilisée. Aucune demande envoyée au support fournisseur.
L’ouverture des uploads, TECH-05 et PILOT-01 restent non validés.

## Recette requise avant de déclarer TECH-04 livré

- Unitaires : schémas, signatures, hash, limites PDF/photo, transitions,
  expirations, idempotence, backoff et budget de file locale.
- Intégration : compte/magasin étranger, rôle lecture seule, cible/version forgée,
  chemin/token forgé, ressource d’un autre environnement, dépassement concurrent
  des quotas, MIME incohérent, hash erroné et parseur borné.
- Stockage : callback doublée/manquante, réponse perdue, annulation puis arrivée
  tardive, suppression partielle, refus/révocation avant liaison, orphelin et
  rapprochement répété ; lecture/suppression historique BSON et migration simulée.
- E2E mobile/desktop : ajout, progression, erreur récupérable, affichage privé,
  refus sans droits, mode avion, fermeture/réouverture, reconnexion et quota local.
  Conserver la non-régression complète du comptage unifié.
- CI sans Blob réel ni Atlas/OpenAI : adaptateur de test hermétique, impossible
  à activer accidentellement en production. Test séparé, explicitement autorisé,
  sur le store non productif pour prouver les restrictions réelles des jetons,
  l’accès privé et la callback. Un mock ne prouve pas ces propriétés du fournisseur.
- Recette appareil de la file photo, coûts observés et procédure d’incident.
  Ces preuves restent techniques, sans clôturer PILOT-01 ni valider l’extraction.

## Informations manquantes avant activation des uploads

- Budget mensuel maximum accepté et plafond de volume global ; les ressources
  déjà configurées ne garantissent pas une facturation bornée.
- Recette de transport et de sécurité sur le store non productif, avec limites
  applicatives en place avant tout upload opérationnel.
- Appareil/mode/version et résultats du test de comptage déjà rapporté.

Les ressources et deux variables locales sont configurées après autorisation.
Le lot 1 implémenté n’active aucun upload Blob utilisateur ; TECH-04 reste ouvert,
sans extraction ni recherche vectorielle et sans clôture de recette métier.
