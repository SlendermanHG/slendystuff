# Phase 1 OCI Setup

This scaffold assumes:

- one `Ubuntu 24.04` OCI VM
- one Docker Compose stack
- `api.slendystuff.com` and `ops.slendystuff.com` point to that VM
- `GitHub Pages` still serves the public static site
- `OCI` handles the dynamic backend
- daily backups go to a separate mounted backup path

## What This Adds

New scaffold files live in [ops/docker-compose.yml](/C:/Slendystuff/managed-site/ops/docker-compose.yml), [ops/Dockerfile](/C:/Slendystuff/managed-site/ops/Dockerfile), [ops/.env.oci.example](/C:/Slendystuff/managed-site/ops/.env.oci.example), [ops/Caddyfile](/C:/Slendystuff/managed-site/ops/Caddyfile), [ops/deploy-oci.sh](/C:/Slendystuff/managed-site/ops/deploy-oci.sh), and [ops/backup-postgres.sh](/C:/Slendystuff/managed-site/ops/backup-postgres.sh).

The stack contains:

- `app`: the current Node/Express site backend
- `postgres`: provisioned now for phase-one backend growth
- `caddy`: TLS termination and reverse proxy for `api` and `ops`

## Important Current Limitation

The app in this repo still stores its real working data in JSON files under `PERSIST_ROOT/data`. Because of that, the backup script saves both:

- a PostgreSQL dump
- an archive of the app's JSON data directory

That is intentional. PostgreSQL is scaffolded now, but the current app is not yet migrated to use it.

## Simple OCI Steps

1. Create one `Ubuntu 24.04` VM in OCI.
2. Attach and mount a separate backup volume, for example at `/mnt/oci-backups/slendystuff`.
3. Point `api.slendystuff.com` and `ops.slendystuff.com` to the VM in Squarespace DNS, then proxy them through Cloudflare if you are using Cloudflare in front.
4. Install Docker Engine and the Docker Compose plugin on the VM.
5. Clone this repo onto the VM at `/opt/slendystuff/managed-site`, or let the deploy script clone it for you after you set your real GitHub repo URL.
6. Copy `ops/.env.oci.example` to `ops/.env.oci`.
7. Fill in real values in `ops/.env.oci`.
8. Run `chmod +x ops/deploy-oci.sh ops/backup-postgres.sh`.
9. Run `./ops/deploy-oci.sh`.
10. Add a daily cron entry for backups.

## Suggested Commands

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
```

If the repo is not already cloned:

```bash
sudo mkdir -p /opt/slendystuff
sudo chown -R "$USER":"$USER" /opt/slendystuff
```

Replace the repo URL with your real repo before running it:

```bash
git clone git@github.com:YOUR_GITHUB_USERNAME/slendystuff.com.git /opt/slendystuff/managed-site
```

or

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/slendystuff.com.git /opt/slendystuff/managed-site
```

Then continue:

```bash
cd /opt/slendystuff/managed-site
cp ops/.env.oci.example ops/.env.oci
chmod +x ops/deploy-oci.sh ops/backup-postgres.sh
```

Before you run the deploy, open `ops/.env.oci` and change `GITHUB_REPO_URL` to your real repo URL.
Examples:

```bash
GITHUB_REPO_URL=git@github.com:YOUR_GITHUB_USERNAME/slendystuff.com.git
```

or

```bash
GITHUB_REPO_URL=https://github.com/YOUR_GITHUB_USERNAME/slendystuff.com.git
```

After you fill in `ops/.env.oci`:

```bash
./ops/deploy-oci.sh
```

## Daily Backup Cron Example

```bash
crontab -e
```

Add:

```cron
15 3 * * * /opt/slendystuff/managed-site/ops/backup-postgres.sh >> /var/log/slendystuff-backup.log 2>&1
```

## Env Values You Will Need Later

- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_OWNER_PHONE`
- `PROTON_SMTP_PASSWORD`
- `OPENAI_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_ACCOUNT_ID`

## Notes

- `ops.slendystuff.com` redirects `/` to `/admin/`.
- `api.slendystuff.com` proxies straight to the app.
- The deploy script does a `git pull`, rebuilds the app image, and restarts the Compose stack.
- The backup script assumes the stack is already running.
- Phase one is OCI-ready now, but the live app still stores working data in JSON files inside the mounted app persist folder until the later PostgreSQL migration is done.
