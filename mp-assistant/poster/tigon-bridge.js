// Tigon Poster (IoT) — bridge on the TIGON IOT website.
// "Copy to Marketplace" on the Prepare-listing page posts the listing here; it is stored for the Facebook tab,
// which fills the vehicle form and uploads the photos automatically (it still never clicks Post).
/* global chrome */
(function () {
  "use strict";
  const PENDING_KEY = "tigonPosterPending";
  const version = chrome.runtime.getManifest().version;

  // Let the page know the extension is installed.
  document.documentElement.setAttribute("data-tigon-poster", version);
  window.postMessage({ source: "tigon-poster", type: "TIGON_POSTER_READY", version }, window.location.origin);

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || ev.origin !== window.location.origin) return;
    const d = ev.data;
    if (!d || d.source !== "tigon-iot") return;
    if (d.type === "TIGON_POSTER_PING") {
      window.postMessage({ source: "tigon-poster", type: "TIGON_POSTER_READY", version }, window.location.origin);
      return;
    }
    if (d.type !== "TIGON_SEND_LISTING" || !d.payload || !d.payload.cart) return;
    const pending = { cart: d.payload.cart, listing: d.payload.listing || {}, ts: Date.now(), autoFill: true, from: "website" };
    chrome.storage.local.set({ [PENDING_KEY]: pending }, () => {
      window.postMessage({ source: "tigon-poster", type: "TIGON_LISTING_RECEIVED", id: d.id }, window.location.origin);
    });
  });
})();
