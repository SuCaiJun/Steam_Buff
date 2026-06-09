/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展内容脚本入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const RUN_MARK = "steamBuffContentStarted";
  if (globalThis[RUN_MARK]) {
    return;
  }
  globalThis[RUN_MARK] = true;

  const LOG_EVENT = "STEAM_BUFF_LOG_EVENT";
  const NEWS_TRANSLATE_CONFIG_REQ = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_REQUEST";
  const NEWS_TRANSLATE_CONFIG_RES = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_RESPONSE";
  const NEWS_TRANSLATE_TEXT_REQ = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_REQUEST";
  const NEWS_TRANSLATE_TEXT_RES = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_RESPONSE";
  const COMMUNITY_MARK = "steamBuffCommunityInjected";
  const SETTINGS_ATTR = "steamBuffSettings";
  const LOCALE_ATTR = "steamBuffUiLocale";
  const NAME_ID = "library-custom-name";
  const NEWS_TRANSLATE_ID = "steam-news-translate";
  const CFG = globalThis.STConfig;
  const MATCH = CFG.matchers;
  const AUTH_REFRESH = CFG.loginAuth("/auth/refresh");
  const API_GET = CFG.steamBuff("/get");
  const API_SUBMIT = CFG.steamBuff("/submit");
  const NAME_REQ_ATTR = "data-steam-buff-name-request";
  const NAME_RES_ATTR = "data-steam-buff-name-response";
  const SETTINGS_PREFIX = "st.settings.";
  const SETTINGS_SUFFIX = ".enabled";
  const TRANS_PREFIX = `${SETTINGS_PREFIX}translate.`;
  const AI_PREFIX = `${SETTINGS_PREFIX}ai.`;
  const UI_LOCALE_KEY = "SETTING_UI_LOCALE";
  const AUTH_KEY = "steam_buff_auth";
  const AI_SERVICE = "steam-buff.ai";
  const NEWS_TEXT_MAX = 20000;
  const STEAM_SETTING_IDS = Object.freeze([
    "library-sort-title",
    NAME_ID,
    "download-auto-shutdown",
    "nexus-mods",
    NEWS_TRANSLATE_ID,
  ]);
  const COMMUNITY_SETTING_IDS = Object.freeze([
    "market-tools",
  ]);
  const ALL_SETTING_IDS = Object.freeze([...STEAM_SETTING_IDS, ...COMMUNITY_SETTING_IDS]);
  const SEEN_NAME_MAX = 200;
  const BOOT_MS = 250;
  const BOOT_MAX = 480;
  const TRANSLATE_DEFAULTS = Object.freeze({
    page: true,
    selection: true,
    selectionTrigger: "direct",
    selectionAction: "click",
    selectionClose: "auto",
    selectionService: "follow",
    newsPopup: true,
    newsPopupService: "follow",
    local: "chinese_simplified",
    to: "chinese_simplified",
    service: "client.edge",
    aiConcurrency: 3,
    aiPerformance: true,
    force: false,
    select: false,
    style: "dashedLine",
    hover: true,
  });
  const AI_DEFAULTS = Object.freeze({
    enabled: false,
    host: "",
    model: "",
    key: "",
    keyMode: "none",
    keyName: "",
    temperature: "",
  });
  let settingsCache = null;
  let watchSettings = false;
  let watchNames = false;
  let watchLogs = false;
  let watchNewsTranslate = false;
  let bootTries = 0;
  const seenNameReqs = new Map();
  const seenLogs = new Set();

  function log(entry) {
    try {
      globalThis.STLogger?.append?.(entry);
    } catch {
    }
  }

  function pageMeta(extra = {}) {
    return {
      host: location.hostname,
      path: location.pathname,
      title: document.title || "",
      topFrame: window.top === window,
      ...extra,
    };
  }

  function steamRuntimeLogTarget() {
    if (!MATCH.isSteamLoopbackHost(location.hostname)) {
      return false;
    }
    const title = document.title || "";
    if (title === "SharedJSContext" || title === "Steam") {
      return true;
    }
    try {
      const url = new URL(location.href);
      return url.searchParams.get("browserType") === "4" ||
        url.searchParams.get("IN_STEAMUI_SHARED_CONTEXT") === "true";
    } catch {
      return false;
    }
  }

  function steamRuntimeLogOnce(key, entry) {
    if (!steamRuntimeLogTarget()) {
      return;
    }
    logOnce(key, entry);
  }

  function logOnce(key, entry) {
    if (seenLogs.has(key)) {
      return;
    }
    seenLogs.add(key);
    log(entry);
  }

  function trimBridgeMeta(meta) {
    if (!meta || typeof meta !== "object") {
      return undefined;
    }
    try {
      const text = JSON.stringify(meta);
      if (text.length <= 4096) {
        return meta;
      }
      return { truncated: true, text: text.slice(0, 4096) };
    } catch {
      return { truncated: true, text: "[无法序列化]" };
    }
  }

  function pageLogEntry(input) {
    const out = {};
    for (const key of ["time", "level", "domain", "feature", "event", "message", "page", "url", "method", "status", "durationMs", "error"]) {
      if (input[key] !== undefined) {
        out[key] = input[key];
      }
    }
    const meta = trimBridgeMeta(input.meta);
    out.meta = {
      ...(meta || {}),
      bridge: "page",
    };
    return out;
  }

  function root() {
    return document.documentElement || document.head;
  }

  function readySteamDeps() {
    return !!globalThis.STGuard?.ready &&
      typeof globalThis.STGuard.ok === "function" &&
      typeof globalThis.STGuard.lock === "function" &&
      typeof globalThis.STInject?.inject === "function";
  }

  // Steam CEF 常先进入 about:blank 或脚本半就绪状态；依赖未齐时必须继续排队重试，不能直接终止注入链路。
  function retryRun() {
    if (bootTries >= BOOT_MAX) {
      return false;
    }
    bootTries += 1;
    window.setTimeout(run, BOOT_MS);
    return true;
  }

  function isCommunityPage() {
    if (!MATCH.isSteamCommunityHost(location.hostname)) {
      return false;
    }

    return /^\/id\/[^/]+\/inventory\/?/i.test(location.pathname) ||
      /^\/profiles\/[^/]+\/inventory\/?/i.test(location.pathname) ||
      /^\/market(?:\/|$)/i.test(location.pathname) ||
      /^\/tradeoffer(?:\/|$)/i.test(location.pathname);
  }

  function lockCommunity() {
    const el = root();
    if (!el) {
      return false;
    }
    if (el.dataset[COMMUNITY_MARK] === "1") {
      return false;
    }
    el.dataset[COMMUNITY_MARK] = "1";
    return true;
  }

  function failCommunity() {
    const el = root();
    if (el) {
      el.dataset[COMMUNITY_MARK] = "";
    }
  }

  function onDomReady(fn) {
    let done = false;
    const fire = () => {
      if (done || document.readyState === "loading") {
        return;
      }
      done = true;
      fn();
    };
    if (document.readyState !== "loading") {
      fire();
      return;
    }
    document.addEventListener("DOMContentLoaded", fire, { once: true });
    document.addEventListener("readystatechange", fire, { once: true });
  }

  function settingKey(id) {
    return `${SETTINGS_PREFIX}${id}${SETTINGS_SUFFIX}`;
  }

  function transKey(id) {
    return `${TRANS_PREFIX}${id}`;
  }

  function aiKey(id) {
    return `${AI_PREFIX}${id}`;
  }

  function normalizeLocale(value) {
    return globalThis.STI18n?.normalizeLocale?.(value) || (String(value || "") === "en" ? "en" : String(value || "") === "zh_TW" ? "zh_TW" : "zh_CN");
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (rt) => {
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

  function storageSet(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(data, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(keys, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  async function loadSettings(force = false) {
    if (settingsCache && !force) {
      return settingsCache;
    }

    const out = {};
    for (const id of ALL_SETTING_IDS) {
      out[id] = true;
    }
    const rt = await storageGet(ALL_SETTING_IDS.map(settingKey));
    for (const id of ALL_SETTING_IDS) {
      const value = rt[settingKey(id)];
      out[id] = typeof value === "boolean" ? value : true;
    }
    settingsCache = out;
    return out;
  }

  async function enabled(id) {
    const settings = await loadSettings();
    return settings[id] !== false;
  }

  async function nameAllowed() {
    const nameOn = await enabled(NAME_ID);
    return { enabled: nameOn, nameOn };
  }

  function normalizeAi(values = {}) {
    const src = values && typeof values === "object" ? values : {};
    const out = {
      enabled: src.enabled === true || src.enabled === "true",
      host: String(src.host || "").trim(),
      model: String(src.model || "").trim(),
      key: String(src.key || "").trim(),
      keyMode: String(src.keyMode || AI_DEFAULTS.keyMode).trim() || AI_DEFAULTS.keyMode,
      keyName: String(src.keyName || "").trim(),
      temperature: String(src.temperature || "").trim(),
    };
    if (out.host && !out.host.endsWith("/")) {
      out.host = `${out.host}/`;
    }
    return out;
  }

  async function loadTranslateConfig() {
    const transIds = Object.keys(TRANSLATE_DEFAULTS);
    const aiDefs = globalThis.STAI?.defaults?.() || AI_DEFAULTS;
    const aiIds = Object.keys(aiDefs);
    const rt = await storageGet([
      settingKey("translate"),
      ...transIds.map(transKey),
      ...aiIds.map(aiKey),
    ]);
    const out = {
      enabled: rt[settingKey("translate")] === true,
      ai: {},
    };

    for (const id of transIds) {
      const def = TRANSLATE_DEFAULTS[id];
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

    for (const id of aiIds) {
      const def = aiDefs[id];
      const value = rt[aiKey(id)];
      out.ai[id] = typeof def === "boolean"
        ? (typeof value === "boolean" ? value : def)
        : (typeof value === "string" ? value : def);
    }
    out.ai = globalThis.STAI?.normalize?.(out.ai) || normalizeAi(out.ai);
    if (out.service === AI_SERVICE) {
      out.select = false;
    }

    return out;
  }

  function newsTranslateOn(featureOn, conf) {
    return featureOn !== false && conf?.enabled === true && conf.newsPopup !== false;
  }

  function safeRid(value) {
    return String(value || "").slice(0, 80);
  }

  function postNews(type, data = {}) {
    try {
      window.postMessage({
        type,
        source: "steam-buff-content",
        ...data,
      }, "*");
    } catch {
    }
  }

  function newsTranslatePublicConfig(featureOn, conf) {
    const enabledNow = newsTranslateOn(featureOn, conf);
    return {
      enabled: enabledNow,
      featureEnabled: featureOn !== false,
      translateEnabled: conf?.enabled === true,
      newsPopup: conf?.newsPopup !== false,
      service: String(conf?.newsPopupService || "follow"),
      to: String(conf?.to || "chinese_simplified"),
    };
  }

  async function postNewsConfig(rid = "") {
    const featureOn = await enabled(NEWS_TRANSLATE_ID);
    const conf = await loadTranslateConfig();
    postNews(NEWS_TRANSLATE_CONFIG_RES, {
      rid: safeRid(rid),
      config: newsTranslatePublicConfig(featureOn, conf),
    });
  }

  function injectTranslate(conf) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: "TRANSLATE_INJECT",
          cfg: conf,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve({ success: false, error: err.message || "翻译注入请求失败" });
            return;
          }
          resolve(response || { success: false, error: "翻译注入无响应" });
        });
      } catch (error) {
        resolve({ success: false, error: error?.message || String(error) });
      }
    });
  }

  async function ensureNewsTranslator(conf) {
    const rtConf = {
      ...conf,
      page: false,
      selection: false,
      selectionService: conf.newsPopupService || "follow",
    };
    globalThis.STEAM_BUFF_TRANSLATE_CONFIG = rtConf;
    const injected = await injectTranslate(rtConf);
    if (!injected?.success) {
      throw new Error(injected?.error || "翻译运行时注入失败");
    }
    if (!globalThis.translate || !globalThis.STTranslateText?.translateText) {
      throw new Error("翻译文本 helper 未就绪");
    }
    return rtConf;
  }

  async function handleNewsTextRequest(data) {
    const rid = safeRid(data?.rid);
    const startedAt = Date.now();
    const text = String(data?.text || "").replace(/\s+\n/g, "\n").trim();
    if (!text) {
      postNews(NEWS_TRANSLATE_TEXT_RES, { rid, ok: false, error: "没有可翻译内容" });
      return;
    }
    if (text.length > NEWS_TEXT_MAX) {
      postNews(NEWS_TRANSLATE_TEXT_RES, { rid, ok: false, error: "新闻文本过长，请缩短后重试" });
      return;
    }

    const featureOn = await enabled(NEWS_TRANSLATE_ID);
    const conf = await loadTranslateConfig();
    if (!newsTranslateOn(featureOn, conf)) {
      postNews(NEWS_TRANSLATE_TEXT_RES, { rid, ok: false, error: "Steam 新闻弹窗翻译未启用" });
      return;
    }

    try {
      const rtConf = await ensureNewsTranslator(conf);
      const service = String(conf.newsPopupService || "follow");
      const result = await globalThis.STTranslateText.translateText(globalThis.translate, rtConf, text, {
        from: "auto",
        to: conf.to || "chinese_simplified",
        service,
      });
      postNews(NEWS_TRANSLATE_TEXT_RES, {
        rid,
        ok: true,
        text: String(result || ""),
        meta: {
          service: globalThis.STTranslateText.serviceFor?.(globalThis.translate, rtConf, service) || service,
          durationMs: Date.now() - startedAt,
          length: text.length,
        },
      });
    } catch (error) {
      postNews(NEWS_TRANSLATE_TEXT_RES, {
        rid,
        ok: false,
        error: error?.message || String(error || "翻译失败"),
      });
    }
  }

  /* Steam 新闻翻译桥接 */
  function watchNewsTranslateBridge() {
    if (watchNewsTranslate || !MATCH.isSteamLoopbackHost(location.hostname)) {
      return;
    }
    watchNewsTranslate = true;
    window.addEventListener("message", (event) => {
      if (event.source !== window) {
        return;
      }
      const data = event.data || {};
      if (data.source === "steam-buff-content") {
        return;
      }
      if (data.type === NEWS_TRANSLATE_CONFIG_REQ) {
        postNewsConfig(data.rid).catch(() => {});
        return;
      }
      if (data.type === NEWS_TRANSLATE_TEXT_REQ) {
        handleNewsTextRequest(data).catch((error) => {
          postNews(NEWS_TRANSLATE_TEXT_RES, {
            rid: safeRid(data.rid),
            ok: false,
            error: error?.message || String(error || "翻译失败"),
          });
        });
      }
    });
  }

  function trustedNamePage() {
    return MATCH.isTrustedNameHost(location.hostname);
  }

  function postName(data) {
    try {
      root()?.setAttribute(NAME_RES_ATTR, JSON.stringify({
        script: NAME_ID,
        side: "content",
        ...data,
        time: Date.now(),
      }));
    } catch {
    }
  }

  // 页面主上下文无法直接调用 chrome API，标题/库自定义名统一走 DOM 属性桥接到内容脚本。
  async function getAuth() {
    const rt = await storageGet([AUTH_KEY]);
    return cleanAuth(rt[AUTH_KEY]);
  }

  function saveAuth(auth) {
    const next = cleanAuth(auth);
    if (!next) {
      return clearAuth();
    }
    return storageSet({ [AUTH_KEY]: next });
  }

  function clearAuth() {
    return storageRemove([AUTH_KEY]);
  }

  function parseBody(response) {
    try {
      return JSON.parse(response?.data || "{}");
    } catch {
      return { code: 0, message: "接口返回解析失败" };
    }
  }

  function fetchBg(request) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          ...request,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || "后台请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || "后台请求失败"));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function authExpired(auth) {
    const expires = Number(auth?.expires_at) || 0;
    return !expires || Date.now() + 60000 >= expires;
  }

  function authError(message) {
    const error = new Error(message);
    error.code = 401;
    return error;
  }

  function cleanAuth(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const access = String(value.access_token || "");
    const refresh = String(value.refresh_token || "");
    if (!access && !refresh) {
      return null;
    }
    return {
      access_token: access,
      refresh_token: refresh,
      expires_at: Number(value.expires_at) || 0,
      last_used_at: Number(value.last_used_at) || 0,
    };
  }

  function nextAuth(body, oldAuth = {}) {
    return cleanAuth({
      access_token: body?.access_token || oldAuth.access_token || "",
      refresh_token: body?.refresh_token || oldAuth.refresh_token || "",
      expires_at: Date.now() + Math.max(1, Number(body?.expires_in) || 600) * 1000,
      last_used_at: Date.now(),
    });
  }

  async function refreshAuth(auth) {
    if (!auth?.refresh_token) {
      await clearAuth();
      throw authError("请先在设置中登录");
    }

    const response = await fetchBg({
      url: AUTH_REFRESH,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      data: {
        refresh_token: auth.refresh_token,
      },
      allowHttpError: true,
    });
    const body = parseBody(response);
    const code = Number(body?.code) || response.status || 0;
    if (code < 200 || code >= 300 || !body?.access_token) {
      await clearAuth();
      throw authError(body?.message || "登录已过期，请重新登录");
    }

    const next = nextAuth(body, auth);
    await saveAuth(next);
    return next;
  }

  async function readyAuth() {
    const auth = await getAuth();
    if (!auth?.access_token && !auth?.refresh_token) {
      throw authError("请先在设置中登录");
    }
    if (authExpired(auth)) {
      return refreshAuth(auth);
    }
    return auth;
  }

  function queryBody(appids) {
    const ids = Array.isArray(appids) ? appids : [appids];
    const list = ids
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);
    if (!list.length) {
      return null;
    }
    return list.length === 1 ? { appid: list[0] } : { appids: list };
  }

  function bridgeNameMeta(data, extra = {}) {
    const ids = new Set();
    const addId = (value) => {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) {
        ids.add(id);
      }
    };
    if (Array.isArray(data?.appids)) {
      data.appids.forEach(addId);
    } else {
      addId(data?.appid);
    }
    if (Array.isArray(data?.items)) {
      data.items.forEach(item => addId(item?.appid));
    }
    const meta = {
      ...pageMeta(),
      appidCount: ids.size,
      ...extra,
    };
    if (ids.size === 1) {
      meta.appid = Array.from(ids)[0];
    }
    if (Array.isArray(data?.items)) {
      meta.itemCount = data.items.length;
    }
    return meta;
  }

  async function queryNames(data) {
    const rid = data?.rid || "";
    const payload = queryBody(data?.appids || data?.appid);
    if (!payload) {
      postName({ type: "query-result", rid, ok: false, error: "无效的 AppID" });
      return;
    }

    const status = await nameAllowed();
    if (!status.enabled) {
      postName({ type: "query-result", rid, ok: false, error: "功能已关闭" });
      return;
    }

    try {
      let auth = await readyAuth();
      let response = await sendQuery(payload, auth);
      let body = parseBody(response);
      let code = Number(body?.code) || response.status || 0;
      if (code === 401 && auth?.refresh_token) {
        auth = await refreshAuth(auth);
        response = await sendQuery(payload, auth);
        body = parseBody(response);
        code = Number(body?.code) || response.status || 0;
      }
      if (code < 200 || code >= 300) {
        postName({ type: "query-result", rid, ok: false, error: `[${code}] ${body?.message || "查询失败"}` });
        log({
          level: "warn",
          domain: "extension",
          feature: NAME_ID,
          event: "library-custom-name-bridge-query-failed",
          message: "库自定义名称桥接查询失败",
          meta: bridgeNameMeta(data, { code, status: response.status || 0 }),
        });
        return;
      }
      await saveAuth({ ...auth, last_used_at: Date.now() });
      postName({ type: "query-result", rid, ok: true, data: body });
    } catch (error) {
      postName({ type: "query-result", rid, ok: false, error: error?.message || String(error) });
      log({
        level: "error",
        domain: "extension",
        feature: NAME_ID,
        event: "library-custom-name-bridge-query-failed",
        message: "库自定义名称桥接查询异常",
        error,
        meta: bridgeNameMeta(data, { code: Number(error?.code) || 0 }),
      });
    }
  }

  function sendQuery(body, auth) {
    return fetchBg({
      url: API_GET,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.access_token}`,
      },
      data: body,
      allowHttpError: true,
    });
  }

  async function submitFeedback(data) {
    const rid = data?.rid || "";
    const status = await nameAllowed();
    if (!status.enabled) {
      postName({ type: "feedback-result", rid, ok: false, data: { code: 403, message: "功能已关闭" } });
      return;
    }

    try {
      let auth = await readyAuth();
      let response = await sendFeedback(data, auth);
      let body = parseBody(response);
      let code = Number(body?.code) || response.status || 0;
      if (code === 401 && auth?.refresh_token) {
        auth = await refreshAuth(auth);
        response = await sendFeedback(data, auth);
        body = parseBody(response);
        code = Number(body?.code) || response.status || 0;
      }
      if (code < 200 || code >= 300) {
        postName({ type: "feedback-result", rid, ok: false, data: { code, message: body?.message || "提交失败" } });
        log({
          level: "warn",
          domain: "extension",
          feature: NAME_ID,
          event: "library-custom-name-bridge-feedback-failed",
          message: "库自定义名称桥接反馈提交失败",
          meta: bridgeNameMeta(data, { code, status: response.status || 0 }),
        });
        return;
      }
      if (code !== 401) {
        await saveAuth({ ...auth, last_used_at: Date.now() });
      }
      postName({ type: "feedback-result", rid, ok: true, data: body });
    } catch (error) {
      postName({ type: "feedback-result", rid, ok: false, data: { code: Number(error?.code) || 0, message: error?.message || String(error) } });
      log({
        level: "error",
        domain: "extension",
        feature: NAME_ID,
        event: "library-custom-name-bridge-feedback-failed",
        message: "库自定义名称桥接反馈提交异常",
        error,
        meta: bridgeNameMeta(data, { code: Number(error?.code) || 0 }),
      });
    }
  }

  function feedbackPayload(data) {
    if (Array.isArray(data?.items)) {
      return { items: data.items };
    }
    return {
      type: "Game",
      appid: data?.appid,
      steam_name: data?.steam_name,
      custom_name: data?.custom_name,
    };
  }

  /* 主上下文日志桥接 */
  function watchPageLog() {
    if (watchLogs) {
      return;
    }
    watchLogs = true;
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.type !== LOG_EVENT) {
        return;
      }
      const entry = event.data.entry;
      if (!entry || typeof entry !== "object") {
        return;
      }
      log(pageLogEntry(entry));
    });
  }

  function sendFeedback(data, auth) {
    return fetchBg({
      url: API_SUBMIT,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.access_token}`,
      },
      data: feedbackPayload(data),
      allowHttpError: true,
    });
  }

  function seenName(data) {
    const rid = String(data?.rid || "");
    if (!rid) {
      return false;
    }
    const key = `${data.type}:${rid}`;
    if (seenNameReqs.has(key)) {
      return true;
    }
    // MutationObserver 可能重复读到同一个 rid，短缓存只用于去重，不影响后续新的页面请求。
    while (seenNameReqs.size >= SEEN_NAME_MAX) {
      const old = seenNameReqs.keys().next().value;
      window.clearTimeout(seenNameReqs.get(old));
      seenNameReqs.delete(old);
    }
    const timer = window.setTimeout(() => {
      seenNameReqs.delete(key);
    }, 30000);
    seenNameReqs.set(key, timer);
    return false;
  }

  function handleName(data) {
    if (!trustedNamePage()) {
      return;
    }
    if (data.script !== NAME_ID || data.side !== "page" || (data.type !== "query" && data.type !== "feedback")) {
      return;
    }
    if (seenName(data)) {
      return;
    }
    if (data.type === "feedback") {
      submitFeedback(data).catch((error) => {
        postName({ type: "feedback-result", rid: data.rid || "", ok: false, data: { code: 0, message: error?.message || String(error) } });
      });
      return;
    }
    queryNames(data).catch((error) => {
      postName({ type: "query-result", rid: data.rid || "", ok: false, error: error?.message || String(error) });
    });
  }

  function readNameReq() {
    try {
      return JSON.parse(root()?.getAttribute(NAME_REQ_ATTR) || "{}");
    } catch {
      return {};
    }
  }

  function watchNameReq() {
    if (watchNames) {
      return;
    }
    const el = root();
    if (!el) {
      return;
    }
    watchNames = true;
    try {
      const obs = new MutationObserver((items) => {
        for (const item of items) {
          if (item.attributeName === NAME_REQ_ATTR) {
            handleName(readNameReq());
          }
        }
      });
      obs.observe(el, {
        attributes: true,
        attributeFilter: [NAME_REQ_ATTR],
      });
      handleName(readNameReq());
    } catch {
      watchNames = false;
    }
  }

  async function communityOn() {
    const settings = await loadSettings();
    return COMMUNITY_SETTING_IDS.every(id => settings[id] !== false);
  }

  async function writeSteamSettings() {
    const el = root();
    if (!el) {
      return;
    }

    // Steam 主上下文脚本通过 dataset 读取开关快照，避免每次按钮点击都等待内容脚本往返。
    const all = await loadSettings();
    const settings = {};
    for (const id of STEAM_SETTING_IDS) {
      settings[id] = all[id] !== false;
    }

    try {
      el.dataset[SETTINGS_ATTR] = JSON.stringify(settings);
    } catch {
      el.dataset[SETTINGS_ATTR] = "{}";
    }
    await writeUiLocale();
  }

  async function writeUiLocale() {
    const el = root();
    if (!el) {
      return;
    }
    let locale = globalThis.STI18n?.locale?.();
    if (!locale) {
      const rt = await storageGet([UI_LOCALE_KEY]);
      locale = rt[UI_LOCALE_KEY];
    }
    el.dataset[LOCALE_ATTR] = normalizeLocale(locale);
  }

  function watchSettingsChanges() {
    if (watchSettings) {
      return;
    }
    watchSettings = true;

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
          return;
        }
        const localeHit = Object.hasOwn(changes || {}, UI_LOCALE_KEY);
        const keys = Object.keys(changes || {});
        const hit = ALL_SETTING_IDS.some(id => Object.hasOwn(changes, settingKey(id)));
        const newsHit = keys.some((item) => item === settingKey(NEWS_TRANSLATE_ID) || item === settingKey("translate") || item.startsWith(TRANS_PREFIX) || item.startsWith(AI_PREFIX));
        if (hit) {
          settingsCache = null;
          if (MATCH.isSteamLoopbackHost(location.hostname)) {
            writeSteamSettings().catch(() => {});
          }
        }
        if (newsHit && MATCH.isSteamLoopbackHost(location.hostname)) {
          postNewsConfig("").catch(() => {});
        }
        if (localeHit) {
          writeUiLocale().catch(() => {});
        }
      });
    } catch {
    }
  }

  function run() {
    watchPageLog();
    watchNewsTranslateBridge();
    watchSettingsChanges();
    logOnce("content-script-start", {
      level: "info",
      domain: "extension",
      feature: "content-script",
      event: "content-script-start",
      message: "内容脚本已启动",
      meta: pageMeta(),
    });
    const inj = globalThis.STInject;

    if (isCommunityPage()) {
      if (document.readyState === "loading") {
        onDomReady(run);
        return;
      }

      // 社区页不使用 STGuard，STInject 还没注入时继续走启动重试，避免扩展重载后漏注入。
      if (!inj?.inject) {
        logOnce("community-runtime-deps-waiting", {
          level: "info",
          domain: "community",
          feature: "community-injection",
          event: "runtime-deps-waiting",
          message: "社区运行时等待注入依赖就绪",
          meta: pageMeta({ bootTries }),
        });
        retryRun();
        return;
      }
      if (!lockCommunity()) {
        logOnce("community-runtime-inject-skipped-lock", {
          level: "info",
          domain: "community",
          feature: "community-injection",
          event: "community-runtime-inject-skipped",
          message: "社区运行时已注入，跳过重复注入",
          meta: pageMeta({ reason: "already-locked" }),
        });
        return;
      }

      communityOn().then((on) => {
        if (!on) {
          failCommunity();
          logOnce("community-runtime-inject-skipped-disabled", {
            level: "info",
            domain: "community",
            feature: "community-injection",
            event: "community-runtime-inject-skipped",
            message: "社区运行时因设置关闭而跳过注入",
            meta: pageMeta({ reason: "disabled" }),
          });
          return;
        }

        logOnce("community-runtime-inject-start", {
          level: "info",
          domain: "community",
          feature: "community-injection",
          event: "community-runtime-inject-start",
          message: "开始注入 Steam 社区经济增强",
          meta: pageMeta(),
        });
        // 只在库存、市场、交易报价页加载社区经济增强；关闭开关时释放标记，后续页面变化可重新判断。
        writeUiLocale().catch(() => {});
        return inj.inject([
          "extension/runtime/logger.js",
          "shared/config.js",
          "shared/i18n.js",
          "community/runtime/base.js",
          "community/runtime/settings.js",
          "community/runtime/dom.js",
          "community/runtime/storage.js",
          "community/runtime/request-queue.js",
          "community/domain/items.js",
          "community/domain/market-api.js",
          "community/domain/pricing.js",
          "community/ui/logger.js",
          "community/ui/spinner.js",
          "community/ui/settings-modal.js",
          "community/ui/styles.js",
          "community/features/inventory/prices.js",
          "community/features/inventory/sell-confirm.js",
          "community/features/inventory/actions.js",
          "community/features/inventory/quick-sell.js",
          "community/features/inventory/view.js",
          "community/features/market/state.js",
          "community/features/market/dom.js",
          "community/features/market/actions.js",
          "community/features/market/view.js",
          "community/features/trade/view.js",
          "community/main.js",
        ]).then(() => {
          logOnce("community-runtime-inject-success", {
            level: "info",
            domain: "community",
            feature: "community-injection",
            event: "community-runtime-inject-success",
            message: "Steam 社区经济增强注入完成",
            meta: pageMeta(),
          });
        });
      }).catch((error) => {
        failCommunity();
        console.error("[Steam Buff] 注入 Steam 社区经济增强失败", error);
        log({
          level: "error",
          domain: "community",
          feature: "community-injection",
          event: "community-runtime-inject-failed",
          message: "注入 Steam 社区经济增强失败",
          error,
          meta: pageMeta(),
        });
      });

      return;
    }

    // steamloopback.host 会先出现内容脚本但 guard/injector 未 ready 的窗口，必须 retry 到依赖完整。
    if (MATCH.isSteamLoopbackHost(location.hostname) && !readySteamDeps()) {
      steamRuntimeLogOnce("steam-runtime-deps-waiting", {
        level: "info",
        domain: "steam",
        feature: "steam-runtime",
        event: "runtime-deps-waiting",
        message: "Steam 运行时等待注入依赖就绪",
        meta: pageMeta({ bootTries }),
      });
      retryRun();
      return;
    }

    const gd = globalThis.STGuard;
    // guard.ok() 失败通常表示页面仍是 about:blank 或非目标 frame，继续 retry 才能覆盖后续 ready 的 Steam CEF。
    if (!gd?.ok()) {
      steamRuntimeLogOnce("steam-runtime-inject-skipped-guard", {
        level: "info",
        domain: "steam",
        feature: "steam-runtime",
        event: "steam-runtime-inject-skipped",
        message: "Steam 运行时等待目标页面就绪",
        meta: pageMeta({ reason: "guard-not-ready", bootTries }),
      });
    }
    if (!gd?.ok()) {
      retryRun();
      return;
    }
    watchNameReq();

    if (!gd.lock()) {
      steamRuntimeLogOnce("steam-runtime-inject-skipped-lock", {
        level: "info",
        domain: "steam",
        feature: "steam-runtime",
        event: "steam-runtime-inject-skipped",
        message: "Steam 运行时已注入，跳过重复注入",
        meta: pageMeta({ reason: "already-locked" }),
      });
      return;
    }

    writeSteamSettings()
      .then(() => {
        steamRuntimeLogOnce("steam-runtime-inject-start", {
          level: "info",
          domain: "steam",
          feature: "steam-runtime",
          event: "steam-runtime-inject-start",
          message: "开始注入 Steam 运行时",
          meta: pageMeta(),
        });
        return inj.inject([
          "extension/runtime/logger.js",
          "shared/config.js",
          "shared/i18n.js",
          "steam/shared/constants.js",
          "steam/runtime/paths.js",
          "steam/runtime/steam-context.js",
          "steam/runtime/feature-registry.js",
          "steam/features/features.js",
          "steam/main.js",
        ]);
      })
      .then(() => {
        steamRuntimeLogOnce("steam-runtime-inject-success", {
          level: "info",
          domain: "steam",
          feature: "steam-runtime",
          event: "steam-runtime-inject-success",
          message: "Steam 运行时注入完成",
          meta: pageMeta(),
        });
      })
      .catch((error) => {
        gd.fail();
        console.error("[Steam Buff] 注入 Steam 运行时失败", error);
        log({
          level: "error",
          domain: "steam",
          feature: "steam-runtime",
          event: "steam-runtime-inject-failed",
          message: "注入 Steam 运行时失败",
          error,
          meta: pageMeta(),
        });
      });
  }

  run();
})();
