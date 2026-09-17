# Sauvegarde & rollback — Prixes

Procédure à suivre en cas de déploiement cassé ou de perte de données. Tous les
scripts se lancent depuis `/opt/prixes-platform` sur le droplet de production.

## Sauvegardes automatiques

- **À chaque déploiement** : `scripts/deploy.sh` lance `scripts/backup-db.sh`
  avant de toucher quoi que ce soit.
- **Tous les jours à 3h** : un cron sur le droplet exécute aussi
  `scripts/backup-db.sh` (rétention 14 jours par défaut), indépendamment des
  déploiements.
- **Une sauvegarde par base** : `prixes-<date>.sql.gz` pour Prixes,
  `prixes_coach-<date>.sql.gz` pour Hi Coach — toutes les bases du Postgres
  sont sauvegardées, pas seulement celle de Prixes. Avant le 2026-09-17, seule
  la base `prixes` l'était : Hi Coach n'avait aucune sauvegarde.
- Les sauvegardes sont stockées dans `/opt/prixes-platform/backups/*.sql.gz` —
  **en dehors** du volume Docker de Postgres, donc elles survivent à un
  `docker compose down -v` ou une réinstallation du conteneur. Dossier et
  fichiers lisibles par root uniquement : ils contiennent les emails et les
  empreintes de mots de passe.
- **DigitalOcean** fait en plus une sauvegarde quotidienne de tout le droplet
  (base, sauvegardes, `.env`), stockée hors du droplet. Elle est supprimée si
  le droplet est détruit : ce n'est pas une copie hors fournisseur.

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

**Destructif** — remplace la base nommée dans le fichier. Toujours prendre une
sauvegarde de l'état courant d'abord si elle a une chance d'être utile :

```bash
cd /opt/prixes-platform
./scripts/backup-db.sh                                        # l'état actuel, au cas où
ls backups/                                                     # repérer le fichier
./scripts/restore-db.sh backups/prixes-20260917-030002.sql.gz        # Prixes
./scripts/restore-db.sh backups/prixes_coach-20260917-030002.sql.gz  # Hi Coach
```

La base restaurée est **celle du nom de fichier** : impossible de verser une
sauvegarde de Hi Coach dans Prixes en se trompant de fichier. Le script demande
`yes`, arrête ce qui écrit dans cette base (`api`+`worker` pour Prixes,
`hicoach-api` pour Hi Coach), restaure **en une seule transaction** — tout ou
rien, jamais un mélange à moitié restauré — puis redémarre les services, même
si la restauration échoue.

Testé le 2026-09-17 dans des bases jetables : restaurer **par-dessus une base
déjà remplie** fonctionne (~80 s pour Prixes, 4 s pour Hi Coach), données
identiques à la base en service.

### Restaurer une ancienne sauvegarde

Les sauvegardes faites **avant le 2026-09-17** ne contiennent pas les
instructions de suppression (`--clean`) : elles ne peuvent pas remplacer une
base en service, chaque table entrerait en collision avec l'existante.
`restore-db.sh` les refuse. Elles se restaurent dans une base **vide**, que
l'on bascule ensuite à la main :

```bash
docker exec prixes-platform-db-1 psql -U prixes -d postgres -c "CREATE DATABASE prixes_restauree"
gunzip -c backups/prixes-20260916-030001.sql.gz   | docker exec -i prixes-platform-db-1 psql -U prixes -d prixes_restauree -v ON_ERROR_STOP=1 --single-transaction
# vérifier le contenu, puis arrêter api+worker et renommer les bases :
#   ALTER DATABASE prixes RENAME TO prixes_ancienne;
#   ALTER DATABASE prixes_restauree RENAME TO prixes;
```

Avec une rétention de 14 jours, plus aucune sauvegarde de l'ancien format ne
restera après le 2026-10-01.

## Restauration de MongoDB (menus, recettes, brouillons)

MongoDB Atlas en offre gratuite ne sauvegarde rien. `backup-db.sh` exporte donc
chaque nuit la base documentaire dans `backups/mongo-prixes-<date>.tar.gz`, qui
profite aussi des sauvegardes DigitalOcean du droplet.

```bash
cd /opt/prixes-platform
./scripts/restore-mongo.sh backups/mongo-prixes-20260917-160900.tar.gz
```

Le script affiche le contenu de l'archive, demande `yes`, arrête `api`+`worker`,
vide puis remplit chaque collection de l'archive, et redémarre les services même
en cas d'échec. L'archive est entièrement lue et vérifiée **avant** de toucher à
la base : un fichier tronqué est refusé sans rien modifier. Les index sont
conservés (les collections sont vidées, pas supprimées).

Testé le 2026-09-17 dans une base jetable : deux restaurations successives,
documents identiques un à un à la base en service, types conservés (ObjectId,
dates…).

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
- **Pas de copie hors serveur** tant que `OFFSITE_REMOTE` n'est pas configuré
  (voir l'en-tête de `backup-db.sh`) : les dumps restent sur le droplet qu'ils
  protègent, seule la sauvegarde DigitalOcean les met ailleurs.
- MongoDB Atlas n'a **pas** de sauvegarde de son côté (offre gratuite M0) : seule
  l'exportation quotidienne de `backup-db.sh` la protège.
- Un seul niveau de rollback applicatif (`:previous`) — pas d'historique
  complet de versions. Pour ça, il faudrait tagger chaque image avec le SHA du
  commit git au lieu d'un simple `:previous`/`:latest` — pas fait pour
  l'instant, à évaluer si le rythme de déploiement l'exige.
