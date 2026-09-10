# Glossaire et dépannage

## Glossaire

**ABC**
Classement selon la contribution économique cumulée d'un article.

**XYZ**
Classement selon la régularité de la demande quotidienne, calculé uniquement
avec des semaines complètes exploitables.

**Article canonique**
Identité produit stable à laquelle plusieurs libellés ou identifiants source
peuvent être rattachés.

**Colisage**
Nombre de kilogrammes ou de pièces contenus dans un colis. Il peut varier d'une
commande à l'autre ; le comptage conserve la valeur utilisée au moment de sa
validation.

**Confiance**
Indication sur la qualité et la couverture des preuves disponibles. Une
confiance faible n'est pas une certitude faible chiffrée : c'est un signal de
prudence.

**Démarque**
Perte observée, saisie séparément des ventes et de la marge Mercalys.

**Fait observé**
Donnée effectivement importée ou saisie, par opposition à une prévision ou une
interprétation.

**ITM8 / EAN**
Identifiants article utilisés pour fiabiliser le rapprochement des imports.

**Plan d'action Copilote**
Proposition documentée et non exécutée. Son approbation ne réalise aucune
mutation opérationnelle.

**Révision**
Version traçable d'une donnée ou d'un calcul. Une correction crée une nouvelle
révision au lieu de réécrire silencieusement l'historique.

**TG**
Tête de gondole utilisée pour une opération commerciale datée.

**Zéro / inconnu**
Zéro affirme qu'une mesure a été observée à zéro. Un champ vide indique que la
mesure manque ; l'application conserve cette différence.

## Accès et navigation

### Aucun magasin n'apparaît

Vérifier que l'invitation à l'organisation a été acceptée avec la bonne adresse.
Demander ensuite à un administrateur une affectation explicite au magasin.

### Une rubrique ou un bouton manque

Les actions sont filtrées par permission. Demander à l'administrateur de
contrôler le rôle et les droits effectifs du magasin concerné. Vérifier aussi
sur mobile l'en-tête et le défilement horizontal de la navigation.

### Le mauvais magasin est affiché

Utiliser le sélecteur d'en-tête. Ne pas modifier manuellement l'adresse pour
tenter d'ouvrir un autre magasin : le serveur réautorise toujours l'accès.

## Imports

### Le fichier est refusé

Contrôler qu'il s'agit bien d'un XLSX ou CSV du format choisi, que le point de
vente correspond au magasin et que chaque ligne d'un export couvrant plusieurs
jours porte une date exploitable. Lire tous les avertissements de la
prévisualisation.

### Des articles restent non reconnus

Comparer ITM8 et EAN avant le libellé. Créer l'article s'il est nouveau,
fusionner uniquement si l'identité est certaine, ou ignorer une ligne qui ne
représente pas un article. Une fusion erronée affecte les imports suivants.

### Un réimport semble ne rien faire

C'est attendu si le fichier est strictement identique : l'import est
idempotent. Une correction réelle doit apparaître comme une nouvelle révision.

## Stocks et commande

### Une ligne de stock ne peut pas être validée

Vérifier le code famille, l'unité et le colisage. Une ligne commencée doit être
complète. En pièces, le colisage et la quantité doivent être entiers. Une valeur
vide signifie inconnu ; saisir explicitement `0` lorsque le comptage est nul.

### La proposition est indisponible

Contrôler les trois prérequis pour la même date : comptage du matin validé,
prévision quotidienne disponible et colisage renseigné. Corriger toute valeur
négative. Un historique mensuel sans ventes quotidiennes suffisantes ne permet
pas de fabriquer la prévision manquante.

### La proposition paraît trop élevée

Lire la période couverte et le reliquat projeté. La proposition du vendredi
couvre samedi et dimanche, celle du samedi couvre lundi, et l'arrondi au colis
supérieur peut créer un surplus. Vérifier aussi le stock de clôture cible dans
les paramètres.

### La commande n'a pas été envoyée

C'est le fonctionnement prévu. F&L Cockpit prépare et trace une proposition ;
la commande doit être passée dans l'outil fournisseur habituel.

## Calculs, espace et tests

### XYZ ou la prévision quotidienne est absent

Il manque probablement assez de jours et de semaines complètes. Importer les
données quotidiennes réelles ; ne pas remplacer les jours absents par des
zéros.

### Préparer une proposition d'espace ne lance pas l'IA

C'est intentionnel. Le bouton exécute une heuristique déterministe. Le Copilote
est une rubrique séparée et n'exécute aucune allocation.

### Un test ne produit pas de résultat

Vérifier que le test a été démarré puis terminé et que toutes les données de la
période et de la référence sont disponibles. L'application préfère une
évaluation indisponible à un uplift inventé.

## Copilote

### Le Copilote indique « configuration requise »

La configuration serveur OpenAI manque ou est invalide. Contacter
l'administrateur technique. Ne jamais transmettre la clé API dans l'interface.

### Le Copilote affiche « Réponse indisponible »

Noter la référence affichée, puis réessayer une fois avec la même question. Si
le problème persiste, transmettre la référence à l'administrateur : elle permet
de retrouver le diagnostic sans exposer les secrets.

### Le plan approuvé n'a rien modifié

C'est intentionnel. Un plan approuvé reste non exécuté. Appliquer séparément
l'action dans le parcours métier autorisé, puis mesurer son résultat.

## Obtenir de l'aide

Fournir à l'administrateur : le magasin concerné, la rubrique, la date et la
période, l'action tentée, le message exact et, si elle existe, la référence
d'erreur. Ne jamais joindre de clé API, mot de passe ou secret serveur.

Retour au [guide de prise en main](./00_START_HERE.md) ou au
[portail documentaire](../README.md).
