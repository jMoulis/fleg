# UX-STOCK-02 — un seul parcours de comptage

## Décision et statut

Direction produit confirmée par le responsable le 2026-09-11, après fusion de
la PR #32 : **un seul comptage métier, quel que soit l’état du réseau**.

Ce document cadre le prochain lot ; il ne décrit pas une fonctionnalité déjà
livrée. La PR de cadrage ne change ni l’application ni les données existantes.
Les règles détaillées ci-dessous traduisent cette direction en contrat de
réalisation à vérifier dans le code et dans la recette terrain.

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
