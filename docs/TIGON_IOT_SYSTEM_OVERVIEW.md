# TIGON IOT — System Overview

> What the TIGON IOT website/app does today, how it works, and where it can be improved.
> Written from the code in `Tigon-Golf-Carts-LLC/tigon-iot` (`main`), September 28, 2026.

---

## 1. Summary

TIGON IOT is an internal web app for Tigon Golf Carts staff, hosted on Firebase (project `tigon-iot`).
It contains two systems that share one login and one dashboard:

| System | What it's for |
|---|---|
| **IoT Notifications** (original) | Android "worker" phones forward their notifications to the cloud. Staff see them all in one dashboard, mark them handled, and "master" phones get push alerts. |
| **MP Assistant** (new, parallel module) | Posting DMS golf-cart inventory to Facebook Marketplace: suggests which carts to post, writes listing text, provides photos, and tracks which Facebook account each cart was posted on. |

Only `@tigongolfcarts.com` email accounts can sign up.

---

## 2. Architecture

```
                 ┌──────────────────────────── Firebase project: tigon-iot ────────────────────────────┐
 Android phones  │                                                                                      │
 (worker/master) ├──► Firestore: devices, notifications ──► Cloud Function onNotificationCreate ──► FCM ─┼──► Master phones (push)
                 │                                                                                      │
 Web browser  ───┼──► Hosting (React app: dist/) ──► Firestore (all collections, guarded by rules)       │
                 │                                                                                      │
 DMS website API ◄┼── Cloud Function mpSyncInventory (hourly) / mpSyncNow (button) ──► Firestore mp_carts  │
 (api.tigondms.com)│                                                                                     │
 Poster extension ┼──► Firebase Auth + Firestore REST (reads mp_carts)                                   │
                 └──────────────────────────────────────────────────────────────────────────────────────┘
 Photos: Amazon S3 (prod.docs.s3) — downloads go through a Cloudflare Worker (tigon-photos…workers.dev)
```

| Layer | Technology | Location in repo |
|---|---|---|
| Web app | React 19, TypeScript, Material UI 7, Vite, React Router 7 | `frontend/` |
| Hosting | Firebase Hosting (single-page app, serves `dist/`) | `firebase.json`, `dist/` |
| Database | Cloud Firestore + security rules | `firestore.rules` |
| Server code | Cloud Functions v2, Node.js 22 | `functions/src/` |
| Login | Firebase Authentication (email + password, email verification) | `frontend/src/context/AuthContext.tsx` |
| Deploys | GitHub Action on every push/merge to `main` | `.github/workflows/firebase-deploy.yml` |
| Browser extension | Chrome MV3 "Tigon Poster (IoT)" | `mp-assistant/poster/` |
| Photo download proxy | Cloudflare Worker | `mp-assistant/photo-worker/worker.js` |
| Android app | Separate project (**not in this repo**) | APK served from Firebase Storage |

---

## 3. Accounts and access

### Sign-up and login
- **Register** (`/register`): email + password + confirm password. Only emails ending in `@tigongolfcarts.com` are accepted. A verification email is sent.
- **Login** (`/login`): email + password. There's also a password-reset email function.
- **Email verification required**: until the email is verified, every protected page shows "Email Verification Required" instead of the app.
- **Logout**: from the avatar menu (top right).

### Permissions (enforced by Firestore rules, not just the UI)
| Data | Who can read | Who can write |
|---|---|---|
| `users/{uid}` | that user | that user |
| `devices` | the owning user | the owning user (create requires @tigongolfcarts.com) |
| `notifications` | the target user | any @tigongolfcarts.com user can create; the target user can update/delete |
| `appVersions`, `systemConfig` | any signed-in user | nobody from the app (Firebase console only) |
| `mp_users` | any @tigongolfcarts.com user | the user (name only); admins (roles) |
| `mp_carts`, `mp_accounts` | MP members | MP **admins** |
| `mp_meta` (sync status) | MP members | server only |

### MP Assistant roles
- **admin**: everything, including mark posted, the Posted On tracker, the Accounts page, Sync now and legacy import.
- **sales**: view inventory, copy listings, save photos (read-only for posting status).
- New users start as **sales**. Emails listed in Firestore `systemConfig/mpAssistant.adminEmails` become **admin** on first visit. Admins can promote or demote anyone on **Accounts → Team**.

---

## 4. IoT Notifications module

### Dashboard (`/dashboard`)
- Three counters: **Total Notifications**, **Unhandled**, **Handled**.
- **Recent Notifications** list (live, updates in real time): each card shows the source phone (e.g. "Phone 058 (4199730163)"), handled/unhandled status, the notification text and how long ago it arrived.
- **Mark Handled** button on unhandled items.
- **MP Assistant card** (new): inventory count, carts you've posted, carts left to post, and an **Open MP Assistant** button.
- ⚠️ The **live** site also has **Today / This Week / This Month / Search by Date** tabs and a **delete** button on notifications. **That code is not in GitHub** (see §9).

### Devices (`/devices`)
- Lists the signed-in user's registered phones (live).
- Each device shows its name, type (**Master** or **Worker**) and status (**Active** / **Inactive**).
- **Rename** a device (dialog) or **delete** it.
- If there are no devices, it links to the Download page.

### Settings (`/settings`)
- Change password (min 8 characters, must match).
- Resend verification email.
- Delete account (double confirmation).
- "Sound" and "Browser notifications" switches — **these are not saved anywhere yet** (see §9).

### Download App (`/download`)
- Reads the latest Android app info from Firestore `appVersions/android` (version, release notes, download URL, update-required flag).
- **Download** button, plus a **QR code** for installing on a phone.
- Device requirements and a step-by-step install guide (allow unknown sources → install → sign in → allow notification access).

### How notifications flow
1. A **worker** phone (Android app) captures a notification (e.g. a Facebook message) and writes it to `notifications` with the target user, device name and text.
2. Cloud Function **`onNotificationCreate`** finds that user's **active master** devices and sends them a push notification (Firebase Cloud Messaging), titled "TIGON IOT: <device name>".
3. The web dashboard shows it instantly; staff mark it handled.
4. **`cleanupOldNotifications`** runs every 24 hours and deletes notifications older than **30 days**.

### Other server endpoints (used by the Android app; the website doesn't call them)
| Function | What it does |
|---|---|
| `onUserCreate` | Creates the `users/{uid}` profile (role `user`) after verifying the login token and email domain |
| `validateEmailDomain` | Confirms a token belongs to a @tigongolfcarts.com user |
| `getLatestAppVersion` | Returns `appVersions/android` to signed-in callers |
| `updateLastLogin` | Updates `users/{uid}.lastLogin` |

---

## 5. MP Assistant module (Facebook Marketplace)

Open it from the sidebar under **Marketplace → MP Assistant** (`/mp`). The first visit asks for a display name and, optionally, which identity you had in the old standalone app (Manager / Navid / Victoria / Sales), so your old "posted" history carries over.

The header shows the inventory count ("800+" while loading), when the DMS was last synced, and your name/role. Its tabs are **Home, Find a Cart, Locations, Browse, Profiles** and **Accounts** (admins only).

### Where the inventory comes from — DMS sync
- **Source:** the production DMS website API only: `POST https://api.tigondms.com/wp-website/get-carts` with `{pageNumber, pageSize: 100, isAllCarts: true}`, paging until an empty page.
- **When:** every hour automatically (`mpSyncInventory`), or on demand with **Accounts → Sync from DMS now** (`mpSyncNow`, admins only).
- **Rules:**
  - Carts with `isInStock: false` (or status "sold") are treated as sold. They're skipped, and any existing copy is **deleted** from the dashboard.
  - Carts containing the word "delete" anywhere in their DMS data are skipped.
  - Safety net: if DMS returns nothing, or fewer than half the current inventory, nothing is deleted and a warning is recorded.
  - Unchanged carts aren't rewritten (compared by hash), which keeps costs low.
- **Photos:** `imageUrls` → `https://s3.amazonaws.com/prod.docs.s3/carts/<file>`. New carts with no photos get the **default web images** (`default-cart-web-images/<color>-<make>-<model>-in-<location>-1..4.jpg`), using the location set first and the national set as fallback.
- **Status:** the result of every run (counts, warnings, errors) is saved to `mp_meta/sync` and shown in the header and on the Accounts page.

### Home — "Suggested to post"
- Carts **you** haven't posted yet, that have at least one working photo.
- Sorted **used first → most photos → highest price**, and rotated across stores so one location doesn't dominate.
- Shows "You've posted X of Y".

### Find a Cart (for customer calls)
- **Search box:** make, model, color, serial, VIN, location, battery, new/used.
- **Always-visible filters:** Price (presets Under $5k / $5–8k / $8–12k / $12k+ plus a slider), Brand, Model (after picking a brand), Condition, Power (electric/gas), Passengers (2 / 4 / 6+), Location.
- **More filters:** Lifted, Street Legal, Battery Type (lithium / lead acid), Cart Color, Extended Roof, Sound System, Hitch, Drivetrain, Tire Type, Has Photos.
- Brand, model, color, drivetrain and tire options are built automatically from current inventory, with counts.
- **Clear all filters** button and a live match count.

### Locations
- One tile per dealership (T1–T14, T0 National) with phone number, cart count, used count and how many you haven't posted.
- A location page shows **store info** (address, phone, and Map / Website / Facebook / YouTube / Reviews buttons), then **Used** and **New** sections.

### Browse
- Search all inventory, with filters for Make, Condition, and Posted (by me / not by me / by anyone / never posted).

### Cart page
- **Name:** Make + Model + Color + Location (e.g. "Evolution Turfman 200 Mineral White Hatfield"), with the year/make/model underneath.
- **Badges:** Used/New, location, ⚠ photo issue (broken image detected), "delete" flag, default images.
- **Window sticker** button when DMS has one (`prod.docs.s3/cart-window-stickers/`).
- **Mark posted / undo** (admins), plus who marked it and when.
- **Photos:** thumbnails, full-screen viewer with arrows and keyboard support, **Save** per photo and **Save all**.
- **5 listing variations:**
  - Each has 2 titles and a description, with copy buttons.
  - The mix is 3 paragraph + 2 list, or 2 + 3.
  - Descriptions include the features, warranty lines, financing, delivery, and "City, ST".
  - Wording is seeded per user, so two salespeople posting the same cart get different text.
  - Each description gets ~3 small human-looking imperfections so posts don't look machine-made.
- **Warranty rules:**
  - DMS warranty fields are used first.
  - Otherwise: new lithium cart → 2 yr cart / 8 yr battery; other new → 1 yr / 1 yr; used with a new lead-acid battery → 90 day / 1 yr; used → 90 day / 90 day.
- **Cart info table:** price, power/battery, passengers, colors, wheels/tires, drivetrain, lifted, street legal, roof, sound, hitch, warranties, serial, VIN, DMS status, last synced.
- **Posted On tracker:**
  - A checklist of every Facebook account, grouped by location.
  - Select several and press **Done** to save them at once.
  - Shows who posted on each account and when.
  - Checking any account also marks the cart posted for you.
- **Store info** for the cart's location.

### Profiles
- Every Facebook account with the list of carts posted on it (who posted and when), filterable by owner.
- `?me=1` (clicking your name chip) lets you edit your display name and legacy identity.

### Accounts (admins)
- **Facebook accounts:**
  - Grouped by location; **drag and drop** an account onto another location to move it.
  - Add, edit (name, location, owner) and delete accounts.
  - The 44 known accounts are seeded automatically the first time.
- **Team:** every MP user with an Admin/Sales role switch.
- **Maintenance:**
  - **Sync from DMS now** and last sync result.
  - **Scan & remove 'delete' carts**.
  - **Import from legacy MP Assistant**: copies carts, accounts and posting history from the old `tigon-marketplace` site. Safe to re-run.
  - **Restore default accounts** and **Reload inventory**.

### Tigon Poster (Chrome extension, optional)
- Sign in with a TIGON IOT account, search or pick a cart, choose one of the 5 listings, then **Send to Facebook form**.
- On Facebook's "create vehicle listing" page a **TIGON MP Autofill** panel appears:
  - It fills price, description, year, make, model, vehicle type and location where it can find them.
  - It **never** clicks Post, Publish or Next.
  - It has a **Copy form structure** button for debugging when Facebook changes its form.

### Dealership data used by the app
T0 National and T1–T14 (Hatfield, Ocean View, Long Pond, Dover, Scranton-Wilkes-Barre, Raleigh, South Bend, Gloucester Point, Bayville, Waretown, Orangeburg, Lecanto, Swanton, Rio Grande). Each has a phone number, address, coordinates, and Google Maps, Facebook, YouTube, website, Pinterest and review links. The list lives in `frontend/src/mp/constants.ts`.

---

## 6. Data model (Firestore)

| Collection | Key fields | Written by |
|---|---|---|
| `users/{uid}` | email, emailVerified, role, createdAt, lastLogin | Android app / functions |
| `devices/{id}` | userId, deviceName, deviceType (master/worker), isActive, fcmToken | Android app; web (rename/delete) |
| `notifications/{id}` | targetUserId, sourceDeviceName, text, isHandled, handledAt, createdAt | Android worker app; web (mark handled) |
| `appVersions/android` | latestVersion, versionCode, downloadUrl, forceUpdate, mandatory, releaseNotes | Firebase console |
| `systemConfig/mpAssistant` | adminEmails[] | Firebase console |
| `mp_users/{uid}` | name, email, role, legacyId | user / admins |
| `mp_carts/{dmsId}` | payload (raw DMS JSON), payloadHash, savedAt, dmsId, serial, locationId, isUsed, postedBy{uid: time}, postedAccounts{accountId: {by, ts}} | DMS sync; admins |
| `mp_accounts/{id}` | name, group (T-location), owner, order | admins |
| `mp_meta/sync` | ok, trigger, startedAt, finishedAt, fetched, inStock, written, unchanged, removedSold, warning, error | DMS sync |

## 7. Scheduled jobs

| Job | Schedule | What it does |
|---|---|---|
| `cleanupOldNotifications` | every 24 h (New York time) | deletes notifications older than 30 days |
| `mpSyncInventory` | every 60 min (New York time) | pulls in-stock inventory from the DMS API, removes sold carts |

## 8. Deploying

- **Automatic:** merging anything into `main` runs **Deploy to Firebase** in GitHub Actions: build website → build functions → deploy hosting, functions and Firestore rules.
- It logs in with the `FIREBASE_SERVICE_ACCOUNT` repository secret.
- Progress and errors are in the repo's **Actions** tab.

---

## 9. Known issues and gaps (fix these first)

| # | Issue | Impact |
|---|---|---|
| 1 | **The live site's newer dashboard code (Today / This Week / This Month / Search by Date, delete button) is not in GitHub.** | Any deploy from GitHub removes those features. Get that code into the repo. |
| 2 | Settings "Sound" and "Browser notifications" switches **aren't saved** and do nothing. | Misleading to users. |
| 3 | The Android app's source isn't in this repo. | No history or backup of the app code, and no way to review it alongside the backend. |
| 4 | Older pages (Dashboard, Devices, Settings, Download) have TypeScript errors from the MUI 7 `Grid` upgrade. The site still builds, but type checks fail. | Harder to catch real bugs. |
| 5 | Leftover files: an empty file `c` and an old duplicate `src/` folder at the repo root. | Confusing. |
| 6 | Any @tigongolfcarts.com user can create a notification **for any other user** (rules only check the email domain). | Spam or mistakes possible. |
| 7 | No automated tests, and no checks run on pull requests (only deploy on merge). | Broken code can reach the live site. |
| 8 | No test/staging Firebase project: every merge goes straight to production. | Risky changes hit users immediately. |
| 9 | DMS API details were written without being able to test against the real API: response format, how "new vs used" is marked (currently: used unless DMS says otherwise), and the prod default-image folder. | Confirm on the first sync; small fixes may be needed. |
| 10 | `firebase-functions` package is outdated (deploy warning). | Should be updated before it becomes unsupported. |
| 11 | Website bundle is one large file (> 500 KB). | Slower first load on phones. |
| 12 | Default new-cart images open in a tab instead of downloading (the photo worker only proxies cart photos). | Minor inconvenience. |

---

## 10. Ideas to make it better

### A. Connect the two systems (biggest win)
The IoT phones are the same phones that run the Facebook accounts. The notifications on the dashboard ("Rowan • You have 5 updates", "1 message, 1 friend request") are Facebook activity from those accounts.
1. **Link each IoT device to its Facebook account(s)** in MP Assistant. Every notification then shows which account and store it came from.
2. **Turn Facebook messages into leads:** detect "message about your listing" notifications, match them to the cart posted on that account, and show "3 people asked about this cart" on the cart page.
3. **Lead inbox per salesperson:** assign unhandled notifications to the account's owner, with a response-time timer and alerts when a lead waits more than X minutes.
4. **Posting → results report:** carts posted vs. messages received vs. sold, per account and per store.

### B. MP Assistant
- **Repost reminders:** Facebook listings go stale. Flag carts posted more than 7 days ago for reposting and add them back to the Home queue.
- **Price-change alerts:** when DMS changes a price, flag the Facebook listings that need editing.
- **Sold alerts:** when a posted cart sells, list the accounts it's posted on so the listings get marked sold or deleted.
- **Daily posting goals** per user or account, plus a leaderboard.
- **Account health:** track bans, restrictions and posting limits per Facebook account; show "last posted" per account.
- **Cart type / utility filter** and a "new arrivals this week" view.
- **Featured carts:** use `get-featured-carts` (national / per store) to prioritize what the website is promoting.
- **Sync stores** from `tigon-stores` so new locations appear automatically.
- **Photo tools:** reorder photos, choose the cover image, bulk-download a ZIP.
- **AI listing writer** (optional): richer, cart-specific descriptions with tone options.

### C. IoT Notifications
- Save Settings (sound, browser push) to Firestore and actually use them. Add **web push** so the dashboard alerts without the Android master phone.
- **Device health:** last seen, battery, app version, "offline for 2 hours" alerts.
- **Search and filters:** by device, text, handled, date range (partly on the live site already).
- **Notes and assignment** on notifications ("called back", "sold").
- **Team view:** managers see all devices and notifications across users, not just their own.
- **Analytics:** charts of notifications per day, per phone, and response times.

### D. Platform and reliability
- Get all live code (dashboard tabs, Android app) into GitHub.
- Add a **pull-request check** (lint + type check + build) so broken code can't be merged.
- Add a **staging project** (e.g. `tigon-iot-staging`) to test before production.
- **Alerts** when the DMS sync fails or deletes an unusual number of carts (email or IoT notification).
- Tighten the notification rule (writer must own the source device).
- Update dependencies; split the website bundle for faster loads.
- Add an **audit log** for admin actions (role changes, deletions, account moves).

---

## 11. Where things are in the code

| Area | Path |
|---|---|
| App routes and providers | `frontend/src/App.tsx` |
| Sidebar / layout | `frontend/src/components/Layout/DashboardLayout.tsx` |
| IoT pages | `frontend/src/pages/` (Dashboard, Devices, Settings, Download, Login, Register) |
| MP Assistant (web) | `frontend/src/mp/` (`pages/`, `components/`, `cartLogic.ts`, `constants.ts`, `MpDataContext.tsx`) |
| IoT server functions | `functions/src/index.ts` |
| MP server functions (DMS sync) | `functions/src/mpAssistant.ts` |
| Security rules | `firestore.rules`, `storage.rules` |
| Deploy pipeline | `.github/workflows/firebase-deploy.yml` |
| Poster extension, photo worker, MP docs | `mp-assistant/` |
