// Tigon Poster (IoT) — background: downloads listing photos for the Facebook tab (content scripts can't read
// other sites' images because of CORS; the extension can, for the hosts listed in manifest.json).
/* global chrome */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "TIGON_FETCH_PHOTOS") return false;
  (async () => {
    const out = [];
    for (const url of (msg.urls || []).slice(0, 20)) {
      try {
        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) { out.push({ url, error: `HTTP ${res.status}` }); continue; }
        const blob = await res.blob();
        if (!/^image\//.test(blob.type) && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) { out.push({ url, error: "not an image" }); continue; }
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        out.push({ url, type: blob.type || "image/jpeg", data: btoa(bin) });
      } catch (e) {
        out.push({ url, error: String(e && e.message || e) });
      }
    }
    sendResponse({ photos: out });
  })();
  return true; // async response
});
