# TECH-04 — stockage privé et uploads récupérables

## Statut et reprise du plan

Contrat de réalisation préparé le 2026-09-12. **Infrastructure configurée après
accord explicite ; uploads applicatifs non implémentés, non activés.**
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
- Le SDK Blob n’est pas installé dans l’application. Les deux variables Blob
  locales sont maintenant configurées pour le développement, sans secret versionné.
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

La migration copie et relit chaque objet pour vérifier taille/hash avant un CAS
de la référence. Une suppression concurrente gagne ; elle ne peut être annulée
par une copie tardive. Supprimer le BSON après bascule vérifiée et autorisée.
Garder les lecteurs des deux backends lors d’un rollback, pas un retour vers une
ancienne version incapable de lire Blob. Une migration non exécutée n’est pas
une économie d’espace déjà obtenue.

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
TECH-04 reste à implémenter : cela ne livre ni upload utilisateur, ni extraction,
ni recherche vectorielle et ne clôture aucune recette métier.
