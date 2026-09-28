// Tigon Poster (IoT) — Facebook Marketplace vehicle form autofill (assistive).
// Fills fields from the cart the user picked in the popup. NEVER clicks Post / Publish / Next.
/* global chrome */
(function () {
  "use strict";
  if (window.__tigonAutofillLoaded) return;
  window.__tigonAutofillLoaded = true;

  const PENDING_KEY = "tigonPosterPending";
  // Location "City, ST" comes from cart-logic.js (loaded before this script).
  const cityState = (id) => {
    const n = TigonCartLogic.locationName(id);
    return n.includes(",") ? n : "";
  };
  const FORBIDDEN = /^(post|publish|next|submit|list|list item|share|save draft|continue)$/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------------------
  // Panel (shadow DOM so Facebook's CSS can't touch it)
  // ---------------------------------------------------------------------------
  let host, root, statusEl, cartEl, fillBtn;

  function buildPanel() {
    host = document.createElement("div");
    host.id = "tigon-mp-autofill";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .p { width: 280px; background: #fff; color: #1c2430; border: 2px solid #af1f31; border-radius: 10px;
             box-shadow: 0 6px 24px rgba(0,0,0,.25); font: 12px/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
        .h { background: #af1f31; color: #fff; padding: 7px 10px; font-weight: 800; letter-spacing: .4px;
             display: flex; justify-content: space-between; align-items: center; border-radius: 7px 7px 0 0; }
        .h button { background: none; border: 0; color: #fff; cursor: pointer; font-size: 14px; }
        .b { padding: 8px 10px; }
        .cart { font-weight: 700; color: #0e4671; margin-bottom: 6px; }
        .btn { display: block; width: 100%; border: 0; border-radius: 6px; padding: 8px; margin-bottom: 6px;
               font-weight: 700; cursor: pointer; font-size: 12px; }
        .fill { background: #af1f31; color: #fff; }
        .copy { background: #fff; color: #0e4671; border: 1px solid #0e4671; }
        .btn:disabled { opacity: .5; cursor: default; }
        ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 220px; overflow: auto; }
        li { padding: 2px 0; border-bottom: 1px solid #f0f2f5; display: flex; gap: 6px; }
        li b { min-width: 78px; }
        .ok { color: #1f7a3f; } .warn { color: #8a5a00; } .err { color: #af1f31; }
        .note { color: #667085; margin-top: 6px; }
        .min .b { display: none; }
      </style>
      <div class="p" id="p">
        <div class="h"><span>TIGON MP Autofill</span><button id="min" title="Minimize">–</button></div>
        <div class="b">
          <div class="cart" id="cart">No cart selected — pick one in the Tigon Poster popup.</div>
          <button class="btn fill" id="fill">Fill Facebook form</button>
          <button class="btn copy" id="copy">Copy form structure</button>
          <ul id="status"></ul>
          <div class="note">Review every field, add photos, then click Post yourself.</div>
        </div>
      </div>`;
    statusEl = root.getElementById("status");
    cartEl = root.getElementById("cart");
    fillBtn = root.getElementById("fill");
    fillBtn.addEventListener("click", onFill);
    root.getElementById("copy").addEventListener("click", onCopyStructure);
    root.getElementById("min").addEventListener("click", () => root.getElementById("p").classList.toggle("min"));
    document.documentElement.appendChild(host);
    refreshCartLabel();
  }

  function status(field, text, kind) {
    let li = statusEl.querySelector(`li[data-f="${field}"]`);
    if (!li) {
      li = document.createElement("li");
      li.dataset.f = field;
      li.innerHTML = `<b></b><span></span>`;
      li.firstChild.textContent = field;
      statusEl.appendChild(li);
    }
    const span = li.lastChild;
    span.textContent = text;
    span.className = kind || "";
  }

  function readPending() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(PENDING_KEY, (res) => resolve((res && res[PENDING_KEY]) || null));
      } catch (_) {
        resolve(null); // extension reloaded; page needs refresh
      }
    });
  }

  async function refreshCartLabel() {
    const p = await readPending();
    if (!cartEl) return;
    cartEl.textContent = p && p.cart
      ? `${[p.cart.year, p.cart.make, p.cart.model].filter(Boolean).join(" ") || "Golf Cart"} — $${Number(p.cart.price || 0).toLocaleString("en-US")}`
      : "No cart selected — pick one in the Tigon Poster popup.";
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[PENDING_KEY]) refreshCartLabel();
    });
  } catch (_) { /* ignore */ }

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

  // ---------------------------------------------------------------------------
  // Main actions
  // ---------------------------------------------------------------------------
  async function onFill() {
    fillBtn.disabled = true;
    statusEl.innerHTML = "";
    try {
      const pending = await readPending(); // re-read at click time
      if (!pending || !pending.cart) {
        status("Cart", "none selected — use the Tigon Poster popup", "err");
        return;
      }
      await refreshCartLabel();
      const { cart } = pending;
      const listing = pending.listing || {};

      await fillDropdown("Vehicle type", /^vehicle type\b/i, ["Other", "Powersport"], { optional: true });
      await sleep(600); // form re-renders after type change
      await fillDropdown("Year", /^year\b/i, String(cart.year || ""));
      await fillDropdown("Make", /^make\b/i, String(cart.make || ""));
      await fillDropdown("Model", /^model\b/i, String(cart.model || ""));
      await fillText("Title", /^title\b/i, listing.title1 || "", { optional: true });
      await fillText("Price", /^price\b/i, cart.price ? String(Math.round(cart.price)) : "");
      await fillText("Description", /^description\b/i, listing.description || "");
      const loc = cityState(cart.locationId);
      if (loc) await fillText("Location", /^location\b/i, loc, { optional: true, onlyIfEmpty: true, pickSuggestion: true });
      else status("Location", "left as is", "warn");
      status("Mileage", "no mileage in DMS — enter if required", "warn");
      status("Photos", `attach ${(cart.photos || []).length} photo(s) manually`, "warn");
    } catch (err) {
      status("Error", String(err && err.message || err), "err");
    } finally {
      fillBtn.disabled = false;
    }
  }

  async function onCopyStructure() {
    const dump = {
      url: location.href,
      at: new Date().toISOString(),
      controls: controls().map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") || "",
          role: el.getAttribute("role") || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          name: el.getAttribute("name") || "",
          placeholder: el.getAttribute("placeholder") || "",
          label: labelOf(el),
          value: String(el.value || (el.getAttribute("role") === "combobox" ? el.innerText : "") || "").slice(0, 80),
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        };
      }),
      labels: labelTextElements(/^[A-Z][\w /&-]{1,30}$/).slice(0, 80).map((n) => norm(n.innerText)),
    };
    const text = JSON.stringify(dump, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    status("Structure", `copied (${dump.controls.length} fields)`, "ok");
  }

  // ---------------------------------------------------------------------------
  // Show the panel only on marketplace create pages (Facebook is a SPA).
  // ---------------------------------------------------------------------------
  function sync() {
    const onCreate = /^\/marketplace\/create(\/|$)/.test(location.pathname);
    if (onCreate && !host) buildPanel();
    if (host) host.style.display = onCreate ? "" : "none";
  }
  sync();
  setInterval(sync, 1000);
})();
