# Checklist terrain du pilote bêta

Cette checklist aide le responsable de rayon qui utilise réellement F&L
Cockpit à produire un compte rendu exploitable pour `PILOT-01`. Elle ne sert
pas à démontrer que tout fonctionne : elle doit aussi permettre de relever une
hypothèse fausse, une donnée manquante ou une étape trop contraignante.

Les cases affichées dans ce guide ne sont pas enregistrées par l'application.
Conserver les notes quotidiennes dans un document daté, puis utiliser le modèle
de compte rendu hebdomadaire en fin de semaine.

## Avant le premier jour

Définir une fois le cadre du pilote :

- □ magasin et rayon testés ;
- □ responsable du pilote et éventuels remplaçants ;
- □ date de début et durée prévue ;
- □ période de référence retenue pour la casse, la démarque et la disponibilité ;
- □ jours particuliers qui devront obligatoirement être observés, notamment un
  vendredi et un samedi ;
- □ version déployée ou date du dernier déploiement ;
- □ appareil, navigateur et zones où le réseau est faible ou absent ;
- □ endroit où seront conservées les notes et captures sans donnée client.

Fixer les critères avant de voir les résultats :

```text
Temps total acceptable pour stock + proposition :
Couverture minimale attendue des articles calculables :
Niveau d'ajustement considéré acceptable :
Indicateur retenu pour la fraîcheur ou la disponibilité :
Valeur de référence de casse ou démarque :
Condition qui impose de suspendre le pilote :
```

Vérifier la préparation :

- □ les articles actifs des familles `3400` et `3402` sont identifiables ;
- □ les unités pièce/kilogramme et les colisages connus sont renseignés ;
- □ les accès Import, Stocks, Commande et Décisions sont disponibles ;
- □ les exports historiques disponibles ont été importés sans combler les jours
  absents par zéro ;
- □ les erreurs bloquantes connues ont été consignées avant le départ.

## Fiche quotidienne — contexte

Au début de chaque matinée, noter :

```text
Date :
Heure de début :
Jour de commande :
Date de livraison et jours de vente censés être couverts :
Responsable présent :
Contexte exceptionnel connu : météo, promotion, férié, rupture fournisseur,
problème de qualité, affluence ou opération locale :
```

Ne pas corriger silencieusement le comportement de l'application à cause de ce
contexte : le noter permet précisément de découvrir ce qui manque au modèle.

## 1. Contrôler les données de vente

- □ l'export Mercalys correspond au bon magasin et à la bonne date ;
- □ la prévisualisation retrouve la période attendue ;
- □ les totaux affichés sont cohérents avec la source ;
- □ les lignes de total ou d'agrégat sont bien exclues ;
- □ les articles non reconnus ou ambigus sont résolus sans association forcée ;
- □ les jours absents restent signalés comme manquants ;
- □ la validation ne crée pas de doublon lors d'un nouvel envoi du même fichier.

À noter si quelque chose surprend : nom du fichier, date métier, nombre de
lignes concernées, article et différence constatée. En cas d'erreur, conserver
l'heure, la rubrique et la référence de requête affichée.

## 2. Faire le tri puis compter le stock

- □ le tri des produits non vendables est terminé avant le comptage ;
- □ la casse ou démarque connue est saisie dans son parcours dédié ;
- □ l'heure de début du comptage est notée ;
- □ la réserve est comptée en colis ;
- □ le rayon est ensuite compté en pièce ou kilogramme ;
- □ une quantité réellement nulle est saisie comme `0` ;
- □ une quantité non comptée ou inconnue reste vide ;
- □ tout changement d'unité ou de colisage est fait avant validation et noté ;
- □ les lignes partielles, non configurées et anormales sont relues ;
- □ le comptage est validé pour la date exacte de commande ;
- □ l'heure de fin du comptage est notée.

Pour tout article difficile à compter, noter la cause : présentation en vrac,
colis entamé, mélange réserve/rayon, unité inadaptée, produit abîmé ou autre.

Noter aussi toute coupure réseau : endroit, durée, état affiché, saisies
retrouvées ou perdues et temps de reprise. Le fonctionnement hors ligne est
prévu dans `TECH-01` à `TECH-03` ; cette checklist ne le présente pas comme déjà
disponible. La recette volontaire en mode avion sera ajoutée à sa livraison
et commencera sur un comptage de test.

## 3. Préparer et contrôler la proposition

- □ la date de commande est correcte ;
- □ la date de livraison et les jours couverts correspondent à la réalité ;
- □ le vendredi couvre bien samedi et dimanche ;
- □ le samedi prépare bien la livraison du lundi ;
- □ l'arrivage du jour n'a pas été ajouté au stock du matin ;
- □ une ligne calculable explique demande, stock, besoin, colisage et arrondi ;
- □ une ligne non calculable expose la donnée absente au lieu d'afficher zéro ;
- □ les articles avec une confiance faible ont été examinés ;
- □ les propositions manifestement trop hautes ou trop basses ont été repérées ;
- □ chaque nombre de colis modifié possède une raison précise ;
- □ la proposition validée a été reportée manuellement dans l'outil habituel ;
- □ l'heure de fin de préparation de commande est notée.

Utiliser autant que possible l'une de ces catégories dans la raison ou dans les
notes du jour :

- `PREVISION_HAUTE` ou `PREVISION_BASSE` ;
- `PROMOTION_MANQUANTE` ;
- `METEO_OU_SAISON` ;
- `RUPTURE_OU_QUALITE_FOURNISSEUR` ;
- `COLISAGE_INCORRECT` ;
- `STOCK_INEXACT_OU_INCOMPLET` ;
- `ARRIVAGE_DU_JOUR` ;
- `CONTRAINTE_ESPACE` ;
- `CONNAISSANCE_LOCALE` ;
- `AUTRE`, avec une explication.

Le but n'est pas de réduire artificiellement le nombre de modifications. Une
correction justifiée est une information utile pour améliorer le produit.

## 4. Contrôler l'arrivage et la journée

Après la commande puis au cours de la journée :

- □ l'arrivage reçu correspond globalement à ce qui était attendu ;
- □ les substitutions, manquants, retards et problèmes de qualité sont notés ;
- □ les produits en rupture ou presque en rupture sont relevés avec l'heure ;
- □ les reliquats manifestes en fin de couverture sont relevés ;
- □ la casse et la démarque sont saisies sans les confondre avec une vente nulle ;
- □ les événements locaux susceptibles d'expliquer le résultat sont notés ;
- □ les conséquences d'un arrondi au colis supérieur sont identifiées.

Lorsque la clôture exacte n'est pas mesurable, écrire « inconnu » et décrire le
signal observé. Ne jamais transformer une absence d'observation en zéro.

## 5. Évaluer l'expérience utilisateur

À la fin de la matinée, répondre brièvement :

```text
Durée du tri :
Durée du comptage réserve + rayon :
Durée de revue et report de la commande :
Étape la plus lente :
Étape la plus confuse :
Information recherchée mais absente :
Action faite en dehors de F&L Cockpit :
Confiance dans la proposition, de 1 à 5 :
Utilité réelle ce matin, de 1 à 5 :
Une chose à conserver absolument :
Une chose à modifier en priorité :
```

Classer chaque problème rencontré :

- **Blocage** : impossible de terminer la tâche ;
- **Donnée** : fichier, article, date, unité ou valeur incorrecte/manquante ;
- **Hypothèse métier** : le calcul ne correspond pas à la pratique réelle ;
- **Friction UX** : la tâche est possible mais lente ou difficile ;
- **Fonctionnalité manquante** : une information ou action nécessaire n'existe
  pas ;
- **Compréhension** : le résultat est peut-être correct mais insuffisamment
  expliqué.

## Contrôle hebdomadaire des autres écrans

Une fois par semaine, sans alourdir chaque matin :

- □ comparer quelques KPI du tableau de bord avec une source connue ;
- □ ouvrir plusieurs fiches produit et vérifier que périodes et unités sont
  compréhensibles ;
- □ contrôler que les recommandations correspondent aux preuves affichées ;
- □ vérifier la cohérence des allocations d'espace avec le rayon réel ;
- □ enregistrer les opérations commerciales, promotions ou événements réels
  utiles à l'interprétation ;
- □ vérifier que les décisions et raisons de modification sont retrouvables ;
- □ poser au Copilote une question dont la réponse terrain est connue et
  contrôler ses sources, limites et éventuelles inférences.

Le Copilote ne doit pas être évalué sur le style de sa réponse seulement. Une
réponse agréable mais sans preuve correcte est un échec.

## Modèle de compte rendu hebdomadaire

```text
PILOT-01 — COMPTE RENDU SEMAINE

Magasin :
Semaine et dates :
Responsable :
Jours prévus / jours réellement testés :
Vendredi testé : oui / non
Samedi testé : oui / non

DONNEES
Exports attendus / importés :
Jours complets / partiels / absents :
Articles non résolus :
Erreurs ou références de requête :

PARCOURS DU MATIN
Temps habituel avant pilote :
Temps observé avec F&L Cockpit :
Étape la plus coûteuse :
Nombre de jours terminés avant 9 h 30 :
Appareil / navigateur / version déployée :
Coupures réseau, saisies concernées et récupération :
Temps perdu lors des interruptions :

PROPOSITIONS DE COMMANDE
Jours avec proposition disponible :
Articles calculables / indisponibles :
Nombre de lignes modifiées :
Principales catégories de modification :
Exemples de proposition trop haute :
Exemples de proposition trop basse :

RESULTATS TERRAIN
Ruptures ou quasi-ruptures remarquables :
Reliquats remarquables :
Casse ou démarque par rapport à la référence :
Signal de fraîcheur ou disponibilité retenu :
Événements susceptibles d'expliquer la semaine :

UTILITE ET CONFIANCE
Confiance moyenne, de 1 à 5 :
Utilité moyenne, de 1 à 5 :
Ce qui doit absolument être conservé :
Ce qui doit être corrigé avant de poursuivre :

DECISION PROPOSEE
Hypothèses confirmées :
Hypothèses infirmées :
Points encore indécidables :
Blocage à corriger immédiatement :
Priorité produit suggérée : données / stock / prévision / commande / UX /
promotions / espace-TG / Copilote / autre
```

## Quand le pilote peut être conclu

Le compte rendu final peut proposer la clôture de `PILOT-01` lorsque :

- la période et la référence ont été conservées sans modification opportuniste ;
- les jours réellement observés incluent les cas de calendrier nécessaires ;
- chaque donnée manquante et chaque modification significative est expliquée ;
- les temps, disponibilités de proposition, corrections, casse/démarque et
  signaux de disponibilité sont résumés ;
- les problèmes sont séparés entre données, modèle métier, UX et fonctionnalité ;
- chaque hypothèse importante reçoit l'état **confirmée**, **infirmée** ou
  **encore indécidable** ;
- la prochaine priorité est justifiée par les observations et non par l'attrait
  d'une nouvelle fonctionnalité.

Une conclusion négative ou partielle reste un pilote utile si elle permet de
modifier une hypothèse avant d'étendre le produit à d'autres magasins.

Voir aussi [Stock du matin et proposition de commande](./02_MORNING_STOCK_AND_ORDER.md),
[Imports et qualité des données](./01_IMPORTS_AND_DATA_QUALITY.md) et
[Décisions et Copilote](./05_DECISIONS_AND_COPILOT.md).
