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
  const STEAM_WEB_API_KEY = "st.credentials.steamWebApi.apiKey";
  const STORE_PRICE_CHART_KEY = `${PREFIX}storePriceChart`;
  const GAME_LINKS_KEY = "st.settings.gameLinks";
  const SETUP_KEY = "st.settings.setup.locale";
  const UI_LOCALE_KEY = globalThis.STI18n?.STORAGE_KEY || api.catalog?.UI_LOCALE_KEY || "SETTING_UI_LOCALE";
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = globalThis.STSettingsMembership?.KEY || "steam_buff_membership";
  // 退出登录同时移除当前账号的备份目标、凭据和修订状态
  // 独立名称按账号分槽留在本地，退出时不删除
  const CLOUD_CHANNEL_KEYS = Object.freeze([
    "st.settings.cloud.enabled",
    "st.settings.cloud.secret",
    "st.settings.cloud.syncMeta",
    "st.settings.cloud.channelV2",
    "st.settings.cloud.metaV2",
    "st.settings.cloud.channelV3",
    "st.settings.cloud.metaV3",
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
    if (control === "prompt") return value === undefined ? fallback : globalThis.STAI.isPromptId(value) ? value : "";
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

  function localeOf(value, fallback = "zh_CN") {
    if (typeof value !== "string") return fallback;
    if (typeof globalThis.STI18n?.normalizeLocale === "function") {
      return globalThis.STI18n.normalizeLocale(value, fallback);
    }
    if (typeof api.panelSnapshot?.localeOf === "function") {
      return api.panelSnapshot.localeOf(value, fallback);
    }
    return fallback;
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

  async function put(data, diagnostics = {}) {
    if (diagnostics.beforeCloudWrite) await diagnostics.beforeCloudWrite();
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
      } else if (["choice", "prompt"].includes(api.catalog?.valueControl?.(id))) {
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

  async function getUiLocale(options = {}) {
    const rt = await get([UI_LOCALE_KEY], options);
    if (options.confirmed && !Object.hasOwn(rt, UI_LOCALE_KEY)) return null;
    return localeOf(rt[UI_LOCALE_KEY]);
  }

  /** 向导只读取显示语言和首次设置标记；读取本身不生成模板。 */
  async function getOnboardingState() {
    const data = await get([UI_LOCALE_KEY, SETUP_KEY], { strict: true });
    const selected = localeOf(data[UI_LOCALE_KEY], "");
    return {
      locale: selected || "zh_CN",
      confirmed: Boolean(selected),
      setupComplete: Boolean(data[SETUP_KEY]),
    };
  }

  async function setUiLocale(value, diagnostics = {}) {
    const locale = localeOf(value);
    const operationId = String(diagnostics?.operationId || "");
    let ok;
    if (globalThis.STI18n?.setLocaleResult) {
      const result = await globalThis.STI18n.setLocaleResult(locale, { ...diagnostics, operationId });
      ok = result?.persisted === true;
    } else if (globalThis.STI18n?.setLocale) {
      await globalThis.STI18n.setLocale(locale, { operationId });
      return locale;
    } else {
      ok = await put({ [UI_LOCALE_KEY]: locale }, { ...diagnostics, operationId });
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
  async function getAuthIdentity(options = {}) {
    const rt = await get([AUTH_KEY, MEMBERSHIP_KEY], options);
    const auth = rt[AUTH_KEY] && typeof rt[AUTH_KEY] === "object" ? rt[AUTH_KEY] : null;
    const membership = rt[MEMBERSHIP_KEY] && typeof rt[MEMBERSHIP_KEY] === "object" ? rt[MEMBERSHIP_KEY] : null;
    return {
      auth,
      userId: String(membership?.userId || membership?.user?.id || "").trim(),
      ...(options.withSettingsCloud === true && {
        settingsCloud: normalizeMembership(membership, auth).permissions.settingsCloud === true,
      }),
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

  async function getMembership(options = {}) {
    const rt = await get([MEMBERSHIP_KEY, AUTH_KEY], options);
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

  // 每次工作流运行固定一次语种，仅取与目标有关的三个设置。
  async function getAiTargetLanguage() {
    const target = transKey("to"), mode = transKey("aiTarget");
    const saved = await get([target, mode, UI_LOCALE_KEY], { strict: true });
    return saved[mode] === "display" ? globalThis.STI18n.translationLanguage(saved[UI_LOCALE_KEY])
      : saved[target] || translateDefaults().to;
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
    if (response?.success !== true) throw Object.assign(new Error(response?.error || "AI 与翻译设置保存失败"), { code: response?.errorCode });
    return response.value;
  }

  async function setTranslate(values, diagnostics = {}) {
    await configureAi("save-translate", values, diagnostics);
    return true;
  }

  function setChatPreferences(values, diagnostics = {}) {
    return configureAi("save-chat-preferences", values, diagnostics);
  }

  async function getReviewFilter() {
    const defs = reviewFilterDefaults();
    const ids = Object.keys(defs);
    const keys = ids.map(reviewFilterKey);
    const rt = await get(keys, { strict: true });
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

  async function getSearchSuggestions(options = {}) {
    const defs = searchSuggestionDefaults();
    const ids = Object.keys(defs);
    const keys = ids.map(searchSuggestionKey);
    const rt = await get(keys, options);
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
  async function waitForAiSettings({ retry = false } = {}) {
    if (globalThis.STBackgroundAutomation) {
      return globalThis.STBackgroundAutomation.ready({ retry });
    }
    const response = await globalThis.STMessageBus.request({ type: "AUTOMATION", action: "settings-ready", ...(retry ? { retry: true } : {}) }, { logFailures: false });
    if (response?.success !== true)
      throw Object.assign(new Error(response?.error || "AI 设置初始化失败"), { code: response?.errorCode });
    return response.value;
  }

  async function getAi() {
    const ai = globalThis.STAI;
    return ai.servicesFromStorage(await get(ai.SETTINGS_KEYS, { strict: true }));
  }

  function setAi(values, diagnostics = {}) {
    return configureAi("save-ai-services", values, diagnostics);
  }

  // 搜索凭据独立存于本机，AI 服务备份与云同步均不读取此键。
  async function readAiSearch() {
    const key = globalThis.STConfig.aiSearchKey;
    return (await get([key], { strict: true }))[key];
  }

  async function getAiSearch() {
    return globalThis.STAI.normalizeSearchSettings(await readAiSearch());
  }

  async function getAiSearchState() {
    return globalThis.STAI.searchSettingsState(await readAiSearch());
  }

  async function setAiSearch(settings, diagnostics) {
    const value = globalThis.STAI.normalizeSearchSettings(settings);
    if (!await put({ [globalThis.STConfig.aiSearchKey]: value }, diagnostics))
      throw new Error("保存搜索服务失败");
  }

  /** 三处关联配置在后台串行校验后一次写入，避免迁移或导入留下悬空引用 */
  async function writeAiSettings({ ai, translate, workflow, familyFeature, familySettings, setupLocale, gameLinks, finishPendingConnection, toolCredentials, chatPromptId, aiSearch }, diagnostics = {}) {
    const data = translate ? translatePatch(translate) : {};
    if (ai) {
      const model = globalThis.STAI;
      const { enabled, aiConcurrency, ...registry } = model.serviceSettings(ai);
      if (typeof enabled === "boolean") data[aiKey("enabled")] = enabled;
      if (typeof aiConcurrency === "number") data[aiKey("aiConcurrency")] = aiConcurrency;
      const existing = diagnostics.onboardingOnly
        ? await get([SETUP_KEY, model.SERVICES_KEY, model.ONBOARDING_CONNECTION_KEY], { strict: true }) : null;
      if (existing && !existing[SETUP_KEY] && !Object.hasOwn(existing, model.SERVICES_KEY)) {
        // 首装草稿沿用正式连接结构，出厂名称延至完成时写入
        const prior = existing[model.ONBOARDING_CONNECTION_KEY];
        const seedName = diagnostics.seedAiConnectionName ?? (prior?.schemaVersion !== 2 || prior.seedName === true);
        if (seedName) {
          const connection = registry.connections.find(item => item.models.some(row => row.id === registry.defaultModelId));
          delete connection.name;
        }
        data[model.ONBOARDING_CONNECTION_KEY] = { ...registry, ...(seedName && { seedName }) };
      } else {
        data[model.SERVICES_KEY] = registry;
      }
    }
    if (finishPendingConnection) data[globalThis.STAI.ONBOARDING_CONNECTION_KEY] = null;
    if (workflow) data[globalThis.STAutomation.KEY] = workflow;
    if (toolCredentials) data[globalThis.STAutomation.TOOL_CREDENTIALS_KEY] = toolCredentials;
    if (aiSearch !== undefined) data[globalThis.STConfig.aiSearchKey] = globalThis.STAI.normalizeSearchSettings(aiSearch);
    if (chatPromptId !== undefined) data[globalThis.STConfig.aiChatPromptKey] = chatPromptId;
    if (setupLocale) data[SETUP_KEY] = setupLocale;
    if (gameLinks) data[GAME_LINKS_KEY] = gameLinks;
    if (typeof familyFeature === "boolean") data[key("family-library-owned-marker")] = familyFeature;
    if (familySettings) {
      const keys = globalThis.STFamilyLibrary.SETTINGS_KEYS;
      for (const [field, value] of Object.entries(familySettings)) data[keys[field]] = value;
    }
    if (!Object.keys(data).length || !(await put(data, diagnostics))) throw new Error("AI、翻译与自动化配置写入失败");
  }

  async function getThirdPartyServices(options = {}) {
    const defs = thirdPartyServicesDefaults();
    const paths = thirdPartyServicesPaths();
    const keys = paths.map(thirdPartyServicesKey);
    const rt = await get(keys, options);
    const out = clone(defs);

    for (const path of paths) {
      const storeKey = thirdPartyServicesKey(path);
      if (Object.hasOwn(rt, storeKey)) {
        setPath(out, path, clone(rt[storeKey]));
      }
    }

    return normalizeThirdPartyServices(out);
  }

  /** 仅返回本机密钥的配置状态，读取失败由设置面板处理 */
  async function hasSteamWebApiKey() {
    const values = await get([STEAM_WEB_API_KEY], { strict: true });
    const key = values[STEAM_WEB_API_KEY];
    if (key === undefined) return false;
    if (typeof key !== "string") throw new TypeError("Steam Web API Key 存储格式错误");
    return key !== "";
  }

  function steamWebApiKeyData(value) {
    if (typeof value !== "string") {
      throw new TypeError("Steam Web API Key 必须是文本");
    }
    return { [STEAM_WEB_API_KEY]: value.trim() };
  }

  /** 仅写本机凭据。空串表示清除 */
  function setSteamWebApiKey(value, diagnostics = {}) {
    return put(steamWebApiKeyData(value), diagnostics);
  }

  /** 同时修改两类配置时，显式提供的 steamWebApiKey 随面板配置一并写入 */
  async function setThirdPartyServices(values, diagnostics = {}) {
    const steamKey = values?.steamWebApiKey;
    const keyData = steamKey === undefined ? {} : steamWebApiKeyData(steamKey);
    const currentChart = await getStorePriceChart({ strict: true });
    const normalized = normalizeStorePriceChartSettings({
      thirdPartyServices: values,
      storePriceChart: currentChart,
    });
    const { next, data } = thirdPartyServicesData(normalized.thirdPartyServices);
    data[STORE_PRICE_CHART_KEY] = normalized.storePriceChart;
    Object.assign(data, keyData);

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

  async function getStorePriceChart(options = {}) {
    const [rt, services] = await Promise.all([
      get([STORE_PRICE_CHART_KEY], options),
      getThirdPartyServices(options),
    ]);
    return normalizeStorePriceChart(rt[STORE_PRICE_CHART_KEY], services.isthereanydeal?.country);
  }

  async function setStorePriceChart(values, diagnostics = {}) {
    const services = await getThirdPartyServices({ strict: true });
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
    const rawServices = values.thirdPartyServices || await getThirdPartyServices({ strict: true });
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

  async function getChatTools() {
    const key = globalThis.STConfig.automationConfigKey;
    const data = await get([key], { strict: true });
    return globalThis.STAI.chatToolsFromWorkflow(data[key]);
  }

  function chatPromptId(data) {
    return normalizeStored("ai-chat-prompt", data[globalThis.STConfig.aiChatPromptKey], api.catalog.featureById("ai-chat-prompt").default);
  }

  async function getChatPromptId() {
    return chatPromptId(await get([globalThis.STConfig.aiChatPromptKey], { strict: true }));
  }

  async function getChatConfiguration() {
    const config = globalThis.STConfig;
    const data = await get([config.automationConfigKey, config.aiChatPromptKey], { strict: true });
    const workflow = data[config.automationConfigKey];
    return {
      tools: globalThis.STAI.chatToolsFromWorkflow(workflow),
      prompts: workflow?.prompts ?? [],
      promptId: chatPromptId(data),
    };
  }

  async function getPanelSettings(options = {}) {
    await waitForAiSettings();
    const readOptions = { strict: options.strict === true };
    const sections = {
      features: getAll(readOptions),
      uiLocale: getUiLocale(readOptions),
      updateCheck: getUpdateCheck(),
      storePriceChart: getStorePriceChart(readOptions),
      gameLinks: getGameLinks(),
      searchSuggestions: getSearchSuggestions(readOptions),
      reviewFilter: getReviewFilter(),
      translate: getTranslate(),
      ai: getAi(),
      thirdPartyServices: getThirdPartyServices(readOptions),
    };
    if (options.workflow === true) sections.workflow = getWorkflow();
    const entries = await Promise.all(Object.entries(sections).map(async ([section, read]) => {
      try {
        return [section, await read];
      } catch (cause) {
        throw Object.assign(new Error("设置分区读取失败：" + section, { cause }), { readSection: section });
      }
    }));
    return Object.fromEntries(entries);
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
    const jobs = {
      features: setAll(features, diagnostics),
      ...(sections.uiLocale === undefined ? {} : { uiLocale: setUiLocale(sections.uiLocale, diagnostics) }),
      updateCheck: setUpdateCheck(updateCheck, diagnostics),
      gameLinks: setGameLinks(sections.gameLinks, { ...diagnostics, templateLocale: sections.uiLocale }),
      searchSuggestions: setSearchSuggestions(sections.searchSuggestions || {}, diagnostics),
      reviewFilter: setReviewFilter(sections.reviewFilter || {}, diagnostics),
      storePriceChart: setStorePriceChartSettings({
        thirdPartyServices: sections.thirdPartyServices || {},
        storePriceChart: sections.storePriceChart || {},
      }, diagnostics),
    };
    const results = await Promise.allSettled(Object.values(jobs));
    const savedSections = ["ai", "translate", "workflow"].filter(id => sections[id] !== undefined && !Object.hasOwn(jobs, id));
    const failedSections = [], errors = [];
    Object.keys(jobs).forEach((section, index) => {
      const result = results[index];
      const group = section === "storePriceChart" ? [section, "thirdPartyServices"] : [section];
      if (result.status === "fulfilled" && result.value != null && result.value !== false) savedSections.push(...group);
      else {
        failedSections.push(...group);
        if (result.status === "rejected") errors.push(result.reason);
      }
    });
    if (failedSections.length && diagnostics.reportSections) {
      throw Object.assign(new AggregateError(errors, "部分设置未恢复"), { savedSections, failedSections });
    }
    if (errors.length) throw errors[0];
    return !failedSections.length;
  }

  /** 相关链接采用严格配置契约，读取异常交由页面或备份入口提示，不静默覆盖已有配置。 */
  async function getGameLinks() {
    const rt = await get([GAME_LINKS_KEY], { strict: true });
    return rt[GAME_LINKS_KEY] === undefined ? globalThis.STGameLinks.empty() : globalThis.STGameLinks.normalize(rt[GAME_LINKS_KEY]);
  }

  async function setGameLinks(values, diagnostics = {}) {
    const model = globalThis.STGameLinks;
    const next = model.normalize(values);
    const saved = next.items.some(item => !Object.hasOwn(item, "name"))
      ? model.seedNames(next, await templateLanguage(diagnostics.templateLocale ?? await getUiLocale({ strict: true })))
      : next;
    return await put({ [GAME_LINKS_KEY]: saved }, diagnostics) ? saved : false;
  }

  async function getWorkflow({ reset = false } = {}) {
    const model = globalThis.STAutomation;
    const data = await get([model.KEY], { strict: true });
    if (!Object.hasOwn(data, model.KEY)) return model.empty();
    const saved = data[model.KEY];
    try {
      if (!reset) return model.normalize(saved, { structureOnly: true });
      // 只校验重置需要读取的原有字段，待替换的内容可以包含无效旧定义
      const { version, epoch, revision, bindings, nextIds } = saved ?? {};
      return model.normalize({ ...model.empty(), version, epoch, revision, bindings, nextIds }, { structureOnly: true });
    } catch (error) {
      if (error instanceof TypeError && !error.code) error.code = "WORKFLOW_CONFIG_INVALID";
      throw error;
    }
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

  async function templateLanguage(locale) {
    const i18n = globalThis.STI18n;
    const messages = await i18n.load(locale);
    const text = i18n.forLocale(locale);
    return (key, fallback) => {
      if (!Object.hasOwn(messages, key.replace(/[^A-Za-z0-9_]/g, "_"))) throw new Error("初始化模板缺少语言词条：" + key);
      return text(key, fallback);
    };
  }

  async function initializeWorkflow({ complete = false, previousVersion } = {}) {
    const model = globalThis.STAutomation, aiConfig = globalThis.STAI, family = globalThis.STFamilyLibrary;
    const defaults = aiConfig.translationDefaults(), familyFeatureKey = key("family-library-owned-marker");
    const installedVersionKey = globalThis.STLifecyclePromptContract.installedVersionKey;
    const legacyKeys = aiConfig.V222_CONNECTION_FIELDS.map(aiKey);
    const stored = await get([SETUP_KEY, UI_LOCALE_KEY, GAME_LINKS_KEY, transKey("aiTarget"), transKey("to"), model.KEY, familyFeatureKey, installedVersionKey, ...Object.values(family.SETTINGS_KEYS),
      ...aiConfig.SETTINGS_KEYS, ...legacyKeys, ...Object.keys(defaults).map(transKey)], { strict: true });
    if (stored[SETUP_KEY]) return true;
    const hasRegistry = Object.hasOwn(stored, aiConfig.SERVICES_KEY);
    const flags = aiConfig.flagsFromStorage(stored);
    const pending = stored[aiConfig.ONBOARDING_CONNECTION_KEY];
    const pendingConnection = pending != null;
    const legacy = hasRegistry || pendingConnection ? undefined : aiConfig.migrateV222Service({
      ...flags,
      ...Object.fromEntries(aiConfig.V222_CONNECTION_FIELDS.filter(field => Object.hasOwn(stored, aiKey(field)))
        .map(field => [field, stored[aiKey(field)]])),
    });
    // 2.2.44 首次引入向导完成标记。该版本起未完成向导的用户，升级后仍应等待本人确认。
    const sourceVersion = previousVersion || stored[installedVersionKey];
    const alreadyInstalled = Boolean(sourceVersion && globalThis.STConfig.versions.compare(sourceVersion, "2.2.44") < 0);
    const releasedFamily = !!legacy || family.hasReleasedSchedule(sourceVersion);
    const familySettings = !Object.hasOwn(stored, model.KEY) && family.releasedSettings(stored, releasedFamily);
    const existingWorkflow = Object.hasOwn(stored, model.KEY);
    if (!complete && !existingWorkflow && !alreadyInstalled && !legacy && !familySettings) return false;
    const selectedLocale = localeOf(stored[UI_LOCALE_KEY], "");
    if (complete && !selectedLocale && !existingWorkflow && !alreadyInstalled && !legacy)
      throw new Error("请先在安装引导中选择并确认语言");
    const locale = selectedLocale || "zh_CN";
    const text = await templateLanguage(locale);
    const gameLinks = globalThis.STGameLinks.seedNames(stored[GAME_LINKS_KEY], text);
    let workflow;
    if (!existingWorkflow) {
      workflow = await model.loadDefaults(locale);
      workflow.presetImportVersion = chrome.runtime.getManifest().version;
      if (familySettings) workflow = model.restoreFamilySchedule(workflow, familySettings,
        stored[familyFeatureKey] !== false && globalThis.STClientEnvironment.isSteamClientRuntime(), true);
    }
    const ai = hasRegistry ? undefined : aiConfig.serviceSettings(legacy ?? aiConfig.servicesFromStorage(stored));
    if (ai && (pending?.schemaVersion !== 2 || pending.seedName === true)) {
      const connection = ai.connections.find(item => item.models.some(row => row.id === ai.defaultModelId));
      connection.name = text("seed.ai.default", "默认 AI 服务");
    }
    const translate = workflow || ai
      ? Object.fromEntries(Object.entries(defaults).filter(([id]) => !Object.hasOwn(stored, transKey(id))))
      : undefined;
    if (complete && workflow && !alreadyInstalled && !legacy && !familySettings && !Object.hasOwn(stored, transKey("to")) && !Object.hasOwn(stored, transKey("aiTarget")))
      translate.aiTarget = "display";
    await writeAiSettings({ workflow, ai, translate, familySettings, gameLinks, setupLocale: locale, finishPendingConnection: pendingConnection }, { reason: "initialize-workflow" });
    if (legacy) log.info("ai-v222-config-migrated", "2.2.2 AI 连接已迁移到默认服务");
    return true;
  }

  async function setWorkflow(values, diagnostics = {}) {
    const next = globalThis.STAutomation.normalize(values, { structureOnly: diagnostics.replaceWorkflow !== true });
    const { promptDeletion, creation } = diagnostics;
    if (globalThis.STBackgroundAutomation)
      return globalThis.STBackgroundAutomation.saveConfig(next, {
        operationId: diagnostics.operationId,
        replace: diagnostics.replaceWorkflow === true,
        promptDeletion, creation,
      });
    const response = await globalThis.STMessageBus.request(
      {
        type: globalThis.STAutomation.ROUTE,
        action: diagnostics.replaceWorkflow === true ? "replace-config" : "save-config",
        value: next,
        operationId: diagnostics.operationId,
        promptDeletion, creation,
      },
      { timeoutMs: 120000, logFailures: false },
    );
    if (response?.success !== true) {
      const error = new Error(response?.error || "自动化配置保存失败");
      if (response?.errorCode) error.code = response.errorCode;
      throw error;
    }
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
    getOnboardingState,
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
    getAiTargetLanguage,
    setTranslate,
    getReviewFilter,
    setReviewFilter,
    SEARCH_SUGGESTION_PREFIX,
    getSearchSuggestions,
    setSearchSuggestions,
    getAi,
    getAiSearch,
    getAiSearchState,
    getAiFlags,
    waitForAiSettings,
    getChatTools,
    getChatConfiguration,
    getChatPromptId,
    setChatPreferences,
    setAi,
    setAiSearch,
    writeAiSettings,
    getThirdPartyServices,
    hasSteamWebApiKey,
    setSteamWebApiKey,
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
    templateLanguage,
    SETUP_KEY,
    initializeDownloadToolbar,
    setWorkflow,
    getRailPos,
    setRailPos,
    getPanelSettings,
    setPanelSettings,
  });
})();
