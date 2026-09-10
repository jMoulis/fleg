# Décisions et Copilote

La rubrique **Décisions** conserve la mémoire des arbitrages. Le **Copilote**
aide à interroger les données, mais reste un analyste en lecture seule : il
n'exécute aucune action dans le magasin.

## Journal des décisions

Le journal regroupe notamment :

- les décisions prises sur les recommandations produit ;
- les conclusions des tests commerciaux ;
- les approbations et rejets de plans d'action proposés par le Copilote ;
- l'auteur, la date, les raisons et les versions de preuve associées.

Ces traces sont immuables. Une correction s'exprime par une nouvelle décision
ou un nouveau suivi, pas par la suppression de l'historique.

## Mesurer après une décision

Après avoir accepté ou modifié une recommandation, le manager peut programmer
un suivi : choisir la période d'observation et une échéance. Lorsque les données
sont disponibles, le suivi présente les écarts avant/après de chiffre
d'affaires, marge et quantité, avec la source et la révision utilisées.

Le manager ajoute alors son interprétation et les limites rencontrées. Un écart
ne prouve pas à lui seul que la décision en est la cause ; la saison, la météo,
une promotion ou un changement de disponibilité peuvent aussi intervenir.

## Poser une question au Copilote

Le Copilote peut analyser les ventes, marges, produits, démarques, allocations
d'espace et opérations commerciales du magasin autorisé. Les réponses
identifient les outils consultés, les sources, périodes et révisions, puis
séparent les éléments observés, calculés et inférés.

Exemples de questions utiles :

- « Pourquoi la marge a-t-elle baissé sur la dernière période ? »
- « Quels articles méritent une vérification cette semaine et pourquoi ? »
- « Quelles limites de données empêchent une conclusion solide ? »
- « Quels produits occupent un espace important avec une faible contribution ? »

Le Copilote du magasin ne peut pas choisir un autre `storeId`. La comparaison
réseau utilise une liste de magasins explicitement autorisés et demande un droit
supplémentaire de comparaison.

## Créer un plan d'action

Le Copilote ne crée un plan que sur demande explicite et après avoir obtenu des
preuves par ses outils de lecture. Le plan contient l'action proposée, l'effet
attendu, la confiance et les limites. Les sources réellement consultées sont
enregistrées par le serveur ; le modèle ne peut pas les remplacer.

Le plan reste un **brouillon**. Un manager autorisé peut l'approuver ou le
rejeter avec une justification. Même approuvé, son état d'exécution reste
**non exécuté** : il ne modifie ni article, ni stock, ni allocation, ni TG, ni
test et ne passe aucune commande.

## En cas de réponse indisponible

Une erreur affiche **Réponse indisponible** avec une référence. Conserver cette
référence pour le diagnostic, puis réessayer sans changer la question. Si la
page signale que le service n'est pas configuré, un administrateur technique
doit vérifier la configuration OpenAI côté serveur ; la clé ne doit jamais être
copiée dans l'interface ou communiquée à un autre utilisateur.

Le Copilote requiert les permissions d'utilisation de l'IA et de lecture des
analyses. L'approbation d'un plan exige en plus le droit d'approuver les
recommandations.

Voir [le dépannage détaillé](./07_GLOSSARY_AND_TROUBLESHOOTING.md#copilote).
