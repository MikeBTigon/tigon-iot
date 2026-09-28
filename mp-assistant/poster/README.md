# Tigon Poster (IoT)

Assistive Facebook Marketplace autofill. Pulls carts from the TIGON IOT MP Assistant (`mp_carts`).
**It never clicks Post / Publish / Next — you review and post yourself.**

## Install
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick this `poster/` folder.
2. To update: click the reload arrow, then refresh any open Facebook tab.

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
