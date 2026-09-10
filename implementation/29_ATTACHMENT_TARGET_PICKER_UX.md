# UX-LIST-09 — sélection des cibles photo

## Problème observé

La photothèque partage un menu qui rend toutes ses cibles. Sur la page TG, ce
menu peut contenir jusqu’à 500 opérations commerciales ; sur Espace, il grandit
avec le nombre de mobiliers de la version. La cible devient difficile à
retrouver et le DOM croît avec tout l’historique.

## Décision

Conserver PREV3-04 sans modification de données et remplacer le menu par le
sélecteur borné partagé :

- afficher clairement la cible courante et sa description ;
- ouvrir la recherche avec **Changer** ;
- rechercher sur le libellé et la description avant des pages de 10 cibles ;
- refermer la recherche après sélection ;
- afficher uniquement les photos de la cible choisie.

Les photos restent naturellement bornées à 20 par cible par le contrat serveur.
Une pagination supplémentaire des images n’est donc pas nécessaire.

## Invariants

- chaque cible reste reconstruite depuis son union discriminée validée ;
- toutes les lectures et mutations restent autorisées par magasin côté serveur ;
- types de fichiers, signature binaire, taille maximale et limite par cible
  restent inchangés ;
- ajout et suppression restent audités et idempotents ;
- une photo reste une observation manuelle sans effet sur le plan ou une TG.

## Critères d’acceptation

- aucun sélecteur photo ne rend plus de 10 cibles à la fois ;
- la recherche porte sur le nom et la description avant pagination ;
- la cible sélectionnée et sa description restent explicites ;
- les états sans cible, sans photo, lecture seule, erreur et confirmation de
  suppression restent inchangés ;
- la recette responsive retrouve une opération TG par recherche et affiche sa
  photo sans modifier les garanties d’isolement ou de suppression ;
- qualité, build de production et suite Playwright complète restent verts.

## Frontière suivante

UX-LIST-09 clôt l’audit pré-pilote des listes à forte cardinalité identifiées.
Tout nouveau bornage doit désormais provenir d’une friction observée pendant le
pilote, et non d’une extension spéculative.
