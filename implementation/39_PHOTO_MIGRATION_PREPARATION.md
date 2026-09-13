# TECH-04 lot 4a — inventaire et simulation de migration des photos

## But et limites

Préparer une décision à partir du volume réel des anciennes photos BSON, sans
ajouter de parcours utilisateur ni développer une bascule avant de savoir si elle
est nécessaire. Le gel offline approuvé après PR #48 reste en vigueur.

L’outil ne possède **aucune commande de copie, bascule, purge ou rollback réel**.
Il ne contacte jamais Blob, ne crée pas d’index, n’écrit pas d’audit MongoDB et ne
modifie pas l’application. Le plan de retour arrière est une procédure proposée,
pas un exécuteur testé. Une migration non exécutée n’a libéré aucun octet.

## Modes

```sh
# Aide sûre : aucune lecture de .env.local, aucun accès réseau
npm run maintenance:plan-photo-migration

# Simulation à partir d’un inventaire local (sans identifiants de connexion)
npm run maintenance:plan-photo-migration -- --snapshot inventaire.json --output plan.json
```

Pour un **inventaire distant séparément autorisé**, fournir explicitement
`PHOTO_MIGRATION_MONGODB_URI` par l’environnement ou un fichier dédié non versionné.
Préférer un compte MongoDB en lecture seule sur les deux bases. L’outil n’utilise
ni `MONGODB_URI`, ni `.env.local` automatiquement, ni une variable Blob.

```sh
npm run maintenance:plan-photo-migration -- --read \
  --credentials-file /chemin/prive/inventaire.env \
  --app-db NOM_BASE_APP --auth-db NOM_BASE_AUTH \
  --confirm-host HOTE_MONGODB \
  --organization ID_ORGANISATION --store ID_MAGASIN --actor ID_ADMIN \
  --confirm-scope ID_ORGANISATION/ID_MAGASIN \
  --output inventaire-page-1.json
```

`--confirm-host` doit correspondre exactement à l’hôte de l’URI, port compris
en local. Les URI multi-hôtes ne sont pas supportées par cette première commande.
L’accès de l’acteur est reconstruit via Better Auth et le magasin actif ; seul un
administrateur d’organisation est accepté, avant et après les lectures. Ce CLI
est un outil opérateur de confiance, pas une API d’authentification utilisateur.
Il ne faut jamais transmettre un URI ou un fichier d’environnement au chat/PR.

## Lecture bornée et qualification

- Deux collections parcourues par identifiant croissant et périmètre
  organisation/magasin : `attachments` et `attachmentObjects`, orphelins inclus.
- Page de 25 identifiants par défaut, maximum 100 (`--page-size`). Budget de
  lecture des octets de 16 Mio, maximum 64 Mio (`--max-read-bytes`).
- Octets d’une seule photo chargés à la fois, 4 Mio maximum. Taille BSON vérifiée
  côté serveur avant transfert, puis signature, MIME, taille et SHA-256 comparés.
  Les métadonnées et la cible sont contrôlées ; une modification concurrente
  détectée empêche de qualifier la photo comme candidate.
- Le rapport contient les noms des deux bases, identifiants, empreintes, tailles et statuts, **aucun
  octet, légende, nom de fichier, URL Blob ni secret**. Fichier créé exclusivement
  en mode `0600` si `--output` est donné ; un fichier existant n’est pas écrasé.
- L’inventaire n’est pas un snapshot transactionnel. Les statuts sont des constats
  au moment de la lecture, à revérifier impérativement avant toute écriture future.

Reprendre avec `--after CURSEUR` lorsque `nextCursor` n’est pas nul, en conservant
chaque page séparément. `exhausted` indique la fin de ce parcours, pas la stabilité
future des données. Un plan issu d’une page de reprise reste explicitement partiel.
Une page sans candidat n’établit pas qu’il n’y a rien à migrer dans les autres pages.

Les statuts distinguent : candidat vérifié, déjà Blob (sans contrôle distant),
Blob avec reliquat BSON, BSON orphelin, contenu absent/invalide, métadonnées ou cible
invalides, suppression en cours et modification concurrente. Les anomalies restent
à examiner ; elles ne constituent jamais une liste d’effacement automatique.

## Décision et exécution ultérieure

Si l’inventaire complet ne contient aucune ancienne photo à migrer, documenter
ce constat et ne pas construire un moteur de migration inutile. S’il existe des
candidats, faire approuver le lot exact, la destination et le budget avant de
réaliser l’outillage d’exécution. Conserver les identifiants/métadonnées métier,
intégrer les références dans le cycle durable existant (intentions, quotas,
nettoyage, lecture/suppression et audit) et relire les copies avant bascule CAS.

Retour arrière prévu :

1. Avant bascule : BSON reste la source ; rapprocher la copie distante exacte.
2. Après bascule, avant purge : retour conditionnel vers BSON vérifié, seulement
   si la source est encore active. Ne jamais annuler une suppression concurrente.
3. Après purge BSON : pas de retour automatique. Garder le lecteur hybride/Blob
   compatible ; toute restauration exige une sauvegarde et une autorisation.

La purge BSON sera une décision distincte après validation. Pas de double stockage
permanent, pas de suppression de collection/bucket et pas de retour vers un ancien
déploiement incapable de lire Blob.

## Vérifications de ce lot

Tests de schémas/calculs et CLI sans réseau ; intégration sur MongoDB local jetable
pour pagination, budget, isolation, droits révoqués et anomalies. Aucune modification
d’écran : Figma/captures navigateur sans objet. Aucun schéma/index MongoDB ajouté.
La gestion des curseurs suit le [pilote MongoDB officiel](https://www.mongodb.com/docs/drivers/node/current/crud/query/cursor/).

Validation locale du 2026-09-13 : lint, TypeScript, Knip et **537 tests réussis**
avec un replica set MongoDB jetable. Le test runtime PDF reste conditionnel et
n’est pas concerné par ce CLI. Les 15 nouveaux tests couvrent aussi la commande
réelle inventaire → fichier local → simulation, sans Blob ni base distante.
Build de production et recette E2E locale : **70 réussis, 4 ignorés** (appels
OpenAI réels désactivés), sur les parcours mobile et desktop.
