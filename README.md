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
$env:ADMIN_PASSWORD = "set-a-strong-password"
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

## Account + support billing policy
- Users can register/login from `/account.html`.
- Support requests check account purchase history.
- If a purchase exists within the previous 365 days: support is marked `free_support`.
- If no qualifying purchase exists: support is marked `paid_support_required`.

## Logging target
Default path is set in `data/secrets.json` as `protonDriveLogPath`.
Set it to your Proton Drive folder path to persist logs there.

## AnyDesk auto-link refresh
Backend checks `support.anydeskSourceUrl` every `refreshIntervalHours` (default `12`) and updates the active download URL.

## Checks

```powershell
npm run check
```
