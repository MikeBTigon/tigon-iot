// Tigon MP Assistant — shared auth + Firestore REST helper for the Chrome extensions.
// Source of truth: mp-assistant/shared/tigon-auth.js. Copy identically into poster/
// (MV3 extensions cannot load files from outside their own folder).
// Works in a service worker (importScripts) and in extension pages (<script> tag).
/* global chrome */
var TigonAuth = (function () {
  "use strict";

  var API_KEY = "AIzaSyBuRfa47FdTj7kd4O6uNE-PmWiFEZfkRo4";
  var PROJECT_ID = "tigon-iot";
  var FUNCTIONS_BASE = "https://us-central1-tigon-iot.cloudfunctions.net";
  var STORAGE_KEY = "tigonAuth";
  var ALLOWED_DOMAIN = "@tigongolfcarts.com";
  var REFRESH_MARGIN_MS = 5 * 60 * 1000;
  var FIRESTORE_BASE =
    "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";

  var refreshing = null;

  // ---- storage -----------------------------------------------------------
  function storageGet() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(STORAGE_KEY, function (res) {
        resolve((res && res[STORAGE_KEY]) || null);
      });
    });
  }
  function storageSet(session) {
    return new Promise(function (resolve) {
      var o = {};
      o[STORAGE_KEY] = session;
      chrome.storage.local.set(o, function () { resolve(); });
    });
  }
  function storageRemove() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(STORAGE_KEY, function () { resolve(); });
    });
  }

  // ---- errors ------------------------------------------------------------
  var FRIENDLY = {
    EMAIL_NOT_FOUND: "No account with that email.",
    INVALID_PASSWORD: "Wrong password.",
    INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
    USER_DISABLED: "This account is disabled.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Try again later.",
    TOKEN_EXPIRED: "Session expired. Sign in again.",
    INVALID_REFRESH_TOKEN: "Session expired. Sign in again.",
    USER_NOT_FOUND: "Account no longer exists. Sign in again.",
  };
  function authError(json, fallback) {
    var code = (json && json.error && (json.error.message || json.error)) || "";
    code = String(code).split(" : ")[0].trim();
    return new Error(FRIENDLY[code] || code || fallback);
  }

  // ---- auth --------------------------------------------------------------
  async function signIn(email, password) {
    email = String(email || "").trim().toLowerCase();
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      throw new Error("Use your " + ALLOWED_DOMAIN + " TIGON IOT account.");
    }
    if (!password) throw new Error("Enter your password.");
    var res = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
      }
    );
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok) throw authError(json, "Sign-in failed (" + res.status + ")");
    var session = {
      idToken: json.idToken,
      refreshToken: json.refreshToken,
      email: json.email || email,
      uid: json.localId,
      expiresAt: Date.now() + Number(json.expiresIn || 3600) * 1000,
    };
    await storageSet(session);
    return session;
  }

  async function refresh(session) {
    var res = await fetch("https://securetoken.googleapis.com/v1/token?key=" + API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        "grant_type=refresh_token&refresh_token=" + encodeURIComponent(session.refreshToken),
    });
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) await storageRemove();
      throw authError(json, "Token refresh failed (" + res.status + ")");
    }
    var next = {
      idToken: json.id_token,
      refreshToken: json.refresh_token || session.refreshToken,
      email: session.email,
      uid: json.user_id || session.uid,
      expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
    };
    await storageSet(next);
    return next;
  }

  /** Returns a valid ID token, refreshing it when within 5 minutes of expiry. */
  async function getIdToken() {
    var session = await storageGet();
    if (!session || !session.refreshToken) throw new Error("Not signed in.");
    if (session.idToken && session.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
      return session.idToken;
    }
    if (!refreshing) {
      refreshing = refresh(session).finally(function () { refreshing = null; });
    }
    var next = await refreshing;
    return next.idToken;
  }

  async function getSession() {
    var s = await storageGet();
    if (!s || !s.refreshToken) return null;
    return { email: s.email, uid: s.uid, expiresAt: s.expiresAt };
  }

  function signOut() {
    return storageRemove();
  }

  // ---- Firestore REST ----------------------------------------------------
  /** Decodes one Firestore REST typed value into plain JS. */
  function decodeValue(v) {
    if (!v || typeof v !== "object") return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("booleanValue" in v) return !!v.booleanValue;
    if ("nullValue" in v) return null;
    if ("timestampValue" in v) return v.timestampValue;
    if ("referenceValue" in v) return v.referenceValue;
    if ("bytesValue" in v) return v.bytesValue;
    if ("geoPointValue" in v) return v.geoPointValue;
    if ("mapValue" in v) return decodeFields((v.mapValue && v.mapValue.fields) || {});
    if ("arrayValue" in v) {
      return ((v.arrayValue && v.arrayValue.values) || []).map(decodeValue);
    }
    return null;
  }

  function decodeFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (k) { out[k] = decodeValue(fields[k]); });
    return out;
  }

  function decodeDocument(doc) {
    var name = String(doc.name || "");
    return { id: name.split("/").pop(), fields: decodeFields(doc.fields || {}) };
  }

  /** Lists every document in a collection. Returns [{id, fields}]. */
  async function firestoreList(collection, pageSize) {
    pageSize = pageSize || 300;
    var token = await getIdToken();
    var out = [];
    var pageToken = "";
    for (var guard = 0; guard < 1000; guard++) {
      var url =
        FIRESTORE_BASE + "/" + encodeURIComponent(collection) + "?pageSize=" + pageSize +
        (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
      var res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        var msg = (json && json.error && json.error.message) || "Firestore error " + res.status;
        if (res.status === 403) msg = "No access to " + collection + " (" + msg + ")";
        var err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      (json.documents || []).forEach(function (d) { out.push(decodeDocument(d)); });
      pageToken = json.nextPageToken || "";
      if (!pageToken) break;
    }
    return out;
  }

  return {
    API_KEY: API_KEY,
    PROJECT_ID: PROJECT_ID,
    FUNCTIONS_BASE: FUNCTIONS_BASE,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getIdToken: getIdToken,
    firestoreList: firestoreList,
    decodeValue: decodeValue,
    decodeFields: decodeFields,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = TigonAuth;
