# Administration

L'administration distingue toujours l'organisation d'authentification et les
magasins métier. Une organisation représente l'entreprise ou le groupe ; un
magasin possède ses propres données, membres, rôles et permissions.

## Administrer l'organisation

Le propriétaire ou un administrateur d'organisation peut :

- créer, renommer, désactiver ou réactiver un magasin ;
- inviter une personne dans l'organisation ;
- affecter cette personne à un ou plusieurs magasins ;
- choisir son rôle magasin et personnaliser ses permissions.

La création d'un magasin initialise son rayon F&L et un plan de référence. Une
désactivation retire le magasin des usages courants sans confondre cette action
avec une suppression de son historique.

## Inviter une personne

1. Saisir l'adresse e-mail et envoyer l'invitation.
2. Si l'envoi d'e-mail n'est pas configuré, copier le lien de secours et le
   transmettre par un canal approprié.
3. Attendre que la personne accepte l'invitation avec la même adresse.
4. Lui attribuer explicitement un accès magasin.
5. Vérifier le rôle et les permissions effectives.

Les liens d'invitation expirent. Accepter l'organisation ne donne pas à lui seul
accès à un magasin.

## Choisir un rôle magasin

Les profils par défaut sont :

- **Direction magasin** : administration et ensemble des opérations du magasin ;
- **Responsable de rayon** : analyses, stock, commandes, espace, opérations,
  tests, décisions et Copilote ;
- **Employé** : consultation opérationnelle, imports, démarque et stock selon
  les permissions par défaut ;
- **Lecture seule** : consultation sans mutation.

Les permissions sont personnalisables indépendamment du nom du rôle. Après une
modification, contrôler le résultat avec le compte concerné : une rubrique
masquée ou un bouton absent peut être la conséquence attendue du nouveau
périmètre.

Les propriétaires et administrateurs d'organisation disposent d'un accès
administratif hérité. Les autres comptes passent par leur adhésion magasin.

## Paramétrer un magasin

La rubrique **Paramètres** rassemble les objectifs et coefficients utilisés par
les calculs : saisonnalité et XYZ, prévision par jour de semaine,
recommandations, commande en flux tendu, références et évaluation des tests,
ainsi que valeurs par défaut des allocations d'espace.

Modifier un coefficient peut changer plusieurs résultats futurs. Avant toute
modification :

1. noter le besoin métier observé ;
2. changer uniquement le paramètre concerné ;
3. conserver une valeur explicable ;
4. vérifier les résultats sur des exemples connus ;
5. ne pas recalibrer avec des données fictives.

Les objectifs mensuels sont gérés séparément. Les photos de rayon jointes aux
paramètres ou au contexte restent des observations : elles ne recalculent pas
le plan ni les prévisions.

Les droits de lecture du magasin, d'écriture des paramètres, d'écriture des
objectifs et d'ajout de pièces jointes sont distincts.

## Bonnes pratiques d'accès

- accorder seulement les magasins et permissions nécessaires ;
- retirer ou désactiver rapidement un accès devenu inutile ;
- ne jamais partager de compte ;
- ne jamais placer un secret serveur dans un commentaire, une note ou une
  capture d'écran ;
- vérifier le magasin sélectionné avant toute importation ou validation.
