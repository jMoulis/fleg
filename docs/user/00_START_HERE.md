# Guide utilisateur — commencer ici

Ce guide décrit F&L Cockpit tel qu'il est livré au 10 septembre 2026. Il
s'adresse aux responsables de rayon, employés, directions de magasin et
administrateurs d'organisation.

## À quoi sert F&L Cockpit ?

L'application rassemble les faits disponibles sur un rayon fruits et légumes
et aide à préparer des décisions traçables : comprendre les ventes, compter le
stock du matin, préparer une proposition de commande, organiser l'espace,
suivre les opérations commerciales et capitaliser les décisions.

Elle ne remplace ni le jugement du responsable ni les outils d'exécution du
magasin. En particulier, une proposition de commande n'est jamais transmise au
fournisseur par F&L Cockpit.

## Organisation, magasin et rayon

- **Organisation** : l'entreprise ou le groupe auquel appartient le compte.
- **Magasin** : le point de vente dont les données et les droits sont isolés.
- **Rayon F&L** : le périmètre métier actuellement piloté dans chaque magasin.

Appartenir à une organisation ne donne pas automatiquement accès à ses
magasins. Chaque accès magasin est attribué explicitement. Le sélecteur de
magasin ne propose donc que les magasins autorisés pour le compte connecté.

## Première connexion

1. Ouvrir le lien d'invitation reçu par e-mail ou transmis par
   l'administrateur.
2. Créer le compte ou se connecter avec l'adresse invitée.
3. Accepter l'invitation à l'organisation.
4. Choisir un magasin autorisé.

Si aucun magasin n'apparaît après l'acceptation, demander à l'administrateur de
vous affecter explicitement à un magasin. Une invitation à l'organisation seule
ne suffit pas.

## Navigation

La navigation magasin peut proposer les rubriques suivantes selon les droits :

- **Accueil** : synthèse du magasin et fraîcheur des données ;
- **Actions** : recommandations en attente d'une décision ;
- **Produits** : matrice produit, historique, prévisions et recommandations ;
- **Stocks** : configuration des unités et comptage du matin ;
- **Commande** : proposition déterministe issue des prévisions et du stock ;
- **Espace** et **Contexte** : plan, allocations et observations terrain ;
- **TG** : opérations en tête de gondole ;
- **Tests** : expériences commerciales ;
- **Démarque** : faits de perte saisis manuellement ;
- **Imports** : intégration des exports Mercalys ;
- **Aide** : guide des parcours, définitions métier et dépannage ;
- **Décisions** : journal des décisions et suivis ;
- **Paramètres** : objectifs, coefficients et photos du rayon ;
- **Copilote** : analyse assistée par OpenAI à partir d'outils en lecture.

Sur mobile, la barre de navigation opérationnelle défile horizontalement. Les
accès Aide, Paramètres et Copilote se trouvent dans l'en-tête. Décisions ne
possède pas encore d'entrée directe dans la navigation mobile. Une autre
rubrique absente signifie généralement que le rôle ne possède pas la permission
nécessaire.

Il n'existe pas de rubrique Prévisions séparée : les prévisions mensuelles et
quotidiennes apparaissent dans Produits, sur la fiche article et dans Commande.

## Rôles habituels

- **Direction magasin** : ensemble des droits du magasin, y compris réglages et
  gestion des accès selon la délégation reçue.
- **Responsable de rayon** : opérations, analyses, décisions et Copilote, sans
  administration structurelle par défaut.
- **Employé** : lecture opérationnelle, import, démarque et saisie du stock
  selon le profil par défaut.
- **Lecture seule** : consultation des analyses, stocks et tests.

Un administrateur peut personnaliser finement les permissions. Le rôle affiché
ne remplace donc pas la vérification des droits effectifs.

## Trois règles pour bien lire les données

1. **Vide ne veut pas dire zéro.** Une date ou une mesure absente reste inconnue
   et n'est pas inventée par l'application.
2. **Un fait n'est pas une prévision.** Les ventes et stocks observés sont
   séparés des calculs prévisionnels et des recommandations.
3. **Une proposition n'est pas une exécution.** Commandes, recommandations et
   plans du Copilote restent sous le contrôle explicite du manager.

## Parcours conseillé

Lors de la mise en route d'un magasin :

1. [importer et contrôler les données](./01_IMPORTS_AND_DATA_QUALITY.md) ;
2. [configurer les articles et saisir le stock du matin](./02_MORNING_STOCK_AND_ORDER.md) ;
3. [lire les prévisions et décider les recommandations](./03_PRODUCTS_FORECASTS_AND_RECOMMENDATIONS.md) ;
4. compléter progressivement les autres modules selon le travail réel du rayon.

Retour au [portail documentaire](../README.md).
