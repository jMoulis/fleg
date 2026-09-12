# UX-STOCK-02 — un seul parcours de comptage

## Décision et statut

Direction produit confirmée par le responsable le 2026-09-11, après fusion de
la PR #32 : **un seul comptage métier, quel que soit l’état du réseau**.

La PR #33 est le cadrage sans changement de l’application. Elle et la réalisation
PR #34 sont fusionnées dans `master` (commit `3b66c03`) ; les contrôles qualité,
build et E2E sont réussis. Le 2026-09-12, le responsable indique « Ok j’ai testé »
et demande de reprendre la feuille de route PR #26. Ce retour est enregistré
comme test utilisateur déclaré, pas comme une matrice de recette complète.
Le téléphone, navigateur/mode PWA, la version effectivement testée et le détail
des scénarios ne sont pas encore documentés. Une demande de précision est faite.
Les règles ci-dessous restent le contrat d’acceptation.

## Pourquoi recentrer

Le [contrat V3-02](./13_MANUAL_STOCK_SNAPSHOTS.md) et le
[parcours réserve/rayon](./21_INVENTORY_LIST_UX.md) répondent au besoin initial :
compter physiquement, vérifier, valider, puis préparer une préconisation de
commande. Le manque de réseau en chambre froide ne change pas ce besoin.

TECH-01/02/03 ont ajouté les protections nécessaires, mais leur découpage est
devenu un parcours supplémentaire : préparer un catalogue, démarrer un brouillon
local, activer son envoi et retrouver l’écran connecté pour valider. La question
« quel stock suis-je en train de modifier ? » révèle une ambiguïté de parcours,
pas une preuve de corruption des données. UX-STOCK-01 a amélioré la présentation
sans supprimer cette ambiguïté.

Le socle technique est à réutiliser. Il ne faut ni ajouter un troisième éditeur,
ni simplement renommer les deux parcours actuels en prétendant les avoir unifiés.

## Parcours cible

1. **Ouvrir mon comptage** : magasin, date métier et état du relevé sont visibles.
   L’application propose de commencer ou reprendre, pas de choisir un mode réseau.
2. **Réserve puis rayon** : mêmes articles, mêmes saisies et même progression
   lors d’une coupure ou du retour du réseau, y compris après fermeture de l’app.
3. **Vérifier puis valider** : une étape de revue et une validation métier explicite,
   depuis le même parcours. La validation exige du réseau, des droits à jour et
   une version serveur contrôlée ; elle n’est jamais déclenchée à la reconnexion.
4. **Préparer la préconisation de commande** : seul le stock validé peut être
   consommé. FLEG ne passe aucune commande fournisseur.

Sauvegarde et synchronisation sont des états compréhensibles, pas des étapes
quotidiennes distinctes. Les détails techniques restent accessibles en cas de
besoin ; une erreur ou un conflit ne doit jamais être masqué.

## Identité, date et cycle de vie

- L’identité métier est le magasin autorisé, la date et la version du comptage.
  Un même relevé peut avoir des copies de travail locales appartenant à des
  utilisateurs/appareils différents : « unique » ne signifie pas un seul objet
  physique dans toutes les bases. Leur rapprochement reste explicite et sûr.
- À une nouvelle ouverture, proposer la date du magasin, dans son fuseau.
  Ne jamais changer la date d’une saisie en cours au passage de minuit.
  Signaler clairement un relevé ancien à reprendre ou à terminer.
- Sans relevé pour la date choisie, commencer avec des quantités non comptées.
  Famille, unité et dernier colisage connu peuvent être préremplis ; aucune
  quantité de la veille ne devient implicitement une observation du jour.
- S’il existe un brouillon pour cette date, le reprendre en indiquant son état.
  Les saisies locales non envoyées priment sur un simple rafraîchissement de
  référence ; une divergence serveur exige une comparaison, pas un écrasement.
- Un relevé validé est consultable, non éditable. **Corriger ce relevé** crée
  explicitement une nouvelle version liée à l’ancienne, sans réécrire l’historique.
  Les valeurs reprises pour correction ne sont pas un nouveau comptage du matin.
- Une réponse de validation perdue doit pouvoir être réconciliée après réouverture
  sans double validation ni faux succès. Un ancien brouillon local ne doit pas
  redevenir un relevé éditable sans signalement après validation côté serveur.

## Continuité réseau et information de l’utilisateur

- L’entrée Stocks conduit au même éditeur utilisable connecté et hors connexion.
  Le choix exact de route reste une décision de réalisation. Conserver une entrée
  statique ouvrable à froid ; ne pas mettre en cache globalement le HTML/RSC privé.
- L’ouverture connectée prépare ou renouvelle le périmètre autorisé nécessaire
  au comptage. Elle ne doit jamais remplacer des saisies locales par le serveur.
- Intégrer l’accord d’envoi au démarrage/reprise du parcours avec une information
  claire. Les anciens brouillons explicitement locaux ne sont pas envoyés sans
  accord. Après accord, la reprise des envois ne demande pas une action par coupure.
- Aucune promesse de première connexion ou de catalogue non préparé hors ligne.
  Si un prérequis manque, proposer une action claire dans ce même parcours.
- Distinguer l’enregistrement sur l’appareil, l’attente d’envoi, la réception
  serveur et la validation métier. La présence de Wi-Fi ne prouve aucun des trois.
- Une saisie locale non enregistrée, un envoi incertain, un conflit ou une session
  expirée bloque l’action concernée sans perdre le travail ni simuler une réussite.
- Ne pas promettre un envoi avec l’application fermée. Conserver la reprise au
  premier plan et les limites de stockage/autorisation du socle existant.

## Ce qui ne change pas

- Stock observé = colis en réserve × colisage du relevé + quantité en rayon.
- Vide = non compté ; zéro = absence constatée. Unité et colisage restent
  explicites, et le colisage employé est conservé avec chaque relevé.
- Isolation compte/organisation/magasin, droits serveur, Zod, audit, opérations
  idempotentes, révisions et résolution des conflits restent obligatoires.
- Aucune conversion des ventes en stock certain, aucune validation automatique,
  aucun changement du calendrier de commande ou du calcul de préconisation.
- Pas de PWA hors connexion généralisée, nouvelle IA, upload PDF ou vectorisation
  dans ce lot. TECH-04/V4/V5 ne sont pas avancés par ce recentrage.

## Réalisation et reprise de l’existant

1. Fixer le cycle de vie partagé et les transitions début/reprise/revue/validation/
   correction, avec tests de réconciliation et de compatibilité des anciens relevés.
2. Relier les entrées actuelles au même éditeur et à la même revue ; intégrer
   préparation et reprise des envois sans conserver deux workflows concurrents.
3. Retirer l’éditeur redondant seulement lorsque ses usages, permissions, filtres,
   articles non configurés et cas de correction sont couverts par la recette.
4. Mettre à jour le guide utilisateur à la livraison, puis refaire la recette
   sur l’appareil réel. Ce cadrage ne modifie pas le guide du comportement actuel.

Avant toute migration locale, définir les cas anciens : brouillon local seul,
lié à un brouillon serveur, envoi incertain, conflit, et référence déjà validée.
Ne jamais purger les saisies pour simplifier la transition. Documenter la reprise
et le rollback ; les anciens clients ne doivent pas pouvoir altérer une nouvelle
forme de relevé qu’ils ne comprennent pas.

## Recette obligatoire

- Nouveau jour : quantités vides, profils préremplis, magasin/date explicites.
- Brouillon existant : reprise du même relevé et des saisies locales non envoyées,
  sans sélection de mode connecté/hors connexion.
- Réserve connectée, coupure en chambre froide, rayon hors ligne, fermeture et
  réouverture, retour du réseau, revue et validation dans le même parcours.
- Une ligne incomplète, un zéro explicite et un colisage changé gardent leur sens ;
  aucune ligne située sur une autre page ne disparaît lors de la validation.
- Minuit, changement de date, nouveau jour et correction d’un relevé validé :
  aucune réattribution silencieuse des quantités ni perte des anciens brouillons.
- Perte de réponse d’envoi **et de validation**, deux onglets/appareils, conflits,
  quotas, expiration et changement de compte : reprise sans double écriture.
- Un compte en lecture seule consulte sans écrire ; un autre magasin reste refusé.
- Anciens brouillons : conservation, accord d’envoi et transition vérifiés ;
  un relevé validé ne réapparaît pas comme une saisie modifiable ordinaire.
- Catalogue réel de plusieurs centaines d’articles, mobile/ordinateur, clavier,
  actions toujours accessibles et absence de défilement horizontal.
- Sur téléphone installé : le responsable identifie immédiatement le relevé,
  termine réserve/rayon sans basculer entre deux interfaces et confirme que les
  coupures ne lui ajoutent pas d’opérations quotidiennes de gestion technique.

Les tests automatisés protègent la cohérence ; ils ne prouvent pas le gain de
temps terrain. TECH-03 garde sa validation physique ouverte et PILOT-01 garde
ses exigences de données réelles. La clôture d’UX-STOCK-02 ne les clôt pas seule.

## Réalisation et reprise — branche de livraison

- L’entrée autorisée `/…/inventory` détermine la date dans le fuseau du magasin
  puis conduit à `/offline` avec préparation intégrée. `/offline` reste l’entrée
  statique à froid ; aucun HTML/RSC privé ni réponse d’API ne rejoint le cache global.
- `LocalInventoryEditor` est l’unique éditeur ; l’ancien `InventoryCountManager`
  et ses exports exclusifs ont été retirés (récupérables dans Git).
- Les quatre vues Réserve/Rayon/Vérifier/Configurer partagent les mêmes lignes,
  filtres famille/progression/ruptures, recherche et pagination de 25 articles.
- Le démarrage annonce l’enregistrement local et l’envoi automatique au premier
  plan. Un ancien relevé sans consentement exige « Reprendre et synchroniser ».
- La revue relit la version serveur et bloque les saisies en attente, anomalies
  ou conflits. La validation conserve la révision vérifiée et une clé idempotente
  durable avant tout appel. La réponse perdue est rejouable après réouverture ;
  le relevé reste verrouillé tant que son résultat est inconnu.
- La correction possède également une intention durable. Après le reçu de création,
  la version actuelle est relue : un ancien reçu ne peut pas rouvrir en écriture
  une correction déjà validée ailleurs. Les valeurs locales concurrentes exigent
  une comparaison par article dans la nouvelle version.
- Les écritures locales de validation/correction portent la liaison exacte de
  session, contrôlée en plus de l’autorisation magasin ; les API existantes sans
  cet en-tête conservent leur contrat d’autorisation serveur.
- Le guide en ligne et la checklist bêta décrivent ce parcours unique. Le lien
  vers la préconisation ne change ni ses calculs ni l’exigence de stock validé.

### Compatibilité et retour arrière

Les brouillons v1 locaux et v2 synchronisables sont lus puis promus en v3 dans
la même clé compte/organisation/magasin/date. Identifiant, valeurs brutes, files
d’opérations et demandes en vol sont conservés ; aucun envoi n’est créé sans
consentement. Un catalogue renouvelé ajoute ses nouveaux articles sans écraser
les valeurs locales. Les anciennes versions de l’app refusent le schéma v3
qu’elles ne comprennent pas, au lieu de modifier ses validations en attente.

Pas de migration MongoDB ni purge IndexedDB. En cas de rollback, **ne pas
effacer les données du site ni rétrograder les brouillons v3**. Les clients anciens
resteront verrouillés sur ces relevés ; redéployer le lecteur v3 pour les récupérer.
Attendre une sauvegarde locale confirmée avant fermeture des onglets lors d’une
mise à jour. Une copie préparée expire selon les limites TECH-01 existantes.

### Preuves automatisées

- Tests du cycle local : consentement ancien, nouveau jour vide, valeurs brutes,
  refus d’éditer pendant une validation incertaine, fermeture/réouverture,
  rejeu de clé, reçu étranger, déconnexion, correction et état serveur déjà validé.
- Tests d’autorisation d’entrée, fuseau/date et liaison de session ; suites
  d’isolation MongoDB et de synchronisation conservées.
- Recette E2E mobile 390 et ordinateur 1440 : réserve connectée → rayon sans
  réseau → rechargement → synchronisation → revue → réponse de validation perdue
  → reprise → correction ; anciens tests de quotas, deux appareils, cache privé
  absent et reprise après arrêt Chromium conservés.
- La commande de recette demeure `E2E_MONGODB_URI=<replica-set local jetable>
  npm run test:e2e` ; aucune utilisation d’Atlas ou d’OpenAI réel. Les résultats
  finaux de la suite complète sont consignés dans la PR.

Suite après fusion et retour utilisateur : reprendre la préparation TECH-04
selon [son contrat](./38_TECH_04_PRIVATE_OBJECT_STORAGE.md), et compléter les
preuves terrain dès réception. Aucun nouveau chantier UX stock n’est demandé.
Ce retour ne vaut ni recette commerciale PILOT-01 ni autorisation cloud.
