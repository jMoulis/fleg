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

Utiliser **Enregistrer le brouillon** pour interrompre et reprendre le comptage.
Les actions restent visibles pendant le défilement. Passer à l'étape suivante
avec l'action principale enregistre également les modifications en attente.
Un changement de date nécessite d'abord de sauvegarder le travail en cours.
Une ligne commencée doit être complète avant validation. Les articles non
configurés ou non comptés peuvent rester vides.

Une validation fige le comptage. Une correction crée une nouvelle version
traçable au lieu d'écraser la précédente.

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
