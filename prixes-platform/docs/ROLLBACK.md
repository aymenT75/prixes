# Sauvegarde & rollback — Prixes

Procédure à suivre en cas de déploiement cassé ou de perte de données. Tous les
scripts se lancent depuis `/opt/prixes-platform` sur le droplet de production.

## Sauvegardes automatiques

- **À chaque déploiement** : `scripts/deploy.sh` lance `scripts/backup-db.sh`
  avant de toucher quoi que ce soit.
- **Tous les jours à 3h** : un cron sur le droplet exécute aussi
  `scripts/backup-db.sh` (rétention 14 jours par défaut), indépendamment des
  déploiements.
- Les sauvegardes sont stockées dans `/opt/prixes-platform/backups/*.sql.gz` —
  **en dehors** du volume Docker de Postgres, donc elles survivent à un
  `docker compose down -v` ou une réinstallation du conteneur.

Sauvegarde manuelle à la demande :
```bash
cd /opt/prixes-platform
./scripts/backup-db.sh          # rétention 14 jours
./scripts/backup-db.sh 30       # ou une rétention custom
```

## Rollback de l'application (code)

`scripts/deploy.sh` tague toujours l'image sortante en `:previous` avant de
charger la nouvelle — un rollback applicatif ne nécessite donc pas de
reconstruire une image, juste de revenir sur la précédente :

```bash
cd /opt/prixes-platform
./scripts/rollback-app.sh
```

Ça remet en service les images `web`/`api`/`worker` précédentes. **Ça ne
touche pas la base de données** — si le déploiement cassé a aussi fait
tourner une migration Alembic, il faut restaurer la DB séparément (voir
ci-dessous).

⚠️ Un seul niveau de retour arrière (`:previous`) est conservé. Si deux
déploiements cassés se succèdent sans validation entre les deux, la version
saine est perdue de l'historique Docker — d'où l'intérêt de vérifier après
**chaque** déploiement (`curl https://DOMAINE/health` + un coup d'œil sur
l'app) avant de redéployer autre chose.

## Restauration de la base de données

**Destructif** — remplace toutes les données actuelles. Toujours prendre une
sauvegarde de l'état courant d'abord si elle a une chance d'être utile :

```bash
cd /opt/prixes-platform
./scripts/backup-db.sh                          # sauvegarde l'état actuel, au cas où
ls backups/                                       # repérer le fichier à restaurer
./scripts/restore-db.sh backups/prixes-20260716-030001.sql.gz
```

Le script demande une confirmation explicite (`yes`), arrête `api`+`worker`
pendant la restauration (évite des écritures concurrentes), puis les
redémarre.

## Scénario complet : déploiement cassé avec migration DB

1. `./scripts/rollback-app.sh` — revient sur le code applicatif précédent.
2. `./scripts/restore-db.sh backups/<dernière-sauvegarde-avant-le-déploiement-cassé>.sql.gz`
   — revient sur le schéma/données d'avant la migration.
3. Vérifier : `curl -s https://DOMAINE/health`, tester la connexion, une
   recherche, le formulaire d'avis.
4. Investiguer la cause avant de retenter le déploiement.

## Ce que ces scripts NE couvrent PAS

- Pas de sauvegarde de Redis (cache, entièrement reconstructible — pas de
  données qu'on ne peut pas se permettre de perdre).
- Pas de sauvegarde des uploads S3/R2 (gérés par le fournisseur cloud
  séparément).
- Un seul niveau de rollback applicatif (`:previous`) — pas d'historique
  complet de versions. Pour ça, il faudrait tagger chaque image avec le SHA du
  commit git au lieu d'un simple `:previous`/`:latest` — pas fait pour
  l'instant, à évaluer si le rythme de déploiement l'exige.
