# Tigon MP Assistant — inside TIGON IOT

The Facebook Marketplace posting workflow (formerly the standalone `tigon-marketplace` site), running as a
**parallel module** of TIGON IOT: same Firebase project (`tigon-iot`), same login, same dashboard, and its
own data (`mp_*` collections) that never touches the IoT device/notification data.

| Piece | Where | What it does |
|---|---|---|
| MP Assistant web app | `frontend/src/mp/` → routes `/mp/*` | Home queue, Find a Cart, Locations, Browse, Profiles, Accounts, cart detail (photos, 5 listings, Posted On tracker) |
| DMS sync (`mpSyncInventory` hourly, `mpSyncNow` on demand) | `functions/src/mpAssistant.ts` | Pulls active inventory from the **production** DMS API, keeps in-stock carts, removes sold ones, resolves default images for new carts |
| Tigon Poster | `mp-assistant/poster/` | Chrome extension — picks a cart and autofills the Facebook vehicle form (never clicks Post) |
| Photo worker | `mp-assistant/photo-worker/worker.js` | Cloudflare Worker that proxies S3 photos as downloads (already live at `tigon-photos…workers.dev`) |

## What changed from the standalone version

- **Login instead of "Who am I?"** — users sign in with their TIGON IOT (`@tigongolfcarts.com`) account. The
  first visit to MP Assistant asks for a display name and, optionally, which old identity (Manager / Navid /
  Victoria / Sales) you were, so your old "posted" history carries over.
- **Roles are enforced by Firestore rules** — `admin` (mark posted, Posted On, Accounts page, imports) or
  `sales` (view + copy listings). New users start as `sales`; admins promote people on **Accounts → Team**.
- **No public read/write.** The old database allowed anyone to write; now only signed-in MP members can read
  and only admins can write.
- **No more scraping.** The old Grabber extension (Chrome debugger capture of the DMS web app) is replaced by a
  server-side sync from the DMS website API.
- **Posted state** is keyed by Firebase uid (`postedBy.{uid}`); legacy keys (`manager`, `navid`, …) still count
  for whoever claimed them.

## DMS API sync (production only)

- Base URL: `https://api.tigondms.com/wp-website` (the test API is never used).
- `POST /get-carts` with `{pageNumber, pageSize: 100, isAllCarts: true}`, paging until an empty page.
- Carts with `isInStock: false` (or status `sold`) are sold: they're skipped, and any dashboard copy is removed.
  As a safety net, removals are skipped if DMS returns nothing or fewer than half the current inventory.
- Photos: `imageUrls` → `https://s3.amazonaws.com/prod.docs.s3/carts/<file>`.
- New carts with no photos get default web images from
  `https://s3.amazonaws.com/prod.docs.s3/default-cart-web-images/<color>-<make>-<model>-in-<location>-<1..4>.jpg`,
  using the location set if it exists, otherwise `-in-national-`. The first image is the thumbnail.
- Window stickers: `https://s3.amazonaws.com/prod.docs.s3/cart-window-stickers/<file>` (shown on the cart page when present).
- Cart name shown in the app: **Make + Model + Cart Color + Location** (e.g. "Evolution Turfman 200 Mineral White Hatfield").
- Unchanged carts aren't rewritten (a payload hash is compared), so hourly syncs are cheap.
- Last run status is in `mp_meta/sync` and shown in the app header; admins can run **Accounts → Sync from DMS now**.

Store details (phone, address, map, Facebook, YouTube, website, Pinterest, review links for T0–T14) live in
`frontend/src/mp/constants.ts` (`DEALERSHIPS`) and appear on the Locations pages and each cart page.

## Firestore collections

| Collection | Doc | Written by |
|---|---|---|
| `mp_carts/{dmsId}` | `payload` (raw DMS JSON string), `payloadHash`, `savedAt`, `dmsId`, `serial`, `locationId`, `isUsed`, `postedBy{uid: ts}`, `postedAccounts{acctId: {by, ts}}` | DMS sync (inventory), admins (posting) |
| `mp_meta/sync` | last sync result / error | DMS sync |
| `mp_accounts/{id}` | `name`, `group` (T-location), `owner`, `order` | admins (auto-seeded with the 44 accounts) |
| `mp_users/{uid}` | `name`, `email`, `role`, `legacyId` | the user (create/name), admins (role) |
| `systemConfig/mpAssistant` | `adminEmails: string[]` | Firebase console only — bootstrap admins |

## First-time setup

1. **Deploy** rules, functions and hosting from the repo root:
   ```bash
   cd frontend && npm ci && npm run build && cd ..
   rm -rf dist && cp -r frontend/dist dist
   cd functions && npm ci && npm run build && cd ..
   firebase deploy --only firestore:rules,functions,hosting
   ```
2. **Bootstrap the first admin**: in the Firebase console → Firestore, create document
   `systemConfig/mpAssistant` with field `adminEmails` (array) containing the admin emails,
   e.g. `mike@tigongolfcarts.com`. Those users get `admin` when they first open MP Assistant.
3. **Migrate old data**: as an admin, open **MP Assistant → Accounts → Import from legacy MP Assistant**.
   It copies accounts and posting history from `tigon-marketplace`. It is safe to run again. Then click
   **Sync from DMS now**; carts that are no longer in stock are removed on that sync.
4. Everyone else opens **MP Assistant** from the sidebar once to create their profile (starts as `sales`).
5. Optional: install the Poster extension (see `poster/README.md`) and sign in with a TIGON IOT account.

## Daily workflow (unchanged)

1. Nothing to import — inventory syncs from the DMS API every hour (or **Sync from DMS now**).
2. Phone → TIGON IOT → **MP Assistant → Home** → pick a cart → copy a listing → post on Facebook.
3. In **Posted on**, tick the account(s) → **Done** (auto-marks the cart posted for you).

## Development

- Listing logic lives in `frontend/src/mp/cartLogic.ts`. After changing it, run
  `cd frontend && npm run build:mp-ext` to regenerate `cart-logic.js` for the Poster.
- `shared/tigon-auth.js` is copied into `poster/` (MV3 can't load files outside the extension folder); keep the copies identical.
- The server keeps its own copy of the image location slugs (`IMAGE_LOCATION_SLUGS` in `functions/src/mpAssistant.ts`).
