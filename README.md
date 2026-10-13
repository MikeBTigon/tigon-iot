# TIGON IOT

Built for **TIGON Golf Carts** by **Noah Jaslow, Jaslow Digital** ([jaslowdigital.com](https://jaslowdigital.com)).

Internal web app and Android app for TIGON Golf Carts staff — live at **https://tigoniot.com**
(Firebase project `tigon-iot`).

- **IoT dashboard** — store phones forward their notifications (Facebook, Messenger, missed calls) to one dashboard.
- **MP Assistant** — posting DMS cart inventory to Facebook Marketplace, leads/CRM, team goals.
- **Sell more** — speed-to-lead, texting, quotes, booking, reviews, referrals.
- **Webhook Flows** — website form submissions → leads, email, Google Sheets.

## What's where

| Folder | What |
|---|---|
| `frontend/` | React 19 + TypeScript + MUI web app (Vite). `frontend/android` / `frontend/ios` = Capacitor phone apps. |
| `functions/` | Cloud Functions (Node 22, TypeScript). |
| `firestore.rules`, `storage.rules` | Security rules. `tests/rules/` = rules tests. |
| `mp-assistant/` | Tigon Poster Chrome extension, photo worker. |
| `scripts/` | Android build (`build-android.sh`) and helpers. |
| `.github/workflows/` | Deploy, rollback, pull-request checks, phone-app builds. |
| `docs/` | System overview, runbook, build notes. |

## Develop

```sh
cd frontend && npm ci && npm run dev          # website on http://localhost:5173 (uses the live Firebase project)
npm run typecheck && npx eslint .             # before opening a pull request
cd ../functions && npm ci && npx tsc --noEmit -p .
```

## Deploy and roll back

- **Deploy:** merge a pull request into `main`. GitHub Actions → *Deploy to Firebase* builds and deploys the website,
  functions and rules, keeps or rebuilds the Android app, and tags the commit `deploy-YYYYMMDD-HHMM-<sha>`.
  What's live: https://tigoniot.com/build-info.json
- **Pull requests** run *Checks* (typecheck, lint, build, rules tests) and get a 7-day preview website
  (it uses the **live** database).
- **Roll back:** Actions → *Roll back* → Run workflow → `ref` = a `deploy-…` tag.

Details, secrets, the Android signing key, backups and everyday fixes: **[docs/RUNBOOK.md](docs/RUNBOOK.md)**.
How the system works: [docs/TIGON_IOT_SYSTEM_OVERVIEW.md](docs/TIGON_IOT_SYSTEM_OVERVIEW.md).
MP Assistant details: [mp-assistant/README.md](mp-assistant/README.md). Phone apps: [frontend/MOBILE_APPS.md](frontend/MOBILE_APPS.md).

## Rules for changes

- Never commit secrets or signing keys (`*.keystore`, `.env`, service-account JSON).
- Firestore indexes are not deployed: queries must work with single-field indexes.
- Only the Cloud Functions listed in `FUNCS` in `.github/workflows/firebase-deploy.yml` are deployed — add new ones there.

## Developer & contact

This system was designed and built for **TIGON Golf Carts** by:

**Noah Jaslow — Jaslow Digital**
- Website: [https://jaslowdigital.com](https://jaslowdigital.com)
- Email: [jaslowdigital@gmail.com](mailto:jaslowdigital@gmail.com) · [info@jaslowdigital.com](mailto:info@jaslowdigital.com)

For questions, changes, support or new features, contact Jaslow Digital.
