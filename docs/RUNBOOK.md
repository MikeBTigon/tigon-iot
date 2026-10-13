# TIGON IOT — Runbook

What to do when something needs fixing or changing. Each section is a short checklist.
Live site: https://tigoniot.com · Firebase project: `tigon-iot` · Repo: `Tigon-Golf-Carts-LLC/tigon-iot`.

Contents: [Deploys](#deploys) · [Roll back](#roll-back) · [Preview websites](#preview-websites-pull-requests) ·
[Android signing key](#android-signing-key) · [Phone app updates](#phone-app-updates-and-reinstalls) ·
[Play Protect warning](#play-protect-unknown-developer-warning) · [Texting phone stopped](#texting-phone-stopped-sending) ·
[Secret rotation](#rotating-secrets) · [Backups and restore](#backups-and-restore) · [Adding a store](#adding-a-store) ·
[Onboarding / offboarding](#onboarding-and-offboarding-people) · [Legacy functions](#legacy-iot-functions-not-in-this-repo) ·
[Chrome extension](#tigon-poster-chrome-extension)

---

## Deploys

- Every merge to `main` runs **Actions → Deploy to Firebase** (`.github/workflows/firebase-deploy.yml`):
  typecheck + build website → keep or rebuild the Android app → package the Chrome extension → build functions →
  deploy hosting, Firestore + Storage rules and the functions listed in `FUNCS` → tag the commit
  `deploy-YYYYMMDD-HHMM-<sha7>`.
- What is live right now: https://tigoniot.com/build-info.json (commit, time, link to the deploy run).
- Run it by hand: Actions → Deploy to Firebase → Run workflow (tick **build_android** to force a new phone app).
- Firebase CLI version is pinned (`firebase-tools@15.32.1`) in the workflows. Dependabot does not update it —
  bump it by hand in `firebase-deploy.yml` and `checks.yml` now and then.
- **Firestore indexes are not deployed** (`firestore.indexes.json` is empty; deploying it would delete the indexes
  made in the Firebase console). Queries must work with single-field indexes.
- **Deploy failed?** Open the failed run, read the red step. Common causes: a typecheck error (fix the code), a missing
  secret (the error message names it), a Firebase quota/permissions error (retry; check the service account).

## Roll back

Website, functions and rules can go back to any earlier deploy in about 5 minutes.

1. GitHub → **Tags** (or the summary of an older deploy run) → copy a tag like `deploy-20261013-1530-abc1234`.
2. **Actions → Roll back → Run workflow**, paste the tag (or a commit sha) into **ref**, Run.
3. Check https://tigoniot.com/build-info.json shows that commit.

Good to know:
- The **next merge to `main` deploys `main` again**. To stay rolled back, revert the bad commit on `main`
  (GitHub → the PR → **Revert**) and merge that.
- The phone app on the Download page is **never** rolled back (an older app can't install over a newer one).
- Functions that didn't exist in the older version are left as they are.
- Firestore **data** isn't rolled back — see [Backups and restore](#backups-and-restore).

## Preview websites (pull requests)

Each pull request from this repo gets **Checks** (typecheck, lint, build, functions typecheck, rules tests) and a
preview website `https://tigon-iot--pr-<number>-<hash>.web.app` (posted as a PR comment, deleted after 7 days).

**Preview pages use the PRODUCTION database and Cloud Functions.** Anything you save, send or delete there is
real (leads, texts, carts). Use them to look at changes, not to test risky actions.

## Android signing key

The Android app must always be signed with the same key, or phones can't install updates. The old key was
committed to git (anyone with the repo could sign a fake update), so it was **retired in October 2026** and a new
key made. The key is never stored in the repo.

- Repository secrets (GitHub → Settings → Secrets and variables → Actions):
  - `ANDROID_KEYSTORE_BASE64` — the `.keystore` file, base64 (`base64 -w0 tigon-release-2026.keystore`)
  - `ANDROID_KEYSTORE_PASSWORD` — its password (store and key use the same password)
  - `ANDROID_KEY_ALIAS` — `tigon`
- Keep an offline copy of the keystore + password in the company password manager. **If the key is lost, every phone
  must uninstall and reinstall the app again.**
- Without these secrets the Android build stops with "Android release signing key is missing" — by design, it never
  publishes an unsigned or debug-signed app.
- Local release build: `TIGON_KEYSTORE_PATH=/path/key.keystore TIGON_STORE_PASSWORD=… scripts/build-android.sh`.
  Debug builds (`./gradlew assembleDebug`, Android Studio Run) use the normal debug key and can't update the real app.
- Key fingerprint (SHA-256) of the 2026 key:
  `69:D3:2A:9F:8B:6A:1B:70:5E:AF:EF:4B:C4:4C:93:38:45:B0:9F:E3:7E:47:24:88:70:C3:1E:EA:6E:EA:55:34`

## Phone app updates and reinstalls

- A new app is built only when Android files change (`frontend/android/**`, Capacitor plugin versions,
  `capacitor.config.ts`, `scripts/build-android.sh`), or by hand (**build_android**). Otherwise the published app
  is kept. Note: the app ships its own copy of the website screens, so website-only changes reach the phone app
  with the next app build — run the deploy with **build_android** when phone users need them.
- Version codes: `3,000,000 + minutes since 2026-01-01` (always going up). `/downloads/version.json` has
  `versionCode`, `versionName`, `minVersionCode` (3000000) and `requiresReinstall`.
- **One-time reinstall (October 2026 key change):** apps installed before the change (version code below 3,000,000)
  can't update. On each phone: open https://tigoniot.com/app → **Download the app** → press and hold the TIGON IOT
  icon → **Uninstall** → open the downloaded file → **Install** → set the phone up again (Devices → Set up a phone on
  a computer, scan the QR code) → turn notification echo back on. Old apps still say "Update available" and the
  install fails with "App not installed" — that's the sign the phone needs this reinstall. New apps show a
  "Reinstall needed" banner if this ever happens again.

## Play Protect "unknown developer" warning

The app is installed from our website, not the Play Store, so Android may warn:
- Chrome "File might be harmful" → **Download anyway**.
- "Install unknown apps" → allow it for Chrome / Files, then **Install** again.
- Play Protect "Unknown developer" / "Unsafe app blocked" → **More details → Install anyway**.
- If Play Protect removed the app: Play Store → profile icon → Play Protect → ⚙ → turn off "Scan apps" only long
  enough to install, then turn it back on. (Publishing to the Play Store would end these warnings.)

## Texting phone stopped sending

Texts go out from each store's texting phone (Sales settings → Texting) unless Twilio is set up.
1. Sales settings → Texting: is the phone shown **online**? (It checks in every 30 seconds while it has internet.)
2. On the phone: TIGON IOT app open once, signed in/paired, **notification echo on**, battery saver **off** for
   TIGON IOT (Settings → Apps → TIGON IOT → Battery → Unrestricted), SMS permission allowed, SIM has service.
3. Texts → look at failed ones: "no texting phone online" = step 1/2; carrier errors = the SIM's plan/limits.
4. Still stuck: restart the phone, open the app, send a test text from Sales settings.
5. Long outage: switch Texting to Twilio (needs the Twilio secrets below) or pick another store phone.

## Rotating secrets

| Secret | Where it lives | How to rotate |
|---|---|---|
| Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) | GitHub repository secrets → written to `functions/.env` on deploy | Twilio console → Account → API keys & tokens → create secondary token → promote. Update the GitHub secret, run **Deploy to Firebase** by hand. |
| Phone echo secret (per phone) | Hashed on `devices/{id}.echoSecretHash`; the phone keeps the plain one | Re-pair the phone (Devices → Set up a phone) — a new secret replaces the old. To cut a lost phone off now: Devices → team phones → **Revoke** (the phone is signed out and stops). |
| Android signing key | GitHub secrets `ANDROID_KEYSTORE_*` | Only if leaked: make a new key (see above) — every phone must reinstall once. Bump `NEW_KEY_BASE` in `scripts/build-android.sh` and the workflow. |
| `FIREBASE_SERVICE_ACCOUNT` | GitHub secret | Google Cloud console → IAM → Service accounts → the deploy account → Keys → Add key (JSON) → paste into the secret → delete the old key. |
| `GOOGLE_PLACES_KEY` | GitHub secret | Google Cloud console → APIs & Services → Credentials → regenerate, restrict to Places API; update secret; redeploy. |
| `ANTHROPIC_API_KEY` (AI writer) | Google Secret Manager | `gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-` then redeploy. |

## Backups and restore

- `mpBackup` exports the whole Firestore database every night to `gs://tigon-iot-backups/backups/<date>`
  (or `BACKUP_BUCKET`); admins can also run it now (System health → **Back up now**). Status: `mp_meta/backup`.
- Restore (Google Cloud Shell, as a project owner). **An import overwrites documents with the same id** and does
  not delete newer ones:
  ```sh
  gcloud config set project tigon-iot
  gsutil ls gs://tigon-iot-backups/backups/                 # pick a date folder
  # whole database:
  gcloud firestore import gs://tigon-iot-backups/backups/2026-10-12/
  # only some collections (safer):
  gcloud firestore import gs://tigon-iot-backups/backups/2026-10-12/ --collection-ids=mp_leads,mp_customers
  gcloud firestore operations list                         # watch progress
  ```
- To look at old data without touching live data, import into a scratch project instead (`--project <other>`;
  that project's service agent needs read access to the bucket).

## Adding a store

1. `frontend/src/mp/constants.ts` → `DEALERSHIPS`: add `T15` with name, city, phone, address, coordinates, links.
2. `functions/src/mpShare.ts` → `STORES`: add the same store (public pages and texts use it).
3. Merge → deploy. Then in the app: Accounts → Facebook accounts for the store (group `T15`), Sales settings →
   texting phone / routing for the store, and set people's **location** to T15 (Users / Accounts → Team).

## Onboarding and offboarding people

**New person**
1. They sign up at https://tigoniot.com with their `@tigongolfcarts.com` email and verify it.
2. An admin opens **Users** (or Accounts → Team), sets their **role** (sales / manager / admin) and **location**.
3. Phone: Devices → **Set up a phone** → pick number, location, person, Facebook account → they scan the QR code.

**Person leaving**
1. Users → the person → set role to none / disable the account (Firebase console → Authentication → Disable user
   for an immediate cut-off).
2. Devices → their phones → **Revoke** (stops echo and alerts) or re-assign the phone to someone else.
3. Leads: reassign their open leads (Leads → filter by owner → change owner).
4. Facebook accounts they ran: change the owner on Accounts.
5. If they knew shared passwords or secrets, rotate them (table above).

## Legacy IoT functions (not in this repo)

`onUserCreate`, `onNotificationCreate`, `validateEmailDomain`, `getLatestAppVersion`, `cleanupOldNotifications`,
`updateLastLogin` run in production from code deployed before this repo. `functions/src/index.ts` has an older copy;
the deploy workflow never deploys or deletes them (only the names in `FUNCS`). To bring the live code in:
```sh
gcloud config set project tigon-iot
gcloud functions list                                   # names, regions, 1st/2nd gen
gcloud functions describe onNotificationCreate --region us-central1 --format=json > describe.json
# 2nd gen: source is in .buildConfig.source.storageSource (bucket + object)
# 1st gen: sourceArchiveUrl
jq '.buildConfig.source.storageSource // .sourceArchiveUrl' describe.json
gsutil cp gs://<bucket>/<object> ./onNotificationCreate.zip && unzip onNotificationCreate.zip -d legacy-src
```
(Or Google Cloud console → Cloud Functions/Run → the function → **Source** → Download zip.) Compare with
`functions/src/index.ts`, merge the differences in a pull request, then add the names to `FUNCS` only once the
repo version matches what's live.

## Tigon Poster (Chrome extension)

- Packaged on every deploy as `/downloads/tigon-poster.zip`; `/downloads/poster-version.json` has its version
  (from `mp-assistant/poster/manifest.json`). The popup shows "Update available" when the website has a newer one.
- **Bump `version` in `mp-assistant/poster/manifest.json` whenever you change the extension**, or nobody gets told.
- The production zip drops the `http://localhost` match used for local testing.
