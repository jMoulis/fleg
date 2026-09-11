# Stock du matin et proposition de commande

Ce parcours accompagne le travail réel du responsable F&L :

1. faire le tri ;
2. traiter le stock ;
3. passer la commande ;
4. traiter l'arrivage du jour.

L'objectif est le flux tendu : limiter la casse tout en conservant un maximum
de fraîcheur et de disponibilité. La proposition vise donc, en théorie, ce qui
pourra partir pendant la période couverte, avec un stock de clôture cible
configurable et nul par défaut.

## Configurer les articles

Avant le premier comptage, renseigner dans **Stocks** :

- le code famille interne : `3400` pour les fruits ou `3402` pour les légumes ;
- l'unité de stock : kilogramme ou pièce ;
- le colisage, c'est-à-dire la quantité contenue dans un colis.

Ces informations viennent aujourd'hui du cadencier et sont saisies
manuellement. Le colisage peut changer d'une commande à l'autre : le modifier
avant le comptage concerné. Chaque comptage validé conserve le colisage qui a
servi à son calcul, afin qu'une modification future ne change pas l'historique.

Les quantités en pièces sont entières. Les quantités en kilogrammes peuvent
être décimales.

Utiliser l'étape **Configurer** pour retrouver les articles non renseignés. La
liste est découpée en pages de 25 articles ; la recherche et les filtres servent
à isoler une famille ou l'état de configuration sans perdre le brouillon.

## Compter le stock

Le matin, compter d'abord la réserve en colis, puis ajouter le reste présent en
rayon dans l'unité de l'article.

L'écran suit ce déplacement :

1. **Réserve** affiche le colisage du jour et le nombre de colis ;
2. **Rayon** affiche le sous-total déjà compté et demande le reste en rayon ;
3. **Vérifier** distingue les lignes complètes, partielles, non comptées et les
   ruptures confirmées avant validation.

```text
Stock total observé = colis en réserve × colisage + quantité en rayon
```

Exemple : 2 colis de 9 pièces et 5 pièces en rayon donnent 23 pièces observées.

- saisir `0` signifie « compté et absent » ;
- laisser vide signifie « non connu ou non compté » ;
- une valeur négative est conservée comme anomalie à contrôler, pas transformée
  en zéro.

Les saisies s’enregistrent automatiquement sur l’appareil. Attendre
**Enregistré sur cet appareil** avant de fermer l’app. Les actions restent
visibles pendant le défilement. Réserve, rayon et vérification appartiennent
au même relevé, avec ou sans réseau. **Changer de date** ouvre un autre relevé
sans déplacer ni effacer les saisies de celui en cours.
Une ligne commencée doit être complète avant validation. Les articles non
configurés ou non comptés peuvent rester vides.

Une validation fige le comptage. Une correction crée une nouvelle version
traçable au lieu d'écraser la précédente.

## Consulter le catalogue sans réseau

**Stocks du matin** ouvre directement le parcours unique de comptage. Le
magasin et la date sont affichés. Le catalogue est préparé automatiquement à
l’ouverture connectée ; en cas d’échec, **Préparer ce catalogue** permet de
réessayer dans le même écran. Un brouillon synchronisé n’est **pas un stock
validé** : la validation reste une décision explicite, avec du réseau, dans
ce même parcours. Avant l’usage terrain, faites la recette avec un relevé témoin.

1. Sur l’appareil que vous utiliserez en réserve, connectez-vous avec du réseau,
   choisissez le magasin et ouvrez Stocks du matin ; contrôlez la date.
2. Attendez **Catalogue prêt** et vérifiez
   le nom du magasin, la date et le nombre d’articles.
   Le téléchargement comprend toutes les pages, pas seulement les articles déjà vus.
3. Coupez le réseau, fermez puis rouvrez **Stocks du matin** (`/offline`).
   Recherchez un article jamais affiché auparavant.
4. **Commencer le comptage** ou **Reprendre le comptage** démarre la saisie
   et son envoi automatique lorsque le réseau revient. Un relevé déjà validé
   s’ouvre en consultation. La simple préparation ne valide aucun stock.

Une seule copie magasin/date est conservée : en préparer une autre remplace la
précédente, **pas les brouillons locaux**. La consultation expire par défaut après 12 heures, ou plus tôt si
la session expire. L’administrateur peut régler cette durée. La date limite et
l’âge sont affichés ; les derniers stocks observés ont leur propre horodatage.
Ouvrez Stocks avec du réseau chaque matin pour renouveler la copie. La copie expirée est effacée au prochain accès
après la durée de conservation (24 heures par défaut).

Pour installer : dans Safari sur iPhone/iPad, **Partager → Sur l’écran d’accueil** ;
sur Android ou ordinateur, **Installer l’application** dans le menu du navigateur,
si cette option est proposée. Préparez ensuite le catalogue **dans l’app installée**,
qui peut utiliser un stockage distinct de l’onglet du navigateur.

Un avertissement de conservation signifie que le navigateur peut effacer cette
copie. Vérifiez-la avant de couper le réseau ; l’installation n’est pas une
garantie de conservation. En cas d’espace insuffisant, libérez du stockage et
réessayez. Un téléchargement incomplet n’est jamais annoncé comme prêt.

Utilisez un appareil de confiance protégé par un code. **Effacer la copie locale**
ne supprime aucune donnée serveur. Une déconnexion ou un changement de compte
efface également cette copie de lecture. Une révocation distante ne peut pas être
détectée immédiatement hors connexion : la durée maximale limite cet accès différé.

Si une mise à jour est disponible, attendez la confirmation d’enregistrement local,
puis fermez tous les onglets de l’app et rouvrez-la. Aucun rechargement n’est forcé.
La première connexion, les autres écrans et les nouvelles réponses du Copilote
restent indisponibles sans réseau.

Une fois le catalogue prêt, la préparation se replie. Touchez **Catalogue prêt**
pour la rouvrir. La barre du bas affiche la progression, l’enregistrement sur
l’appareil et l’envoi : **Réseau détecté** ne prouve pas que les saisies sont reçues.
**Aide et détails** reste consultable hors connexion. La famille et l’unité déjà
renseignées sont repliées dans chaque article ; le colisage reste directement modifiable.

## Essayer le brouillon local sans réseau

Commencez sur un relevé d’essai pour vérifier la résistance aux coupures de
votre appareil. Pour les nouveaux relevés, l’accord d’envoi fait partie du
démarrage. Les anciens brouillons créés sans envoi restent locaux : choisissez
**Reprendre et synchroniser** pour autoriser leur envoi. Aucun accord n’est déduit
du simple fait de rouvrir un ancien brouillon.

1. Préparez de nouveau le catalogue avec un compte autorisé à saisir les stocks.
   Une ancienne copie ou un compte en lecture seule n’autorise pas la saisie locale.
2. Appuyez sur **Commencer le comptage**. Vérifiez le magasin et la date.
3. Renseignez famille, unité et colisage du relevé, puis **Réserve** et **Rayon**.
   Le colisage reste propre à ce brouillon : un téléchargement ultérieur ne le
   remplace pas. Les valeurs du comptage de référence ne sont pas de nouvelles observations.
4. Attendez **Enregistré sur cet appareil** après chaque saisie
   (avec la mention **non synchronisé** pour un ancien brouillon local seul).
   `0` reste un zéro observé ; vide reste non compté ; `1,` reste une saisie
   incomplète, conservée jusqu’à correction. Aucun total n’est inventé.
5. Fermez puis rouvrez l’app sans réseau. Vérifiez les valeurs, la recherche,
   la famille, la zone réserve/rayon, le filtre de progression et la page.
6. Si le stockage échoue, vos valeurs non enregistrées restent affichées, mais
   **ne fermez pas l’app**. Libérez de l’espace sans effacer ses données puis
   choisissez **Réessayer l’enregistrement local**. Un conflit avec un autre
   onglet impose une relecture explicite ; aucune saisie concurrente n’est fusionnée.

La date du relevé reste fixe, même après minuit. Une différence avec la date
actuelle est signalée. Une horloge incohérente doit être corrigée dans les
réglages de l’appareil ; la date d’envoi ne remplace pas celle de l’observation.

Après expiration, déconnexion ou changement de compte, les brouillons sont
**verrouillés, pas supprimés**. Reconnectez-vous avec le compte propriétaire,
choisissez le même magasin et la même date, puis préparez à nouveau. Les autres
dates conservées pour votre compte/magasin sont indiquées dans l’espace local.
Une nouvelle préparation n’écrase pas vos valeurs en attente. Si le serveur a
déjà validé ce relevé, elles restent conservées mais verrouillées : ouvrez une
correction pour les comparer au stock validé.

Par défaut, l’appareil conserve au maximum 14 brouillons (limite réglable par
l’administrateur). Au-delà, la création est refusée sans effacer les anciens.
Dans **Options du comptage**, **Supprimer ce brouillon local** exige confirmation
et est irréversible : les saisies non synchronisées seront perdues, sans supprimer un éventuel brouillon
serveur. Une réponse d’envoi, de validation ou d’ouverture de correction incertaine bloque cette suppression : réessayez ou
résolvez d’abord le conflit pour savoir ce qui a été reçu.
Après validation, renouvelez le catalogue avant de supprimer sa copie locale :
l’app doit conserver la connaissance de l’état validé si vous rouvrez ce relevé.
Dans **Catalogue prêt → Gérer la copie locale**, **Effacer la copie locale** efface
seulement le catalogue téléchargé et verrouille les brouillons jusqu’à nouvelle préparation.

Ne supprimez pas les données du site pour résoudre un problème de cache : cela
effacerait aussi les brouillons. L’installation ne garantit ni la persistance
du navigateur ni une sauvegarde ; perte de l’appareil ou éviction du stockage
peuvent entraîner leur perte.

## Synchroniser puis valider le stock

1. L’envoi est prévu dès **Commencer le comptage** / **Reprendre le comptage**.
   Pour un ancien brouillon local seul, choisissez **Reprendre et synchroniser**.
   Les envois reprennent au retour du réseau, tant que cet écran reste ouvert
   et votre accès valide. Sans cet accord, rien n’est envoyé.
2. Au retour du réseau, rouvrez **Stocks du matin**. Si nécessaire,
   touchez l’indicateur réseau pour vérifier la connexion. **Voir le problème**
   mène au bouton **Réessayer la synchronisation** si l’envoi reste bloqué.
   Gardez l’écran ouvert jusqu’au résultat ; l’app ne promet pas d’envoyer en arrière-plan.
3. Vérifiez **Brouillon synchronisé** dans la barre de sauvegarde. Ouvrez
   **Détails de synchronisation** pour la révision serveur et le nombre d’articles
   encore en attente. Une valeur incomplète comme `1,` doit être corrigée ; une
   quantité de référence doit être confirmée en la saisissant. Aucun zéro n’est inventé.
4. Dans ce même écran, choisissez **Vérifier**. Avec du réseau, l’app relit
   la version serveur et les articles reçus ; les filtres ne suppriment aucune ligne.
5. Complétez les lignes partielles, vérifiez les données reçues, puis choisissez
   **Valider le comptage**. C’est seulement
   alors que le stock peut servir à la proposition de commande. La synchronisation
   ne valide pas le stock, ne calcule pas de commande et n’envoie rien au fournisseur.

**En attente** ou **en cours** ne signifie pas reçu. Après cinq tentatives
automatiques non confirmées, l’envoi s’arrête et reste récupérable avec le bouton
de réessai. Si la réponse s’est perdue, la même opération est renvoyée sans doubler
le stock. Les saisies faites pendant un envoi sont conservées pour l’envoi suivant.

En cas de **conflit**, la saisie des quantités est suspendue : comparez les valeurs
« appareil » et « serveur », puis choisissez **Garder ma saisie** ou **Garder la
version serveur** pour chaque article, y compris sur les pages suivantes. Confirmez
vos choix. Les quantités ne sont jamais additionnées. **Actualiser la version
serveur** renouvelle la comparaison et demande de refaire les choix. Si le stock
a déjà été validé, **Corriger et comparer mes saisies** ouvre une nouvelle version
dans le même écran, avant la comparaison. Ne recréez pas le relevé ailleurs.

Après validation, le relevé est verrouillé. **Corriger ce relevé** ouvre une
nouvelle version : l’ancien stock reste intact jusqu’à validation de la correction.
Si la réponse de validation est perdue, **Vérifier la validation** reprend la
même opération, même après fermeture de l’app. N’interprétez pas « validation
à confirmer » comme un succès. **Reprendre la correction** joue le même rôle
si la réponse d’ouverture de correction se perd.

Un **accès verrouillé** demande une reconnexion avec le compte propriétaire,
puis une nouvelle préparation du même magasin et de la même date. Les droits
sont revérifiés à chaque envoi. Un **envoi refusé** pour une valeur invalide peut
être révisé avec le bouton dédié : les saisies restent locales, corrigez-les puis
réessayez. Un navigateur incompatible conserve les saisies locales mais ne permet
pas la synchronisation : mettez-le à jour et refaites la recette avant usage réel.

La [checklist terrain TECH-03](./08_PILOT_BETA_CHECKLIST.md#recette-hors-connexion-tech-03)
reste obligatoire sur les téléphones/tablettes utilisés en magasin. Les tests
automatiques ne prouvent pas la fiabilité de votre appareil en chambre froide.

## Préparer la proposition

Dans **Commande**, sélectionner la date de commande puis préparer la
proposition. Le calcul utilise uniquement :

- la prévision quotidienne en unités pour les jours couverts ;
- le comptage du matin validé pour exactement la même date ;
- le colisage figé ;
- le stock de clôture cible configuré.

Le bouton **Préparer la proposition** lance un calcul déterministe, pas une
intelligence artificielle. Pour chaque article, l'écran explique la demande
couverte, le stock observé, le besoin net, l'arrondi en colis et le stock de
clôture projeté.

La revue s'ouvre sur les lignes **Calculées**, c'est-à-dire celles pour lesquelles
un nombre de colis, y compris zéro, peut être décidé. La recherche et les filtres
permettent ensuite d'isoler les articles à commander, sans commande,
indisponibles, modifiés ou d'une famille donnée. Chaque page contient au plus
25 articles. Les quantités et motifs déjà saisis restent conservés lors d'un
changement de filtre ou de page.

## Calendrier actuellement modélisé

- les commandes sont préparées le matin avant le repère de 9 h 30 ;
- une commande passée un jour normal couvre la livraison et les ventes du jour
  suivant ;
- la commande du vendredi couvre les ventes du samedi et du dimanche ;
- la commande du samedi couvre le lundi ;
- aucune commande n'est préparée le dimanche.

Le repère de coupure est affiché mais n'est pas encore bloquant. Les jours
fériés, exceptions fournisseur et l'arrivage du jour ne sont pas encore
modélisés. Il faut donc vérifier manuellement ces situations.

## Comprendre les statuts

- **Prêt** : les éléments nécessaires au calcul sont présents ;
- **Pas de commande** : le stock observé couvre le besoin calculé ;
- **Indisponible** : une donnée essentielle manque ou est incohérente.

Une prévision absente, un stock non compté ou négatif ne devient jamais zéro.
Une confiance faible reste visible et doit conduire à davantage de prudence.
L'arrondi au colis supérieur peut produire un reliquat projeté : ce n'est pas
une demande supplémentaire inventée, mais l'effet du conditionnement.

## Ajuster et valider

Le manager peut modifier le nombre de colis proposé. Chaque modification exige
une raison par article ; une note générale peut compléter la décision. La
validation est auditée. L'action de validation reste visible pendant la revue et
indique les saisies ou motifs encore incomplets avant de pouvoir être utilisée.

F&L Cockpit ne passe pas la commande dans le système fournisseur. La proposition
validée reste un support de décision : le manager reporte ensuite les quantités
dans l'outil de commande habituel.

Voir aussi [Produits et prévisions](./03_PRODUCTS_FORECASTS_AND_RECOMMENDATIONS.md)
et [le glossaire](./07_GLOSSARY_AND_TROUBLESHOOTING.md). Pendant `PILOT-01`,
utiliser aussi la [checklist terrain du pilote bêta](./08_PILOT_BETA_CHECKLIST.md).
