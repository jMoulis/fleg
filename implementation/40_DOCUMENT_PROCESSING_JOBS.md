# TECH-05 — traitements PDF persistants, lot backend

## Lot Documents — 14 septembre 2026, après fusion de la PR #52

Périmètre présenté puis approuvé par le manager avant codage. L’écran Documents
propose un volet **Texte du PDF** sur chaque source. Aucune requête de traitement
tant que le volet reste fermé ; l’ouverture lit le statut, jamais ne crée un job.
**Extraire le texte** appelle le POST existant, seulement pour un utilisateur
autorisé et un magasin activé. Le serveur reste l’autorité de chaque commande.
Une configuration invalide masque l’admission sans casser la liste des PDF.

Le volet distingue attente, exécution, échec définitif, annulation et texte prêt.
Il affiche le texte littéralement (pas de HTML/Markdown interprété), une page à
la fois, et laisse les pages vides/scannées vides, sans OCR. Le texte n’est ni
une analyse IA ni une validation commerciale ; la date d’expiration est visible.
Lecture et retrait du texte restent disponibles quand l’admission est désactivée.

Suivi automatique : GET toutes les 30 secondes pendant les états actifs, au plus
20 vérifications par ouverture/actualisation manuelle, seulement avec page visible
et réseau disponible. L’erreur arrête ce suivi ; l’utilisateur peut actualiser.
Chaque requête expire après 15 secondes. Une réponse perdue à POST/DELETE laisse
l’action **non confirmée** : vérifier par GET, sans réémission automatique.
Fermeture/navigation annule les requêtes et libère le texte en mémoire. Aucun
texte ni résultat dans IndexedDB, sessionStorage ou cache HTTP. Une lecture refusée
efface le résultat affiché ; l’expiration locale le retire aussi.

**Annuler l’extraction / Retirer le texte extrait** demande confirmation et appelle
DELETE sur le traitement, pas sur le PDF. Une annulation n’est pas une commande
de redémarrage ; l’admission d’un nouveau job attend expiration/nettoyage TTL.
Les limites/rétentions/backend et les gates de déploiement ci-dessous ne changent
pas. Aucun flag distant activé, aucune donnée réelle traitée par ce lot.

Acceptation : états et requêtes Zod, réponse perdue sans double POST, refus d’accès,
annulation, contenu littéral, page scannée, admission désactivée, lecture seule,
polling/fermeture et rendu 390/1440 px. Recette application réelle avec MongoDB
jetable : lecture inter-magasin refusée, texte consultable par page, retrait
transactionnel du texte conservant le PDF et annulation persistante après reload.
Les fixtures sont synthétiques ; la recette Preview/Blob réel reste à faire.

Vérifications locales du lot : `npm run check` avec MongoDB jetable, **560 tests
réussis**, un test runtime conditionnel exécuté séparément avec succès. La recette
Chromium des composants réels (API simulée uniquement) passe en 390/1440 px,
y compris arrêt après 20 vérifications et expiration du texte affiché. Build
webpack et suite E2E complète : **72 réussis, 4 tests OpenAI réels ignorés**.
La revue React conserve la page serveur, les contrôles d’accès dans les API et
un chargement du texte à la demande. Le guide utilisateur est mis à jour ; la
validation préalable des prochains lots IA/Copilote est inscrite dans AGENTS.md.

## Décision du 14 septembre 2026

PR #49 fusionnée. L’inventaire autorisé du magasin démo ne trouve aucun contenu
image/PDF dans MongoDB : `attachmentObjects` vide, références PDF/photos sur Blob.
Les traces `deleted` restent intactes. Aucune suppression ou migration nécessaire,
aucune conclusion sur d’autres magasins. Ne pas construire d’exécuteur de migration
pour ce périmètre vide. Les extensions offline restent gelées.

Le manager autorise TECH-05. Ce lot livre le **moteur et les API**, pas les commandes
dans Documents ni une activation Production. PILOT-01 et V4-01 restent ouverts.

## Choix d’exécution

Vercel Workflow a été évalué sur sa documentation officielle actuelle :
[fonctionnement](https://vercel.com/docs/workflows),
[tarification, rétention et limites](https://vercel.com/docs/workflows/pricing).
Les étapes accèdent à Node.js ; leurs entrées/sorties/événements sont persistés.
La documentation annonce sept jours de rétention après terminaison sur Pro, avec
facturation des événements, écritures/rétention, Queues et Functions. La région
dépend de la version du SDK. Son intégration webpack/Serwist et la suppression des
copies de données privées nécessiteraient une vérification spécifique.

Pour cette extraction native bornée, **MongoDB est le journal durable, Cron le
réveil**. Aucun nouveau SDK/service. Les lectures Blob, opérations MongoDB et
invocations Functions restent facturables ; zéro dépense IA ne signifie pas zéro
coût d’infrastructure. [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing)
fonctionne indépendamment du navigateur en Production ; en Preview/local, appeler
explicitement la route authentifiée. Il ne garantit ni livraison unique ni
exécution immédiate. Baux/transactions et passage suivant permettent la reprise.
Réévaluer Workflow pour OCR/modèles/attentes longues, sans mettre les PDF/textes
dans les messages ou résultats d’orchestration sans décision de rétention.

## Contrat et limites

- Job lié à organisation/magasin/source/SHA-256/politique, identifiant déterministe
  et index unique. Les doublons concurrents réutilisent le même travail.
- États `queued`, `running`, `failed`, `ready`, `cancelled`. `ready` signifie
  extraction technique terminée, **pas validation commerciale**.
- Checkpoints `queued`, `validated` (source relue, empreinte vérifiée), `extracted`.
  Chaque reprise relit l’original privé ; aucun PDF dans la queue MongoDB.
- PDFium 2.1.13, extracteur `pdfium-2.1.13-text-1`, politique `pdf-text-1`.
  Pas d’OCR, modèle/prompt, embedding/indexation ou artefact OpenAI. Le document
  est du texte non fiable qui ne peut déclencher aucune action métier.
- Pages ordonnées, numérotées dès 1. Texte littéral non revu ; l’ordre interne du
  PDF ne garantit pas la fidélité d’un tableau. Pages vides/scannées laissées vides,
  sans contenu inventé ni OCR implicite.
- Limites versionnées : 25 Mio, 60 pages, 20 000 caractères/page, 120 000/document,
  worker 10 s, heap JS 96 Mio et WASM 256 Mio. Dépassement → aucun résultat partiel.
- 20 jobs conservés/magasin, admission sérialisée ; un worker logique/magasin,
  bail 120 s, trois tentatives maximum. Reprise transitoire après 60 puis 120 s
  au plus tôt. Jeton de bail empêchant la publication d’un ancien worker repris.
  Un chevauchement physique après expiration n’est pas impossible, mais ses effets
  sont neutralisés. Les budgets sont techniques, pas des coefficients métier.
- Historique borné des tentatives : début/fin si connus, version extracteur,
  code assaini, coût IA nul. Fin absente = arrêt non enregistré. Pas de stack,
  URL, clé ni texte privé dans l’audit/les diagnostics.
- Jobs et texte expirent sept jours après création : nettoyage TTL, mais refus
  de lecture/exécution dès expiration même si le TTL tarde. Le plafond inclut
  les lignes expirées non encore nettoyées. Maximum 2,4 millions de caractères
  par magasin, hors métadonnées ; pas de conservation permanente par ce lot.
- Révocation du PDF et annulation/effacement du texte dans la même transaction.
  Publication touche le même document source et vérifie le bail ; lectures
  recontrôlent sa visibilité. Nettoyage physique Blob indépendant, jamais annoncé
  accompli par le job. Une annulation utilisateur retire le texte, pas le PDF.
- Droits Better Auth du demandeur revérifiés à l’exécution et à la publication.
  Révocation/absence source annule le travail. Les lectures publiques utilisent
  les droits magasin actuels du lecteur, pas une ancienne autorisation de job.

## API et exploitation

`/api/stores/[storeId]/attachments/documents/[sourceId]/processing` :

- `POST {}` : `attachments.write`, origine/corps strict borné, allowlist et flag
  serveur. 202 et travail existant/créé. Aucun compteur remis à zéro au rejeu.
- `GET` : `stores.read`, statut/résultat non revu ; `job: null` si absent/expiré,
  404 si source inaccessible. Toutes les réponses sont `private, no-store`.
- `DELETE {}` : annulation et retrait du texte, sans supprimer l’original.
  Origine/permission contrôlées ; disponible même si l’admission est désactivée.

`/api/cron/document-processing` : secret serveur `CRON_SECRET`, au plus quatre
magasins explicitement autorisés et un job/magasin/invocation. Les paramètres HTTP
ne définissent jamais le scope. Réponse avec compteurs uniquement. Planification
toutes les cinq minutes ; `disabled` par défaut sans MongoDB/Blob.

```dotenv
DOCUMENT_PROCESSING_ENABLED=false
DOCUMENT_PROCESSING_STORE_IDS=
```

Aucune variable distante activée par ce lot. Recette Preview : bases/documents
synthétiques isolés, Blob privé configuré, secret et allowlist explicites ; créer
le job via API authentifiée, fermer le navigateur, invoquer le Cron côté opérateur
sans exposer son secret au navigateur. Vérifier reprise et suppression.

POST perdu → même job. Worker interrompu → reprise après expiration du bail.
Échec transitoire → attente puis reprise automatique. Après trois essais ou erreur
définitive, examiner le code assaini et corriger source/configuration ; **ne pas
modifier les compteurs MongoDB à la main**. Pour relancer un document inchangé,
attendre expiration/nettoyage ou livrer ultérieurement une commande de reprise
explicitement budgétée. L’UI de récupération manuelle n’est pas dans ce lot.
L’annulation reste durable jusqu’à expiration et n’est pas annulée par un POST.

Pas de changement d’environnement, de traitement Production, d’accès Blob réel,
d’upload du PDF utilisateur ou d’appel OpenAI pendant la recette de cette branche.

## Schéma, suppression et rollback

Collections `documentProcessingJobs` (statut, texte borné, historique) et
`documentProcessingLanes` (une coordination par magasin, sans contenu). Index :
source/version unique ; jobs dus scope/état/date ; TTL `expiresAt` ; lane scope
unique. `documentSources.processingFence` est un compteur de concurrence, pas une
version métier. Audit de demande/résultat prêt/annulation sans contenu.

Arrêt : désactiver le flag, garder lecture/annulation. **Ne pas revenir à un
déploiement antérieur avec des résultats encore présents** : il ne connaît pas
leur suppression transactionnelle. Les annuler ou attendre leur expiration avant
ce rollback, sans supprimer les PDF. Une nouvelle politique devra conserver le
lecteur des anciennes versions et traiter/annuler leurs jobs explicitement.

## Vérification et suite

Tests synthétiques : vrai PDFium (texte, pages vides, padding, limites), API/CSRF,
transactions MongoDB (doublons, budget, bail, reprise, erreurs, révocation, isolation,
annulation/suppression), runtime Next réel. La CI inclut les nouveaux tests de
persistance dans sa recette MongoDB dédiée, pas seulement les mocks.
Aucun écran modifié : Figma/captures sans objet pour ce lot backend.

Suite : commandes discrètes et statut dans Documents, recette Preview, puis
activation explicitement autorisée. TECH-05 reste ouvert avant ces preuves.
V4-01 conserve ses gates PILOT-01/PDF représentatif ; TECH-06 sa recherche citée.
Pas d’extension hors connexion.

Recette locale du 14 septembre 2026 : lint, TypeScript, Knip et **554 tests réussis**
avec MongoDB jetable. Le test runtime Next/PDFium conditionnel passe aussi séparément
(1 test). Build webpack réussi, présence du worker et du WASM vérifiée dans la trace
de la route Cron. Aucun service distant utilisé pendant cette implémentation.
E2E mobile/desktop : **70 réussis, 4 ignorés** (tests OpenAI réels désactivés).
