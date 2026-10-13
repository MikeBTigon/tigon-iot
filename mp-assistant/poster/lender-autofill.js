// Tigon Poster (IoT) — fills a lender's online credit application with the customer from TIGON IOT
// (Credit applications → a lender card → "Apply & fill in"). The website hands the details over through
// tigon-bridge.js; they are kept 30 minutes for that one lender's site, then dropped.
// Fields are matched by their label / name / placeholder, so it keeps working when a lender changes its form.
// It only types into EMPTY fields, skips SSN, date of birth, co-applicant and reference sections, and
// NEVER clicks Submit / Next. Alt+Shift+F fills again (e.g. after moving to the next step of the form).
/* global chrome */
(function () {
  "use strict";
  const KEY = "tigonCreditPending";
  const MAX_AGE = 30 * 60 * 1000;
  const host = location.hostname.replace(/^www\./, "");
  let data = null;
  let filled = new Set();
  let observer = null;
  let timer = 0;

  const STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };

  // Never fill: identity numbers, dates, passwords, anyone who isn't the applicant, and previous address / job.
  const SKIP = /\b(ssn|social|security|tax ?id|itin|ein|dob|birth|date|password|pin|license|licence|routing|account number|card number|cvv)\b|co-?app|co-?borrow|co-?signer|joint|spouse|partner|reference|relative|landlord|previous|prior|former|second(ary)? (job|employ)|promo|coupon|captcha/i;

  // [field, test] — first match wins. Tests run on the field's description (label, name, id, placeholder…).
  const RULES = [
    ["email", /e-?mail/i],
    ["firstName", /first.?name|name.?first|\bfname\b|given.?name|^first$/i],
    ["lastName", /last.?name|name.?last|\blname\b|surname|family.?name|^last$/i],
    ["employer", /employer|company.?name|business.?name|employed (by|at)|place of (work|employment)|name of (employer|company)/i],
    ["jobTitle", /job.?title|occupation|position|^title$/i],
    ["phone", /phone|mobile|cell|\btel\b|contact number/i],
    ["unit", /\b(apt|apartment|unit|suite|ste)\b|address.?(line)?.?2|addr.?(line)?.?2|address2/i],
    ["street", /street|address.?(line)?.?1|addr.?(line)?.?1|address1|home address|residen(ce|tial) address|^address$|mailing address/i],
    ["city", /\bcity\b|\btown\b/i],
    ["state", /\bstate\b|province|region/i],
    ["zip", /\bzip|postal|post.?code/i],
    ["downPayment", /down.?payment|cash down|amount down/i],
    ["housingPayment", /\brent\b.*(amount|payment|month)|mortgage|housing.?(payment|cost)|monthly (rent|payment)|rent\/mortgage/i],
    ["housing", /own or rent|rent or own|housing.?(status|type)|residen(ce|tial).?(status|type)|home.?ownership|do you (own|rent)/i],
    ["annualIncome", /(annual|yearly|per year|gross year).*(income|salary|pay)|(income|salary|pay).*(annual|yearly|per year)/i],
    ["monthlyIncome", /(monthly|per month).*(income|salary|pay)|(income|salary|pay).*(monthly|per month)|gross monthly/i],
    ["fullName", /^(full |your |applicant'?s? |customer )?name$|full.?name/i],
  ];
  // "Years / months at address" and "on job" are matched separately: the label usually has both words.
  const timeField = (desc) => {
    const yrs = /\byears?\b|\byrs?\b/i.test(desc);
    const mos = /\bmonths?\b|\bmos?\b/i.test(desc);
    if (!yrs && !mos) return "";
    if (/employ|job|work|employer/i.test(desc)) return yrs ? "yearsOnJob" : "monthsOnJob";
    if (/address|residen|live|living|home/i.test(desc)) return yrs ? "yearsAtAddress" : "monthsAtAddress";
    return "";
  };

  const text = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "");

  // Label text for a field: <label for>, wrapping <label>, aria-labelledby, or a short text just before it.
  function labelOf(el) {
    const out = [];
    if (el.id) {
      try {
        document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach((l) => out.push(text(l)));
      } catch (e) { /* bad id */ }
    }
    const wrap = el.closest("label");
    if (wrap) out.push(text(wrap));
    const lb = el.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach((id) => out.push(text(document.getElementById(id))));
    if (!out.join("").trim()) {
      let node = el;
      // Only the element right before the field (or before its wrapper) — never past another field.
      for (let i = 0; i < 3 && node && !out.join("").trim(); i++) {
        const prev = node.previousElementSibling;
        if (prev) {
          if (!prev.matches("input, select, textarea") && !prev.querySelector("input, select, textarea") && text(prev).length <= 80) out.push(text(prev));
          break;
        }
        node = node.parentElement;
      }
    }
    return out.join(" ");
  }

  function describe(el) {
    return [
      el.getAttribute("autocomplete"), el.getAttribute("name"), el.id, el.getAttribute("placeholder"),
      el.getAttribute("aria-label"), el.getAttribute("data-testid"), labelOf(el),
    ].filter(Boolean).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-[\]]+/g, " ");
  }

  // The nearest section heading / fieldset legend — used to skip co-applicant and reference sections.
  function sectionOf(el) {
    const fs = el.closest("fieldset");
    const parts = [fs ? text(fs.querySelector("legend")) : ""];
    let node = el;
    for (let i = 0; i < 6 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const h = node.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend");
      if (h) { parts.push(text(h)); break; }
    }
    return parts.join(" ").slice(0, 200);
  }

  const AUTOCOMPLETE = {
    "given-name": "firstName", "family-name": "lastName", name: "fullName", email: "email", tel: "phone", "tel-national": "phone",
    "address-line1": "street", "street-address": "street", "address-line2": "unit", "address-level2": "city",
    "address-level1": "state", "postal-code": "zip", organization: "employer", "organization-title": "jobTitle",
  };

  function fieldFor(el) {
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/).pop();
    const desc = describe(el);
    if (SKIP.test(desc) || SKIP.test(sectionOf(el))) return "";
    if (/email/i.test(desc) && el.type !== "email" && /confirm|verify|re-?enter/i.test(desc)) return "email";
    if (AUTOCOMPLETE[ac]) return AUTOCOMPLETE[ac];
    const t = timeField(desc);
    if (t) return t;
    for (const [f, re] of RULES) if (re.test(desc)) {
      // "Employer phone", "work address" etc. belong to the job, not the applicant's contact details.
      if (["phone", "street", "unit", "city", "state", "zip", "email"].includes(f) && /employer|work|business|company|office/i.test(desc)) return "";
      if (f === "fullName" && /employer|company|business|dealer|lender/i.test(desc)) return "";
      // "Employer phone / address / income" are about the job, not the employer's name.
      if ((f === "employer" || f === "jobTitle") && /phone|\btel\b|address|street|city|state|zip|postal|income|salary|pay\b|email/i.test(desc)) return "";
      return f;
    }
    return "";
  }

  function valueFor(field, el) {
    const d = data.fields || {};
    if (field === "fullName") return [d.firstName, d.lastName].filter(Boolean).join(" ");
    if (field === "phone") {
      const p = String(d.phone || "").replace(/\D/g, "");
      const ph = (el.getAttribute("placeholder") || "") + (el.getAttribute("pattern") || "");
      if (p.length === 10 && /\(\d{3}\)|\(xxx\)|\(___\)/i.test(ph)) return `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
      if (p.length === 10 && /\d{3}-\d{3}-\d{4}|xxx-xxx/i.test(ph)) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
      return p;
    }
    return String(d[field] || "");
  }

  // React / Angular / Vue keep their own copy of the value: set it the way a person typing would.
  function setInput(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function chooseOption(el, field, value) {
    const opts = Array.from(el.options || []);
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    let pick = null;
    if (field === "state") {
      const code = value.toUpperCase();
      const full = norm(STATES[code] || "");
      pick = opts.find((o) => norm(o.value) === norm(code) || norm(o.text) === norm(code)) || opts.find((o) => full && (norm(o.text) === full || norm(o.value) === full));
    } else if (field === "housing") {
      const re = { own: /own|mortgage|homeowner/i, rent: /rent/i, family: /family|relative|parent/i, other: /other/i }[value];
      pick = re ? opts.find((o) => re.test(o.text) && !/^(select|choose)/i.test(o.text)) : null;
    } else {
      pick = opts.find((o) => norm(o.value) === norm(value) || norm(o.text) === norm(value));
    }
    if (!pick || el.value === pick.value) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(el, pick.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";

  function fillAll(force) {
    if (!data) return 0;
    let count = 0;
    const fields = document.querySelectorAll("input, select, textarea");
    fields.forEach((el) => {
      if (el.disabled || el.readOnly || !visible(el)) return;
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (el.tagName === "INPUT" && !["text", "email", "tel", "number", "search", ""].includes(type)) return;
      const field = fieldFor(el);
      if (!field) return;
      const value = valueFor(field, el);
      if (!value) return;
      if (el.tagName === "SELECT") {
        if (el.selectedIndex > 0 && !force) return;
        if (chooseOption(el, field, value)) { count++; mark(el); }
        return;
      }
      if (el.value && !force) return;
      if (field === "housing") return; // a text box for own/rent: leave it to the person
      setInput(el, value);
      count++;
      mark(el);
    });
    filled = new Set([...filled, ...Array.from(document.querySelectorAll("[data-tigon-filled]"))]);
    updateBanner();
    return count;
  }

  function mark(el) {
    el.setAttribute("data-tigon-filled", "1");
    el.style.outline = "2px solid #2e7d32";
    el.style.outlineOffset = "1px";
  }

  // ---- Banner (bottom-right): what was filled, Fill again, Done ----
  let banner = null;
  function updateBanner() {
    if (!data) { if (banner) banner.remove(); banner = null; return; }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "tigon-lender-banner";
      banner.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;background:#fff;color:#222;" +
        "border:2px solid #af1f31;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);font:14px/1.4 system-ui,Arial,sans-serif;padding:12px 14px";
      document.documentElement.appendChild(banner);
    }
    const n = document.querySelectorAll("[data-tigon-filled]").length;
    banner.innerHTML = "";
    const h = document.createElement("div");
    h.style.cssText = "font-weight:700;color:#af1f31;margin-bottom:4px";
    h.textContent = `TIGON IOT — ${data.name || "customer"}`;
    const p = document.createElement("div");
    p.textContent = n
      ? `Filled ${n} field${n === 1 ? "" : "s"} (green). Check every field. The customer adds their SSN and date of birth, then submits.`
      : "Waiting for the form… If it doesn't fill, click Fill again (Alt+Shift+F).";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:8px";
    const btn = (label, primary, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = `cursor:pointer;border-radius:6px;padding:6px 10px;font:600 13px system-ui,Arial,sans-serif;border:1px solid #af1f31;${primary ? "background:#af1f31;color:#fff" : "background:#fff;color:#af1f31"}`;
      b.addEventListener("click", fn);
      row.appendChild(b);
    };
    btn("Fill again", true, () => fillAll(false));
    btn("Done — forget customer", false, done);
    banner.append(h, p, row);
  }

  function done() {
    data = null;
    chrome.storage.local.remove(KEY);
    if (observer) observer.disconnect();
    updateBanner();
  }

  function start(pending) {
    if (!pending || !pending.fields || Date.now() - (pending.ts || 0) > MAX_AGE) return;
    const target = String(pending.host || "").replace(/^www\./, "");
    if (target && target !== host && !host.endsWith(`.${target}`) && !target.endsWith(`.${host}`)) return;
    data = pending;
    fillAll(false);
    // Multi-step forms show new fields as you go: fill those too (never overwriting what's typed).
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => fillAll(false), 400);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { if (observer) observer.disconnect(); }, MAX_AGE);
  }

  chrome.storage.local.get(KEY, (r) => start(r && r[KEY]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY] && changes[KEY].newValue) start(changes[KEY].newValue);
  });
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && (e.key === "F" || e.key === "f" || e.code === "KeyF")) {
      e.preventDefault();
      if (data) fillAll(false);
    }
  }, true);

  // For tests (node): expose the matcher without a browser extension.
  if (typeof window !== "undefined") window.__tigonLenderFill = { fieldFor, fillAll, start };
})();
