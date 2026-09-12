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
