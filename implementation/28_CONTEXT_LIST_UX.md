# UX-LIST-08 — saisie promotionnelle et historiques contextuels

## Problème observé

La saisie d’une promotion affiche chaque produit du catalogue sous forme de case
à cocher dans une zone défilante. Avec plusieurs centaines d’articles, retrouver
les produits concernés devient lent et imprécis. Les historiques promotionnels
et météo rendent également toutes les observations de la plage chargée.

## Décision

Conserver les contrats V3-05 et borner uniquement les interactions clientes :

- rechercher les produits avant des pages de 10 candidats ;
- ajouter un produit directement depuis son résultat et le retirer des
  candidats disponibles ;
- garder les produits sélectionnés visibles et individuellement retirables ;
- rappeler la limite existante de 50 produits par observation ;
- ordonner comme aujourd’hui les preuves par date d’enregistrement décroissante,
  puis paginer séparément les historiques promotion et météo par 25 ;
- conserver la couverture quotidienne sur sa plage temporelle déjà bornée.

## Invariants

- promotion et météo restent des faits observés immuables et sourcés ;
- une absence reste inconnue tant qu’elle n’est pas explicitement constatée ;
- la recherche locale ne donne accès à aucun produit d’un autre magasin ;
- dates, provenance, idempotence, révision des données, autorisation et audit
  restent inchangés ;
- aucune observation ne modifie les ventes, stocks, prévisions ou expériences.

## Critères d’acceptation

- le sélecteur promotionnel ne rend jamais plus de 10 produits ;
- la recherche précède la pagination et l’ajout retire le produit des candidats ;
- aucun historique ne rend plus de 25 preuves à la fois ;
- les contrôles de pagination et les plages visibles sont accessibles ;
- la recette responsive couvre sélection produit, preuve promotionnelle, preuve
  météo, jointure et bornage des historiques ;
- qualité, build de production et suite Playwright complète restent verts.

## Frontière suivante

Le sélecteur commun des cibles de photos, notamment l’historique des opérations
TG, reste un sujet transversal ultérieur. UX-LIST-08 ne modifie ni les fichiers
ni leur cycle de conservation.
