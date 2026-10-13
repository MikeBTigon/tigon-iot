# Tigon Poster (IoT)

Assistive Facebook Marketplace autofill. Pulls carts from the TIGON IOT MP Assistant (`mp_carts`).
**It never clicks Post / Publish / Next — you review and post yourself.**

## Install
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick the unzipped `tigon-poster` folder (the one with `manifest.json` directly inside).
2. To update: the popup says **Update available** when tigoniot.com has a newer version
   (`/downloads/poster-version.json`). Download the new zip, unzip it over the old folder, click the reload arrow
   on `chrome://extensions`, then refresh any open Facebook tab.

## Releasing a new version
Bump `version` in `manifest.json` with every change — the deploy publishes the zip and writes that version to
`poster-version.json`, which is what tells people to update. The published zip drops the `http://localhost`
match (local testing only). `https://*.amazonaws.com/*` stays: cart photo URLs can come from the DMS as full
S3 links, not only `s3.amazonaws.com/prod.docs.s3`.

## Use
1. Open the popup and sign in with your TIGON IOT account (`@tigongolfcarts.com`).
2. Search / pick a cart, choose one of the 5 listing variations, click **SEND TO FACEBOOK FORM**.
3. Open the Facebook vehicle form (button in the popup, or facebook.com/marketplace/create/vehicle).
   The **TIGON MP Autofill** panel appears bottom-right → click **Fill Facebook form**.
4. Price, Description (and Title if present) fill reliably. Vehicle type/Year/Make/Model dropdowns are
   attempted; the panel says which ones to check or pick by hand. Add photos, review, click Post.

**Copy form structure** copies a JSON dump of the form fields for debugging when Facebook changes its layout.

`cart-logic.js` is generated from `frontend/src/mp/cartLogic.ts` — don't edit it here.
`tigon-auth.js` is a copy of `../shared/tigon-auth.js`.
