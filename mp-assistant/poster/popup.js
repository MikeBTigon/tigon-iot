// Tigon Poster (IoT) — popup: pick a cart from TIGON IOT `mp_carts`, send it to the FB autofill.
/* global chrome, TigonCartLogic, TigonAuth */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const PENDING_KEY = "tigonPosterPending";
  const FB_CREATE_URL = "https://www.facebook.com/marketplace/create/vehicle";
  const locName = (id) => TigonCartLogic.locationName(id);

  let session = null;
  let carts = [];
  let current = null;
  let variations = [];

  function show(el, on) { el.classList.toggle("hidden", !on); }
  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
    show(el, !!text);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const money = (p) => (p ? "$" + Number(p).toLocaleString("en-US") : "—");

  function view(name) {
    show($("view-signin"), name === "signin");
    show($("view-list"), name === "list");
    show($("view-detail"), name === "detail");
  }

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  $("signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("si-submit").disabled = true;
    setMsg($("si-msg"), "Signing in…");
    try {
      await TigonAuth.signIn($("si-email").value, $("si-pass").value);
      $("si-pass").value = "";
      setMsg($("si-msg"), "");
      await init();
    } catch (err) {
      setMsg($("si-msg"), err.message, "err");
    } finally {
      $("si-submit").disabled = false;
    }
  });

  $("btn-signout").addEventListener("click", async () => {
    await TigonAuth.signOut();
    carts = [];
    await init();
  });

  // ---------------------------------------------------------------------------
  // Load carts
  // ---------------------------------------------------------------------------
  function toCart(doc) {
    const f = doc.fields || {};
    let raw;
    try {
      raw = JSON.parse(f.payload || "{}");
    } catch (_) {
      return null;
    }
    if (!raw || typeof raw !== "object") return null;
    const cart = TigonCartLogic.mapDmsCartObject(raw);
    if (!cart.id) cart.id = cart.dmsId = doc.id;
    return Object.assign(cart, {
      docId: doc.id,
      savedAt: Number(f.savedAt) || 0,
      postedBy: f.postedBy || {},
      postedAccounts: f.postedAccounts || {},
    });
  }

  async function loadCarts() {
    setMsg($("list-msg"), "Loading carts from TIGON IOT…");
    $("list").innerHTML = "";
    try {
      const docs = await TigonAuth.firestoreList("mp_carts");
      carts = docs.map(toCart).filter((c) => c && c.inStock !== false);
      carts.sort((a, b) => (b.isUsed - a.isUsed) || (b.price - a.price));
      setMsg($("list-msg"), "");
      renderList();
    } catch (err) {
      const msg = err.status === 403
        ? "Your account has no MP Assistant profile yet. Open MP Assistant in the TIGON IOT dashboard once (or ask an MP admin), then Reload."
        : err.message;
      setMsg($("list-msg"), msg, "err");
    }
  }

  function matches(cart, q) {
    if (!q) return true;
    const hay = [cart.make, cart.model, cart.year, cart.serial, cart.vin, cart.locationId, locName(cart.locationId), cart.color, cart.seatColor]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((t) => hay.includes(t));
  }

  function renderList() {
    const q = $("search").value.trim().toLowerCase();
    const list = carts.filter((c) => matches(c, q));
    $("list-count").textContent = `${list.length} of ${carts.length} carts`;
    const uid = session ? session.uid : "";
    const host = $("list");
    host.innerHTML = "";
    const frag = document.createDocumentFragment();
    list.slice(0, 300).forEach((c) => {
      const el = document.createElement("div");
      el.className = "item";
      const photo = c.photos[0] ? TigonCartLogic.photoUrl(c.photos[0]) : "";
      const posted = uid && c.postedBy && c.postedBy[uid];
      el.innerHTML = `
        ${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : `<img alt="">`}
        <div class="meta">
          <div class="name">${esc(TigonCartLogic.cartTitle(c))}${c.isUsed ? "" : '<span class="badge new">NEW</span>'}${posted ? '<span class="badge">posted</span>' : ""}</div>
          <div class="sub">${esc([c.locationId, c.color, c.serial].filter(Boolean).join(" · "))}</div>
        </div>
        <div class="price">${esc(money(c.price))}</div>`;
      const img = el.querySelector("img");
      img.addEventListener("error", () => { img.removeAttribute("src"); });
      el.addEventListener("click", () => openCart(c));
      frag.appendChild(el);
    });
    host.appendChild(frag);
    if (list.length > 300) {
      const more = document.createElement("div");
      more.className = "muted";
      more.textContent = `Showing first 300 — refine your search.`;
      host.appendChild(more);
    }
  }

  $("search").addEventListener("input", renderList);
  $("btn-reload").addEventListener("click", loadCarts);

  // ---------------------------------------------------------------------------
  // Cart detail
  // ---------------------------------------------------------------------------
  function openCart(cart) {
    current = cart;
    $("d-name").textContent = TigonCartLogic.cartTitle(cart);
    const rows = [
      ["Price", money(cart.price)],
      ["Location", `${cart.locationId} — ${locName(cart.locationId)}`],
      ["Condition", cart.isUsed ? "Used" : "New"],
      ["Color", [cart.color, cart.seatColor && cart.seatColor + " seats"].filter(Boolean).join(", ")],
      ["Passengers", cart.passengers || ""],
      ["Power", cart.isElectric ? ["Electric", cart.packVoltage, cart.batteryType].filter(Boolean).join(" · ") : ["Gas", cart.engineMake].filter(Boolean).join(" · ")],
      ["Warranty", [cart.cartWarranty && "Cart: " + cart.cartWarranty, cart.batteryWarranty && "Battery: " + cart.batteryWarranty].filter(Boolean).join(" / ")],
      ["Serial", cart.serial],
      ["Photos", cart.photos.length],
      ["Posted on", Object.keys(cart.postedAccounts || {}).length ? Object.keys(cart.postedAccounts).length + " account(s)" : ""],
    ];
    $("d-fields").innerHTML = rows
      .filter(([, v]) => v !== "" && v != null)
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
      .join("");
    $("d-photos").innerHTML = cart.photos
      .slice(0, 12)
      .map((p) => `<img src="${esc(TigonCartLogic.photoUrl(p))}" alt="" loading="lazy">`)
      .join("");
    $("d-photos").querySelectorAll("img").forEach((img) =>
      img.addEventListener("error", () => { img.style.visibility = "hidden"; })
    );

    variations = TigonCartLogic.generateVariations(cart, session ? session.uid : "");
    $("d-variation").innerHTML = variations
      .map((v, i) => `<option value="${i}">Variation ${i + 1} (${esc(v.format)}) — ${esc(v.title1)}</option>`)
      .join("");
    renderVariation();
    setMsg($("send-msg"), "");
    view("detail");
  }

  function renderVariation() {
    const v = variations[Number($("d-variation").value) || 0];
    $("d-listing").innerHTML = v
      ? `<div class="title">${esc(v.title1)}</div><div class="title">${esc(v.title2)}</div><pre>${esc(v.description)}</pre>`
      : "";
  }

  $("d-variation").addEventListener("change", renderVariation);
  $("btn-back").addEventListener("click", () => view("list"));

  $("btn-send").addEventListener("click", async () => {
    if (!current) return;
    const listing = variations[Number($("d-variation").value) || 0];
    // Facebook's Make/Model fields get a description of the cart instead of the DMS's "Other".
    const cart = Object.assign({}, current, {
      make: TigonCartLogic.displayMake(current),
      model: TigonCartLogic.displayModel(current),
    });
    try {
      await chrome.storage.local.set({ [PENDING_KEY]: { cart, listing, ts: Date.now() } });
      setMsg($("send-msg"), `Ready: ${TigonCartLogic.cartName(cart)}. Open the Facebook vehicle form and click "Fill Facebook form".`, "ok");
    } catch (err) {
      setMsg($("send-msg"), err.message, "err");
    }
  });

  $("btn-open-fb").addEventListener("click", () => chrome.tabs.create({ url: FB_CREATE_URL }));

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  async function init() {
    session = await TigonAuth.getSession();
    show($("who"), !!session);
    $("who-email").textContent = session ? session.email : "";
    if (!session) return view("signin");
    view("list");
    if (!carts.length) await loadCarts();
    else renderList();
  }

  init();
})();
