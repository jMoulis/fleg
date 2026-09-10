# UX-LIST-07 — listes et sélecteurs des expériences

## Problème

Le module Tests & Expériences charge jusqu’à 500 tests, toutes les opérations
commerciales et tout le catalogue produit. Les afficher sans recherche ni borne
rend la préparation et la consultation difficiles sur mobile comme sur bureau.

## Périmètre

- filtrer la catégorie active des tests avant des pages de 25 cartes ;
- rechercher un test par nom, hypothèse, famille, produit ou emplacement ;
- rechercher les opérations commerciales liables avant des pages de 10 ;
- rechercher et ajouter directement un produit testé depuis des pages de 10 ;
- conserver la liaison facultative d’une opération et la possibilité de la
  retirer avant enregistrement ;
- conserver sans changement les contrats de création, de démarrage,
  d’évaluation, de conclusion, d’autorisation et d’audit.

## Hors périmètre

- modification du modèle ou des statuts d’expérience ;
- nouvelle méthode statistique ;
- chargement serveur incrémental ;
- exécution automatique d’une action en rayon.

## Critères d’acceptation

- la recherche des tests s’applique dans la catégorie active avant pagination ;
- aucune page ne rend plus de 25 cartes de test ;
- les sélecteurs d’opération et de produit ne rendent pas plus de 10
  propositions à la fois ;
- l’ajout d’un produit est direct et le retire des propositions disponibles ;
- l’opération choisie reste explicite, modifiable et déliable ;
- l’acceptation navigateur responsive couvre la sélection produit, le cycle
  planifier/démarrer/terminer et la recherche dans la liste.

## Preuves attendues

- `npm run check` ;
- `npm run build:e2e` ;
- recette Playwright `REL-03` sur mobile et bureau ;
- suite Playwright complète.
