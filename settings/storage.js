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
  const AI_PREFIX = `${PREFIX}ai.`;
  const UI_LOCALE_KEY = globalThis.STI18n?.STORAGE_KEY || api.catalog?.UI_LOCALE_KEY || "SETTING_UI_LOCALE";
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = globalThis.STSettingsMembership?.KEY || "steam_buff_membership";
  const AI_SERVICE = "steam-buff.ai";
  const log = globalThis.STLoggerFactory.createLogger("settings", "settings-storage");

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

  function seeDefaults() {
    return api.catalog?.seeDefaults?.() || {};
  }

  function translateDefaults() {
    return api.catalog?.translateDefaults?.() || {};
  }

  function aiDefaults() {
    return api.catalog?.aiDefaults?.() || {};
  }

  function transKey(id) {
    return `${TRANS_PREFIX}${id}`;
  }

  function aiKey(id) {
    return `${AI_PREFIX}${id}`;
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

  function put(data) {
    if (globalThis.STSettingsBus?.rawSet) {
      return globalThis.STSettingsBus.rawSet(data, {
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

  async function set(id, enabled) {
    const value = Boolean(enabled);
    const ok = await put({ [key(id)]: value });
    log[ok ? "info" : "warn"](ok ? "setting-toggle-success" : "setting-save-failed", ok ? "设置开关已保存" : "设置开关保存失败", {
      featureId: id,
      enabled: value,
    });
    return ok;
  }

  async function getUiLocale() {
    const rt = await get([UI_LOCALE_KEY]);
    return normalizeLocale(rt[UI_LOCALE_KEY]);
  }

  async function setUiLocale(value) {
    const locale = normalizeLocale(value);
    let ok = true;
    try {
      if (globalThis.STI18n?.setLocale) {
        await globalThis.STI18n.setLocale(locale);
      } else {
        ok = await put({ [UI_LOCALE_KEY]: locale });
      }
    } catch {
      ok = false;
    }
    logSave("ui-locale", ok !== false, { locale });
    return ok !== false ? locale : null;
  }

  async function getAuth() {
    const rt = await get([AUTH_KEY]);
    const value = rt[AUTH_KEY];
    return value && typeof value === "object" ? value : null;
  }

  async function setAuth(value) {
    if (!value || typeof value !== "object") {
      return clearAuth();
    }
    await put({ [AUTH_KEY]: value });
    return value;
  }

  function clearAuth() {
    if (globalThis.STSettingsBus?.rawRemove) {
      return globalThis.STSettingsBus.rawRemove([AUTH_KEY, MEMBERSHIP_KEY], {
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

  async function setMembership(value) {
    const rt = await get([AUTH_KEY]);
    const next = normalizeMembership(value, { access_token: "__snapshot__" });
    const ok = await put({ [MEMBERSHIP_KEY]: next });
    const visible = normalizeMembership(next, rt[AUTH_KEY]);
    log[ok ? "info" : "warn"](ok ? "membership-save-success" : "membership-save-failed", ok ? "会员状态已同步" : "会员状态同步失败", {
      active: visible.active,
      features: visible.features,
    });
    return ok ? visible : null;
  }

  function getSee() {
    const defs = seeDefaults();
    const out = {};

    for (const [id, def] of Object.entries(defs)) {
      try {
        const value = localStorage.getItem(id);
        out[id] = value == null ? def : value;
      } catch {
        out[id] = def;
      }
    }

    return Promise.resolve(out);
  }

  function setSee(values) {
    const defs = seeDefaults();

    for (const id of Object.keys(defs)) {
      if (!Object.hasOwn(values || {}, id)) {
        continue;
      }
      try {
        localStorage.setItem(id, String(values[id]));
      } catch {
        // localStorage 不可写时保留默认值即可。
      }
    }

    return Promise.resolve(true);
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

  async function setTranslate(values) {
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
      logSave("translate", false, { reason: "empty" });
      return false;
    }

    const ok = await put(data);
    logSave("translate", ok, { count: Object.keys(data).length });
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

  async function setReviewFilter(values) {
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
      logSave("review-filter", false, { reason: "empty" });
      return false;
    }

    const ok = await put(data);
    logSave("review-filter", ok, { count: Object.keys(data).length });
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

  async function setSearchSuggestions(values) {
    const next = normalizeSearchSuggestions(values);
    const data = {};

    for (const id of Object.keys(searchSuggestionDefaults())) {
      data[searchSuggestionKey(id)] = next[id];
    }

    const ok = await put(data);
    logSave("search-suggestions", ok, { count: Object.keys(data).length });
    return next;
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

  async function setAi(values) {
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
      logSave("ai", false, { reason: "empty" });
      return false;
    }

    const ok = await put(data);
    logSave("ai", ok, { count: Object.keys(data).length });
    return ok;
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
      reviewFilter: await getReviewFilter(),
      searchSuggestions: await getSearchSuggestions(),
      see: await getSee(),
    };
  }

  async function setBackupSections(sections = {}) {
    const jobs = [
      setAll(sections.features || {}),
      setTranslate(sections.translate || {}),
      setAi(sections.ai || {}),
      setReviewFilter(sections.reviewFilter || {}),
      setSearchSuggestions(sections.searchSuggestions || {}),
      setSee(sections.see || {}),
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
    getSee,
    setSee,
    getTranslate,
    setTranslate,
    getReviewFilter,
    setReviewFilter,
    SEARCH_SUGGESTION_PREFIX,
    getSearchSuggestions,
    setSearchSuggestions,
    getAi,
    setAi,
    getRailPos,
    setRailPos,
    getBackupSections,
    setBackupSections,
  });
})();
