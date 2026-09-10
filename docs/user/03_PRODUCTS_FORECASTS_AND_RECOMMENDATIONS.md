# Produits, prévisions et recommandations

La rubrique **Produits** relie les faits importés, les classements analytiques,
les prévisions et les recommandations. Elle aide à décider ; elle ne modifie
jamais automatiquement l'assortiment ni l'implantation.

## Lire la matrice produit

Choisir une période puis utiliser la recherche, les filtres ABC et XYZ ou le
tri. La matrice présente selon les données disponibles :

- chiffre d'affaires, marge et quantité observés ;
- évolution par rapport à la période comparable ;
- classement ABC et vrai classement XYZ ;
- prévision mensuelle et niveau de confiance ;
- recommandation actuelle.

Lorsqu'aucun article n'apparaît, vérifier d'abord qu'un import a été validé pour
le magasin et la période. Une valeur absente ne doit pas être interprétée comme
une vente nulle.

## Comprendre ABC et XYZ

- **ABC** classe les articles selon leur contribution économique cumulée.
- **XYZ** mesure la régularité de la demande quotidienne.

Le vrai classement XYZ utilise uniquement des semaines complètes du lundi au
dimanche. Si la fenêtre ne contient pas assez de semaines complètes,
l'application laisse l'article non classé et explique la limite. Elle ne
complète pas artificiellement les jours absents.

La lettre ABC et la lettre XYZ répondent donc à deux questions différentes. Un
article peut être important économiquement mais irrégulier, ou régulier avec un
poids économique moindre.

## Ouvrir une fiche article

La fiche rassemble :

- les KPI observés pour la période ;
- la prévision mensuelle de chiffre d'affaires ;
- la prévision quotidienne en unités sur sept jours ;
- les plages d'apprentissage et de contrôle du modèle ;
- les mesures d'erreur telles que MAE et WAPE lorsqu'elles sont calculables ;
- les versions de données, de configuration et de calcul ;
- les avertissements et limites ;
- la recommandation et ses preuves.

La prévision mensuelle et la prévision quotidienne sont deux calculs séparés.
La proposition de commande utilise la prévision quotidienne en unités, pas la
prévision mensuelle de chiffre d'affaires.

## Lire la confiance

La confiance reflète la couverture et la qualité des données utilisées. Une
confiance faible n'interdit pas la lecture, mais signale qu'une décision doit
être davantage vérifiée sur le terrain. Si les données ne permettent pas un
calcul honnête, l'application indique que la prévision est indisponible au lieu
d'afficher un zéro.

Les observations de promotion et de météo sont conservées comme contexte et
preuves. Dans la version actuelle, elles n'alimentent pas encore le calcul des
prévisions ou des recommandations.

## Décider une recommandation

Les recommandations peuvent notamment proposer de pousser, réduire, maintenir,
surveiller la marge ou protéger un produit de trafic. La fiche sépare :

1. les signaux observés ;
2. l'interprétation ;
3. l'action proposée ;
4. le niveau de confiance et les limites ;
5. les versions du calcul et des données.

Une recommandation reste un brouillon. Avec la permission appropriée, choisir :

- **Accepter** ;
- **Modifier** ;
- **Rejeter** ;
- **Reporter**.

Expliquer la décision, particulièrement lors d'une modification ou d'un rejet.
La décision est inscrite dans un journal immuable et ne déclenche pas à elle
seule une modification physique du rayon.

Les recommandations actives autres que « maintenir » sont également regroupées
dans **Actions**. Cliquer sur une action ouvre la fiche article qui porte les
preuves utiles à la décision.

Voir [Décisions et Copilote](./05_DECISIONS_AND_COPILOT.md) pour le suivi des
effets après la période choisie.
