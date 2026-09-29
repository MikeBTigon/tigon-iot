// TIGON IOT phone app — "Quick FB List" fill script, injected into the Facebook Marketplace vehicle form opened
// inside the app (FbListingActivity). Same field logic as the Tigon Poster Chrome extension (fb-autofill.js).
// Reads the listing from window.TigonFill (native bridge). NEVER clicks Post / Publish / Next.
(function () {
  "use strict";
  if (window.__tigonFill) return;
  const FORBIDDEN = /^(post|publish|next|submit|list|list item|share|save draft|continue)$/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const host = null;
  let statusEl = null;

  function status(name, text, kind) {
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483646;background:#fff;" +
        "border:2px solid #af1f31;border-radius:10px;padding:8px 10px;font:14px/1.35 Arial,sans-serif;color:#1c2430;" +
        "max-height:40vh;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.25)";
      const close = document.createElement("div");
      close.textContent = "TIGON Quick FB List  ✕";
      close.style.cssText = "font-weight:800;color:#af1f31;margin-bottom:4px;cursor:pointer";
      close.onclick = () => { statusEl.style.display = "none"; };
      statusEl.appendChild(close);
      document.body.appendChild(statusEl);
    }
    statusEl.style.display = "";
    const color = kind === "ok" ? "#1f7a3f" : kind === "err" ? "#af1f31" : "#8a5a00";
    const row = document.createElement("div");
    row.innerHTML = "<b>" + name + ":</b> <span style='color:" + color + "'></span>";
    row.querySelector("span").textContent = text;
    statusEl.appendChild(row);
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (host && host.contains(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  }

  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const firstLine = (s) => norm(String(s || "").split("\n").find((l) => l.trim()) || "");

  function controls() {
    const sel = [
      "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button])",
      "textarea",
      "[role=combobox]",
      "[contenteditable=true]",
    ].join(",");
    const all = Array.from(document.querySelectorAll(sel)).filter(visible);
    // Drop inputs nested inside a combobox element (treat the combobox as the control).
    return all.filter((el) => {
      const outer = el.parentElement && el.parentElement.closest("[role=combobox]");
      return !(outer && all.includes(outer));
    });
  }

  function labelOf(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return norm(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? n.innerText : ""; }).join(" ");
      if (norm(t)) return firstLine(t);
    }
    const lab = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (lab) {
      const t = firstLine(lab.innerText);
      if (t) return t;
    }
    return norm(el.getAttribute("placeholder") || "");
  }

  /** Visible leaf-ish text nodes whose whole text matches `re`. */
  function labelTextElements(re) {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = walker.nextNode())) {
      if (!/^(SPAN|DIV|LABEL|H2|H3|P)$/.test(n.tagName)) continue;
      if (n.children.length > 2) continue;
      const t = norm(n.innerText);
      if (!t || t.length > 40 || !re.test(t)) continue;
      if (visible(n)) out.push(n);
    }
    return out;
  }

  /** Finds the control for a label: direct label match first, then DOM proximity. */
  function findControl(re, kinds) {
    const list = controls().filter((el) => !kinds || kinds(el));
    const direct = list.find((el) => re.test(labelOf(el)));
    if (direct) return direct;
    let best = null;
    let bestD = Infinity;
    for (const lab of labelTextElements(re)) {
      const lr = lab.getBoundingClientRect();
      for (const el of list) {
        const r = el.getBoundingClientRect();
        // Label inside/above/left of control
        const contains = el.contains(lab) || (el.closest("label") && el.closest("label").contains(lab));
        const dy = r.top + r.height / 2 - (lr.top + lr.height / 2);
        const dx = r.left - lr.left;
        if (!contains && (dy < -12 || dy > 120 || Math.abs(dx) > 400)) continue;
        const d = contains ? 0 : Math.hypot(dx * 0.5, dy);
        if (d < bestD) { bestD = d; best = el; }
      }
    }
    return best;
  }

  function isForbidden(el) {
    const t = norm(el.getAttribute("aria-label") || el.innerText || el.value || "");
    return FORBIDDEN.test(t) || (el.tagName === "BUTTON" && el.type === "submit") || (el.tagName === "INPUT" && /submit/i.test(el.type));
  }

  function safeClick(el) {
    if (!el) return false;
    const btn = el.closest("[role=button],button");
    if (isForbidden(el) || (btn && btn !== el && isForbidden(btn) && !btn.matches("[role=combobox]"))) {
      console.warn("[Tigon Autofill] refused to click", el);
      return false;
    }
    el.scrollIntoView({ block: "center" });
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
    return true;
  }

  /** React-controlled input: native setter + clear _valueTracker + input/change events. */
  function setNativeValue(el, value) {
    if (el.isContentEditable) {
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, value);
      return;
    }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue("");
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitFor(fn, timeout = 2500, step = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  function visibleOptions() {
    return Array.from(document.querySelectorAll("[role=option],[role=menuitemradio],[role=menuitem],[role=listbox] [role=button]")).filter(visible);
  }

  function pickOption(opts, want) {
    const w = norm(want).toLowerCase();
    if (!w) return null;
    const text = (o) => firstLine(o.innerText).toLowerCase();
    return opts.find((o) => text(o) === w) ||
      opts.find((o) => text(o).startsWith(w)) ||
      opts.find((o) => w.startsWith(text(o)) && text(o).length >= 3) ||
      opts.find((o) => text(o).includes(w)) || null;
  }

  function closeMenus() {
    const t = document.activeElement || document.body;
    t.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }

  // ---------------------------------------------------------------------------
  // Field fillers
  // ---------------------------------------------------------------------------
  async function fillText(name, re, value, opts = {}) {
    if (value === "" || value == null) return status(name, "no value", "warn");
    const isField = (e) => e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable;
    let el = findControl(re, (e) => isField(e) || !!e.querySelector("input,textarea"));
    if (el && !isField(el)) el = el.querySelector("input,textarea");
    if (!el) return status(name, opts.optional ? "not on form (ok)" : "field not found", opts.optional ? "warn" : "err");
    if (opts.onlyIfEmpty && norm(el.value || el.innerText)) return status(name, "already set (left as is)", "ok");
    setNativeValue(el, String(value));
    await sleep(150);
    if (opts.pickSuggestion) {
      const opt = await waitFor(() => pickOption(visibleOptions(), value), 2000);
      if (opt && safeClick(opt)) return status(name, "filled + suggestion picked", "ok");
      return status(name, "typed — pick the suggestion", "warn");
    }
    return status(name, "filled", "ok");
  }

  /** Dropdown: click combobox, then click the matching option. Falls back to typing when it's an input. */
  async function fillDropdown(name, re, value, opts = {}) {
    const wants = [].concat(value).filter(Boolean);
    if (!wants.length) return status(name, "no value", "warn");
    const el = findControl(re);
    if (!el) return status(name, opts.optional ? "not on form (ok)" : "field not found", opts.optional ? "warn" : "err");

    // Plain text input (e.g. Make/Model for some vehicle types)
    if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.getAttribute("role") !== "combobox") {
      setNativeValue(el, wants[0]);
      await sleep(250);
      const opt = pickOption(visibleOptions(), wants[0]);
      if (opt) safeClick(opt);
      return status(name, "filled", "ok");
    }

    const current = firstLine((el.innerText || "").replace(labelOf(el), ""));
    if (current && wants.some((w) => current.toLowerCase() === String(w).toLowerCase())) {
      return status(name, `already "${current}"`, "ok");
    }

    safeClick(el);
    let opt = null;
    const typeInput = el.tagName === "INPUT" ? el : el.querySelector("input");
    for (const w of wants) {
      if (typeInput) { setNativeValue(typeInput, String(w)); await sleep(200); }
      opt = await waitFor(() => pickOption(visibleOptions(), w), 2500);
      if (opt) break;
    }
    if (opt && safeClick(opt)) {
      await sleep(300);
      return status(name, `selected "${firstLine(opt.innerText)}"`, "ok");
    }
    closeMenus();
    return status(name, `couldn't select "${wants[0]}" — choose it manually`, "warn");
  }


  // Photos come from the app (it downloads them); handed to Facebook's photo input like a drag & drop.
  function photoInput() {
    const inputs = Array.from(document.querySelectorAll("input[type=file]"));
    return inputs.find((i) => /image/i.test(i.getAttribute("accept") || "") && !/^video/i.test(i.getAttribute("accept") || "")) ||
      inputs.find((i) => !/video/i.test(i.getAttribute("accept") || "")) || null;
  }

  async function uploadPhotos() {
    const n = window.TigonFill.photoCount();
    if (!n) return status("Photos", "no photos for this cart", "warn");
    const input = await waitFor(photoInput, 8000);
    if (!input) return status("Photos", "photo box not found — add photos by hand", "err");
    const files = [];
    let failed = 0;
    for (let i = 0; i < n; i++) {
      let raw = "";
      const end = Date.now() + 45000;
      while (!(raw = window.TigonFill.photo(i)) && Date.now() < end) await sleep(300);
      let p = null;
      try { p = raw ? JSON.parse(raw) : null; } catch (_) { p = null; }
      if (!p || !p.data) { failed++; continue; }
      const bin = atob(p.data);
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      const ext = /png/.test(p.type) ? "png" : /webp/.test(p.type) ? "webp" : "jpg";
      files.push(new File([bytes], "tigon-cart-" + (i + 1) + "." + ext, { type: p.type || "image/jpeg" }));
    }
    if (!files.length) return status("Photos", "couldn't download the photos — add them by hand", "err");
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(1500);
    return status("Photos", files.length + " attached" + (failed ? " (" + failed + " couldn't download)" : ""), failed ? "warn" : "ok");
  }

  let running = false;
  let doneFor = "";
  window.__tigonFill = async function (force) {
    if (running || !window.TigonFill) return;
    if (!/^\/marketplace\/create(\/|$)/.test(location.pathname)) return; // login etc.: wait for the next page
    if (!force && doneFor === location.href) return;
    running = true;
    try {
      const ready = await waitFor(() => findControl(/^price\b/i), 25000, 300);
      if (!ready) { status("Form", "Facebook form not found yet — tap \"Fill again\" when it shows", "warn"); return; }
      doneFor = location.href;
      const data = JSON.parse(window.TigonFill.payload() || "{}");
      const cart = data.cart || {};
      const listing = data.listing || {};
      await sleep(600);
      await fillDropdown("Vehicle type", /^vehicle type\b/i, ["Other", "Powersport"], { optional: true });
      await sleep(600);
      await fillDropdown("Year", /^year\b/i, String(cart.year || ""));
      await fillDropdown("Make", /^make\b/i, String(cart.make || ""));
      await fillDropdown("Model", /^model\b/i, String(cart.model || ""));
      await fillText("Price", /^price\b/i, cart.price ? String(Math.round(cart.price)) : "");
      await fillText("Description", /^description\b/i, listing.description || "");
      if (cart.cityState) await fillText("Location", /^location\b/i, cart.cityState, { optional: true, onlyIfEmpty: true, pickSuggestion: true });
      await uploadPhotos();
      status("Next", "Check everything, then tap Next / Publish", "ok");
    } catch (e) {
      status("Error", String((e && e.message) || e), "err");
    } finally {
      running = false;
    }
  };
})();
