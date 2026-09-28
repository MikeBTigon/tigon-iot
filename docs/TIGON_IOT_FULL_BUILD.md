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
| **admin** | Everything: mark posted, Posted On tracker, Accounts page, team roles, Sync from DMS, cleanup, legacy import |
| **sales** | View inventory, filters, copy listings, save photos (read-only posting status) |

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
| `mp_meta/sync` | ok, trigger, startedAt, finishedAt, fetched, inStock, written, unchanged, removedSold, skippedDelete, warning, error | DMS sync |

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
| Storage | locked | — | — | — |

---

## 18. Deploy and build pipelines

### Website + backend — `.github/workflows/firebase-deploy.yml`
- Trigger: push/merge to `main` (or **Run workflow** manually).
- Steps: build website (`frontend`, `npm run build`) → copy to `dist/` → build functions → authenticate with
  secret `FIREBASE_SERVICE_ACCOUNT` → `firebase deploy --only firestore:rules,hosting,functions:mpSyncInventory,functions:mpSyncNow`.
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

### Manual deploy (from a computer)
```bash
git clone https://github.com/Tigon-Golf-Carts-LLC/tigon-iot.git && cd tigon-iot
cd frontend && npm ci && npm run build && cd .. && rm -rf dist && cp -r frontend/dist dist
cd functions && npm ci && npm run build && cd ..
npm install -g firebase-tools && firebase login
firebase deploy --only firestore:rules,hosting,functions:mpSyncInventory,functions:mpSyncNow
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
