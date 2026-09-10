# Imports et qualité des données

La rubrique **Imports** transforme des exports Mercalys en faits observés. Un
fichier est toujours prévisualisé avant d'être enregistré : cette étape permet
de contrôler la période, le point de vente, les totaux, la couverture et les
articles non reconnus.

## Deux imports distincts

### Export journalier

Il alimente les ventes quotidiennes nécessaires aux vues par jour de semaine,
au vrai classement XYZ et à la proposition de commande. La prévisualisation
affiche notamment la date ou la plage détectée, le point de vente, les montants,
les quantités, les lignes incluses ou écartées et le niveau de couverture.

Un export couvrant plusieurs jours doit porter une date exploitable sur chaque
ligne. Sinon l'import est refusé : l'application ne répartit pas arbitrairement
un total entre plusieurs journées.

### Synthèse mensuelle

Elle alimente l'historique mensuel, les KPI, le classement ABC et les
prévisions mensuelles. Les colonnes ITM8 et EAN peuvent être présentes, mais
restent optionnelles pour ce format.

## Avant de valider

1. Déposer un fichier XLSX ou CSV dans la section correspondant à son format.
2. Lire la période et le point de vente reconnus.
3. Comparer le chiffre d'affaires, la marge et les quantités aux totaux
   Mercalys disponibles.
4. Examiner les avertissements et les lignes exclues.
5. Résoudre chaque article non reconnu.
6. Enregistrer seulement lorsque le périmètre est correct.

Un point de vente incompatible avec le magasin courant provoque un rejet. Les
lignes de total ou d'agrégat ne deviennent pas des articles. Une date absente
ne devient jamais une journée à zéro.

## Résoudre l'identité d'un article

Pour chaque libellé non reconnu, trois choix sont possibles :

- **Créer** un nouvel article canonique ;
- **Fusionner** avec un article canonique existant ;
- **Ignorer** la ligne lorsqu'elle ne représente pas un article exploitable.

Lorsque les identifiants existent, la résolution privilégie ITM8, puis EAN,
puis le libellé normalisé. Vérifier soigneusement une fusion : elle détermine
où seront rattachées les observations futures de cette source.

## Réimporter ou corriger

Les imports sont idempotents : rejouer exactement le même fichier ne doit pas
dupliquer les faits. Un export journalier corrigé crée une nouvelle révision
traçable au lieu d'effacer silencieusement l'historique. Les validations sont
auditées.

## Permissions

- la prévisualisation demande la permission de créer un import ;
- l'enregistrement définitif demande la permission de valider un import.

Si le bouton de validation est absent, le fichier n'est pas nécessairement en
erreur : le compte peut simplement ne pas posséder le droit correspondant.

## Après l'import

Contrôler la fraîcheur des données sur l'Accueil puis ouvrir Produits. Les
calculs quotidiens exigent une couverture journalière suffisante ; un historique
mensuel seul ne permet pas de reconstituer des jours manquants.

Voir aussi [Produits, prévisions et recommandations](./03_PRODUCTS_FORECASTS_AND_RECOMMENDATIONS.md)
et [le dépannage des imports](./07_GLOSSARY_AND_TROUBLESHOOTING.md#imports).
