/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置存储读写封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STSettings = globalThis.STSettings || {};

  if (api.storage) {
    return;
  }

  const PREFIX = "st.settings.";
  const SUFFIX = ".enabled";
  const RAIL_TOP = `${PREFIX}rail.top`;
  const RAIL_SIDE = `${PREFIX}rail.side`;
  const TRANS_PREFIX = `${PREFIX}translate.`;
  const REVIEW_FILTER_PREFIX = `${PREFIX}reviewFilter.`;
  const SEARCH_SUGGESTION_PREFIX = `${PREFIX}searchSuggestions.`;
  const FAMILY_LIBRARY_PREFIX = `${PREFIX}familyLibrary.`;
  const AI_PREFIX = `${PREFIX}ai.`;
  const THIRD_PARTY_SERVICES_PREFIX = `${PREFIX}thirdPartyServices.`;
  const STORE_PRICE_CHART_KEY = `${PREFIX}storePriceChart`;
  const UI_LOCALE_KEY = globalThis.STI18n?.STORAGE_KEY || api.catalog?.UI_LOCALE_KEY || "SETTING_UI_LOCALE";
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = globalThis.STSettingsMembership?.KEY || "steam_buff_membership";
  const AI_SERVICE = "steam-buff.ai";
  const log = globalThis.STLoggerFactory.createLogger("settings", "settings-storage");
  const priceCatalog = globalThis.STPriceComparisonCatalog;
  let unknownShopMigrationLogged = false;

  function logSave(kind, ok, meta = {}) {
    log[ok ? "info" : "warn"](ok ? "setting-save-success" : "setting-save-failed", ok ? "设置保存成功" : "设置保存失败", {
      kind,
      ...meta,
    });
  }

  function key(id) {
    return `${PREFIX}${id}${SUFFIX}`;
  }

  function defaults() {
    return api.catalog?.defaults?.() || {};
  }

  function translateDefaults() {
    return api.catalog?.translateDefaults?.() || {};
  }

  function aiDefaults() {
    return api.catalog?.aiDefaults?.() || {};
  }

  function failureOperationMeta(ok, diagnostics = {}) {
    const operationId = String(diagnostics?.operationId || "");
    return !ok && operationId ? { operationId } : {};
  }

  function thirdPartyServicesDefaults() {
    return api.catalog?.thirdPartyServicesDefaults?.() || {};
  }

  function storePriceChartDefaults() {
    return api.catalog?.storePriceChartDefaults?.() || {
      additionalSteamRegions: [],
      lowCriterion: "discount",
      lowReferenceScope: "currentRegular",
      lineColors: {},
    };
  }

  function transKey(id) {
    return `${TRANS_PREFIX}${id}`;
  }

  function aiKey(id) {
    return `${AI_PREFIX}${id}`;
  }

  function thirdPartyServicesKey(path) {
    return `${THIRD_PARTY_SERVICES_PREFIX}${path}`;
  }

  function reviewFilterDefaults() {
    return api.catalog?.reviewFilterDefaults?.() || {};
  }

  function reviewFilterKey(id) {
    return `${REVIEW_FILTER_PREFIX}${id}`;
  }

  function searchSuggestionDefaults() {
    return api.catalog?.searchSuggestionDefaults?.() || {
      limit: 5,
      nativeMode: "default",
    };
  }

  function searchSuggestionFields() {
    return api.catalog?.searchSuggestionFields?.() || [];
  }

  function searchSuggestionKey(id) {
    return `${SEARCH_SUGGESTION_PREFIX}${id}`;
  }

  function familyLibraryDefaults() {
    return api.catalog?.familyLibraryDefaults?.() || {
      refreshInterval: "1d",
      autoRefresh: true,
    };
  }

  function familyLibraryFields() {
    return api.catalog?.familyLibraryFields?.() || [];
  }

  function familyLibraryKey(id) {
    return `${FAMILY_LIBRARY_PREFIX}${id}`;
  }

  function normalizeFamilyLibrary(values) {
    const defs = familyLibraryDefaults();
    const fields = familyLibraryFields();
    const intervalField = fields.find(field => field.key === "refreshInterval") || {};
    const intervals = new Set((intervalField.options || []).map(opt => String(opt.value)));
    const refreshInterval = String(values?.refreshInterval ?? defs.refreshInterval);
    return {
      refreshInterval: intervals.has(refreshInterval) ? refreshInterval : defs.refreshInterval,
      autoRefresh: typeof values?.autoRefresh === "boolean" ? values.autoRefresh : defs.autoRefresh === true,
    };
  }

  function normalizeSearchSuggestions(values) {
    const defs = searchSuggestionDefaults();
    const fields = searchSuggestionFields();
    const limitField = fields.find(field => field.key === "limit") || {};
    const modeField = fields.find(field => field.key === "nativeMode") || {};
    const min = Number(limitField.min ?? 1);
    const max = Number(limitField.max ?? 10);
    const rawLimit = Number.parseInt(values?.limit ?? defs.limit, 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(Number.isFinite(min) ? min : 1, Math.min(Number.isFinite(max) ? max : 10, rawLimit))
      : defs.limit;
    const modes = new Set((modeField.options || []).map(opt => String(opt.value)));
    const nativeMode = String(values?.nativeMode ?? defs.nativeMode);
    return {
      limit,
      nativeMode: modes.has(nativeMode) ? nativeMode : defs.nativeMode,
    };
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? {}));
    } catch {
      return {};
    }
  }

  function getPath(src, path, fallback) {
    const parts = String(path || "").split(".").filter(Boolean);
    let cur = src;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !Object.hasOwn(cur, part)) {
        return fallback;
      }
      cur = cur[part];
    }
    return cur === undefined ? fallback : cur;
  }

  function setPath(target, path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) {
      return;
    }
    let cur = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!cur[part] || typeof cur[part] !== "object" || Array.isArray(cur[part])) {
        cur[part] = {};
      }
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function thirdPartyServicesPaths() {
    return [
      "enabled",
      "defaultProvider",
      "isthereanydeal.key",
      "isthereanydeal.country",
      "isthereanydeal.shops",
      "routes.prices",
      "routes.history",
      "routes.discountForecast",
    ];
  }

  function cleanItadShops(value) {
    const raw = Array.isArray(value)
      ? value
      : String(value ?? "").split(",");
    const parsed = raw
      .map(item => Number.parseInt(item, 10))
      .filter(item => Number.isFinite(item) && item > 0);
    const unknown = parsed.filter(item => !priceCatalog?.getItadPriceShop?.(item));
    if (unknown.length && !unknownShopMigrationLogged) {
      unknownShopMigrationLogged = true;
      log.warn("itad-shop-config-migrated", "已忽略目录外 ITAD 商店配置", {
        ignoredCount: new Set(unknown).size,
      });
    }
    const shops = parsed.filter(item => !!priceCatalog?.getItadPriceShop?.(item));
    return [61, ...Array.from(new Set(shops)).filter(item => item !== 61)];
  }

  function cleanItadCountry(value, fallbackValue = "auto") {
    const raw = String(value ?? (fallbackValue || "auto")).trim();
    if (!raw || raw.toLowerCase() === "auto") {
      return "auto";
    }
    return /^[a-z]{2}$/i.test(raw) ? raw.toUpperCase() : fallbackValue;
  }

  function normalizeThirdPartyServices(values) {
    const defs = thirdPartyServicesDefaults();
    const src = values && typeof values === "object" ? values : {};
    const itad = src.isthereanydeal && typeof src.isthereanydeal === "object" ? src.isthereanydeal : {};
    const defItad = defs.isthereanydeal || {};
    const routes = { ...(defs.routes || {}), ...(src.routes || {}) };
    const routeValue = (value) => String(value || "") === "isthereanydeal" ? "isthereanydeal" : "";

    return {
      enabled: src.enabled === true,
      defaultProvider: String(src.defaultProvider || defs.defaultProvider || "isthereanydeal") === "isthereanydeal" ? "isthereanydeal" : "isthereanydeal",
      isthereanydeal: {
        key: String(itad.key ?? defItad.key ?? "").trim(),
        country: cleanItadCountry(itad.country, defItad.country || "auto"),
        shops: cleanItadShops(itad.shops ?? defItad.shops),
      },
      routes: {
        prices: routeValue(routes.prices || "isthereanydeal") || "isthereanydeal",
        history: routeValue(routes.history || "isthereanydeal") || "isthereanydeal",
        discountForecast: routeValue(routes.discountForecast || "isthereanydeal") || "isthereanydeal",
      },
    };
  }

  function normalizeStorePriceChart(values, mainCountry = "") {
    const defs = storePriceChartDefaults();
    const src = values && typeof values === "object" && !Array.isArray(values) ? values : {};
    const main = String(mainCountry || "").trim().toUpperCase();
    const additionalSteamRegions = priceCatalog.limitStorePriceSelection({
      mainCountry: main,
      additionalSteamRegions: Array.isArray(src.additionalSteamRegions)
        ? src.additionalSteamRegions
        : defs.additionalSteamRegions || [],
      shops: [priceCatalog.STEAM_SHOP_ID],
    }).additionalSteamRegions;
    const lowCriterion = src.lowCriterion === "price" ? "price" : "discount";
    const lowReferenceScope = ["allRegular", "currentRegular", "recent12Months"].includes(src.lowReferenceScope)
      ? src.lowReferenceScope
      : "currentRegular";
    const lineColors = {};
    const inputColors = src.lineColors && typeof src.lineColors === "object" && !Array.isArray(src.lineColors)
      ? src.lineColors
      : {};
    for (const [key, value] of Object.entries(inputColors)) {
      const steamMatch = key.match(/^steam:([A-Z]{2})$/);
      const shopMatch = key.match(/^shop:(\d+)$/);
      const validKey = (steamMatch && priceCatalog?.getSteamPriceRegion?.(steamMatch[1]))
        || (shopMatch && priceCatalog?.getItadPriceShop?.(shopMatch[1]));
      const color = String(value || "").trim().toUpperCase();
      if (validKey && /^#[0-9A-F]{6}$/.test(color)) lineColors[key] = color;
    }
    return { additionalSteamRegions, lowCriterion, lowReferenceScope, lineColors };
  }

  function normalizeStorePriceChartSettings(values = {}) {
    const thirdPartyServices = normalizeThirdPartyServices(values.thirdPartyServices);
    const chartBeforeShopLimit = normalizeStorePriceChart(
      values.storePriceChart,
      thirdPartyServices.isthereanydeal.country,
    );
    const selection = priceCatalog.limitStorePriceSelection({
      mainCountry: thirdPartyServices.isthereanydeal.country,
      additionalSteamRegions: chartBeforeShopLimit.additionalSteamRegions,
      shops: thirdPartyServices.isthereanydeal.shops,
    });
    const limitedServices = {
      ...thirdPartyServices,
      isthereanydeal: {
        ...thirdPartyServices.isthereanydeal,
        shops: selection.shops,
      },
    };
    return {
      thirdPartyServices: limitedServices,
      storePriceChart: {
        ...chartBeforeShopLimit,
        additionalSteamRegions: selection.additionalSteamRegions,
      },
    };
  }

  function thirdPartyServicesData(values) {
    const next = normalizeThirdPartyServices(values);
    const data = {};
    for (const path of thirdPartyServicesPaths()) {
      data[thirdPartyServicesKey(path)] = clone(getPath(next, path, getPath(thirdPartyServicesDefaults(), path, "")));
    }
    return { next, data };
  }

  function normalizeMembership(value = {}, auth = {}) {
    return globalThis.STSettingsMembership?.normalize?.(value, auth) || {
      active: false,
      level: "",
      badge: "普通用户",
      identity: "赞助者身份",
      expire: "",
      features: { searchSuggestions: false },
      updatedAt: Date.now(),
    };
  }

  function normalizeLocale(value) {
    return globalThis.STI18n?.normalizeLocale?.(value) || (String(value || "") === "en" ? "en" : String(value || "") === "zh_TW" ? "zh_TW" : "zh_CN");
  }

  function area() {
    return chrome.storage.local;
  }

  function get(keys) {
    if (globalThis.STSettingsBus?.rawGet) {
      return globalThis.STSettingsBus.rawGet(keys, {
        owner: "settings:storage",
        reason: "settings-storage-read",
      });
    }
    const box = area();
    if (!box) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      try {
        box.get(keys, (rt) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(rt || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  function put(data, diagnostics = {}) {
    if (globalThis.STSettingsBus?.rawSet) {
      return globalThis.STSettingsBus.rawSet(data, {
        operationId: String(diagnostics?.operationId || ""),
        owner: "settings:storage",
        reason: "settings-storage-write",
      });
    }
    const box = area();
    if (!box) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      try {
        box.set(data, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  async function getAll() {
    const defs = defaults();
    const ids = Object.keys(defs);
    if (globalThis.STSettingsBus?.loadSettingsSnapshot) {
      return globalThis.STSettingsBus.loadSettingsSnapshot({
        owner: "settings:storage",
        ids,
        defaults: defs,
        force: false,
        reason: "settings-storage-get-all",
      });
    }
    const keys = ids.map(key);
    const rt = await get(keys);
    const out = {};

    for (const id of ids) {
      const value = rt[key(id)];
      out[id] = typeof value === "boolean" ? value : defs[id];
    }

    return out;
  }

  async function setAll(values) {
    const defs = defaults();
    const data = {};

    for (const id of Object.keys(defs)) {
      if (!Object.hasOwn(values || {}, id)) {
        continue;
      }
      data[key(id)] = Boolean(values[id]);
    }

    if (!Object.keys(data).length) {
      logSave("features", false, { reason: "empty" });
      return false;
    }

    const ok = await put(data);
    logSave("features", ok, { count: Object.keys(data).length });
    return ok;
  }

  async function set(id, enabled, diagnostics = {}) {
    const value = Boolean(enabled);
    const operationId = String(diagnostics?.operationId || "");
    try {
      const ok = await put({ [key(id)]: value }, { operationId });
      log[ok ? "info" : "warn"](ok ? "setting-toggle-success" : "setting-save-failed", ok ? "设置开关已保存" : "设置开关保存失败", {
        operationId,
        featureId: id,
        enabled: value,
      });
      return ok;
    } catch (error) {
      log.error("setting-save-failed", "设置开关保存异常", {
        operationId,
        featureId: id,
        enabled: value,
        error,
      });
      return false;
    }
  }

  async function getUiLocale() {
    const rt = await get([UI_LOCALE_KEY]);
    return normalizeLocale(rt[UI_LOCALE_KEY]);
  }

  async function setUiLocale(value, diagnostics = {}) {
    const locale = normalizeLocale(value);
    const operationId = String(diagnostics?.operationId || "");
    let ok = true;
    try {
      if (globalThis.STI18n?.setLocaleResult) {
        const result = await globalThis.STI18n.setLocaleResult(locale, { operationId });
        ok = result?.persisted === true;
      } else if (globalThis.STI18n?.setLocale) {
        await globalThis.STI18n.setLocale(locale, { operationId });
        ok = null;
      } else {
        ok = await put({ [UI_LOCALE_KEY]: locale }, { operationId });
      }
    } catch (error) {
      log.error("setting-save-failed", "界面语言保存异常", {
        operationId,
        kind: "ui-locale",
        locale,
        error,
      });
      return null;
    }
    if (ok === null) {
      return locale;
    }
    logSave("ui-locale", ok === true, { operationId, locale });
    return ok !== false ? locale : null;
  }

  async function getAuth() {
    const rt = await get([AUTH_KEY]);
    const value = rt[AUTH_KEY];
    return value && typeof value === "object" ? value : null;
  }

  async function setAuth(value, diagnostics = {}) {
    if (!value || typeof value !== "object") {
      return clearAuth(diagnostics);
    }
    const ok = await put({ [AUTH_KEY]: value }, diagnostics);
    if (!ok) {
      const error = new Error("登录状态保存失败");
      error.code = "AUTH_STORAGE_WRITE_FAILED";
      throw error;
    }
    return value;
  }

  function clearAuth(diagnostics = {}) {
    const operationId = String(diagnostics?.operationId || "");
    if (globalThis.STSettingsBus?.rawRemove) {
      return globalThis.STSettingsBus.rawRemove([AUTH_KEY, MEMBERSHIP_KEY], {
        operationId,
        owner: "settings:storage",
        reason: "auth-clear",
      });
    }
    const box = area();
    if (!box) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      try {
        box.remove([AUTH_KEY, MEMBERSHIP_KEY], () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  async function getMembership() {
    const rt = await get([MEMBERSHIP_KEY, AUTH_KEY]);
    return normalizeMembership(rt[MEMBERSHIP_KEY], rt[AUTH_KEY]);
  }

  async function setMembership(value, diagnostics = {}) {
    const rt = await get([AUTH_KEY]);
    const next = normalizeMembership(value, { access_token: "__snapshot__" });
    const operationId = String(diagnostics?.operationId || "");
    const ok = await put({ [MEMBERSHIP_KEY]: next }, { operationId });
    const visible = normalizeMembership(next, rt[AUTH_KEY]);
    log[ok ? "info" : "warn"](ok ? "membership-save-success" : "membership-save-failed", ok ? "会员状态已同步" : "会员状态同步失败", {
      operationId,
      active: visible.active,
      features: visible.features,
    });
    return ok ? visible : null;
  }

  async function getTranslate() {
    const defs = translateDefaults();
    const ids = Object.keys(defs);
    const keys = ids.map(transKey);
    const rt = await get(keys);
    const out = {};

    for (const id of ids) {
      const def = defs[id];
      const value = rt[transKey(id)];
      if (typeof def === "boolean") {
        out[id] = typeof value === "boolean" ? value : def;
      } else if (typeof def === "number") {
        const num = Number(value);
        out[id] = Number.isFinite(num) ? num : def;
      } else {
        out[id] = typeof value === "string" && (id !== "local" || value.trim())
          ? value
          : def;
      }
    }
    if (out.service === AI_SERVICE) {
      out.select = false;
    }

    return out;
  }

  async function setTranslate(values, diagnostics = {}) {
    const defs = translateDefaults();
    const data = {};
    const src = values?.service === AI_SERVICE
      ? { ...values, select: false }
      : values;

    for (const id of Object.keys(defs)) {
      if (!Object.hasOwn(src || {}, id)) {
        continue;
      }
      const def = defs[id];
      if (typeof def === "boolean") {
        data[transKey(id)] = Boolean(src[id]);
      } else if (typeof def === "number") {
        const num = Number(src[id] ?? def);
        data[transKey(id)] = Number.isFinite(num) ? num : def;
      } else {
        data[transKey(id)] = String(
          id === "local" && !String(src[id] ?? "").trim()
            ? def
            : src[id] ?? def
        );
      }
    }

    if (!Object.keys(data).length) {
      logSave("translate", false, { ...failureOperationMeta(false, diagnostics), reason: "empty" });
      return false;
    }

    const ok = await put(data, diagnostics);
    logSave("translate", ok, { ...failureOperationMeta(ok, diagnostics), count: Object.keys(data).length });
    return ok;
  }

  async function getReviewFilter() {
    const defs = reviewFilterDefaults();
    const ids = Object.keys(defs);
    const keys = ids.map(reviewFilterKey);
    const rt = await get(keys);
    const out = {};

    for (const id of ids) {
      const def = defs[id];
      const value = rt[reviewFilterKey(id)];
      if (typeof def === "boolean") {
        out[id] = typeof value === "boolean" ? value : def;
      } else if (typeof def === "number") {
        const num = Number(value);
        out[id] = Number.isFinite(num) ? num : def;
      } else if (Array.isArray(def)) {
        out[id] = Array.isArray(value) ? value : def;
      } else {
        out[id] = typeof value === "string" ? value : def;
      }
    }

    return out;
  }

  async function setReviewFilter(values, diagnostics = {}) {
    const defs = reviewFilterDefaults();
    const data = {};

    for (const id of Object.keys(defs)) {
      if (!Object.hasOwn(values || {}, id)) {
        continue;
      }
      const def = defs[id];
      if (typeof def === "boolean") {
        data[reviewFilterKey(id)] = Boolean(values[id]);
      } else if (typeof def === "number") {
        const num = Number(values[id] ?? def);
        data[reviewFilterKey(id)] = Number.isFinite(num) ? Math.max(0, num) : def;
      } else if (Array.isArray(def)) {
        data[reviewFilterKey(id)] = Array.isArray(values[id]) ? values[id] : def;
      } else {
        data[reviewFilterKey(id)] = String(values[id] ?? def);
      }
    }

    if (!Object.keys(data).length) {
      logSave("review-filter", false, { ...failureOperationMeta(false, diagnostics), reason: "empty" });
      return false;
    }

    const ok = await put(data, diagnostics);
    logSave("review-filter", ok, { ...failureOperationMeta(ok, diagnostics), count: Object.keys(data).length });
    return ok;
  }

  async function getSearchSuggestions() {
    const defs = searchSuggestionDefaults();
    const ids = Object.keys(defs);
    const keys = ids.map(searchSuggestionKey);
    const rt = await get(keys);
    const out = {};

    for (const id of ids) {
      out[id] = Object.hasOwn(rt, searchSuggestionKey(id)) ? rt[searchSuggestionKey(id)] : defs[id];
    }

    return normalizeSearchSuggestions(out);
  }

  async function setSearchSuggestions(values, diagnostics = {}) {
    const next = normalizeSearchSuggestions(values);
    const data = {};

    for (const id of Object.keys(searchSuggestionDefaults())) {
      data[searchSuggestionKey(id)] = next[id];
    }

    const ok = await put(data, diagnostics);
    logSave("search-suggestions", ok, { ...failureOperationMeta(ok, diagnostics), count: Object.keys(data).length });
    return ok ? next : false;
  }

  async function getFamilyLibrary() {
    const defs = familyLibraryDefaults();
    const ids = Object.keys(defs);
    const keys = ids.map(familyLibraryKey);
    const rt = await get(keys);
    const out = {};

    for (const id of ids) {
      out[id] = Object.hasOwn(rt, familyLibraryKey(id)) ? rt[familyLibraryKey(id)] : defs[id];
    }

    return normalizeFamilyLibrary(out);
  }

  async function setFamilyLibrary(values, diagnostics = {}) {
    const next = normalizeFamilyLibrary(values);
    const data = {};

    for (const id of Object.keys(familyLibraryDefaults())) {
      data[familyLibraryKey(id)] = next[id];
    }

    const ok = await put(data, diagnostics);
    logSave("family-library", ok, {
      ...failureOperationMeta(ok, diagnostics),
      refreshInterval: next.refreshInterval,
      autoRefresh: next.autoRefresh === true,
      count: Object.keys(data).length,
    });
    return ok ? next : false;
  }

  async function getAi() {
    const defs = aiDefaults();
    const ids = Object.keys(defs);
    const legacyAiKeys = ids.includes("aiConcurrency") ? [transKey("aiConcurrency")] : [];
    const keys = [...ids.map(aiKey), ...legacyAiKeys];
    const rt = await get(keys);
    const out = {};

    for (const id of ids) {
      const def = defs[id];
      const storeKey = aiKey(id);
      const value = id === "aiConcurrency" && !Object.hasOwn(rt, storeKey)
        ? rt[transKey("aiConcurrency")]
        : rt[storeKey];
      if (typeof def === "boolean") {
        out[id] = typeof value === "boolean" ? value : def;
      } else if (typeof def === "number") {
        const num = Number(value);
        out[id] = Number.isFinite(num) ? num : def;
      } else {
        out[id] = typeof value === "string" ? value : def;
      }
    }

    return globalThis.STAI?.normalize?.(out) || out;
  }

  async function setAi(values, diagnostics = {}) {
    const defs = aiDefaults();
    const data = {};
    const normalized = globalThis.STAI?.normalize?.({ ...defs, ...(values || {}) }) || {};

    for (const id of Object.keys(defs)) {
      if (!Object.hasOwn(values || {}, id)) {
        continue;
      }
      const def = defs[id];
      if (typeof def === "boolean") {
        data[aiKey(id)] = normalized[id] === true;
      } else if (typeof def === "number") {
        const num = Number(normalized[id] ?? values[id] ?? def);
        data[aiKey(id)] = Number.isFinite(num) ? num : def;
      } else {
        data[aiKey(id)] = String(normalized[id] ?? values[id] ?? def);
      }
    }

    if (!Object.keys(data).length) {
      logSave("ai", false, { ...failureOperationMeta(false, diagnostics), reason: "empty" });
      return false;
    }

    const ok = await put(data, diagnostics);
    logSave("ai", ok, { ...failureOperationMeta(ok, diagnostics), count: Object.keys(data).length });
    return ok;
  }

  async function getThirdPartyServices() {
    const defs = normalizeThirdPartyServices(thirdPartyServicesDefaults());
    const paths = thirdPartyServicesPaths();
    const keys = paths.map(thirdPartyServicesKey);
    const rt = await get(keys);
    const out = clone(defs);

    for (const path of paths) {
      const storeKey = thirdPartyServicesKey(path);
      if (Object.hasOwn(rt, storeKey)) {
        setPath(out, path, clone(rt[storeKey]));
      }
    }

    return normalizeThirdPartyServices(out);
  }

  async function setThirdPartyServices(values, diagnostics = {}) {
    const currentChart = await getStorePriceChart();
    const normalized = normalizeStorePriceChartSettings({
      thirdPartyServices: values,
      storePriceChart: currentChart,
    });
    const { next, data } = thirdPartyServicesData(normalized.thirdPartyServices);
    data[STORE_PRICE_CHART_KEY] = normalized.storePriceChart;

    const ok = await put(data, diagnostics);
    logSave("third-party-services", ok, {
      ...failureOperationMeta(ok, diagnostics),
      enabled: next.enabled === true,
      provider: next.defaultProvider,
      hasItadKey: String(next.isthereanydeal?.key || "").trim() !== "",
      count: Object.keys(data).length,
    });
    return ok ? next : false;
  }

  async function getStorePriceChart() {
    const [rt, services] = await Promise.all([
      get([STORE_PRICE_CHART_KEY]),
      getThirdPartyServices(),
    ]);
    return normalizeStorePriceChart(rt[STORE_PRICE_CHART_KEY], services.isthereanydeal?.country);
  }

  async function setStorePriceChart(values, diagnostics = {}) {
    const services = await getThirdPartyServices();
    const normalized = normalizeStorePriceChartSettings({
      thirdPartyServices: services,
      storePriceChart: values,
    });
    const { data } = thirdPartyServicesData(normalized.thirdPartyServices);
    const next = normalized.storePriceChart;
    data[STORE_PRICE_CHART_KEY] = next;
    const ok = await put(data, diagnostics);
    logSave("store-price-chart", ok, {
      ...failureOperationMeta(ok, diagnostics),
      additionalRegionCount: next.additionalSteamRegions.length,
      colorOverrideCount: Object.keys(next.lineColors).length,
      lowCriterion: next.lowCriterion,
      lowReferenceScope: next.lowReferenceScope,
    });
    return ok ? next : false;
  }

  async function setStorePriceChartSettings(values = {}, diagnostics = {}) {
    const rawServices = values.thirdPartyServices || await getThirdPartyServices();
    const mainCountry = rawServices?.isthereanydeal?.country === "auto"
      ? "CN"
      : rawServices?.isthereanydeal?.country;
    const servicesInput = clone(rawServices);
    servicesInput.isthereanydeal = {
      ...(servicesInput.isthereanydeal || {}),
      country: mainCountry,
    };
    const normalized = normalizeStorePriceChartSettings({
      thirdPartyServices: servicesInput,
      storePriceChart: values.storePriceChart,
    });
    const { next: thirdPartyServices, data } = thirdPartyServicesData(normalized.thirdPartyServices);
    const storePriceChart = normalized.storePriceChart;
    data[STORE_PRICE_CHART_KEY] = storePriceChart;

    const ok = await put(data, diagnostics);
    logSave("store-price-chart-settings", ok, {
      ...failureOperationMeta(ok, diagnostics),
      mainCountry: thirdPartyServices.isthereanydeal.country,
      shopCount: thirdPartyServices.isthereanydeal.shops.length,
      additionalRegionCount: storePriceChart.additionalSteamRegions.length,
      colorOverrideCount: Object.keys(storePriceChart.lineColors).length,
    });
    return ok ? { thirdPartyServices, storePriceChart } : false;
  }

  async function getRailPos() {
    const rt = await get([RAIL_TOP, RAIL_SIDE]);
    const top = Number(rt[RAIL_TOP]);
    const side = rt[RAIL_SIDE] === "left" ? "left" : "right";
    return {
      top: Number.isFinite(top) ? top : null,
      side,
    };
  }

  async function setRailPos(pos) {
    const top = Number(pos?.top);
    const side = pos?.side === "left" ? "left" : "right";
    if (!Number.isFinite(top)) {
      return null;
    }
    await put({
      [RAIL_TOP]: top,
      [RAIL_SIDE]: side,
    });
    return { top, side };
  }

  async function getBackupSections() {
    return {
      features: await getAll(),
      translate: await getTranslate(),
      ai: await getAi(),
      thirdPartyServices: await getThirdPartyServices(),
      storePriceChart: await getStorePriceChart(),
      reviewFilter: await getReviewFilter(),
      searchSuggestions: await getSearchSuggestions(),
      familyLibrary: await getFamilyLibrary(),
    };
  }

  async function setBackupSections(sections = {}) {
    const jobs = [
      setAll(sections.features || {}),
      setTranslate(sections.translate || {}),
      setAi(sections.ai || {}),
      setStorePriceChartSettings({
        thirdPartyServices: sections.thirdPartyServices || {},
        storePriceChart: sections.storePriceChart || {},
      }),
      setReviewFilter(sections.reviewFilter || {}),
      setSearchSuggestions(sections.searchSuggestions || {}),
      setFamilyLibrary(sections.familyLibrary || {}),
    ];
    const out = await Promise.all(jobs);
    return out.every(value => value !== false);
  }

  api.storage = Object.freeze({
    key,
    UI_LOCALE_KEY,
    getAll,
    setAll,
    set,
    getUiLocale,
    setUiLocale,
    getAuth,
    setAuth,
    clearAuth,
    MEMBERSHIP_KEY,
    normalizeMembership,
    getMembership,
    setMembership,
    getTranslate,
    setTranslate,
    getReviewFilter,
    setReviewFilter,
    SEARCH_SUGGESTION_PREFIX,
    getSearchSuggestions,
    setSearchSuggestions,
    FAMILY_LIBRARY_PREFIX,
    getFamilyLibrary,
    setFamilyLibrary,
    getAi,
    setAi,
    getThirdPartyServices,
    setThirdPartyServices,
    STORE_PRICE_CHART_KEY,
    normalizeStorePriceChart,
    getStorePriceChart,
    setStorePriceChart,
    setStorePriceChartSettings,
    getRailPos,
    setRailPos,
    getBackupSections,
    setBackupSections,
  });
})();
