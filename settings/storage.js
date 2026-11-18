/*
 * @Author        : Ricky
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
  const AI_PREFIX = `${PREFIX}ai.`;
  const THIRD_PARTY_SERVICES_PREFIX = `${PREFIX}thirdPartyServices.`;
  const STORE_PRICE_CHART_KEY = `${PREFIX}storePriceChart`;
  const GAME_LINKS_KEY = "st.settings.gameLinks";
  const UI_LOCALE_KEY = globalThis.STI18n?.STORAGE_KEY || api.catalog?.UI_LOCALE_KEY || "SETTING_UI_LOCALE";
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = globalThis.STSettingsMembership?.KEY || "steam_buff_membership";
  // 退出登录必须同时切断设置云同步通道，避免下一账号沿用密钥和 revision
  // 独立名称按账号分槽留在本地，退出时不删除
  const CLOUD_CHANNEL_KEYS = Object.freeze([
    "st.settings.cloud.enabled",
    "st.settings.cloud.secret",
    "st.settings.cloud.syncMeta",
  ]);
  const AUTH_CLEAR_KEYS = Object.freeze([AUTH_KEY, MEMBERSHIP_KEY, ...CLOUD_CHANNEL_KEYS]);
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
    const control = api.catalog?.valueControl?.(id);
    if (control) {
      return `${PREFIX}${id}.value`;
    }
    return `${PREFIX}${id}${SUFFIX}`;
  }

  function normalizeStored(id, value, fallback) {
    const control = api.catalog?.valueControl?.(id);
    if (control === "choice") {
      const allowed = new Set((api.catalog?.featureById?.(id)?.options || []).map((option) => String(option.value)));
      const next = typeof value === "string" ? value : "";
      if (next && allowed.has(next)) {
        return next;
      }
      return typeof fallback === "string" && fallback ? fallback : next;
    }
    if (control === "order") {
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch (error) {
          globalThis.STLoggerFactory.reportError(error, { domain: "settings", feature: "storage", event: "normalize-stored-failed", message: "设置中心处理失败", level: "warn", phase: "normalizeStored" });
          value = null;
        }
      }
      const allowed = new Set((api.catalog?.featureById?.(id)?.options || []).map((option) => option.value));
      const source = Array.isArray(value) ? value : [];
      const out = [];
      for (const item of source) {
        if (allowed.has(item) && !out.includes(item)) {
          out.push(item);
        }
      }
      for (const item of Array.isArray(fallback) ? fallback : []) {
        if (allowed.has(item) && !out.includes(item)) {
          out.push(item);
        }
      }
      return out;
    }
    return typeof value === "boolean" ? value : fallback;
  }

  function localeOf(value) {
    if (typeof globalThis.STI18n?.normalizeLocale === "function") {
      return globalThis.STI18n.normalizeLocale(value);
    }
    if (typeof api.panelSnapshot?.localeOf === "function") {
      return api.panelSnapshot.localeOf(value);
    }
    return "zh_CN";
  }

  function defaults() {
    return api.catalog?.defaults?.() || {};
  }

  function translateDefaults() {
    return api.catalog?.translateDefaults?.() || {};
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
      lowCriterion: "api",
      lowReferenceScope: "currentRegular",
      lowOccurrence: "latest",
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

  /** 统一规范第三方服务配置；可传入目录默认值，返回独立配置对象，不写存储 */
  function normalizeThirdPartyServices(values, defaults = thirdPartyServicesDefaults()) {
    const defs = defaults && typeof defaults === "object" ? defaults : {};
    const src = values && typeof values === "object" ? values : {};
    const itad = src.isthereanydeal && typeof src.isthereanydeal === "object" ? src.isthereanydeal : {};
    const defItad = defs.isthereanydeal || {};

    return {
      enabled: src.enabled === true,
      defaultProvider: "isthereanydeal",
      isthereanydeal: {
        key: String(itad.key ?? defItad.key ?? "").trim(),
        country: cleanItadCountry(itad.country, defItad.country || "auto"),
        shops: cleanItadShops(itad.shops ?? defItad.shops),
      },
      routes: {
        prices: "isthereanydeal",
        history: "isthereanydeal",
        discountForecast: "isthereanydeal",
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
    const lowCriterion = ["api", "discount", "price"].includes(src.lowCriterion)
      ? src.lowCriterion
      : "api";
    const lowReferenceScope = ["allRegular", "currentRegular", "recent12Months"].includes(src.lowReferenceScope)
      ? src.lowReferenceScope
      : "currentRegular";
    const lowOccurrence = ["latest", "earliest"].includes(src.lowOccurrence)
      ? src.lowOccurrence
      : "latest";
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
    return { additionalSteamRegions, lowCriterion, lowReferenceScope, lowOccurrence, lineColors };
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

  function thirdPartyServicesData(next) {
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
      badge: "",
      identity: "",
      expire: "",
      permissions: {
        customNames: false,
        gameNotes: false,
        priceMonitor: false,
        searchSuggestions: false,
      },
      features: {
        customNames: false,
        gameNotes: false,
        priceMonitor: false,
        searchSuggestions: false,
      },
      updatedAt: Date.now(),
    };
  }

  function area() {
    return chrome.storage.local;
  }

  function get(keys, options = {}) {
    if (globalThis.STSettingsBus?.rawGet) {
      return globalThis.STSettingsBus.rawGet(keys, {
        owner: "settings:storage",
        reason: "settings-storage-read",
        strict: options.strict === true,
      });
    }
    const box = area();
    if (!box) {
      if (options.strict === true) return Promise.reject(new Error("本地设置存储不可用"));
      return Promise.resolve({});
    }

    return new Promise((resolve, reject) => {
      try {
        box.get(keys, (rt) => {
          if (chrome.runtime.lastError) {
            if (options.strict === true) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve({});
            return;
          }
          resolve(rt || {});
        });
      } catch (error) {
        if (options.strict === true) {
          reject(error);
          return;
        }
        globalThis.STLoggerFactory.reportError(error, { domain: "settings", feature: "storage", event: "get-failed", message: "读取本地设置失败", level: "warn", phase: "get" });
        resolve({});
      }
    });
  }

  function put(data, diagnostics = {}) {
    if (globalThis.STSettingsBus?.rawSet) {
      return globalThis.STSettingsBus.rawSet(data, {
        operationId: String(diagnostics?.operationId || ""),
        owner: "settings:storage",
        reason: String(diagnostics?.reason || "settings-storage-write"),
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
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "settings", feature: "storage", event: "put-failed", message: "保存本地设置失败", level: "error", phase: "put" });
        resolve(false);
      }
    });
  }

  /**
   * 读取并归一化功能开关；force 绕过快照缓存，strict 要求本次存储读取成功，失败交由调用方处理。
   * strict 同时绕过缓存；成功读取时未保存的键仍使用目录默认值，不传选项保持原行为。
   */
  async function getAll(options = {}) {
    const defs = defaults();
    const ids = Object.keys(defs);
    if (globalThis.STSettingsBus?.loadSettingsSnapshot) {
      return globalThis.STSettingsBus.loadSettingsSnapshot({
        owner: "settings:storage",
        ids,
        defaults: defs,
        force: options.force === true,
        strict: options.strict === true,
        reason: "settings-storage-get-all",
      });
    }
    const keys = ids.map(key);
    const rt = await get(keys, { strict: options.strict === true });
    const out = {};

    for (const id of ids) {
      const value = rt[key(id)];
      out[id] = normalizeStored(id, value, defs[id]);
    }

    return out;
  }

  async function setAll(values, diagnostics = {}) {
    const defs = defaults();
    const data = {};

    for (const id of Object.keys(defs)) {
      if (!Object.hasOwn(values || {}, id)) {
        continue;
      }
      if (api.catalog?.valueControl?.(id) === "order") {
        data[key(id)] = JSON.stringify(normalizeStored(id, values[id], defs[id]));
      } else if (api.catalog?.valueControl?.(id) === "choice") {
        data[key(id)] = normalizeStored(id, values[id], defs[id]);
      } else {
        data[key(id)] = Boolean(values[id]);
      }
    }

    if (!Object.keys(data).length) {
      logSave("features", false, { reason: "empty" });
      return false;
    }

    const ok = await put(data, diagnostics);
    logSave("features", ok, { count: Object.keys(data).length });
    return ok;
  }

  async function set(id, enabled, diagnostics = {}) {
    const control = api.catalog?.valueControl?.(id);
    const defs = defaults();
    const value = control
      ? (control === "order" ? JSON.stringify(normalizeStored(id, enabled, defs[id])) : normalizeStored(id, enabled, defs[id]))
      : Boolean(enabled);
    const operationId = String(diagnostics?.operationId || "");
    try {
      const ok = await put({ [key(id)]: value }, { ...diagnostics, operationId });
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

  /** 更新频率只接受已公布选项，缺失配置采用六小时，读取异常不覆盖用户已有值 */
  async function getUpdateCheck() {
    const contract = globalThis.STConfig.updates;
    const data = await get([contract.settingKey], { strict: true });
    return { hours: contract.hours(data[contract.settingKey]) };
  }

  async function setUpdateCheck(value, diagnostics = {}) {
    const contract = globalThis.STConfig.updates;
    const hours = contract.hours(value.hours);
    const ok = await put({ [contract.settingKey]: hours }, diagnostics);
    logSave("update-check", ok, { hours, ...failureOperationMeta(ok, diagnostics) });
    if (!ok) throw new Error("检查更新频率保存失败");
    return true;
  }

  async function getUiLocale() {
    const rt = await get([UI_LOCALE_KEY]);
    return localeOf(rt[UI_LOCALE_KEY]);
  }

  async function setUiLocale(value, diagnostics = {}) {
    const locale = localeOf(value);
    const operationId = String(diagnostics?.operationId || "");
    let ok = true;
    try {
      if (globalThis.STI18n?.setLocaleResult) {
        const result = await globalThis.STI18n.setLocaleResult(locale, { ...diagnostics, operationId });
        ok = result?.persisted === true;
      } else if (globalThis.STI18n?.setLocale) {
        await globalThis.STI18n.setLocale(locale, { operationId });
        ok = null;
      } else {
        ok = await put({ [UI_LOCALE_KEY]: locale }, { ...diagnostics, operationId });
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

  // 一次读出令牌和会员 userId，认证请求绑定身份时不能拆成两次读取
  async function getAuthIdentity() {
    const rt = await get([AUTH_KEY, MEMBERSHIP_KEY]);
    const auth = rt[AUTH_KEY] && typeof rt[AUTH_KEY] === "object" ? rt[AUTH_KEY] : null;
    const membership = rt[MEMBERSHIP_KEY] && typeof rt[MEMBERSHIP_KEY] === "object" ? rt[MEMBERSHIP_KEY] : null;
    return {
      auth,
      userId: String(membership?.userId || membership?.user?.id || "").trim(),
    };
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
      return globalThis.STSettingsBus.rawRemove([...AUTH_CLEAR_KEYS], {
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
        box.remove([...AUTH_CLEAR_KEYS], () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "settings", feature: "storage", event: "clear-auth-failed", message: "设置中心处理失败", level: "warn", phase: "clearAuth", operationId });
        resolve(false);
      }
    });
  }

  async function workflowPermissionSession(snapshot, auth) {
    const session = snapshot?.workflowSession;
    if (!session || typeof snapshot.permissions?.workflowAdvanced !== "boolean") return "";
    return session === await globalThis.STAuthSession.fingerprint(auth) ? session : "";
  }

  async function getMembership() {
    const rt = await get([MEMBERSHIP_KEY, AUTH_KEY]);
    const raw = rt[MEMBERSHIP_KEY], auth = rt[AUTH_KEY];
    const membership = normalizeMembership(raw, auth);
    if (typeof membership.permissions.workflowAdvanced === "boolean" && (auth?.access_token || auth?.refresh_token) &&
      !await workflowPermissionSession(raw, auth)) {
      delete membership.permissions.workflowAdvanced;
    }
    return membership;
  }

  async function setMembership(value, diagnostics = {}) {
    const expectedOwner = String(diagnostics?.ownerId || "").trim();
    const expectedSession = String(diagnostics?.sessionKey || "").trim();
    if (expectedOwner || expectedSession) {
      const identity = await getAuthIdentity();
      const currentSession = globalThis.STAuthSession?.authKey?.(identity.auth) || "";
      if ((expectedOwner && identity.userId !== expectedOwner)
        || (expectedSession && currentSession !== expectedSession)) {
        return null;
      }
    }
    const rt = await get([AUTH_KEY, MEMBERSHIP_KEY]);
    const next = normalizeMembership(value, { access_token: "__snapshot__" });
    if (expectedSession) {
      if (globalThis.STAuthSession.authKey(rt[AUTH_KEY]) !== expectedSession) return null;
      if (typeof next.permissions.workflowAdvanced === "boolean") next.workflowSession = await globalThis.STAuthSession.fingerprint(rt[AUTH_KEY]);
    } else {
      // 其他功能更新权益快照时，仅保留当前会话已确认的自动化权限
      const previous = rt[MEMBERSHIP_KEY], session = await workflowPermissionSession(previous, rt[AUTH_KEY]);
      if (session) {
        next.workflowSession = session;
        next.permissions.workflowAdvanced = previous.permissions.workflowAdvanced;
      } else delete next.permissions.workflowAdvanced;
    }
    const operationId = String(diagnostics?.operationId || "");
    const ok = await put({ [MEMBERSHIP_KEY]: next }, { operationId });
    const visible = normalizeMembership(next, rt[AUTH_KEY]);
    log[ok ? "info" : "warn"](ok ? "membership-save-success" : "membership-save-failed", ok ? "会员状态已同步" : "会员状态同步失败", {
      operationId,
      active: visible.active,
      permissions: visible.permissions,
    });
    return ok ? visible : null;
  }

  async function getTranslate({ storedBindings = false } = {}) {
    const defs = translateDefaults();
    const ids = Object.keys(defs);
    const keys = ids.map(transKey);
    const rt = await get(keys, { strict: true });
    const bindings = storedBindings ? globalThis.STAI.translationDefaults() : {};
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
          : Object.hasOwn(bindings, id) ? "" : def;
      }
    }
    if (out.service === AI_SERVICE) {
      out.select = false;
    }

    return out;
  }

  function translatePatch(values) {
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

    return data;
  }

  async function configureAi(action, value, diagnostics = {}) {
    const message = { type: "AUTOMATION", action, value, operationId: diagnostics.operationId };
    if (globalThis.STBackgroundAutomation) return globalThis.STBackgroundAutomation.configureAi(message, diagnostics);
    const response = await globalThis.STMessageBus.request(message, { timeoutMs: 120000, logFailures: false });
    if (response?.success !== true) throw new Error(response?.error || "AI 与翻译设置保存失败");
    return response.value;
  }

  async function setTranslate(values, diagnostics = {}) {
    await configureAi("save-translate", values, diagnostics);
    return true;
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

  async function getAiFlags() {
    const ai = globalThis.STAI;
    return ai.flagsFromStorage(await get(ai.FLAG_KEYS, { strict: true }));
  }

  /** 等待后台完成 AI 及其绑定的初始化。失败时交由设置面板或备份入口处理 */
  async function waitForAiSettings() {
    if (globalThis.STBackgroundAutomation) {
      await globalThis.STBackgroundAutomation.ready();
      return;
    }
    const response = await globalThis.STMessageBus.request({ type: "AUTOMATION", action: "settings-ready" }, { logFailures: false });
    if (response?.success !== true) throw new Error(response?.error || "AI 设置初始化失败");
  }

  async function getAi() {
    const ai = globalThis.STAI;
    return ai.servicesFromStorage(await get(ai.SETTINGS_KEYS, { strict: true }));
  }

  function setAi(values, diagnostics = {}) {
    return configureAi("save-ai-services", values, diagnostics);
  }

  /** 三处关联配置在后台串行校验后一次写入，避免迁移或导入留下悬空引用 */
  async function writeAiSettings({ ai, translate, workflow, familyFeature, familySettings }, diagnostics = {}) {
    const data = translate ? translatePatch(translate) : {};
    if (ai) {
      const { enabled, aiConcurrency, ...registry } = ai;
      if (typeof enabled === "boolean") data[aiKey("enabled")] = enabled;
      if (typeof aiConcurrency === "number") data[aiKey("aiConcurrency")] = aiConcurrency;
      data[globalThis.STAI.SERVICES_KEY] = registry;
    }
    if (workflow) data[globalThis.STAutomation.KEY] = workflow;
    if (typeof familyFeature === "boolean") data[key("family-library-owned-marker")] = familyFeature;
    if (familySettings) {
      const keys = globalThis.STFamilyLibrary.SETTINGS_KEYS;
      for (const [field, value] of Object.entries(familySettings)) data[keys[field]] = value;
    }
    if (!Object.keys(data).length || !(await put(data, diagnostics))) throw new Error("AI、翻译与自动化配置写入失败");
  }

  async function getThirdPartyServices() {
    const defs = thirdPartyServicesDefaults();
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
      lowOccurrence: next.lowOccurrence,
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

  async function getPanelSettings(options = {}) {
    await waitForAiSettings();
    const [
      features,
      uiLocale,
      updateCheck,
      storePriceChart,
      gameLinks,
      searchSuggestions,
      reviewFilter,
      translate,
      ai,
      thirdPartyServices,
    ] = await Promise.all([
      getAll(),
      getUiLocale(),
      getUpdateCheck(),
      getStorePriceChart(),
      getGameLinks(),
      getSearchSuggestions(),
      getReviewFilter(),
      getTranslate(),
      getAi(),
      getThirdPartyServices(),
    ]);
    const out = {
      features,
      uiLocale,
      updateCheck,
      storePriceChart,
      gameLinks,
      searchSuggestions,
      reviewFilter,
      translate,
      ai,
      thirdPartyServices,
    };
    if (options.workflow === true) out.workflow = await getWorkflow();
    return out;
  }

  async function setPanelSettings(sections = {}, diagnostics = {}) {
    const updateCheck = sections.updateCheck === undefined ? { hours: globalThis.STConfig.updates.defaultHours } : sections.updateCheck;
    if (!updateCheck || typeof updateCheck !== "object") throw new TypeError("更新频率配置格式错误");
    globalThis.STConfig.updates.hours(updateCheck.hours);
    const { ai: aiEnabled, "family-library-owned-marker": familyFeature, ...features } = sections.features || {};
    const ai = sections.ai ?? (typeof aiEnabled === "boolean"
      ? { ...globalThis.STAI.normalizeServices(), enabled: aiEnabled } : undefined);
    await configureAi("apply-ai-settings", {
      ai, translate: sections.translate, workflow: sections.workflow,
      familyFeature, familySettings: sections.familyLibrary,
    }, diagnostics);
    const jobs = [
      setAll(features, diagnostics),
      setUiLocale(sections.uiLocale, diagnostics),
      setUpdateCheck(updateCheck, diagnostics),
      setGameLinks(sections.gameLinks, diagnostics),
      setSearchSuggestions(sections.searchSuggestions || {}, diagnostics),
      setReviewFilter(sections.reviewFilter || {}, diagnostics),
      setStorePriceChartSettings({
        thirdPartyServices: sections.thirdPartyServices || {},
        storePriceChart: sections.storePriceChart || {},
      }, diagnostics),
    ];
    const out = await Promise.all(jobs);
    return out.every(value => value !== false);
  }

  /** 相关链接采用严格配置契约，读取异常交由页面或备份入口提示，不静默覆盖已有配置。 */
  async function getGameLinks() {
    const rt = await get([GAME_LINKS_KEY], { strict: true });
    return globalThis.STGameLinks.normalize(rt[GAME_LINKS_KEY]);
  }

  async function setGameLinks(values, diagnostics = {}) {
    const next = globalThis.STGameLinks.normalize(values);
    const ok = await put({ [GAME_LINKS_KEY]: next }, diagnostics);
    return ok ? next : false;
  }

  async function getWorkflow() {
    const model = globalThis.STAutomation;
    const data = await get([model.KEY], { strict: true });
    return model.normalize(Object.hasOwn(data, model.KEY) ? data[model.KEY] : model.defaults());
  }

  /** 2.2.2 的下载开关独立于工作流配置 */
  async function initializeDownloadToolbar() {
    const toolbar = key("download-manager-enhancement");
    const toggles = [key("download-auto-shutdown"), key("download-batch-actions")];
    const stored = await get([toolbar, ...toggles], { strict: true });
    if (Object.hasOwn(stored, toolbar) || !toggles.some(id => Object.hasOwn(stored, id))) return;
    if (!await put({ [toolbar]: toggles.some(id => stored[id] !== false) }, { reason: "initialize-download-toolbar" }))
      throw new Error("下载工具栏设置迁移失败");
  }

  async function initializeWorkflow() {
    const model = globalThis.STAutomation, aiConfig = globalThis.STAI, family = globalThis.STFamilyLibrary;
    const defaults = aiConfig.translationDefaults(), familyFeatureKey = key("family-library-owned-marker");
    const installedVersionKey = globalThis.STLifecyclePromptContract.installedVersionKey;
    const legacyKeys = aiConfig.V222_CONNECTION_FIELDS.map(aiKey);
    const stored = await get([model.KEY, familyFeatureKey, installedVersionKey, ...Object.values(family.SETTINGS_KEYS),
      ...aiConfig.SETTINGS_KEYS, ...legacyKeys, ...Object.keys(defaults).map(transKey)], { strict: true });
    const hasRegistry = Object.hasOwn(stored, aiConfig.SERVICES_KEY);
    const flags = aiConfig.flagsFromStorage(stored);
    const legacy = hasRegistry ? undefined : aiConfig.migrateV222Service({
      ...flags,
      ...Object.fromEntries(aiConfig.V222_CONNECTION_FIELDS.filter(field => Object.hasOwn(stored, aiKey(field)))
        .map(field => [field, stored[aiKey(field)]])),
    });
    const released = !!legacy || family.hasReleasedSchedule(stored[installedVersionKey]);
    const familySettings = !Object.hasOwn(stored, model.KEY) && family.releasedSettings(stored, released);
    let workflow;
    if (!Object.hasOwn(stored, model.KEY)) {
      workflow = model.defaults();
      if (familySettings) workflow = model.restoreFamilySchedule(workflow, familySettings,
        stored[familyFeatureKey] !== false && globalThis.STClientEnvironment.isSteamClientRuntime(), true);
    }
    const ai = hasRegistry ? undefined : legacy ?? { ...aiConfig.normalizeServices(), ...flags };
    const translate = workflow || ai
      ? Object.fromEntries(Object.entries(defaults).filter(([id]) => !Object.hasOwn(stored, transKey(id))))
      : undefined;
    if (workflow || ai) await writeAiSettings({ workflow, ai, translate, familySettings }, { reason: "initialize-workflow" });
    if (legacy) log.info("ai-v222-config-migrated", "2.2.2 AI 连接已迁移到默认服务");
  }

  async function setWorkflow(values, diagnostics = {}) {
    const next = globalThis.STAutomation.normalize(values);
    if (globalThis.STBackgroundAutomation)
      return globalThis.STBackgroundAutomation.saveConfig(next, {
        operationId: diagnostics.operationId,
        replace: diagnostics.replaceWorkflow === true,
      });
    const response = await globalThis.STMessageBus.request(
      {
        type: globalThis.STAutomation.ROUTE,
        action: diagnostics.replaceWorkflow === true ? "replace-config" : "save-config",
        value: next,
        operationId: diagnostics.operationId,
      },
      { timeoutMs: 120000, logFailures: false },
    );
    if (response?.success !== true) throw new Error(response?.error || "自动化配置保存失败");
    if (response.value.steamPending) diagnostics.onSteamPending?.();
    return response.value.workflow;
  }

  api.storage = Object.freeze({
    key,
    UI_LOCALE_KEY,
    getAll,
    setAll,
    set,
    getUiLocale,
    setUiLocale,
    getUpdateCheck,
    setUpdateCheck,
    getAuth,
    getAuthIdentity,
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
    getAi,
    getAiFlags,
    waitForAiSettings,
    setAi,
    writeAiSettings,
    getThirdPartyServices,
    setThirdPartyServices,
    normalizeThirdPartyServices,
    STORE_PRICE_CHART_KEY,
    normalizeStorePriceChart,
    getStorePriceChart,
    setStorePriceChart,
    setStorePriceChartSettings,
    getGameLinks,
    setGameLinks,
    getWorkflow,
    initializeWorkflow,
    initializeDownloadToolbar,
    setWorkflow,
    getRailPos,
    setRailPos,
    getPanelSettings,
    setPanelSettings,
  });
})();
