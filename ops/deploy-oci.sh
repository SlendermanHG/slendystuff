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
: "${GITHUB_REPO_URL:?GITHUB_REPO_URL is required}"
: "${GITHUB_DEPLOY_BRANCH:=main}"
: "${OCI_APP_PERSIST_DIR:?OCI_APP_PERSIST_DIR is required}"
: "${OCI_POSTGRES_DATA_DIR:?OCI_POSTGRES_DATA_DIR is required}"
: "${OCI_CADDY_DATA_DIR:?OCI_CADDY_DATA_DIR is required}"
: "${OCI_CADDY_CONFIG_DIR:?OCI_CADDY_CONFIG_DIR is required}"
: "${OCI_BACKUP_MOUNT:?OCI_BACKUP_MOUNT is required}"

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1"
    exit 1
  fi
}

ensure_command git
ensure_command docker

mkdir -p \
  "$OCI_APP_PERSIST_DIR/data" \
  "$OCI_APP_PERSIST_DIR/logs" \
  "$OCI_POSTGRES_DATA_DIR" \
  "$OCI_CADDY_DATA_DIR" \
  "$OCI_CADDY_CONFIG_DIR" \
  "$OCI_BACKUP_MOUNT"

chown -R 1000:1000 "$OCI_APP_PERSIST_DIR"

if [[ ! -d "$OCI_REPO_ROOT/.git" ]]; then
  mkdir -p "$(dirname "$OCI_REPO_ROOT")"
  git clone --branch "$GITHUB_DEPLOY_BRANCH" "$GITHUB_REPO_URL" "$OCI_REPO_ROOT"
fi

cd "$OCI_REPO_ROOT"

if [[ ! -f "$OCI_APP_PERSIST_DIR/data/settings.json" && -f "$OCI_REPO_ROOT/data/settings.json" ]]; then
  cp "$OCI_REPO_ROOT/data/settings.json" "$OCI_APP_PERSIST_DIR/data/settings.json"
fi

git fetch origin "$GITHUB_DEPLOY_BRANCH"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$GITHUB_DEPLOY_BRANCH" ]]; then
  git checkout "$GITHUB_DEPLOY_BRANCH"
fi

git pull --ff-only origin "$GITHUB_DEPLOY_BRANCH"

docker compose --env-file "$ENV_FILE" -f "$OCI_REPO_ROOT/ops/docker-compose.yml" pull postgres caddy
docker compose --env-file "$ENV_FILE" -f "$OCI_REPO_ROOT/ops/docker-compose.yml" build --pull app
docker compose --env-file "$ENV_FILE" -f "$OCI_REPO_ROOT/ops/docker-compose.yml" up -d --remove-orphans
docker compose --env-file "$ENV_FILE" -f "$OCI_REPO_ROOT/ops/docker-compose.yml" ps
