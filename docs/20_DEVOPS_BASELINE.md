# 20 — Socle DevOps

## Contrôles versionnés

Le workflow GitHub Actions `CI` s'exécute à chaque pull request vers `master`, à chaque push sur `master` et à la demande. Il n'utilise aucun secret de préproduction ou de production.

Deux contrôles doivent réussir :

- `Quality and build` installe strictement `package-lock.json`, puis exécute le lint, le typage, les tests unitaires et le build de production avec Node.js 24 ;
- `End-to-end` démarre MongoDB 8 dans un conteneur jetable, injecte uniquement des identifiants de test, charge le jeu de démonstration et exécute la recette Playwright sur les formats mobile et desktop.

Le script de seed accepte une configuration fournie entièrement par les variables du processus : `.env.local` reste pratique en local mais n'est pas requis dans un runner CI ou un conteneur.

Les traces, captures et vidéos Playwright sont conservées sept jours uniquement en cas d'échec. Les appels OpenAI réels restent exclus de la CI générale : ils doivent être lancés explicitement avec `npm run test:e2e:ai` sur un environnement autorisé.

Dependabot vérifie chaque semaine les dépendances npm et les actions GitHub. Toute mise à jour reste soumise aux mêmes contrôles CI avant fusion.

## Surveillance publique minimale

Le workflow `Production health` appelle toutes les trente minutes `https://fleg-two.vercel.app/api/health`. Il échoue si le statut HTTP n'est pas `200`, si MongoDB n'est pas disponible ou si les index ne sont pas prêts.

La variable de dépôt GitHub `PRODUCTION_URL` permet de remplacer le domaine sans modifier le workflow. Après sa première activation, lancer manuellement le workflow et vérifier que les notifications GitHub Actions sont autorisées pour le propriétaire du dépôt.

Ce contrôle est un filet de sécurité, pas une supervision avec garantie de service : les exécutions planifiées GitHub peuvent être retardées. Avant l'ouverture à des utilisateurs réels, compléter ce contrôle par une alerte Vercel ou un moniteur externe sur `/api/health` et sur les événements JSON décrits dans `docs/18_OPERATIONS.md`.

## Protection de `master`

Configurer un ruleset GitHub ciblant la branche par défaut avec les règles suivantes :

1. exiger une pull request avant fusion ;
2. exiger les contrôles `Quality and build` et `End-to-end` ;
3. exiger que la branche soit à jour avant fusion ;
4. bloquer les force-push et la suppression de la branche ;
5. inclure les administrateurs dans l'application des règles.

Le ruleset ne doit être activé qu'après le premier passage réussi de `CI`, afin que GitHub connaisse les noms des contrôles requis.

## Contrôles de plateforme à consigner

Les éléments suivants ne peuvent pas être garantis par le dépôt et doivent être vérifiés dans les consoles des fournisseurs :

- Vercel : environnements Preview et Production séparés, domaines stables, variables distinctes, Node.js 24, Fluid Compute et alertes activées ;
- Atlas : utilisateur applicatif au moindre privilège, liste d'accès réseau documentée, Cloud Backup actif, rétention définie et exercice de restauration réussi ;
- Resend et OpenAI : clés limitées à l'environnement concerné, quotas surveillés et rotation planifiée ;
- GitHub : notifications des workflows en échec et protection de `master` actives.

Ne jamais copier une valeur secrète dans une issue, un artefact GitHub Actions ou le compte rendu d'un exercice.
