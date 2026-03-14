#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${OCI_ENV_FILE:-$SCRIPT_DIR/.env.oci}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Copy ops/.env.oci.example to ops/.env.oci and fill it in first."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${OCI_REPO_ROOT:?OCI_REPO_ROOT is required}"
: "${OCI_APP_PERSIST_DIR:?OCI_APP_PERSIST_DIR is required}"
: "${OCI_BACKUP_MOUNT:?OCI_BACKUP_MOUNT is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

COMPOSE_FILE="$OCI_REPO_ROOT/ops/docker-compose.yml"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
backup_root="${OCI_BACKUP_MOUNT%/}/daily/$timestamp"
mkdir -p "$backup_root"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  postgres pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$backup_root/${POSTGRES_DB}.dump"

if [[ -d "$OCI_APP_PERSIST_DIR/data" ]]; then
  tar -C "$OCI_APP_PERSIST_DIR" -czf "$backup_root/app-data.tgz" data
fi

if [[ -f "$backup_root/${POSTGRES_DB}.dump" ]]; then
  (cd "$backup_root" && sha256sum ./* > SHA256SUMS)
fi

retention_days="${BACKUP_RETENTION_DAYS:-30}"
if [[ "$retention_days" =~ ^[0-9]+$ ]]; then
  find "${OCI_BACKUP_MOUNT%/}/daily" -mindepth 1 -maxdepth 1 -type d -mtime +"$retention_days" -exec rm -rf {} +
fi

echo "Backup written to $backup_root"
