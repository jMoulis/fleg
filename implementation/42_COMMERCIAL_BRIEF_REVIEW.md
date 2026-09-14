# V4-01 — lot 1 : brouillon commercial à relire

## Décision et frontière

Le 14 septembre 2026, après la fusion signalée de PR #57, le responsable valide
le fonctionnement courant avec réserve UX, puis approuve explicitement le premier
lot V4-01 et le transfert du texte du PDF choisi à OpenAI. Cette décision permet
ce lot sans attendre les mesures finales de PILOT-01. Elle ne démontre ni gain
de temps ni baisse de casse et ne clôt pas ce pilote.

Le PDF représentatif local est un document commercial de huit pages, avec offres
actuelles et anticipées, dates distinctes et expressions de prix non exactes.
Une page pertinente a été inspectée visuellement en local. Ce contrôle ne prouve
pas la stabilité de toutes les éditions ni la qualité d'une extraction IA.
Le PDF et ses rendus ne sont pas des fixtures et restent hors Git.

## Parcours livré

Documents → **Brouillon commercial IA**. Extraire d'abord le texte natif via
TECH-05. Cocher les pages utiles et consentir explicitement à leur envoi.
L'interface affiche le modèle configuré, la réservation budgétaire et le budget
journalier. L'ajout d'un PDF seul ne déclenche aucune analyse payante.

La demande est persistée, puis exécutée par un Cron distinct ; l'onglet peut être
fermé. Une vérification automatique lit le statut toutes les 30 secondes ou au
retour onglet/réseau, au plus 20 fois, uniquement visible et connecté. Les erreurs
exigent une actualisation manuelle. Aucune répétition automatique de POST.
Fermeture/navigation annule les requêtes et libère la mémoire ; aucun texte
commercial dans le stockage navigateur. L'expiration et une lecture refusée
retirent les données affichées.

Relecture d'un élément à la fois : produit, offres, prix en euros, marge en %, dates
et qualificatifs de prix, avec accès aux citations de chaque champ. Les données
restent des centimes entiers/ratios dans les schémas et la base. Une valeur vide
reste inconnue. Un élément peut être confirmé après correction ou exclu ; la
source IA initiale reste distincte des valeurs corrigées et de leur auteur/date.
Une confirmation est immuable dans ce lot, protégée par une révision attendue.
Elle valide uniquement la transcription, jamais une opération magasin.

Les correspondances catalogue sont des suggestions en lecture seule : alias
PLU/EAN/Gencod d'abord, libellé normalisé uniquement sans identifiant source.
Un identifiant inconnu/contradictoire n'est pas remplacé par un rapprochement de
nom. Aucune création/fusion/association de produit. Les alias PLU/Gencod absents
du catalogue courant restent non résolus ; une saisie de PLU ne crée pas d'alias.

## Sécurité, persistance et limites

- Chaque lecture/requête MongoDB conserve organisation + magasin autorisés.
- Admission : `imports.create` et `attachments.write` ; relecture :
  `imports.commit` et `attachments.write`. Le worker reconstruit les droits
  courants de l'auteur avant l'appel et avant publication du résultat.
- Origin strict + JSON borné, schemas stricts, aucun URL/fournisseur/modèle ou
  scope fourni par le navigateur. Aucune donnée de vente/stock dans le prompt.
- Au plus 12 pages sélectionnées, 30 000 caractères, enveloppe requête JSON UTF-8
  de 60 000 octets, 40 éléments × 30 champs, résultat JSON limité à 120 000 octets.
  Une page sans texte ou un dépassement est refusé, pas tronqué en silence.
- Les citations sont vérifiées littéralement (espaces normalisés) dans les pages.
  Cela prouve leur présence, **pas** la justesse de leur interprétation. Dates,
  prix, ratio, unicité des champs et qualificatifs sont contrôlés par le code.
  Les confiances du modèle ne sont pas des probabilités calibrées.
- Un brouillon par empreinte PDF + magasin + version de politique. Une demande
  répétée pour la même source/sélection retrouve le même brouillon. Une seconde
  copie ou une autre sélection est refusée et renvoie vers le document initial,
  sans nouvelle dépense. Le retour transparent vers une copie canonique reste à
  améliorer dans un incrément ultérieur.
- 20 brouillons maximum par magasin ; rétention de 30 jours, y compris les
  relectures. Ce n'est pas encore une archive métier durable. MongoDB contient
  le texte sélectionné, les champs et leur suivi, **jamais les octets PDF/image**.
- Suppression du PDF : retrait transactionnel du brouillon et de ses textes ;
  une réponse tardive ne peut pas le recréer. Les réservations budgétaires,
  sans contenu source, sont conservées 35 jours ; les audits restent minimaux.
- Une tentative fournisseur maximum, sans retry SDK ni relance de lease expirée.
  Une interruption devient un échec explicite ; le coût peut être inconnu.
  Les tokens disponibles sont conservés même après sortie invalide/refusée.

## Fournisseur et activation séparée

SDK OpenAI existant, Responses API, Structured Outputs Zod, `store:false`, aucun
outil, fichier provider, navigation, image ou état de conversation partagé. Les
instructions du document sont des données non fiables et ne peuvent pas devenir
des commandes. Aucun changement du Copilote.

`store:false` ne signifie pas Zero Data Retention : la politique de rétention
de sécurité du fournisseur reste applicable. Sources consultées :
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Data controls](https://developers.openai.com/api/docs/guides/your-data).

Pas de modèle par défaut et pas de changement `.env.local`/Production dans ce lot.
Avant tout appel réel, choisir et présenter un modèle supportant les sorties
structurées, ses tarifs actualisés, le plafond de recette et la politique de
confidentialité. Évaluer sur le PDF représentatif ; ne pas confondre les tests
avec fournisseur simulé et cette recette métier.

Configuration serveur requise pour l'activation autorisée :

| Variable | Sens |
| --- | --- |
| `COMMERCIAL_BRIEF_ENABLED` | `true` uniquement après activation explicite |
| `COMMERCIAL_BRIEF_STORE_IDS` | Liste autorisée, 1 à 4 magasins |
| `COMMERCIAL_BRIEF_MODEL` | Modèle revu, idéalement snapshot explicite |
| `COMMERCIAL_BRIEF_INPUT_USD_CENTS_PER_MILLION` | Tarif entrée, centimes USD / million de tokens |
| `COMMERCIAL_BRIEF_OUTPUT_USD_CENTS_PER_MILLION` | Tarif sortie, même unité |
| `COMMERCIAL_BRIEF_DAILY_BUDGET_USD_CENTS` | Plafond quotidien par magasin, journée UTC |
| `OPENAI_API_KEY` | Clé serveur existante, jamais persistée dans le brouillon |
| `CRON_SECRET` | Secret existant du scheduler |

Le Cron `/api/cron/commercial-briefs` est prévu toutes les cinq minutes, au plus
un appel par invocation. Il ne lit pas MongoDB et n'appelle pas OpenAI lorsque
l'activation est absente. Désactiver le flag suspend l'admission et le worker ;
la lecture et la relecture restent disponibles. Un appel déjà en vol peut finir.

Le budget réserve, avant admission et transactionnellement, un coût conservateur
calculé sur 60 000 octets + 8 192 tokens d'enveloppe et 12 000 tokens de sortie.
Les tarifs sont figés par demande, sans remise de cache ni remboursement d'une
tentative incertaine. C'est une protection applicative dépendant de tarifs
corrects, pas un plafond contractuel de facturation OpenAI. Les limites compte
fournisseur restent recommandées. La qualité peut nécessiter de revoir ces
limites avant activation ; aucune boucle automatique ne les augmente.

## Tests et suite

Fixtures exclusivement synthétiques : types, euros/centimes, ratios, dates,
citations, refus d'instructions/champs supplémentaires ; SDK simulé (aucun appel
payant) ; API/Origin/consentement ; MongoDB local réel avec concurrence, budget,
droits, expiration, suppression et isolation ; recette Chromium 390/1440 px.
La CI inclut explicitement la nouvelle suite de persistance et le parcours UI.

Vérifications locales du 14 septembre 2026 : `npm run check` (513 tests réussis,
83 tests conditionnels ignorés) ; suite avec MongoDB local jetable (595 réussis,
seule la recette Next/browser conditionnelle ignorée), puis recette Next réelle
séparée, avec APIs simulées et Chromium mobile/desktop. La conservation de
30 jours est couverte côté navigateur sans débordement de minuterie ni boucle de
requêtes. Aucun de ces résultats ne valide la qualité du modèle sur un vrai brief.
Le build production et la recette E2E complète sur replica set local jetable
passent également : 72 scénarios réussis, 4 tests OpenAI réels volontairement
ignorés. Le runner force aussi la nouvelle analyse commerciale à rester désactivée.

V4-01 reste ouvert. Ce lot ne fournit pas : OCR/image fallback, correction de
classification/ajout d'éléments omis, association canonique explicite, archive
confirmée durable, préparation de brouillons TG/événements ni index vectoriel.
La prochaine étape est la recette provider limitée sur le document représentatif,
puis les compléments justifiés par cette relecture. TECH-06 reste ultérieur.
