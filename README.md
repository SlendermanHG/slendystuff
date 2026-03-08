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

## Config files
- `data/settings.json` (public-safe editable settings)
- `data/secrets.json` (generated locally, gitignored)
- `data/secrets.example.json` (template)
- `data/accounts.json` (runtime account/purchase/support data, gitignored)
- `data/accounts.example.json` (template)
- `data/admins.json` (runtime admin login accounts, gitignored)
- `data/admins.example.json` (template)

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
