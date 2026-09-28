# TIGON IOT — Full Build Documentation

> Complete reference for the entire TIGON IOT platform: website, MP Assistant (Facebook Marketplace),
> server functions, iPhone/Android app, Chrome extension, deploy pipeline, data, security, and setup.
> Repository: `Tigon-Golf-Carts-LLC/tigon-iot` · Firebase project: `tigon-iot` · Last updated: September 28, 2026

---

## Table of contents

1. [System overview](#1-system-overview)
2. [Live URLs, IDs and constants](#2-live-urls-ids-and-constants)
3. [Architecture](#3-architecture)
4. [Repository layout](#4-repository-layout)
5. [Accounts, login and roles](#5-accounts-login-and-roles)
6. [Website — IoT Notifications module](#6-website--iot-notifications-module)
7. [Website — MP Assistant module](#7-website--mp-assistant-module)
8. [Listing generator (cart logic)](#8-listing-generator-cart-logic)
9. [DMS inventory sync](#9-dms-inventory-sync)
10. [Dealership locations](#10-dealership-locations)
11. [Phone app (iPhone + Android)](#11-phone-app-iphone--android)
12. [Android worker app (existing)](#12-android-worker-app-existing)
13. [Tigon Poster Chrome extension](#13-tigon-poster-chrome-extension)
14. [Photo system and Cloudflare Worker](#14-photo-system-and-cloudflare-worker)
15. [Cloud Functions](#15-cloud-functions)
16. [Firestore data model](#16-firestore-data-model)
17. [Security rules](#17-security-rules)
18. [Deploy and build pipelines](#18-deploy-and-build-pipelines)
19. [Setup from scratch](#19-setup-from-scratch)
20. [Daily operations](#20-daily-operations)
21. [Troubleshooting](#21-troubleshooting)
22. [Known issues and gaps](#22-known-issues-and-gaps)
23. [Roadmap / ideas](#23-roadmap--ideas)
24. [Build history](#24-build-history)
25. [Posting, phones and analytics](#25-posting-phones-and-analytics)
26. [Growth release: create, share, sell, team, ease of use](#26-growth-release-create-share-sell-team-ease-of-use)

---

## 1. System overview

TIGON IOT is Tigon Golf Carts' internal staff platform. One login (`@tigongolfcarts.com` accounts only) gives
access to two systems that run side by side:

| System | Purpose | Where it runs |
|---|---|---|
| **IoT Notifications** | Android "worker" phones forward their notifications (mostly Facebook Marketplace activity) to the cloud; staff see and handle them in one dashboard; "master" phones get push alerts. | Website, Android worker app, phone app, Cloud Functions |
| **MP Assistant** | Posting DMS inventory to Facebook Marketplace: what to post next, ready-to-paste listings, photos, and which Facebook account each cart is posted on. | Website, phone app, Cloud Functions, Chrome extension |

| Component | Type | Purpose |
|---|---|---|
| TIGON IOT website | React web app on Firebase Hosting | Dashboard, devices, settings, app download, MP Assistant |
| TIGON IOT phone app | iPhone + Android app (Capacitor) | Same as the website + push alerts + save photos to phone |
| Android worker app | Android app (separate project, **not in repo**) | Captures phone notifications and uploads them |
| Cloud Functions | Firebase Functions v2 (Node.js 22) | Push alerts, cleanup, DMS inventory sync, account helpers |
| Tigon Poster | Chrome extension (MV3) | Autofills the Facebook Marketplace vehicle form (never clicks Post) |
| Photo worker | Cloudflare Worker | Serves S3 cart photos as downloads |

---

## 2. Live URLs, IDs and constants

| Item | Value |
|---|---|
| Website | `https://tigon-iot.web.app` (Firebase Hosting, project `tigon-iot`) |
| Firebase project ID | `tigon-iot` |
| Firebase web API key | `AIzaSyBuRfa47FdTj7kd4O6uNE-PmWiFEZfkRo4` (public web key; security is enforced by rules) |
| Auth domain | `tigon-iot.firebaseapp.com` |
| Storage bucket | `tigon-iot.firebasestorage.app` |
| Functions region | `us-central1` (default) |
| Phone app ID (iOS bundle / Android package) | `com.tigongolfcarts.iot` |
| Phone app name | TIGON IOT |
| DMS API (production only) | `https://api.tigondms.com/wp-website` |
| Cart photos (S3) | `https://s3.amazonaws.com/prod.docs.s3/carts/` |
| Default new-cart images | `https://s3.amazonaws.com/prod.docs.s3/default-cart-web-images/` |
| Window stickers | `https://s3.amazonaws.com/prod.docs.s3/cart-window-stickers/` |
| Photo download worker | `https://tigon-photos.michael-b-2da.workers.dev` |
| Legacy MP Assistant (migration source) | Firebase project `tigon-marketplace` (`https://tigon-marketplace.web.app`) |
| Brand colors | Red `#af1f31` (primary), Blue `#0e4671` (secondary) |

---

## 3. Architecture

```
┌──────────────────────────────── Firebase project: tigon-iot ────────────────────────────────┐
│                                                                                              │
│  Hosting ── React app (website)                     Auth ── email/password, verified email   │
│                                                                                              │
│  Firestore                                                                                   │
│   ├─ users, devices, notifications, appVersions, systemConfig      (IoT)                     │
│   └─ mp_carts, mp_accounts, mp_users, mp_meta                      (MP Assistant)            │
│                                                                                              │
│  Cloud Functions                                                                             │
│   ├─ onNotificationCreate ──► FCM push to the user's active master devices                   │
│   ├─ cleanupOldNotifications (daily)                                                         │
│   ├─ onUserCreate / validateEmailDomain / getLatestAppVersion / updateLastLogin (HTTP)       │
│   ├─ mpSyncInventory (hourly) ─┐                                                             │
│   └─ mpSyncNow (admin button) ─┴─► DMS API get-carts ──► mp_carts                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
      ▲               ▲                        ▲                      ▲
      │               │                        │                      │
 Android worker   Website /             Tigon Poster ext.        Amazon S3 photos
 phones (upload   phone app             (reads mp_carts via      (via Cloudflare
 notifications)   (staff)               Firestore REST)          photo worker)
```

**Notification flow:** worker phone → `notifications` doc → `onNotificationCreate` → push to master phones
(Android master app and/or TIGON IOT phone app) → staff mark handled on the dashboard → auto-deleted after 30 days.

**Inventory flow:** DMS → `mpSyncInventory` (hourly) → `mp_carts` → MP Assistant (website / phone app / Poster)
→ staff post on Facebook → Posted On tracker records account + person.

---

## 4. Repository layout

```
tigon-iot/
├── .github/workflows/
│   ├── firebase-deploy.yml      # deploy website + rules + MP functions on merge to main
│   └── mobile-build.yml         # build Android APK + iOS compile check
├── docs/                        # this document + system overview
├── firebase.json                # hosting (dist/), functions (nodejs22), firestore, storage
├── .firebaserc                  # default project: tigon-iot
├── firestore.rules              # database security rules
├── firestore.indexes.json
├── storage.rules                # storage locked (no client access)
├── dist/                        # built website (CI rebuilds it on deploy)
├── frontend/                    # React app + phone app
│   ├── src/
│   │   ├── App.tsx              # routes, providers
│   │   ├── config/firebase.ts   # Firebase client config
│   │   ├── context/AuthContext.tsx
│   │   ├── components/Layout/DashboardLayout.tsx   # sidebar + top bar
│   │   ├── pages/               # IoT pages: Dashboard, Devices, Settings, Download, Login, Register
│   │   ├── mp/                  # MP Assistant module
│   │   │   ├── cartLogic.ts     # DMS mapping + listing generator (also bundled for the extension)
│   │   │   ├── cartUtils.ts     # sorting, suggestions, search, posted status
│   │   │   ├── constants.ts     # URLs, dealerships, seed accounts, legacy users
│   │   │   ├── MpDataContext.tsx# data layer (carts, accounts, profiles, sync, actions)
│   │   │   ├── legacyImport.ts  # one-time migration from tigon-marketplace
│   │   │   ├── photos.ts        # save photos (browser download / phone share sheet)
│   │   │   ├── routes.tsx
│   │   │   ├── components/      # MpShell, CartCard, CartGrid, PhotoLightbox, ListingVariations,
│   │   │   │                    # PostedOnTracker, StoreInfo, ChipFilter, MpDashboardCard, CartPhoto
│   │   │   └── pages/           # MpHome, MpFind, MpLocations, MpBrowse, MpProfiles, MpAccounts, MpCartDetail
│   │   └── native/              # phone-app-only code (push alerts, back button)
│   ├── android/                 # Android Studio project (Capacitor)
│   ├── ios/                     # Xcode project (Capacitor, Swift Package Manager)
│   ├── assets/                  # app icon + splash sources
│   ├── public/                  # manifest.webmanifest, icons
│   ├── capacitor.config.ts
│   └── MOBILE_APPS.md           # phone app guide
├── functions/
│   └── src/
│       ├── index.ts             # IoT functions (+ re-exports MP functions)
│       └── mpAssistant.ts       # DMS sync functions
└── mp-assistant/
    ├── README.md                # MP Assistant technical notes
    ├── poster/                  # Tigon Poster Chrome extension
    ├── shared/                  # shared extension files (auth helper, cart logic bundle)
    └── photo-worker/worker.js   # Cloudflare Worker source
```

Tech stack: React 19, TypeScript 5.9, Material UI 7, React Router 7, Vite 7, Firebase JS SDK 12,
Capacitor 8, Firebase Functions v2 (Node.js 22), firebase-admin 13, date-fns, recharts, qrcode.react.

---

## 5. Accounts, login and roles

### Sign-up / login
| Feature | Details |
|---|---|
| Register (`/register`) | Email, password, confirm password. Only `@tigongolfcarts.com` emails. Sends a verification email. |
| Login (`/login`) | Email + password. |
| Email verification | Required: unverified users see "Email Verification Required" on every protected page. |
| Password reset | Sends a reset email. |
| Change password / delete account | Settings page. |
| Logout | Avatar menu (top right). In the phone app, logging out also turns off push alerts for that phone. |

### MP Assistant roles
| Role | Can do |
|---|---|
| **admin** | Everything: Accounts page, team roles, Sync from DMS, cleanup, legacy import, audit log, delete phones |
| **manager** | Team phones (see, rename, reassign, revoke), queue carts to anyone, team analytics, alerts |
| **sales** (shown as **Member**) | Inventory, listings, photos, Prepare listing, mark posted / Posted On, own queue and own analytics |

- First visit to MP Assistant: pick a display name and (optionally) a **legacy identity** from the old app
  (Manager / Navid / Victoria / Sales) so old "posted" history carries over. Each legacy identity can be claimed once.
- New users are **sales**. Emails in Firestore `systemConfig/mpAssistant.adminEmails` (array) become **admin**
  on their first visit. Admins can change anyone's role on **Accounts → Team** (not their own).

---

## 6. Website — IoT Notifications module

Sidebar: **Dashboard, Devices, Settings, Download App**, then **Marketplace → MP Assistant**.

### Dashboard (`/dashboard`)
- Counters: **Total Notifications**, **Unhandled**, **Handled** (from the 20 most recent).
- **Recent Notifications** — live list: source device, handled status, text, time ago; **Mark Handled** button.
- **Alerts on this phone** card (phone app only) — turn push alerts on/off for this phone.
- **MP Assistant card** — carts in inventory, posted by you, left to post; **Open MP Assistant**.

### Devices (`/devices`)
- Live list of your registered devices: name, **Master/Worker**, **Active/Inactive**.
- Rename (dialog) and delete.
- Phone app: **Alerts on this phone** card at the top.
- Empty state links to Download App.

### Settings (`/settings`)
- Change password (8+ characters, confirm must match).
- Resend verification email.
- Delete account (double confirmation).
- "Sound" and "Browser notifications" switches (display only — not saved yet, see §22).

### Download App (`/download`)
- Reads `appVersions/android`: latest version, release notes, "Update Required" flag, download URL.
- Download button + QR code, device requirements, step-by-step install instructions.

---

## 7. Website — MP Assistant module

Route `/mp/*`. Header: title, inventory count (`800+` while loading), **DMS synced X ago** (red if the last sync
failed), your name + role (click to edit your profile). Tabs: **Home · Find a Cart · Locations · Browse ·
Profiles · Accounts** (Accounts for admins only).

Inventory loads once per session in batches of 200 and is kept in memory; cards render 50 at a time with
infinite scroll + "Load more". Carts marked not-in-stock are hidden.

### 7.1 Home — Suggested to post
- Carts **you** haven't posted, with at least one working photo, not flagged "delete".
- Order: **used first → photo rank (3+ / 2 / 1) → price high to low**, then round-robin across stores within
  each tier so no single location dominates. Up to 60 suggestions.
- "You've posted X of Y."

### 7.2 Find a Cart (customer calls)
| Filter | Options |
|---|---|
| Search | make, model, year, color, seat color, serial, VIN, location code/name, battery, new/used |
| Price | Any, Under $5k, $5k–$8k, $8k–$12k, $12k+, plus range slider ($250 steps) |
| Brand | built from inventory with counts |
| Model | appears after a brand is picked |
| Condition | Any / Used / New |
| Power | Any / Electric / Gas |
| Passengers | Any / 2 / 4 / 6+ |
| Location | locations present in inventory |
| **More filters** | Lifted, Street legal, Battery type (lithium / lead acid), Cart color, Extended roof, Sound system, Hitch, Drivetrain, Tire type, Has photos (Yes/No/Any where relevant) |

Match count and **Clear all filters**.

### 7.3 Locations
- A tile for every dealership (T1–T14, T0) with phone number, cart count, used count, and "not posted by you".
- Location page: **store info** (address, click-to-call phone, Map / Website / Facebook / YouTube / Reviews
  buttons), then **Used** and **New** sections.

### 7.4 Browse
Search everything; filters: Make, Condition, Posted (Any / by me / not by me / by anyone / never posted).

### 7.5 Cart card (all lists)
Photo with photo count, name (Make Model Color City), year/make/model, price, location, chips: Used/New,
Posted (by you), N accounts, ⚠ photo issue, delete flag. **Save all photos** button. Tap → cart page.

### 7.6 Cart page (`/mp/cart/:id`)
- **Title:** Make + Model + Color + Location, with year/make/model underneath; price.
- **Chips:** Used/New, location, ⚠ photo issue, "Flagged 'delete' in DMS", "Default new-cart images".
- **Window sticker** button (when DMS provides one).
- **Mark posted / Posted by you X ago — undo** (admins).
- **Photos:** grid, full-screen lightbox (arrows, keyboard ←/→, Esc, counter), **Save** per photo, **Save all**.
- **Listing variations:** 5 tabs (see §8), copy buttons for Title 1, Title 2, description, and title + description.
- **Cart info table:** price, condition, location, power/voltage/engine, battery (type, brand, year), passengers,
  colors, wheels/tires, drivetrain, lifted, street legal, extended roof, sound system, hitch, cart warranty,
  battery warranty, serial, VIN, DMS status, last synced; "Marked posted by" chips (who + when).
- **Posted On tracker:** every Facebook account grouped by location; multi-select checkboxes → **Done (n)** saves
  all at once (Cancel to discard); each checked account shows who posted and when; checking any account also
  marks the cart posted for you. Sales users see it read-only.
- **Store info** for the cart's location.
- **Refresh** (re-reads the cart from the database). After any posting change the cart is re-read 0.8 s later.

### 7.7 Profiles
Every Facebook account (grouped by location) as an expandable row: posted count, owner, and the list of carts
posted on it (cart, price, location, who, when — tap to open). Filter by owner. `?me=1` shows your profile editor.

### 7.8 Accounts (admins)
- **Facebook accounts:** grouped by location (T1–T14, Other); **drag and drop** to move; add / edit (name,
  location, owner) / delete. The 44 known accounts are seeded automatically when the list is empty.
- **Team:** every MP user with Admin/Sales selector.
- **Maintenance:**
  - **Sync from DMS now** + last run result (in stock, updated, removed, warnings/errors).
  - **Scan & remove 'delete' carts** (shows how many found).
  - **Import from legacy MP Assistant** — copies carts, accounts and posting history from `tigon-marketplace`
    (merges; safe to re-run).
  - **Restore default accounts**, **Reload inventory**.

### 7.9 Seeded Facebook accounts (44)
| Group | Accounts |
|---|---|
| T1 | Armando Fuentes Jr, Barbara Woodrich, Jeffrey Honda, Michael Benedict, Yusuf Mustaf Rahman |
| T2 | Mahin Saleem Cassim |
| T3 | Ana Sepulveda, Cindra James, Coleen Hohn |
| T4 | Hilary Lowenstein, Newell Carapezzi |
| T6 | Nilande Louis |
| T7 | Boswell Hamilton, Robin Masfield |
| T8 | Elizabeth Garcia, Grace Kim |
| T9 | Alic Starkey |
| T10 | Salah Al Sandaqchi |
| Other | Nancy Swanson, Peggy Longshore, Susan Dilsaver, Ronald Carapezzi, Camille Jourdain, Judith Baxter, Lola Peterson, Rachel Davis, Younan Hasado, Kassandra Ibarra, Grace Cervin, Margaret Jenkins, Salvador Sanchez, Shlomo Zikri, Jude Andrepont, Tamara Young, Alejandro Govea, Boston Lesjak, Julie Long, Phillip Glaze, Jason Ritchie, Jose Herrera, Marie Perlis, Terry Savage, Robert Ireland, Carol Ireland |

---

## 8. Listing generator (cart logic)

File: `frontend/src/mp/cartLogic.ts` (also bundled into the Poster extension as `cart-logic.js`).

### DMS → cart mapping (`mapDmsCartObject`)
| Cart field | DMS source |
|---|---|
| id / dmsId | `_id` (falls back to `serialNo`) |
| make, model, year | `cartType.make/model/year` |
| color, seatColor, driveTrain, tireRimSize, tireType | `cartAttributes.*` |
| hasSoundSystem, isLifted, hasHitch, hasExtendedTop | `cartAttributes.*` (null = no) |
| passengers | number parsed from `cartAttributes.passengers` ("4 Passenger" → 4) |
| battery type/voltage/brand/year | `battery.*` |
| engineMake | `engine.make` |
| locationId | `cartLocation.locationId` → `cartLocation.latestStoreId` → "Other" |
| price | `retailPrice` |
| isElectric | `isElectric` (default true) |
| isUsed | `isUsed` → `!isNew` → `condition` text → default **used** |
| isStreetLegal | `title.isStreetLegal` |
| inStock | `isInStock !== false` |
| photos | `imageUrls` → `internalCartImageUrls` → default new-cart images from sync |
| windowSticker | any `*sticker*`/`monroney` field, prefixed with the sticker URL |
| serial, vin, invoice, status, isDraft, isRFS | `serialNo`, `vinNo`, `invoiceNo`, `status`, `isDraft`, `rfsStatus.isRFS` |
| flaggedDelete | the word "delete" anywhere in the DMS record |

### Warranty rules
DMS values first (`warrantyLength`, `battery.warrantyLength`); otherwise:

| Cart | Cart warranty | Battery warranty |
|---|---|---|
| New + lithium | 2 year | 8 year |
| New (other) | 1 year | 1 year |
| Used electric, non-lithium battery ≤ 1 year old | 90 day | 1 year |
| Used (other) | 90 day | 90 day |
| Gas | as above | none |

### Five variations (`generateVariations`)
- Split 3 paragraph + 2 list **or** 3 list + 2 paragraph, shuffled.
- **Seeded per user** (hash of cart ID + user ID): two salespeople get different wording for the same cart;
  the same person always gets the same five.
- **Titles:** adjective (used: Well Kept / Clean / Great Shape / Nice / Sharp / Ready to Ride; new: New / Brand New /
  Like New / New Model) + feature noun (Street Legal Cart, LSV, Lifted Golf Cart, Lithium Cart, Gas Golf Cart,
  4 Seater / 6 Seater Golf Cart…). Title 2 variants: "2023 EVolution Classic 4 Pro – Candy Apple Red",
  "… Lithium/Electric/Gas", "Make Model Lifted 4 Pass".
- **List format:** name, price, then one feature per line (street legal, lifted, passengers, lithium battery /
  voltage, gas engine, paint + seats, wheels + tires, extended roof, sound system, hitch, drivetrain — "2WD"/"2X4" omitted).
- **Paragraph format:** opener ("Well taken care of and ready for the season.") + "It's a lifted 4 passenger
  2023 … with a 48V lithium battery and …" + "Also has …" + price sentence.
- **Both end with:** warranty lines → financing line → delivery line → blank line → **City, ST** (no company name).
- **Human touch:** ~3 random subtle imperfections per description (dropped comma, "&" for "and", lowercase
  sentence start, dropped final period).

---

## 9. DMS inventory sync

File: `functions/src/mpAssistant.ts`. **Production DMS only.**

| Step | Details |
|---|---|
| Fetch | `POST https://api.tigondms.com/wp-website/get-carts` body `{pageNumber, pageSize: 100, isAllCarts: true}`; pages until an empty page or no new carts (max 200 pages). Response shape is detected automatically (largest array of cart objects). |
| Filter | Skip `isInStock: false` and status "sold" (sold); skip records containing "delete". |
| Default images | New carts with no photos: check `default-cart-web-images/<color>-<make>-<model>-in-<location-slug>-1.jpg`; if missing, use `-in-national-`; keep images 1–4 that exist. First image = thumbnail. |
| Save | Upsert `mp_carts/{id}` with raw payload, hash, location, used flag, serial. **Unchanged carts are skipped** (hash compare). Posting history is never overwritten. |
| Remove sold | Delete carts no longer in the in-stock list (matched by ID, DMS ID or serial). **Safety net:** skipped if DMS returned 0 carts or fewer than half the current inventory (warning recorded). |
| Status | Written to `mp_meta/sync` (counts, trigger, times, warning or error). |
| Schedule | `mpSyncInventory` every 60 min (America/New_York); `mpSyncNow` on demand (admins; callable, 9-minute timeout). |

Location slugs for default images: T1 hatfield-pennsylvania · T2 ocean-view-new-jersey · T3 long-pond-pennsylvania ·
T4 dover-delaware · T5 scranton-pennsylvania · T6 raleigh-north-carolina · T7 south-bend-indiana ·
T8 gloucester-point-virginia · T9 bayville-new-jersey · T10 waretown-new-jersey · T11 orangeburg-south-carolina ·
T12 lecanto-florida · T13 swanton-ohio · T14 rio-grande-new-jersey · fallback `national`.

Other DMS endpoints (documented, not used yet): `POST /get-featured-carts` (`{key: "national"}` or
`"tigon_hatfield"`, `"tigon_ocean_view"` → featuredNewCarts / featuredUsedCarts / popularCarts), `GET /tigon-stores`.

---

## 10. Dealership locations

Source of truth: `frontend/src/mp/constants.ts` → `DEALERSHIPS`.

| ID | Store | Phone | Address | Website |
|---|---|---|---|---|
| T0 | TIGON National | 1-844-844-6638 | National | tigongolfcarts.com |
| T1 | Hatfield, PA | 215-595-8736 | 2333 Bethlehem Pike, Hatfield, PA 19440 | /hatfield |
| T2 | Ocean View, NJ | 609-840-0404 | 101 NJ-50, Ocean View, NJ 08230 | /ocean-view |
| T3 | Long Pond, PA | 570-580-0567 | 4738 PA-115, Long Pond, PA 18334 | /long-pond |
| T4 | Dover, DE | 302-546-0010 | 5158 N Dupont Hwy, Dover, DE 19901 | /dover |
| T5 | Scranton-Wilkes-Barre, PA | 570-344-4443 | 1225 N Keyser Ave #2, Scranton, PA 18504 | /scranton-wilkes-barre |
| T6 | Raleigh, NC | 984-489-0296 | 2700 S Wilmington St, Raleigh, NC 27603 | /raleigh |
| T7 | South Bend, IN | 574-703-0456 | 52129 State Road 933, South Bend, IN 46637 | /south-bend |
| T8 | Gloucester Point, VA | 804-792-0234 | 2810 George Washington Memorial Hwy, Gloucester Point, VA 23072 | /gloucester-point |
| T9 | Bayville, NJ | 732-908-7166 | 155 Atlantic City Blvd, Bayville, NJ 08721 | /bayville |
| T10 | Waretown, NJ | 732-998-8146 | 526 US-9, Waretown, NJ 08758 | /waretown |
| T11 | Orangeburg, SC | 803-596-0246 | 4166 North Rd, Orangeburg, SC 29118 | /orangeburg |
| T12 | Lecanto, FL | 352-453-0345 | 299 E. Gulf to Lake Hwy, Lecanto, FL 34461 | /lecanto |
| T13 | Swanton, OH | 419-402-8400 | 10420 Airport Hwy, Swanton, OH 43558 | /swanton |
| T14 | Rio Grande, NJ | 609-551-0234 | 1304 NJ-47 b, Rio Grande, NJ 08242 | /rio-grande |

Each entry also stores coordinates (where known) and Google Maps, Facebook, YouTube, Pinterest and review links.
Location sort order: T1, T2, T3, T3.5, T4 … T15, T0, Other.

---

## 11. Phone app (iPhone + Android)

Guide: `frontend/MOBILE_APPS.md`. Built with **Capacitor 8** around the same React code, so every website feature
is in the app. Phone-only code lives in `frontend/src/native/` and does nothing in a browser.

| Feature | Details |
|---|---|
| Everything on the website | Dashboard, Devices, Settings, Download, MP Assistant |
| **Push alerts** | "Alerts on this phone → Turn on" asks for notification permission, gets an FCM token, and saves the phone as a **master** device (`devices/app_<installId>_<uid>`, `source: tigon-iot-app`). `onNotificationCreate` then pushes every new notification to it. Token refreshes are saved automatically. Turning off / logging out sets `isActive: false`. |
| Tap an alert | Opens the Dashboard |
| Save photos | MP "Save" / "Save all" downloads photos to the app cache and opens the share sheet → **Save Image(s)** to the photo library |
| Phone layout | Edge-to-edge with safe-area padding (notch, status bar, home indicator); red status-bar area |
| Android back button | Goes back; exits on the first screen |
| Icon / splash | Red "TIGON IOT" placeholder (sources in `frontend/assets/`) |
| Installable website | The website also has a web manifest + icons, so "Add to Home Screen" works on any phone |

**Limits:** the app is a viewer/master app. It **cannot forward notifications** (iPhones don't allow it); worker
phones keep using the Android worker app. Website changes reach the app only after it's rebuilt.

**Push setup (one time):** register Android (`com.tigongolfcarts.iot`) and iOS apps in Firebase; add
`google-services.json` as GitHub secret `GOOGLE_SERVICES_JSON`; for iOS add `GoogleService-Info.plist`, upload an
APNs key to Firebase, and enable Push Notifications + Background Modes (Remote notifications) in Xcode.

**Getting it:**
- Android: GitHub → Actions → **Build phone apps** → artifact **tigon-iot-android-apk** → install the APK.
- iPhone: Apple Developer Program ($99/yr) + Mac/Xcode → Archive → TestFlight / App Store.
- Google Play (optional): Play Console ($25) + signed release bundle.

---

## 12. Android worker app (existing)

Separate app, **source code not in this repository**. Distributed as an APK from Firebase Storage; version info in
`appVersions/android` (current record: latestVersion 1.2.7, release notes "TIGON IOT Marketplace Release – Login and
device selection"). Worker phones capture notifications (e.g. Facebook) and write them to `notifications`; master
phones receive FCM pushes. Uses the HTTP functions in §15. The live backend functions for it
(e.g. `validateEmailDomain` as a callable) differ from this repo's copies — see §22.

---

## 13. Tigon Poster Chrome extension

Folder: `mp-assistant/poster/` (Manifest V3, version 2.0.0, "Tigon Poster (IoT)").

1. Install: `chrome://extensions` → Developer mode → **Load unpacked** → `poster/`.
2. Sign in with a TIGON IOT account (Firebase Auth REST; token refresh automatic). Requires an MP profile.
3. Pick a cart (search by make/model/serial/location/color; used first, price high → low; in-stock only),
   choose one of the 5 listings → **Send to Facebook form**.
4. On `facebook.com/marketplace/create/vehicle` a **TIGON MP Autofill** panel appears → **Fill Facebook form**:
   fills price and description reliably; tries year, make, model, vehicle type ("Other"/"Powersport"),
   location ("City, ST", only if empty); leaves mileage for you; shows per-field status.
5. Review, add photos, click **Post yourself**. Safety guard: it refuses to click anything labelled Post, Publish,
   Next, Submit, List, Share, Save draft or Continue.
6. **Copy form structure** button dumps Facebook's form fields for debugging when Facebook changes the page.

Shared files: `tigon-auth.js` (copy of `mp-assistant/shared/tigon-auth.js`), `cart-logic.js` (generated by
`cd frontend && npm run build:mp-ext` — don't edit by hand).

---

## 14. Photo system and Cloudflare Worker

- Cart photos: DMS `imageUrls` file names → `https://s3.amazonaws.com/prod.docs.s3/carts/<file>`.
- Broken photos are detected when an image fails to load, remembered for the session, excluded from photo rank,
  and flagged "⚠ photo issue".
- Downloads go through the Cloudflare Worker (`mp-assistant/photo-worker/worker.js`), which fetches from S3 and
  returns the image with `Content-Disposition: attachment` and CORS, so "Save" downloads instead of opening a tab.
  Download names: `Year_Make_Model_Serial_N.jpg`.
- Default new-cart images (full S3 URLs) download directly (they open in a tab in some browsers).
- Worker deploy: Cloudflare → Workers → `tigon-photos` → paste `worker.js` → Deploy (free tier).

---

## 15. Cloud Functions

| Function | Trigger | Purpose | Deployed by CI? |
|---|---|---|---|
| `onNotificationCreate` | Firestore create `notifications/{id}` | FCM push to the target user's active master devices ("TIGON IOT: <device>") | No (live version managed outside repo) |
| `cleanupOldNotifications` | Every 24 h | Delete notifications older than 30 days | No |
| `onUserCreate` | HTTPS | Create `users/{uid}` (domain check) | No |
| `validateEmailDomain` | HTTPS (live: callable) | Confirm a @tigongolfcarts.com token | No |
| `getLatestAppVersion` | HTTPS | Return `appVersions/android` | No |
| `updateLastLogin` | HTTPS | Update `users/{uid}.lastLogin` | No |
| `mpSyncInventory` | Every 60 min | DMS → `mp_carts` sync | **Yes** |
| `mpSyncNow` | Callable (admins) | Run the sync now | **Yes** |
| `mpCreatePairingCode` | Callable | One-time QR + 8-char code (10 min) to pair a phone to a user | **Yes** |
| `mpPairDevice` | Callable (no sign-in) | Validates the code, registers the phone, returns a custom sign-in token | **Yes** |
| `mpSendQueueItem` | Callable | Push a due queue item to the assigned phone right away | **Yes** |
| `mpDispatchQueue` | Every 5 min | Send scheduled items, remind after 30 min, fail after 3 reminders | **Yes** |
| `mpMonitor` | Every 15 min | Alerts: phone not opened for 24 h, failed posts, failed DMS sync | **Yes** |
| `mpAiListing` | Callable | AI listing writer (Claude) | Only when `ENABLE_AI_WRITER` = true |

Runtime: Node.js 22 (`firebase.json`). CI deploys only the two MP functions so the live IoT functions
(built from code not in GitHub) are never overwritten or deleted.

---

## 16. Firestore data model

| Collection / doc | Fields | Written by |
|---|---|---|
| `users/{uid}` | email, emailVerified, role, createdAt, lastLogin | Android app / functions |
| `devices/{id}` | userId, deviceName, deviceType (`master`/`worker`), isActive, fcmToken, (phone app: platform, source, updatedAt) | Android app, phone app, website (rename/delete) |
| `notifications/{id}` | targetUserId, sourceDeviceName, text, isHandled, handledAt, createdAt | Worker phones; website (handled) |
| `appVersions/android` | latestVersion, version, versionCode, downloadUrl, forceUpdate, mandatory, releaseNotes | Firebase console |
| `systemConfig/mpAssistant` | adminEmails[] | Firebase console |
| `mp_users/{uid}` | name, email, role (`admin`/`sales`), legacyId, createdAt | User (create/name), admins (role) |
| `mp_carts/{dmsId}` | payload (raw DMS JSON string), payloadHash, savedAt, dmsId, serial, locationId, isUsed, source, postedBy{userKey: ms}, postedAccounts{accountId: {by, ts}} | DMS sync; admins (posting) |
| `mp_accounts/{id}` | name, group (T-location or Other), owner (uid or legacy id), order | Admins |
| `mp_meta/sync` | ok, trigger, startedAt, finishedAt, fetched, inStock, written, unchanged, removedSold, skippedDelete, warning, error, alertedAt | DMS sync |
| `mp_queue/{id}` | cartId, cartTitle, cartPrice, locationId, assignedUserId, deviceId, accountId, accountName, variation, scheduledAt, status (queued/sent/opened/posted/failed/cancelled), attempts, sentAt, openedAt, postedAt, lastError, createdBy | Managers / members (own), functions |
| `mp_events/{id}` | type, userId, deviceId ('web' or device), platform, ts, cartId, queueId, accountId, message | Apps (append-only) |
| `mp_device_days/{deviceId_YYYYMMDD}` | deviceId, userId, date, activeMinutes | Phone app heartbeat |
| `mp_alerts/{id}` | kind, text, deviceId, queueId, userId, createdAt, acknowledgedBy/At | `mpMonitor`; managers acknowledge |
| `mp_audit/{id}` | actorUid, actorName, action, target, details, ts | Apps + functions (append-only) |
| `mp_pairing/{sha256(token)}` | userId, codeHash, createdBy, createdAt, expiresAt, used | Functions only |
| `devices` (phone app extras) | source `tigon-iot-app`, installId, platform, model, osVersion, appVersion, lastSeen, status (active/revoked), pairedAt, offlineAlertAt | Phone app, functions, managers |

Posted-state keys: the user's Firebase uid, plus their claimed legacy id (`manager`, `navid`, `victoria`, `sales`).

---

## 17. Security rules

Helpers: `isAuthenticated`, `isValidEmail` (email ends with `@tigongolfcarts.com`), `isOwner`,
`isMpMember` (valid email + `mp_users` profile), `isMpAdmin` (role admin), `isMpBootstrapAdmin` (email in
`systemConfig/mpAssistant.adminEmails`).

| Path | Read | Create | Update | Delete |
|---|---|---|---|---|
| users/{uid} | owner | owner + valid email | owner | owner |
| devices | owner | valid email, userId = self | owner | owner |
| notifications | target user | valid email | target user | target user |
| appVersions, systemConfig | signed in | — | — | — |
| mp_users/{uid} | valid email | self, role `sales` (or `admin` if bootstrap) | admin, or self without changing role/email | admin |
| mp_carts | MP member | admin | admin | admin |
| mp_accounts | MP member | admin | admin | admin |
| mp_meta | MP member | server only | server only | server only |
| devices (addition) | + managers | — | + managers (rename/reassign/revoke) | + admins |
| mp_carts (addition) | — | — | + members, only `postedBy`/`postedAccounts` | — |
| mp_queue | members | managers, or member for self | managers, or the assignee | managers |
| mp_events | managers, or own | own (append-only) | — | — |
| mp_device_days | managers, or own | own | own | — |
| mp_alerts | managers | server | managers (acknowledge only) | — |
| mp_audit | admins | own entries | — | — |
| mp_pairing | nobody | server | server | server |

Rules are covered by 30 emulator permission tests (members vs managers vs admins).
| Storage | locked | — | — | — |

---

## 18. Deploy and build pipelines

### Website + backend — `.github/workflows/firebase-deploy.yml`
- Trigger: push/merge to `main` (or **Run workflow** manually).
- Steps: build website (`frontend`, `npm run build`) → copy to `dist/` → build functions → authenticate with
  secret `FIREBASE_SERVICE_ACCOUNT` → `firebase deploy --only firestore:rules,hosting` + the MP functions (`mpSyncInventory, mpSyncNow, mpCreatePairingCode, mpPairDevice, mpSendQueueItem, mpDispatchQueue, mpMonitor`, and `mpAiListing` when enabled).
- Service account `github-deploy` roles: Firebase Admin, Cloud Functions Admin, Service Account User,
  Cloud Scheduler Admin, Artifact Registry Administrator, Cloud Build Editor. Cloud Billing API must be enabled
  (Blaze plan).

### Phone apps — `.github/workflows/mobile-build.yml`
- Trigger: any push that changes `frontend/` (or manual).
- **android** job (Ubuntu, Node 22, JDK 21): build web → `cap sync android` → optional `GOOGLE_SERVICES_JSON` →
  `./gradlew assembleDebug` → artifact **tigon-iot-android-apk**.
- **ios** job (macOS): build web → `cap sync ios` → optional `GOOGLE_SERVICE_INFO_PLIST` → `xcodebuild` for the
  iOS Simulator without signing (compile check).

### GitHub secrets
| Secret | Used for |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Deploying to Firebase (JSON key of `github-deploy`) |
| `GOOGLE_SERVICES_JSON` | Android push alerts (optional) |
| `GOOGLE_SERVICE_INFO_PLIST` | iOS push alerts in CI builds (optional) |

Repository **variable** (Settings → Secrets and variables → Actions → Variables): `ENABLE_AI_WRITER` = `true`
turns on deploying the AI listing writer (after the `ANTHROPIC_API_KEY` secret exists in Google Secret Manager).

### Manual deploy (from a computer)
```bash
git clone https://github.com/Tigon-Golf-Carts-LLC/tigon-iot.git && cd tigon-iot
cd frontend && npm ci && npm run build && cd .. && rm -rf dist && cp -r frontend/dist dist
cd functions && npm ci && npm run build && cd ..
npm install -g firebase-tools && firebase login
firebase deploy --only firestore:rules,hosting,functions:mpSyncInventory,functions:mpSyncNow,functions:mpCreatePairingCode,functions:mpPairDevice,functions:mpSendQueueItem,functions:mpDispatchQueue,functions:mpMonitor
```

---

## 19. Setup from scratch

1. **Firebase:** project `tigon-iot` on the **Blaze** plan; enable Authentication (Email/Password), Firestore,
   Hosting, Functions, Cloud Scheduler; enable the Cloud Billing API.
2. **Admins:** Firestore → collection `systemConfig` → document `mpAssistant` → field `adminEmails` (array of
   `@tigongolfcarts.com` emails).
3. **Deploy account:** create service account `github-deploy` with the roles in §18 → JSON key → GitHub secret
   `FIREBASE_SERVICE_ACCOUNT`.
4. **Deploy:** merge to `main` (or run the workflow).
5. **First use:** sign in → **MP Assistant** → set up profile → **Accounts → Import from legacy MP Assistant**
   (one time) → **Sync from DMS now**.
6. **Phone app:** download the APK from Actions (Android); follow `frontend/MOBILE_APPS.md` for push alerts and iOS.
7. **Poster (optional):** load `mp-assistant/poster/` unpacked in Chrome and sign in.
8. **Photo worker:** already live; redeploy from `mp-assistant/photo-worker/worker.js` if ever needed.

Local development: `cd frontend && npm ci && npm run dev` (website at http://localhost:5173 against the live
Firebase project). Phone: `npm run build && npx cap sync && npx cap open android|ios`.

---

## 20. Daily operations

**Posting workflow**
1. Open TIGON IOT (phone app or website) → **MP Assistant → Home**.
2. Pick a suggested cart → pick one of the 5 listings → copy title + description → **Save all photos**.
3. Post on Facebook Marketplace (or use the Poster extension on a computer).
4. **Posted On** → tick the account(s) → **Done** (auto-marks the cart posted for you).

**Inventory:** nothing to do — synced hourly. Sold carts disappear automatically. Use **Sync from DMS now** after
big DMS changes.

**Notifications:** watch the Dashboard (or phone push alerts) → respond → **Mark Handled**.

**Admin tasks:** manage accounts/owners and team roles on **Accounts**; check "DMS synced" in the header.

---

## 21. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| MP Assistant not in sidebar | Deploy hasn't finished or browser cache → check Actions is green → Ctrl+Shift+R |
| "Email Verification Required" | Verify via the email link, or Settings → resend |
| Setup screen error saving profile | Account isn't `@tigongolfcarts.com` or not verified |
| No Accounts tab | You're `sales` → ask an admin, or add your email to `systemConfig/mpAssistant.adminEmails` before first visit |
| "DMS sync failed" in header | Accounts page shows the error; DMS API down or response changed |
| Sync warning "looks incomplete" | DMS returned too few carts; nothing was deleted; run again later |
| Photos show a car icon / ⚠ | S3 image missing or broken; cart sorts lower |
| Deploy fails "Permissions denied enabling …" | Enable that API in Google Cloud console as project owner, re-run |
| Deploy fails "Changing from a callable…" | CI tried to deploy an IoT function; CI must only deploy MP functions (current setup) |
| Phone app: "Notifications are blocked" | Allow notifications for TIGON IOT in phone settings |
| Phone app: alerts on but nothing arrives | Firebase app registration / `GOOGLE_SERVICES_JSON` (Android) or APNs key (iOS) missing |
| Poster: "needs a profile" / 403 | Open MP Assistant once on the website to create your profile |

---

## 22. Known issues and gaps

| # | Issue | Impact / action |
|---|---|---|
| 1 | Live dashboard features (Today / This Week / This Month / Search by Date, delete button) were never in GitHub and were replaced by the September 28 deploy | Recover that code from whoever deployed it and merge it in |
| 2 | Live IoT Cloud Functions and the Android worker app source are not in GitHub | No backup/review; CI deliberately doesn't touch them. Get the code into the repo. |
| 3 | Firestore rules were replaced from GitHub on Sept 28 | If anything on the phones/app shows permission errors, compare with the old rules |
| 4 | Settings "Sound" / "Browser notifications" switches aren't saved | Wire them up or remove |
| 5 | DMS API integration built without live access (response shape, new/used field, prod default-image folder) | Verify on first syncs; adjust mapping if needed |
| 6 | Phone app not yet tested on real devices; push needs Firebase app registration + APNs | Complete MOBILE_APPS.md setup, test on devices |
| 7 | Any @tigongolfcarts.com user can create a notification for any user | Tighten rule (writer must own the source device) |
| 8 | No automated tests; no PR checks for the website; no staging project | Add lint/type/build checks on PRs and a staging Firebase project |
| 9 | TypeScript errors in older pages (MUI 7 Grid API) | Build works; fix to restore type checking |
| 10 | `firebase-functions` package outdated (deploy warning) | Update |
| 11 | Website bundle is one ~1 MB file | Code-split for faster phone loads |
| 12 | Leftover files: empty `c`, old root `src/` duplicate | Delete |
| 13 | App icon is a placeholder | Replace `frontend/assets/*.png` with the real logo and regenerate |

---

## 23. Roadmap / ideas

**Connect IoT + MP (highest value)**
- Link each worker phone to its Facebook account(s); show account/store on every notification.
- Detect Marketplace inquiries and attach them to the cart posted on that account ("3 people asked about this cart").
- Lead inbox per salesperson with response-time timers and escalation.
- Report: posted → messages → sold, per account / store / person.

**MP Assistant**
- Repost reminders (listings older than 7 days), price-change and sold alerts for posted carts.
- Daily posting goals and leaderboard; Facebook account health (bans, limits, last posted).
- Use `get-featured-carts` to prioritize promoted carts; sync stores from `tigon-stores`.
- Photo tools (reorder, cover image, ZIP download); optional AI listing writer.

**IoT**
- Persist settings; web push for the website; device health (last seen, battery, app version, offline alerts).
- Search/filter/date views, notes and assignment on notifications, team/manager view, analytics charts.

**Platform**
- All live code into GitHub; PR checks; staging project; sync-failure alerts; audit log of admin actions;
  dependency updates; bundle splitting; signed Android release + Play Store; TestFlight.

---

## 24. Build history

| Date | Change |
|---|---|
| Before Sept 2026 | TIGON IOT dashboard (notifications, devices, settings, download) + Android worker app + IoT functions |
| Sept 2026 | Standalone Tigon MP Assistant (`tigon-marketplace`): website, MP Grabber extension (DMS scraping), Poster extension, photo worker |
| Sept 28, 2026 | MP Assistant integrated into TIGON IOT as a parallel module (PR #1) |
| Sept 28, 2026 | DMS scraping replaced by the production DMS API sync; dealership data T0–T14 added |
| Sept 28, 2026 | GitHub Actions auto-deploy (PR #2); Functions runtime → Node.js 22 (PR #3); CI limited to MP functions + system overview doc (PR #4) — MP Assistant live |
| Sept 28, 2026 | TIGON IOT phone app for iPhone + Android (Capacitor), push alerts, phone photo saving, build pipeline |
| Sept 28, 2026 | Posting & phones release: Prepare listing, posting queue + Auto Post, QR phone pairing, heartbeat/online status, manager role, team phones, analytics, alerts, audit log, AI listing writer, app quick actions |
| Sept 28, 2026 | Growth release: snap-to-list, voice, photo studio, templates, imports; Share Kit, graphics, video, flyers, storefronts, tracked links, A/B; leads, customers, reviews, calendar, insights, digest; goals, badges, assets, approval, status, backups, exports; navigation, search, dark mode, 4 languages, onboarding, help, offline |

---

## 25. Posting, phones and analytics

### 25.1 Prepare listing (one tap per phone)
Route `/mp/prepare/:cartId` (from the cart page) or `/mp/post/:queueId` (from a queue push).
1. **Save N photos to this phone**: opens the share sheet → Save Images. In a browser, the photos download.
2. **Copy listing & open Marketplace**: copies the chosen variation's description and opens
   `facebook.com/marketplace/create/vehicle`. The Facebook app opens it if it's installed.
3. **I published it**: pick the account(s). This marks the cart posted, fills in Posted On, and completes the queue item.
- **Couldn't post it**: enter a reason. The queue item is marked failed and managers get an alert.
- Tap-to-copy chips for Title, Price, Year, Make, Model; tap the description to copy it; switch variations 1–5.
- **Facebook Marketplace has no posting API.** The person always taps **Publish**, which keeps the accounts safe.

### 25.2 Auto Post + posting queue
- **Auto Post** is on every cart page. Choose:
  - who posts it (managers can pick anyone);
  - which phone, or any of that person's phones;
  - the Facebook account (the person's own accounts are listed first; accounts it's already posted on are disabled);
  - the listing variation;
  - **Send now** or **Schedule** (date and time).
- The phone gets a push: "Ready to post · <cart> on <account> — tap to prepare". Tapping it opens the Prepare screen.
- Delivery:
  - `mpSendQueueItem` sends a due item immediately.
  - `mpDispatchQueue` runs every 5 minutes. It sends scheduled items and re-sends unopened ones after 30 minutes, up to 3 pushes.
  - An item still unopened an hour after the third push is marked **failed**.
- **Queue tab** (`/mp/queue`):
  - Mine / Team (Team is for managers).
  - Filter: Waiting / Posted / Failed / All.
  - Actions: **Post now**, retry, cancel, delete.
  - Managers also see the alerts panel here.

### 25.3 Phones: pairing, heartbeat, management
- **Pair a phone** (Devices page) creates a QR code plus an 8-character code (`ABCD-EFGH`). It's valid for 10 minutes and can be used once.
  Managers can pair a phone for any teammate.
- On the phone app's sign-in screen, tap **Scan pairing QR code** or type the code. The phone signs in as that person
  automatically (custom token) and registers itself. Email/password sign-in still works.
- Every signed-in phone registers `devices/app_<installId>_<uid>` with platform, model, OS and app version.
- **Heartbeat** every 5 minutes while the app is open: updates `lastSeen` and adds active minutes for the day.
  A phone is **Online** if it was seen in the last 10 minutes; otherwise it shows "Seen X ago".
- **Team phones** (managers):
  - Owner filter and an online count.
  - Rename, **reassign** to another person, restore, and delete (admins only).
  - **Revoke**: the phone is signed out on its next heartbeat.
  - Every action is written to the audit log.
- **Quick actions ("hotkeys")**: long-press the app icon for Next cart to post · My posting queue · Notifications.

### 25.4 Analytics (`/mp/analytics`)
- **Range:** Today / 7 / 30 / 90 days. Managers can pick a user.
- **Tiles:** listings prepared, posts marked, failed posts, success rate (posted ÷ (posted + failed)), active hours,
  phones online.
- **Charts:** daily prepared / posted / failed, and active hours per day.
- **Leaderboard** (managers): for each user, phones, prepared, posted, failed, success %, active hours and last seen.
  Click a user to drill down to each phone: model, app version, online status, counts and last error.
- **Recent failures** list.
- **Events tracked:** app_open, listing_prepared, photos_saved, text_copied, marketplace_opened, post_marked,
  post_failed, queue_opened, ai_listing, error.

### 25.5 Alerts and audit log
- `mpMonitor` runs every 15 minutes and raises an alert for:
  - a phone not opened in **24 hours** (once per offline stretch);
  - a **failed post**;
  - a **failed DMS sync**.
- Each alert is saved in `mp_alerts` **and** sent as an IoT notification to every manager and admin, so it shows on
  the Dashboard and pushes to their alert phones.
- The alerts panel is on the Queue tab (managers), with Acknowledge.
- **Audit log** (Accounts page, admins) records:
  - role changes;
  - account add / edit / move / delete;
  - phone rename / reassign / revoke / delete / pairing;
  - queue create / cancel / retry / delete;
  - cleanup, legacy import and DMS sync.

### 25.6 AI listing writer
- Cart page → **AI listing writer**. Pick a tone (Friendly / Professional / Short) to get a title, a description
  and a price note, each with copy buttons.
- It uses only the cart's facts, plus the first photo for appearance, and never invents features.
- Model: Claude (`claude-opus-5`, low effort). Estimated **$0.02–0.04 per listing** with a photo.
- Setup:
  1. Create an Anthropic API key.
  2. Store it in Google Cloud **Secret Manager** as the secret `ANTHROPIC_API_KEY`.
  3. Give the `github-deploy` account **Secret Manager Admin**.
  4. Set the repository variable `ENABLE_AI_WRITER` to `true`, then merge or deploy.

### 25.7 One-time setup for this release
1. **Pairing sign-in:** Google Cloud → IAM → the functions runtime account
   (`<project-number>-compute@developer.gserviceaccount.com`) → add the role **Service Account Token Creator**.
   Without it, pairing still registers the phone, but the person signs in with email and password.
2. **Roles:** Accounts → Team → set Managers.
3. **Push:** complete the Firebase app registration in `frontend/MOBILE_APPS.md` so queue pushes reach phones.
4. **AI (optional):** see 25.6.

### 25.8 Not included (needs outside accounts)
- Facebook Login per user, Page posting, and Catalog / Instagram Shop sync: need a Meta developer app, business
  verification and app review.
- Signed Play Store / TestFlight builds: need an Apple Developer account ($99/yr) and a Google Play account ($25).
- eBay / Etsy / Shopify posting.
- Stripe billing.

---

## 26. Growth release: create, share, sell, team, ease of use

All paths are grouped in the MP navigation (`frontend/src/mp/navRegistry.ts`): **Sell · Post & share · Customers ·
Team · Admin · Help**. On phones there is a bottom bar (Home, New listing, Queue, Leads, More).

### 26.1 Create listings (`frontend/src/mp/create/`, `functions/src/mpCreate.ts`)
| Feature | Details |
|---|---|
| **New listing / Snap-to-list** (`/mp/new`) | 3 steps (Photos → Details → Review). Take/upload photos (compressed to ≤2000px, stored in Storage `mp_media/{uid}/`). Optional **AI fill** (`mpAiSnap`) from photos and/or dictated text fills make, model, year, color, features, title, description; a rough price estimate is shown only when comparable inventory exists and is never auto-applied. Saved as an `mp_carts` doc with `source: 'manual'` (DMS-shaped payload, so every screen works). Edit later via `/mp/new?edit=<id>`. |
| **Voice input** | Mic button dictates descriptions (native speech plugin in the app, Web Speech API in browsers). |
| **Photo studio** | Cart page → Photo studio: crop 1:1 / 4:5 / 16:9, brightness/contrast/saturation, Auto fix, logo or text stamp; save to phone or replace a photo in your own listing. |
| **Templates** (`/mp/templates`) | Listing and reply templates with placeholders `{year} {make} {model} {color} {price} {location} {phone} {name} {storeName} {link} {title} {reviewLink}`; starter reply templates. |
| **Import** (`/mp/import`, managers) | CSV upload with column mapping and preview; connectors for **WooCommerce**, **Shopify**, **JSON feed**, **CSV URL** (credentials write-only in `mp_integration_secrets`), run now (`mpRunImport`) or every 6 hours (`mpImportScheduled`). Imported items: `mp_carts/imp_<connector>_<id>`, `source: 'import:<id>'`. The DMS sync never removes manual or imported listings. |

### 26.2 Share everywhere (`frontend/src/mp/share/`, `frontend/src/storefront/`, `functions/src/mpShare.ts`)
| Feature | Details |
|---|---|
| **Share Kit** (`/mp/share/:cartId`) | Pick photos + listing text, then one tap per platform: Facebook, Instagram, WhatsApp, TikTok, X, SMS, Email, More (native share sheet with photos in the app). Each share gets its own tracked link. |
| **Graphics** | Branded 1080×1080 post and 1080×1920 story images (3 styles) with photo, price, store, QR code. |
| **Promo video** | Vertical slideshow video (Ken Burns, crossfades, price/phone overlays) recorded on the device (MP4 where supported, else WebM). |
| **Flyers & QR** (`/mp/flyer/:cartId`) | Letter-size flyer or 6-per-page QR labels, print or save as PDF. |
| **Mini-storefront** (`/mp/storefront`, public `/s/:slug`) | Each person's own public page of in-stock carts (choose locations, new/used, pinned carts); built-in `/s/tigon` shows everything. Public data only (no serial/VIN), served by `mpStorefrontApi` with caching. |
| **Short links + UTM** (`/l/:code`) | Every share link carries `utm_source` (platform), `utm_campaign`, `utm_content` (person_phone). `mpLink` counts real clicks (bots excluded; social previews get a proper title/photo) and records who/which phone/platform. |
| **Links & A/B** (`/mp/links`) | Your links and clicks, A/B tests of two titles/photos with a leader indicator, clicks by platform/phone/person. |

### 26.3 Sales & marketing (`frontend/src/mp/crm/`, `functions/src/mpCrm.ts`)
| Feature | Details |
|---|---|
| **Leads** (`/mp/leads`) | New → Talking → Sold / Lost (kanban on desktop, tabs on phones); call/text/WhatsApp/email with reply templates; follow-up dates with due/overdue badges; **Make lead** button on every IoT dashboard notification. |
| **Mark as sold** | From a lead or the cart page: records price/date, hides the cart from inventory (`soldLocally`), cancels its queue items, optionally saves the buyer as a customer, then offers a review request. |
| **Customers** (`/mp/customers`) | Contacts with **per-channel opt-in consent** (SMS, WhatsApp, email) and where consent was given; CSV export; Broadcast = one-tap send per opted-in customer only, with "Reply STOP to opt out". |
| **Review requests** | Sends the store's Google review link through a channel the customer opted into (or in person); no incentives. |
| **Calendar** (`/mp/calendar`) | Week/month view of scheduled posts; drag to reschedule; relist-due items overlaid. |
| **Insights** (`/mp/insights`) | Best time to post (heatmap from your clicks, leads, posts), price insights (comparables + sales history), relist list, week-over-week digest. |
| **Reminders & digest** | `mpCrmReminders` (every 30 min): follow-up and relist reminders as IoT notifications. `mpWeeklyDigest` (Monday 08:00): team digest to managers, personal digest to active members. |

### 26.4 Team & admin (`frontend/src/mp/team/`, `functions/src/mpTeam.ts`)
| Feature | Details |
|---|---|
| **Goals & badges** (`/mp/team`) | Weekly/monthly goals per person (posts, leads, sales) with progress; leaderboard with medals; badges (first post, 10/50/100 posts, streaks, first sale, sharer, early bird, every store, photo pro) and posting streaks. |
| **Brand assets** (`/mp/assets`) | Shared library of logos/photos (managers upload; everyone downloads/shares); "Use as team logo". |
| **Approval** (`/mp/settings`) | Admins can require manager approval: members' Auto Post items wait as "Waiting for approval" until a manager approves/rejects in the Queue; managers get a digest (`mpApprovalDigest`). |
| **Status** (`/mp/status`) | Health of DMS sync, queue, phones (offline, no push, push token errors), alerts, connectors, backups. |
| **Backups** | Daily Firestore export (`mpBackup`, 03:00) to `gs://<project>-backups/backups/<date>`; "Back up now" (`mpBackupNow`). |
| **Exports** (`/mp/exports`, `/mp/report`) | CSV exports (inventory, posts, queue, leads, customers, events, clicks) and a printable monthly report (save as PDF). |

### 26.5 Ease of use (`frontend/src/ui/`, `frontend/src/i18n/`, `frontend/src/mp/help/`)
- **Setup wizard** (`/mp/welcome`): profile & language → pair a phone → alerts → first listing, with a "Finish setup (n/4)" banner.
- **Global search**: Ctrl/Cmd+K or the search icon — pages, help, carts, phones, queue, leads, customers.
- **Dark mode, large text**, and **English / Spanish / French / Haitian Creole** (avatar menu). Non-English text
  should be reviewed by a native speaker; other pages adopt translations over time via `useT()`.
- **Help center** (`/mp/help`) with articles and **Contact support** (phone/email in `SUPPORT`,
  `frontend/src/mp/help/articles.ts` — change them there).
- **Offline**: data is cached on the device and changes sync when back online; the website caches the app and
  cart photos (service worker). An "offline" banner shows when there's no connection.
- **Quick actions** (long-press the app icon): Next cart, New listing, My queue, Leads, Notifications.

### 26.6 New collections and rules
`mp_templates`, `mp_integrations` (+ `mp_integration_secrets`, never readable), `mp_links`, `mp_clicks` (function-written),
`mp_storefronts`, `mp_leads` (owner or manager), `mp_customers`, `mp_goals` (managers write), `mp_assets`,
`mp_settings/general` (admins write). Manual listings: members create/edit their own; members can mark any cart
sold. Storage: `mp_media/{uid}/` (own uploads), `mp_assets/`. **75 emulator permission tests** cover the rules.

### 26.7 One-time setup for this release
1. **Backups:** create bucket `gs://tigon-iot-backups` (same region as Firestore); give the functions runtime account
   (`<project-number>-compute@developer.gserviceaccount.com`) **Cloud Datastore Import Export Admin** and
   **Storage Object Admin** on that bucket.
2. **Photo editing of Storage photos (optional):** set CORS on the Storage bucket so the studio/graphics can draw
   uploaded photos: `gsutil cors set cors.json gs://tigon-iot.firebasestorage.app` allowing GET from
   `https://tigon-iot.web.app`, `https://localhost`, `capacitor://localhost`.
3. **Connectors:** WooCommerce → Settings → Advanced → REST API → key with **Read**; Shopify → Develop apps →
   `read_products` → Admin API token; Google Sheets → Publish to web → CSV.
4. **AI** (writer + snap-to-list): `ANTHROPIC_API_KEY` secret + `ENABLE_AI_WRITER=true` (see 25.6).
5. **Approval / logo / relist days:** MP → Admin → Settings.

### 26.8 Not included
Paid plans / trials / upgrade prompts and referral or affiliate programs (internal tool), home-screen widgets
(quick actions instead), two-factor login (needs Identity Platform), automatic background removal, bulk SMS/WhatsApp/
email sending (needs Twilio / WhatsApp Business), how-to videos.

## 27. Webhook Flows (website forms → flows → Master Flow)

Sidebar section **WEBHOOK FLOWS** (under MARKETPLACE; managers and admins). Every website lead form posts to
`https://tigoniot.com/hooks/{webhook_key}`; each submission runs through its webhook's flow and then the single
**Master Flow**. Code: `functions/src/wh/` (engine) and `functions/src/wh/steps/` (integrations), `frontend/src/wh/` (UI).

### 27.1 Pages
| Page | Path | What it does |
|---|---|---|
| Overview | `/wh` | Leads/spam/duplicates/failed steps, leads per day, top websites/forms/sources, "needs attention" |
| Add website | `/wh/new` | Generator: website + webhook + flow in one go, then the **Setup Packet** |
| Websites | `/wh/websites` | Per-website settings, forms (webhooks), stats, recent leads |
| Webhooks | `/wh/webhooks` | All webhooks; bulk pause/activate, assign flow, recipients, sheet, new keys, CSV |
| Flows | `/wh/flows` | Master Flow, shared template flows, private website flows; clone / save as template |
| Flow builder | `/wh/flows/:id` | Step cards: validate, dedupe, condition, email, sheets, ga4, dms_sync, webhook_out, delay, create_lead, notify, forward_to_master |
| Submissions | `/wh/submissions` | Filters, CSV export, spam marking; lead timeline per submission with replay |
| Dead letters | `/wh/dead` | Steps that failed after all retries; replay one, a group, or selected |
| Email templates | `/wh/templates` | Editor with merge tags, live preview, test send |
| Settings | `/wh/settings` | Admins: global settings, integrations (SMTP, Sheets, DMS, GA4), security & retention |

**Setup Packet** (after Add website and on every webhook): endpoint URL, copy-paste form + script (or a script for an
existing form), per-platform tips, field reference, cURL/JSON and HMAC examples, GA4 checklist, **Send test**, an AI
setup prompt, and a downloadable `.md`.

### 27.2 Ingestion (`whIngest`)
JSON, urlencoded and multipart (up to 3 images, 10 MB each, checked by content). The IP is taken from the request
headers (the client's value is ignored). Honeypot field (default `website`), optional Cloudflare Turnstile, blocked
IPs/words → stored as spam, not processed, still answered 200. Rate limits per IP and per key (default 10 and 120 per
minute) → 429. Optional HMAC per webhook (`X-Tigon-Signature: sha256=<hex hmac of body>`). Field map + common aliases;
unknown fields kept in `rawPayload.extra`. CORS: the website's URL, `allowedOrigins`, and the TIGON sites. Answers
immediately: JSON `{ok, id}`, or a redirect to the thank-you URL for plain HTML form posts.

### 27.3 Engine
- `whProcess` runs every minute and processes queued submissions (a lease stops double processing). With the GitHub
  variable `WH_REALTIME=true`, the Firestore trigger `whOnSubmission` also processes them instantly.
- Each step writes `wh_step_runs/{submission}_{flow}_{step}`. Steps that already succeeded are never re-run, so retries and
  replays are safe (emails aren't re-sent by "Retry failed steps").
- Failures retry after 1 min, 5 min, 30 min, 2 h, 12 h, then go to **Dead letters**, and the flow continues with the next
  step. Configuration errors go to dead letters immediately. Failed validation marks the lead `failed` and stops.
- Settings cascade: Global → Master Flow → Website → Webhook flow → Webhook (empty = inherit; recipients can "add to"
  inherited lists instead of replacing).
- `whReplay` (retry failed / re-run all / one step / bulk), `whTestWebhook` (sample lead through the real flow;
  emails get "[TEST]", GA4/CRM/DMS skipped), `whTestEmail` (template or SMTP test).
- `whAlerts` (hourly): no leads for N days per website (default 3), failure spike (default 20 failed steps/hour) →
  MP alert + phone notification. `whMaintenance` (daily 03:15 New York time): retention (default 365 days,
  including step runs and uploaded images), cleanup, and the **Master digest** email of yesterday's leads.

### 27.4 Integrations
- **Email:** SMTP (custom, Postmark, SendGrid, Amazon SES, Gmail app password). Merge tags `{{first_name}}`,
  `{{{raw}}}`, `{{#if image_1}}…{{else}}…{{/if}}`, `{{all_fields_table}}`, plus `domain_name`, `webhook_name`,
  `submitted_at`, `lead_url`. Reply-To defaults to the customer's email. Optional customer auto-reply.
- **Google Sheets:** rows are buffered and appended in batches every minute. The tab and header row are created
  automatically, and formula injection is escaped.
- **GA4 Measurement Protocol:** `generate_lead` with UTM data (no personal data).
- **DMS:** adapter pattern; ADF/XML (HTTP POST or email) and JSON; DMS lead id stored on the submission.
- **Webhook out:** https only, private addresses blocked, optional HMAC signature.
- **CRM lead** (MP Leads) and **phone notification** (IoT notifications).

### 27.5 Data and security
Collections: `wh_domains`, `wh_webhooks`, `wh_flows`, `wh_email_templates`, `wh_submissions`, `wh_step_runs`,
`wh_stats`, `wh_settings` (global, sheets_status, alert/digest state), `wh_integrations`, `wh_integration_secrets`
(write-only from the app, read only by functions), `wh_sheet_buffer`, `wh_rate` (server only). Storage:
`wh_uploads/` (staff read, server write).
- Managers: websites, webhooks, flows, templates.
- Admins: Master Flow, global settings, integrations.
- Webhook keys are 32 random characters. Everything is audited in `mp_audit`.
- **35 emulator permission tests** cover these rules, and the engine and integrations have 119 emulator tests.
- All queries use single-field indexes only (CI doesn't deploy composite indexes).

### 27.6 One-time setup
1. **Open Webhook Flows → Overview → Finish setup** (admin): creates the Master Flow, the "Standard lead flow",
   default email templates and global settings.
2. **Email:** Settings → Integrations → add an SMTP server (Postmark/SendGrid/SES/Gmail app password), then **Send
   test**. Set the global recipients in Settings → General.
3. **Google Sheets:** enable the **Google Sheets API** in the `tigon-iot` Google Cloud project, and share each sheet
   (Editor) with `470095494000-compute@developer.gserviceaccount.com`.
4. **GA4:** per website, the Measurement ID and a Measurement Protocol API secret (GA Admin → Data streams).
5. **DMS:** Settings → Integrations → DMS (ADF by email is the most widely accepted).
6. **Instant processing (optional):** GitHub → Settings → Variables → `WH_REALTIME` = `true`, then run the deploy.
   If that deploy fails with an Eventarc/IAM error, remove the variable (leads still process every minute).
7. **Add website** → paste the snippet on the site → **Send test**.
