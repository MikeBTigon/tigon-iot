var TigonCartLogic = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/mp/cartLogic.ts
  var cartLogic_exports = {};
  __export(cartLogic_exports, {
    GOLF_CART_HEADLINE: () => GOLF_CART_HEADLINE,
    buildTitles: () => buildTitles,
    cartKind: () => cartKind,
    cartName: () => cartName,
    cartTitle: () => cartTitle,
    defaultImageFiles: () => defaultImageFiles,
    displayMake: () => displayMake,
    displayModel: () => displayModel,
    findAllDmsCartObjects: () => findAllDmsCartObjects,
    findDmsCartObject: () => findDmsCartObject,
    generateListing: () => generateListing,
    generateVariations: () => generateVariations,
    hasDeleteFlag: () => hasDeleteFlag,
    hashString: () => hashString,
    isDmsCartObject: () => isDmsCartObject,
    isLithium: () => isLithium,
    isPlaceholder: () => isPlaceholder,
    isUsedCart: () => isUsedCart,
    locationCity: () => locationCity,
    locationName: () => locationName,
    mapDmsCartObject: () => mapDmsCartObject,
    photoDownloadUrl: () => photoDownloadUrl,
    photoUrl: () => photoUrl,
    resolveWarranty: () => resolveWarranty,
    seededRandom: () => seededRandom,
    userSeed: () => userSeed
  });

  // src/mp/constants.ts
  var PHOTO_BASE = "https://s3.amazonaws.com/prod.docs.s3/carts/";
  var WINDOW_STICKER_BASE = "https://s3.amazonaws.com/prod.docs.s3/cart-window-stickers/";
  var PHOTO_WORKER = "https://tigon-photos.michael-b-2da.workers.dev";
  var ONLINE_WINDOW_MS = 10 * 60 * 1e3;
  var HEARTBEAT_MS = 5 * 60 * 1e3;
  var DEALERSHIPS = [
    { id: "T0", name: "TIGON National", cityState: "", phone: "1-844-844-6638", address: "National", maps: "https://www.google.com/maps?cid=913687030872245288", facebook: "https://www.facebook.com/Tigongolfcarts", youtube: "https://www.youtube.com/@TigonGolfCarts", website: "https://tigongolfcarts.com", pinterest: "https://www.pinterest.com/tigongolfcarts/", review: "https://g.page/r/CSiEBX-DEa4MEBM/review" },
    { id: "T1", name: "Hatfield PA", cityState: "Hatfield, PA", phone: "215-595-8736", address: "2333 Bethlehem Pike, Hatfield, PA 19440", lat: 40.29839945958623, lng: -75.28308913039525, maps: "https://www.google.com/maps?cid=8221925612164093496", facebook: "https://www.facebook.com/TigonGolfCartsHatfield/", youtube: "https://www.youtube.com/@TIGONGolfCartsHatfieldPA", website: "https://tigongolfcarts.com/hatfield", pinterest: "https://www.pinterest.com/tigongolfcarts/hatfield-pennsylvania/", review: "https://g.page/r/CTgWulrIJRpyEBM/review" },
    { id: "T2", name: "Ocean View NJ", cityState: "Ocean View, NJ", phone: "609-840-0404", address: "101 NJ-50, Ocean View, NJ 08230", lat: 39.22254797811702, lng: -74.70417212536503, maps: "https://www.google.com/maps?cid=6446924254429489274", facebook: "https://www.facebook.com/TigonGolfCartsOceanView/", youtube: "https://www.youtube.com/@TIGONGolfCartsOceanViewNJ", website: "https://tigongolfcarts.com/ocean-view", pinterest: "https://www.pinterest.com/tigongolfcarts/ocean-view-new-jersey/", review: "https://g.page/r/CXqoHr9zE3hZEBM/review" },
    { id: "T3", name: "Long Pond PA", cityState: "Long Pond, PA", phone: "570-580-0567", address: "4738 PA-115, Long Pond, PA 18334", lat: 41.053988, lng: -75.534146, maps: "https://www.google.com/maps?cid=11714838830522733253", facebook: "https://www.facebook.com/TigonGolfCartsPoconos/", youtube: "", website: "https://tigongolfcarts.com/long-pond", pinterest: "https://www.pinterest.com/tigongolfcarts/long-pond-pennsylvania/", review: "" },
    { id: "T4", name: "Dover DE", cityState: "Dover, DE", phone: "302-546-0010", address: "5158 N Dupont Hwy, Dover, DE 19901", lat: 39.22044318468275, lng: -75.57452048907642, maps: "https://www.google.com/maps?cid=12843447677705895190", facebook: "https://www.facebook.com/TigonGolfCartsDover/", youtube: "https://www.youtube.com/@TIGONGolfCartsDoverDE", website: "https://tigongolfcarts.com/dover", pinterest: "https://www.pinterest.com/tigongolfcarts/dover-delaware/", review: "https://g.page/r/CRa9-YidFz2yEBM/review" },
    { id: "T5", name: "Scranton-Wilkes-Barre PA", cityState: "Scranton, PA", phone: "570-344-4443", address: "1225 N Keyser Ave #2, Scranton, PA 18504", lat: 41.4374075, lng: -75.6835104, maps: "https://www.google.com/maps?cid=13243686786001524416", facebook: "https://www.facebook.com/TigonGolfCartsScranton/", youtube: "https://www.youtube.com/@TIGONGolfCartsScrantonWilkesPA", website: "https://tigongolfcarts.com/scranton-wilkes-barre", pinterest: "https://www.pinterest.com/tigongolfcarts/scranton-pennsylvania/", review: "https://g.page/r/CcDWJ7z2Bsu3EBM/review" },
    { id: "T6", name: "Raleigh NC", cityState: "Raleigh, NC", phone: "984-489-0296", address: "2700 S Wilmington St, Raleigh, NC 27603", lat: 35.7471032, lng: -78.6452007, maps: "https://www.google.com/maps?cid=14570072271497929915", facebook: "https://www.facebook.com/TigonGolfCartsRaleigh/", youtube: "https://www.youtube.com/@TIGONGolfCartsRaleighNC", website: "https://tigongolfcarts.com/raleigh", pinterest: "https://www.pinterest.com/tigongolfcarts/raleigh-north-carolina/", review: "https://g.page/r/CbskZw6JSzPKEBM/review" },
    { id: "T7", name: "South Bend IN", cityState: "South Bend, IN", phone: "574-703-0456", address: "52129 State Road 933, South Bend, IN 46637", lat: 41.7360283, lng: -86.2511865, maps: "https://www.google.com/maps?cid=17532455648086849827", facebook: "https://www.facebook.com/TigonGolfCartsSouthBend/", youtube: "https://www.youtube.com/@TIGONGolfCartsSouthBendIN", website: "https://tigongolfcarts.com/south-bend", pinterest: "https://www.pinterest.com/tigongolfcarts/south-bend-indiana/", review: "https://g.page/r/CSP5gWCFy0_zEBM/review" },
    { id: "T8", name: "Gloucester Point VA", cityState: "Gloucester Point, VA", phone: "804-792-0234", address: "2810 George Washington Memorial Hwy, Gloucester Point, VA 23072", lat: 37.2850625, lng: -76.5074161, maps: "https://www.google.com/maps?cid=16682967888503617377", facebook: "https://www.facebook.com/TigonGolfCartsGloucesterPoint/", youtube: "https://www.youtube.com/@TIGONGolfCartsGloucesterPoint", website: "https://tigongolfcarts.com/gloucester-point", pinterest: "https://www.pinterest.com/tigongolfcarts/gloucester-point-virginia/", review: "" },
    { id: "T9", name: "Bayville NJ", cityState: "Bayville, NJ", phone: "732-908-7166", address: "155 Atlantic City Blvd, Bayville, NJ 08721", lat: 39.9277698, lng: -74.1748497, maps: "https://www.google.com/maps?cid=16812778070531162551", facebook: "https://www.facebook.com/TigonGolfCartsBayville/", youtube: "", website: "https://tigongolfcarts.com/bayville", pinterest: "https://www.pinterest.com/tigongolfcarts/bayville-new-jersey/", review: "https://g.page/r/CbfBfMWT_FLpEBM/review" },
    { id: "T10", name: "Waretown NJ", cityState: "Waretown, NJ", phone: "732-998-8146", address: "526 US-9, Waretown, NJ 08758", lat: 39.7998853, lng: -74.1971619, maps: "https://www.google.com/maps?cid=11595558320608622005", facebook: "https://www.facebook.com/TigonGolfCartsWaretown/", youtube: "", website: "https://tigongolfcarts.com/waretown", pinterest: "https://www.pinterest.com/tigongolfcarts/waretown-new-jersey/", review: "https://g.page/r/CbW1M1DbsuugEBM/review" },
    { id: "T11", name: "Orangeburg SC", cityState: "Orangeburg, SC", phone: "803-596-0246", address: "4166 North Rd, Orangeburg, SC 29118", lat: 33.547201, lng: -80.9162039, maps: "https://www.google.com/maps?cid=17192321019507936230", facebook: "https://www.facebook.com/TigonGolfCartsOrangeburg/", youtube: "https://www.youtube.com/@TIGONGolfCartsOrangeburgSC", website: "https://tigongolfcarts.com/orangeburg", pinterest: "https://www.pinterest.com/tigongolfcarts/orangeburg-south-carolina/", review: "https://g.page/r/CeaLQODgZJfuEBM/review" },
    { id: "T12", name: "Lecanto FL", cityState: "Lecanto, FL", phone: "352-453-0345", address: "299 E. Gulf to Lake Hwy, Lecanto, FL 34461", lat: 28.858622, lng: -82.4295381, maps: "https://www.google.com/maps?cid=4773802157529013859", facebook: "https://www.facebook.com/TigonGolfCartsLecanto/", youtube: "https://www.youtube.com/@TIGONGolfCartsLecantoFL", website: "https://tigongolfcarts.com/lecanto", pinterest: "https://www.pinterest.com/tigongolfcarts/lecanto-florida/", review: "https://g.page/r/CWOeggPF8z9CEBM/review" },
    { id: "T13", name: "Swanton OH", cityState: "Swanton, OH", phone: "419-402-8400", address: "10420 Airport Hwy, Swanton, OH 43558", lat: 41.6013184, lng: -83.7926472, maps: "https://www.google.com/maps?cid=16517552730289967239", facebook: "https://www.facebook.com/TigonGolfCartsSwanton/", youtube: "https://www.youtube.com/@TIGONGolfCartsSwantonOH", website: "https://tigongolfcarts.com/swanton", pinterest: "https://www.pinterest.com/tigongolfcarts/swanton-ohio/", review: "https://g.page/r/CYeQt8exIjrlEBM/review" },
    { id: "T14", name: "Rio Grande NJ", cityState: "Rio Grande, NJ", phone: "609-551-0234", address: "1304 NJ-47 b, Rio Grande, NJ 08242", maps: "https://www.google.com/maps?cid=17469351422439742131", facebook: "https://www.facebook.com/TigonGolfCartsRioGrande/", youtube: "", website: "https://tigongolfcarts.com/rio-grande", pinterest: "https://www.pinterest.com/tigongolfcarts/rio-grande-new-jersey/", review: "https://g.page/r/CbNa_OaPmm_yEBM/review" }
  ];
  var DEALERSHIP_BY_ID = Object.fromEntries(DEALERSHIPS.map((d) => [d.id, d]));
  function locationName(id) {
    const d = DEALERSHIP_BY_ID[id];
    return d ? d.cityState || d.name : id || "Other";
  }
  function locationCity(id) {
    const d = DEALERSHIP_BY_ID[id];
    return d?.cityState ? d.cityState.split(",")[0] : "";
  }

  // src/mp/cartLogic.ts
  var str = (v) => v === null || v === void 0 ? "" : String(v).trim();
  var bool = (v) => v === true || v === "true" || v === "Yes" || v === "yes";
  var obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  function isDmsCartObject(v) {
    const o = obj(v);
    const hasShape = "cartType" in o || "cartAttributes" in o;
    return typeof o._id === "string" && (hasShape || "serialNo" in o) || hasShape && !!str(o.serialNo);
  }
  function findDmsCartObject(v, depth = 0) {
    if (depth > 6 || !v || typeof v !== "object") return null;
    if (isDmsCartObject(v)) return v;
    const values = Array.isArray(v) ? v : Object.values(v);
    for (const child of values) {
      const found = findDmsCartObject(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  function findAllDmsCartObjects(v, out = [], depth = 0) {
    if (depth > 6 || !v || typeof v !== "object") return out;
    if (isDmsCartObject(v)) {
      out.push(v);
      return out;
    }
    const values = Array.isArray(v) ? v : Object.values(v);
    for (const child of values) findAllDmsCartObjects(child, out, depth + 1);
    return out;
  }
  function hasDeleteFlag(doc) {
    try {
      return /delete/i.test(JSON.stringify(doc));
    } catch {
      return false;
    }
  }
  function parsePassengers(v) {
    const m = str(v).match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  function photoList(doc) {
    const clean = (a) => (Array.isArray(a) ? a : []).map(str).filter((s) => s && !/^null$/i.test(s));
    const pub = clean(doc.imageUrls);
    if (pub.length) return { photos: pub, source: "public" };
    const internal = clean(doc.internalCartImageUrls);
    if (internal.length) return { photos: internal, source: "internal" };
    const defaults = clean(doc._mpDefaultImages);
    if (defaults.length) return { photos: defaults, source: "default" };
    return { photos: [], source: "none" };
  }
  function isLithium(batteryType) {
    return /lith|lifepo|li-ion/i.test(batteryType);
  }
  function resolveWarranty(doc, isUsed, isElectric) {
    const batt = obj(doc.battery);
    const battType = str(batt.type);
    const lithium = isLithium(battType);
    const battYear = parseInt(str(batt.year), 10);
    const newBattery = !!battYear && battYear >= (/* @__PURE__ */ new Date()).getFullYear() - 1;
    let cart;
    let battery;
    if (!isUsed && lithium) {
      cart = "2 year";
      battery = "8 year";
    } else if (!isUsed) {
      cart = "1 year";
      battery = "1 year";
    } else if (isElectric && !lithium && newBattery) {
      cart = "90 day";
      battery = "1 year";
    } else {
      cart = "90 day";
      battery = "90 day";
    }
    return {
      cart: str(doc.warrantyLength) || cart,
      battery: isElectric ? str(batt.warrantyLength) || battery : ""
    };
  }
  function windowStickerUrl(doc) {
    for (const [k, v] of Object.entries(doc)) {
      if (!/sticker|monroney/i.test(k)) continue;
      const file = Array.isArray(v) ? str(v[0]) : str(v);
      if (file && !/^(null|undefined)$/i.test(file)) return /^https?:\/\//i.test(file) ? file : WINDOW_STICKER_BASE + file;
    }
    return "";
  }
  function defaultImageFiles(doc, locationSlug, count = 4) {
    const s = (v) => str(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const type = obj(doc.cartType);
    const stem = [s(obj(doc.cartAttributes).cartColor), s(type.make), s(type.model)].filter(Boolean).join("-");
    return Array.from({ length: count }, (_, i) => `${stem}-in-${locationSlug}-${i + 1}.jpg`);
  }
  function isUsedCart(doc) {
    if (typeof doc.isUsed === "boolean") return doc.isUsed;
    if (typeof doc.isNew === "boolean") return !doc.isNew;
    const cond = str(doc.condition || doc.cartCondition);
    if (cond) return !/^new/i.test(cond);
    return true;
  }
  function mapDmsCartObject(doc) {
    const type = obj(doc.cartType);
    const attrs = obj(doc.cartAttributes);
    const batt = obj(doc.battery);
    const engine = obj(doc.engine);
    const loc = obj(doc.cartLocation);
    const title = obj(doc.title);
    const rfs = obj(doc.rfsStatus);
    const isUsed = isUsedCart(doc);
    const isElectric = doc.isElectric !== false;
    const warranty = resolveWarranty(doc, isUsed, isElectric);
    const { photos, source } = photoList(doc);
    const price = Number(doc.retailPrice) || 0;
    return {
      id: str(doc._id) || str(doc.serialNo),
      dmsId: str(doc._id) || str(doc.serialNo),
      make: str(type.make),
      model: str(type.model),
      year: str(type.year),
      color: str(attrs.cartColor),
      seatColor: str(attrs.seatColor),
      driveTrain: str(attrs.driveTrain),
      tireRimSize: str(attrs.tireRimSize),
      tireType: str(attrs.tireType),
      hasSoundSystem: bool(attrs.hasSoundSystem),
      isLifted: bool(attrs.isLifted),
      hasHitch: bool(attrs.hasHitch),
      hasExtendedTop: bool(attrs.hasExtendedTop),
      passengers: parsePassengers(attrs.passengers),
      isElectric,
      isUsed,
      isStreetLegal: bool(title.isStreetLegal),
      batteryType: str(batt.type),
      packVoltage: str(batt.packVoltage),
      batteryBrand: str(batt.brand),
      batteryYear: str(batt.year),
      engineMake: str(engine.make),
      locationId: str(loc.locationId) || str(loc.latestStoreId) || "Other",
      price,
      cartWarranty: warranty.cart,
      batteryWarranty: warranty.battery,
      serial: str(doc.serialNo),
      vin: str(doc.vinNo),
      invoice: str(doc.invoiceNo),
      status: str(doc.status),
      isDraft: bool(doc.isDraft),
      isRFS: bool(rfs.isRFS),
      photos,
      photoSource: source,
      inStock: doc.isInStock !== false,
      windowSticker: windowStickerUrl(doc),
      flaggedDelete: hasDeleteFlag(doc)
    };
  }
  function photoUrl(file) {
    return /^https?:\/\//i.test(file) ? file : PHOTO_BASE + file;
  }
  function photoFileName(file) {
    return file.split("/").pop().split("?")[0];
  }
  function photoDownloadUrl(file, downloadName) {
    if (/^https?:\/\//i.test(file) && !file.startsWith(PHOTO_BASE)) return file;
    const name = photoFileName(file);
    const q = new URLSearchParams({ file: name });
    if (downloadName) q.set("name", downloadName);
    return `${PHOTO_WORKER}?${q.toString()}`;
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  var cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function normalizeColor(c) {
    return c.replace(/\s+/g, " ").trim().toLowerCase();
  }
  function isPlaceholder(v) {
    return /^(other|others|n\/?a|none|unknown|tbd|-+|\.)$/i.test((v || "").trim());
  }
  function cartKind(cart) {
    const parts = [];
    if (cart.isLifted) parts.push("Lifted");
    if (cart.passengers) parts.push(`${cart.passengers} Passenger`);
    if (parts.length) return `${parts.join(" ")} Cart`;
    if (cart.isStreetLegal) return "Street Legal Golf Cart";
    if (!cart.isElectric) return "Gas Golf Cart";
    if (isLithium(cart.batteryType)) return "Lithium Golf Cart";
    return "Golf Cart";
  }
  function displayMake(cart) {
    return isPlaceholder(cart.make) ? "" : cart.make;
  }
  function displayModel(cart) {
    return isPlaceholder(cart.model) ? cartKind(cart) : cart.model;
  }
  function cartName(cart) {
    return [cart.year, displayMake(cart), displayModel(cart)].filter(Boolean).join(" ") || "Golf Cart";
  }
  function cartTitle(cart) {
    return [displayMake(cart), displayModel(cart), cart.color, locationCity(cart.locationId)].filter(Boolean).join(" ") || cartName(cart);
  }
  function formatWarranty(w) {
    const t = w.trim();
    if (!t) return "";
    return /warranty/i.test(t) ? t : `${t} warranty`;
  }
  function priceText(p) {
    return p > 0 ? `$${p.toLocaleString("en-US")}` : "";
  }
  function voltage(v) {
    return v ? v.replace(/\s*v(olt)?s?$/i, "") + "V" : "";
  }
  function descriptors(cart) {
    const d = [];
    if (cart.isStreetLegal) d.push("street legal");
    if (cart.isLifted) d.push("lifted");
    if (cart.passengers) d.push(`${cart.passengers} passenger`);
    if (!cart.isElectric) d.push("gas");
    return d;
  }
  function equipment(cart) {
    const e = [];
    if (cart.isElectric && isLithium(cart.batteryType)) e.push(`a ${voltage(cart.packVoltage)} lithium battery`.replace("a  ", "a "));
    else if (cart.isElectric && cart.packVoltage) e.push(`a ${voltage(cart.packVoltage)} battery pack`);
    if (!cart.isElectric && cart.engineMake) e.push(`a ${cart.engineMake} engine`);
    if (cart.color) e.push(`${normalizeColor(cart.color)} paint${cart.seatColor ? ` with ${normalizeColor(cart.seatColor)} seats` : ""}`);
    else if (cart.seatColor) e.push(`${normalizeColor(cart.seatColor)} seats`);
    if (cart.tireRimSize) e.push(`${cart.tireRimSize.replace(/"/g, "")}" wheels${cart.tireType ? ` with ${cart.tireType.toLowerCase()} tires` : ""}`);
    else if (cart.tireType) e.push(`${cart.tireType.toLowerCase()} tires`);
    if (cart.hasExtendedTop) e.push("an extended roof");
    if (cart.hasSoundSystem) e.push("a sound system");
    if (cart.hasHitch) e.push("a trailer hitch");
    if (cart.driveTrain && !/^(2wd|2x4)$/i.test(cart.driveTrain)) e.push(cart.driveTrain.toUpperCase());
    return e;
  }
  function features(cart) {
    const lines = descriptors(cart).map((d) => d === "gas" ? "Gas powered" : cap(d));
    for (const e of equipment(cart)) lines.push(cap(e.replace(/^(a|an) /, "")));
    return lines;
  }
  function buildTitles(cart, rng) {
    const adjectives = cart.isUsed ? ["Well Kept", "Clean", "Great Shape", "Nice", "Sharp", "Ready to Ride"] : ["New", "Brand New", "Like New", "New Model"];
    const nouns = [];
    if (cart.isStreetLegal) nouns.push("Street Legal Cart", "Street Legal Golf Cart", "LSV");
    if (cart.isLifted) nouns.push("Lifted Golf Cart", "Lifted Cart");
    if (cart.isElectric && isLithium(cart.batteryType)) nouns.push("Lithium Cart", "Lithium Golf Cart");
    if (!cart.isElectric) nouns.push("Gas Golf Cart", "Gas Cart");
    if (cart.passengers >= 6) nouns.push(`${cart.passengers} Seater Golf Cart`);
    else if (cart.passengers === 4) nouns.push("4 Seater Golf Cart", "4 Passenger Cart");
    nouns.push("Golf Cart");
    const a1 = pick(rng, adjectives);
    const n1 = pick(rng, nouns);
    let title1 = cart.isUsed || a1 !== "New" ? `${a1} ${n1}` : `New ${n1}`;
    title1 = title1.replace(/\bNew New\b/, "New");
    const name = cartName(cart);
    const power = cart.isElectric ? isLithium(cart.batteryType) ? "Lithium" : "Electric" : "Gas";
    const t2opts = [
      `${name}${cart.color ? " - " + normalizeColor(cart.color).replace(/\b\w/g, (c) => c.toUpperCase()) : ""}`,
      isPlaceholder(cart.model) ? [cart.year, displayMake(cart), cartKind(cart).includes(power) ? "" : power, cartKind(cart)].filter(Boolean).join(" ") : `${name} ${power}`,
      isPlaceholder(cart.model) ? `${displayMake(cart)} ${cartKind(cart)}`.trim() : `${displayMake(cart) || "Golf"} ${cart.model || "Cart"}${cart.isLifted ? " Lifted" : ""}${cart.passengers ? ` ${cart.passengers} Pass` : ""}`.trim()
    ];
    return [title1, pick(rng, t2opts)];
  }
  function warrantyLines(cart, rng) {
    const lines = [];
    const cw = formatWarranty(cart.cartWarranty);
    const bw = formatWarranty(cart.batteryWarranty);
    if (cw) lines.push(pick(rng, [`Comes with a ${cw} on the cart`, `${cap(cw)} on the cart`, `Cart has a ${cw}`]));
    if (bw) lines.push(pick(rng, [`${cap(bw)} on the battery`, `Battery comes with a ${bw}`, `Battery has a ${bw}`]));
    return lines;
  }
  var GOLF_CART_HEADLINE = "Golf Cart";
  var FINANCING = [
    "Financing available",
    "Financing available, easy approval",
    "We offer financing",
    "Financing options available"
  ];
  var DELIVERY = [
    "Delivery available",
    "We can deliver",
    "Delivery available for a fee",
    "Local delivery available"
  ];
  var OPENERS_USED = [
    "This one is in great shape and ready to go.",
    "Really nice cart, runs and drives great.",
    "Well taken care of and ready for the season.",
    "Clean cart, everything works like it should."
  ];
  var OPENERS_NEW = [
    "Brand new and ready to go.",
    "New cart, fully loaded and ready to ride.",
    "New in stock, come check it out."
  ];
  function listDescription(cart) {
    const out = [cartName(cart)];
    const p = priceText(cart.price);
    if (p) out.push(p);
    for (const f of features(cart)) out.push(cap(f));
    return out;
  }
  function paragraphDescription(cart, rng) {
    const name = cartName(cart);
    const desc = descriptors(cart).filter((d) => !name.toLowerCase().includes(d));
    const eq = equipment(cart);
    const sentences = [pick(rng, cart.isUsed ? OPENERS_USED : OPENERS_NEW)];
    const subject = [...desc, name].join(" ");
    const article = /^[aeiou8]/i.test(subject) ? "an" : "a";
    const head = eq.slice(0, 2);
    const tail = eq.slice(2);
    sentences.push(
      head.length ? `${pick(rng, ["It's", "This is", "Up for sale is"])} ${article} ${subject} ${pick(rng, ["with", "that has", "featuring"])} ${joinList(head)}.` : `${pick(rng, ["It's", "This is"])} ${article} ${subject}.`
    );
    if (tail.length) sentences.push(`${pick(rng, ["Also has", "It also has", "Comes with"])} ${joinList(tail)}.`);
    const p = priceText(cart.price);
    if (p) sentences.push(pick(rng, [`Asking ${p}.`, `Price is ${p}.`, `${p}.`]));
    return [sentences.join(" ")];
  }
  function joinList(items) {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }
  function addImperfections(text, rng, count = 3) {
    const ops = [
      (s) => s.replace(/, (?=[a-z])/, " "),
      (s) => s.replace(/ and /, " & "),
      (s) => s.replace(/([.!]\s+|\n)([A-Z])([a-z])/, (_m, sep, c, r) => `${sep}${c.toLowerCase()}${r}`),
      (s) => s.replace(/\.(\n|$)/, "$1")
    ];
    let out = text;
    for (const op of shuffle(rng, ops).slice(0, count)) out = op(out);
    return out;
  }
  function generateListing(cart, opts = {}) {
    const seed = (opts.seed ?? hashString(cart.id)) + (opts.variant ?? 0) * 7919;
    const rng = seededRandom(seed);
    const format = opts.format ?? (rng() < 0.5 ? "list" : "paragraph");
    const [title1, title2] = buildTitles(cart, rng);
    const body = format === "list" ? listDescription(cart) : paragraphDescription(cart, rng);
    const tail = [...warrantyLines(cart, rng), pick(rng, FINANCING), pick(rng, DELIVERY)];
    const main = format === "list" ? [...body, ...tail].join("\n") : `${body.join(" ")}

${tail.join("\n")}`;
    const loc = locationName(cart.locationId);
    const locationLine = /,/.test(loc) ? loc : "";
    let description = `${GOLF_CART_HEADLINE}

${addImperfections(main, rng)}`;
    if (locationLine) description += `

${locationLine}`;
    return { title1, title2, description, format };
  }
  function userSeed(cartId, userId) {
    return hashString(`${cartId}::${userId}`);
  }
  function generateVariations(cart, userId = "") {
    const seed = userSeed(cart.id, userId);
    const rng = seededRandom(seed);
    const threeParagraph = rng() < 0.5;
    const formats = threeParagraph ? ["paragraph", "paragraph", "paragraph", "list", "list"] : ["list", "list", "list", "paragraph", "paragraph"];
    return shuffle(rng, formats).map((format, i) => generateListing(cart, { seed, variant: i + 1, format }));
  }
  return __toCommonJS(cartLogic_exports);
})();
