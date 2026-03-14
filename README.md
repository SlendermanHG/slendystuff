# Slendy Stuff Website

This repo now contains:
- Static pages for GitHub Pages (`index.html`, `support.html`, `product.html`, `admin/`)
- Optional Node backend (`server.js`) for API features (tracking, 18+ logging, admin save, support form handling)

## GitHub Pages mode (current hosting)
GitHub Pages can serve the UI, but it **cannot run the backend API routes**.
- Product/support/admin pages render
- API features (`/api/*`) require separate backend hosting

## Local / backend mode
Run locally:

```powershell
npm install
$env:ADMIN_EMAIL = "Slender@slendystuff.com"
$env:ADMIN_PASSWORD = "1234567890"
npm start
```

Open:
- `http://localhost:4173/`
- `http://localhost:4173/admin/`

## Website Manager Bot
The admin page now includes a local website manager bot with:
- Desktop/browser notifications for new support requests and contact messages
- Hourly security scans with automatic fixes for critical data-exposure issues it can safely quarantine or gitignore
- Repo/domain awareness for `slendystuff.com` and Squarespace-managed DNS notes
- An operator console that can call OpenAI and, when enabled, write changes directly inside the managed repo path
- Settings controls for notifications, scan interval, repo path, domain details, operator model/base URL, full-access mode, and a phase-one fill-later checklist for OCI/Twilio/Proton/Cloudflare setup
- A local owner-console tray app for Windows (`pink heart` tray icon, desktop shortcut, background start)

## Config files
- `data/settings.json` (public-safe editable settings)
- `data/secrets.json` (generated locally, gitignored)
- `data/secrets.example.json` (template)
- `data/accounts.json` (runtime account/purchase/support data, gitignored)
- `data/accounts.example.json` (template)
- `data/admins.json` (runtime admin login accounts, gitignored)
- `data/admins.example.json` (template)
- `data/contact-messages.json` (runtime contact inbox, gitignored)
- `data/contact-messages.example.json` (template)
- `ops/.env.oci.example` (OCI deploy placeholders)
- `docs/PHASE1-OCI-SETUP.md` (plain-English OCI setup guide)

## Admin login account
- Admin page login now uses **email + password**.
- On first backend start, the server auto-creates one admin account if it does not already exist:
  - `ADMIN_EMAIL` (defaults to `slender@slendystuff.com`)
  - `ADMIN_PASSWORD` (defaults to temporary `1234567890`)

## Account + support billing policy
- Users can register/login from `/account.html`.
- Support requests check account purchase history.
- If a purchase exists within the previous 365 days: support is marked `free_support`.
- If no qualifying purchase exists: support is marked `paid_support_required`.

## Logging target
Default path is set in `data/secrets.json` as `protonDriveLogPath`.
Set it to your Proton Drive folder path to persist logs there.

## Idea assistant + hardwired rules
- Custom Tool page now includes an AI Idea Generation Lab.
- Saved idea logs are stored in browser local storage and can be attached to custom tool requests.
- Backend endpoint: `POST /api/idea-assistant/generate`.
- Configure hardwired assistant rules in admin page under `Idea Assistant Rules`.
- To use live OpenAI generation, set `apiKeys.openai` in admin settings (or `data/secrets.json`).

## AnyDesk auto-link refresh
Backend checks `support.anydeskSourceUrl` every `refreshIntervalHours` (default `12`) and updates the active download URL.

## Checks

```powershell
npm run check
```

## Owner Console On This PC

To open the admin locally and ensure the backend is running:

```powershell
npm run owner:start
```

To run the tray app in the background:

```powershell
npm run owner:tray
```

To install the Windows logon task + desktop shortcut:

```powershell
npm run owner:install
```

## OCI Phase One Scaffold

Phase one OCI files live in `ops/`.

- `ops/docker-compose.yml`
- `ops/Dockerfile`
- `ops/Caddyfile`
- `ops/.env.oci.example`
- `ops/deploy-oci.sh`
- `ops/backup-postgres.sh`

Use the dumbed-down guide in `docs/PHASE1-OCI-SETUP.md` when you are ready to create the Ubuntu 24.04 OCI VM.

## Current Phase-One Storage Note

Phase one now includes the OCI deployment scaffold, Docker Compose stack, Cloudflare-ready hostnames, backup script, and admin readiness checklist.

The live app still stores its working runtime data in JSON files under the mounted persist directory. PostgreSQL is provisioned in the OCI stack now so the later migration has a clean landing spot, but the app is not fully database-backed yet in this pass.
