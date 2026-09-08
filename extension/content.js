/*
 * @Author        : Ricky
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

  const authSession = globalThis.STAuthSession;
  if (!authSession) {
    throw new Error("shared/auth-session.js must load before extension/content.js");
  }
  const { cleanAuth, nextAuth } = authSession;

  const RUN_MARK = "steamBuffContentStarted";
  const RUN_VERSION = "steam-buff-runtime-v20";
  const RUN_PENDING = `${RUN_VERSION}:pending`;
  const EXCLUDED_STEAM_CLEANUP_SCRIPT = "steam/runtime/cleanup-stale.js";
  const SETTINGS_OPEN_MESSAGE = "STEAM_BUFF_OPEN_SETTINGS";
  const SETTINGS_LOAD_MARK = "__steamBuffSettingsChunk";
  const SETTINGS_LOAD_PENDING = `${SETTINGS_LOAD_MARK}:pending`;
  const SETTINGS_RAIL_LOAD_MARK = "__steamBuffSettingsRailChunk";
  const SETTINGS_RAIL_LOAD_PENDING = `${SETTINGS_RAIL_LOAD_MARK}:pending`;
  const STORE_LOAD_MARK = "__steamBuffStoreChunk";
  const STORE_LOAD_PENDING = `${STORE_LOAD_MARK}:pending`;
  const CONTENT_BUNDLES = Object.freeze({
    steamContentDeps: "steam-content-deps",
    settingsShared: "settings-shared",
    settingsUi: "settings-ui",
    settingsRail: "settings-rail",
    storeRuntime: "store-runtime",
  });
  const STEAM_TITLE_WAIT_MS = 100;
  const STEAM_TITLE_WAIT_MAX = 80;
  const STEAM_TITLE_WAIT_TRIES = "__steamBuffTitleWaitTries";
  const STEAM_SCOPE_WAIT_TRIES = "__steamBuffScopeWaitTries";
  const STEAM_SCOPE_WAIT_MAX = 80;
  const STEAM_CONTENT_DEPS_LOAD_MARK = "__steamBuffSteamContentDepsLoad";
  const STEAM_CONTENT_DEPS_PENDING = `${STEAM_CONTENT_DEPS_LOAD_MARK}:pending`;

  function shouldInject() {
    return globalThis.STPageContext?.shouldInject?.() === true;
  }

  function shouldLightBoot() {
    return globalThis.STPageContext?.shouldLightBoot?.() === true;
  }

  function shouldCleanupExcludedSteamRuntime() {
    return globalThis.STPageContext?.isSteamCleanupTarget?.() === true;
  }

  function cleanupExcludedSteamRuntime() {
    if (!shouldCleanupExcludedSteamRuntime()) {
      return;
    }
    try {
      globalThis.STInject?.inject?.([EXCLUDED_STEAM_CLEANUP_SCRIPT]).catch(() => {});
    } catch {
    }
  }

  const LOG_EVENT = "STEAM_BUFF_LOG_EVENT";
  const NEWS_TRANSLATE_CONFIG_REQ = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_REQUEST";
  const NEWS_TRANSLATE_CONFIG_RES = "STEAM_BUFF_NEWS_TRANSLATE_CONFIG_RESPONSE";
  const NEWS_TRANSLATE_TEXT_REQ = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_REQUEST";
  const NEWS_TRANSLATE_TEXT_RES = "STEAM_BUFF_NEWS_TRANSLATE_TEXT_RESPONSE";
  const NEWS_TRANSLATE_BRIDGE_MARK = "__steamBuffNewsTranslateBridge";
  const NEWS_TRANSLATE_BRIDGE_HANDLER_MARK = "__steamBuffNewsTranslateBridgeHandler";
  const NEWS_TRANSLATE_BRIDGE_HANDLER_REF = "__steamBuffNewsTranslateBridgeHandlerRef";
  const SETTINGS_ATTR = "steamBuffSettings";
  const RUNTIME_SESSION_ATTR = "steamBuffRuntimeSessionId";
  const RUNTIME_OPERATION_ATTR = "steamBuffRuntimeOperationId";
  const RUNTIME_READY_ATTR = "steamBuffRuntimeReady";
  const RUNTIME_READY_OPERATION_ATTR = "steamBuffRuntimeReadyOperationId";
  const STEAM_FEATURES_DISABLED_MESSAGE = "__steam_buff_features_disabled";
  const NEWS_TRANSLATE_ATTR = "steamBuffNewsTranslate";
  const LOCALE_ATTR = "steamBuffUiLocale";
  const SORT_TITLE_ID = "library-sort-title";
  const NAME_ID = "library-custom-name";
  const NEWS_TRANSLATE_ID = "steam-news-translate";
  const ORIGINAL_NAME_SEARCH_ID = "library-sort-title-original-search";
  const STABLE_MODE_ID = "library-sort-title-stable-mode";
  const HOVER_TITLE_SETTING_ID = "library-sort-title-hover-custom-name";
  const CHROMIUM_WINDOW_OPEN = "CHROMIUM_WINDOW_OPEN";
  const SETTINGS_CENTER_PAGE = "settings/center.html";
  const CFG = globalThis.STConfig;
  const MATCH = CFG.matchers;
  const AUTH_REFRESH = CFG.loginAuth("/auth/refresh");
  const API_GET = CFG.steamBuff("/get");
  const API_SUBMIT = CFG.steamBuff("/submit");
  const NAME_REQ_ATTR = "data-steam-buff-name-request";
  const NAME_RES_ATTR = "data-steam-buff-name-response";
  const PLAYER_STATS_ID = "player-stats";
  const PLAYER_STATS_REQ_ATTRS = Object.freeze({
    gmcharts: "data-steam-buff-player-stats-request-gmcharts",
    "steam-current": "data-steam-buff-player-stats-request-steam-current",
    "augmented-peak": "data-steam-buff-player-stats-request-augmented-peak",
  });
  const PLAYER_STATS_RES_ATTRS = Object.freeze({
    gmcharts: "data-steam-buff-player-stats-response-gmcharts",
    "steam-current": "data-steam-buff-player-stats-response-steam-current",
    "augmented-peak": "data-steam-buff-player-stats-response-augmented-peak",
  });
  const SETTINGS_PREFIX = "st.settings.";
  const SETTINGS_SUFFIX = ".enabled";
  const TRANS_PREFIX = `${SETTINGS_PREFIX}translate.`;
  const AI_PREFIX = `${SETTINGS_PREFIX}ai.`;
  const UI_LOCALE_KEY = "SETTING_UI_LOCALE";
  const AUTH_KEY = "steam_buff_auth";
  const AI_SERVICE = "steam-buff.ai";
  const NEWS_AI_MODE = "steam-news-popup";
  const NEWS_TEXT_MAX = 20000;
  const NEWS_AI_CHUNK_CHARS = 1600;
  const NEWS_AI_HARD_CHUNK_CHARS = 1800;
  const NEWS_AI_TIMEOUT_MS = 120_000;
  const STEAM_SETTING_DEFAULTS = Object.freeze({
    [SORT_TITLE_ID]: true,
    [ORIGINAL_NAME_SEARCH_ID]: false,
    [STABLE_MODE_ID]: true,
    [HOVER_TITLE_SETTING_ID]: false,
    "library-group-labels": true,
    "library-group-labels-grouped-mode": false,
    "library-group-labels-hide-collection-tags": true,
    "download-batch-actions": true,
    "download-auto-shutdown": true,
    [NEWS_TRANSLATE_ID]: true,
  });
  const STEAM_SETTING_IDS = Object.freeze([
    SORT_TITLE_ID,
    ORIGINAL_NAME_SEARCH_ID,
    STABLE_MODE_ID,
    HOVER_TITLE_SETTING_ID,
    "library-group-labels",
    "library-group-labels-grouped-mode",
    "library-group-labels-hide-collection-tags",
    "download-batch-actions",
    "download-auto-shutdown",
    NEWS_TRANSLATE_ID,
  ]);
  const STEAM_FEATURE_IDS = Object.freeze([
    SORT_TITLE_ID,
    NAME_ID,
    "download-batch-actions",
    "download-auto-shutdown",
    NEWS_TRANSLATE_ID,
  ]);
  const STEAM_FEATURE_SETTING_IDS = Object.freeze({
    [SORT_TITLE_ID]: SORT_TITLE_ID,
    [NAME_ID]: SORT_TITLE_ID,
    "download-batch-actions": "download-batch-actions",
    "download-auto-shutdown": "download-auto-shutdown",
    [NEWS_TRANSLATE_ID]: NEWS_TRANSLATE_ID,
  });
  const SEEN_NAME_MAX = 200;
  const BOOT_MS = 250;
  const BOOT_MAX = 480;
  // 依赖未就绪可等待较久；完整资源包注入失败只做少量、低频重试，避免反复全量注入
  const RUNTIME_INJECT_RETRY_DELAYS = Object.freeze([1000, 3000]);
  const RUNTIME_INJECT_MAX_ATTEMPTS = RUNTIME_INJECT_RETRY_DELAYS.length + 1;
  const TRANSLATE_DEFAULTS = Object.freeze({
    page: false,
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
    aiPerformance: true,
    force: false,
    select: false,
    style: "dashedLine",
    hover: true,
  });
  const AI_DEFAULTS = Object.freeze({
    enabled: false,
    host: "https://open.bigmodel.cn/api/paas/v4/chat/completions/",
    model: "GLM-4-Flash",
    key: "",
    keyMode: "bearer",
    keyName: "",
    temperature: "",
    aiConcurrency: 10,
  });
  let settingsCache = null;
  let steamSettingsSnapshot = null;
  let watchSettings = false;
  let watchNames = false;
  let watchLogs = false;
  let watchNewsTranslate = false;
  let bootTries = 0;
  const seenNameReqs = new Map();
  const seenLogs = new Set();
  let steamRuntimeOperationId = "";
  let steamRuntimeInjectStartedAt = 0;
  let steamRuntimeInjectAttempt = 0;
  let steamRuntimeInjectRetryTimer = 0;
  let steamRuntimeLastInjectFailurePhase = "";

  function log(entry) {
    try {
      globalThis.STLogger?.append?.(entry);
    } catch {
    }
  }

  function pageMeta(extra = {}) {
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    return {
      host: ctx.host || location.hostname,
      path: ctx.path || location.pathname,
      topFrame: ctx.topFrame ?? (window.top === window),
      page: ctx.page || "",
      pageType: ctx.pageType || "",
      ...extra,
    };
  }

  function steamRuntimeLogTarget() {
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    if (ctx.domain !== "steam") {
      return isSteamContentTarget();
    }
    if (ctx.title === "SharedJSContext" || ctx.title === "Steam") {
      return true;
    }
    return ctx.steam?.aboutMain === true ||
      String(ctx.href || "").includes("IN_STEAMUI_SHARED_CONTEXT=true");
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

  function beginSteamRuntimeInjection() {
    if (steamRuntimeInjectRetryTimer) {
      window.clearTimeout(steamRuntimeInjectRetryTimer);
      steamRuntimeInjectRetryTimer = 0;
    }
    if (steamRuntimeInjectAttempt === 0) {
      steamRuntimeOperationId = globalThis.STLoggerFactory.createOperationId();
      steamRuntimeInjectStartedAt = Date.now();
    }
    steamRuntimeInjectAttempt += 1;
    const el = root();
    if (el) {
      clearPageRuntimeReady();
      el.dataset[RUNTIME_SESSION_ATTR] = globalThis.STLogger.sessionId;
      el.dataset[RUNTIME_OPERATION_ATTR] = steamRuntimeOperationId;
    }
    return {
      operationId: steamRuntimeOperationId,
      attempt: steamRuntimeInjectAttempt,
    };
  }

  function scheduleRuntimeInjectionRetry(attempt) {
    const delay = RUNTIME_INJECT_RETRY_DELAYS[attempt - 1];
    if (!Number.isFinite(delay) || steamRuntimeInjectRetryTimer) {
      return null;
    }
    steamRuntimeInjectRetryTimer = window.setTimeout(() => {
      steamRuntimeInjectRetryTimer = 0;
      run();
    }, delay);
    return delay;
  }

  function runtimeInjectionRetryMeta(attempt) {
    return attempt > 1
      ? { retry: { attempt, maxAttempts: RUNTIME_INJECT_MAX_ATTEMPTS } }
      : {};
  }

  function steamRuntimeInjectionMeta(extra = {}) {
    return pageMeta({
      loadStrategy: "sequential-web-accessible-scripts",
      resourceGroup: "steamloopback-host-runtime",
      runtimeVersion: RUN_VERSION,
      ...extra,
    });
  }

  function root() {
    return document.documentElement || document.head;
  }

  function pageRuntimeReady(operationId = "") {
    const el = root();
    const data = el?.dataset;
    if (data?.[RUNTIME_READY_ATTR] !== RUN_VERSION) {
      return false;
    }
    return !operationId || data[RUNTIME_READY_OPERATION_ATTR] === operationId;
  }

  function clearPageRuntimeReady(operationId = "") {
    const el = root();
    const data = el?.dataset;
    if (!data || (operationId && data[RUNTIME_READY_OPERATION_ATTR] !== operationId)) {
      return;
    }
    data[RUNTIME_READY_ATTR] = "";
    data[RUNTIME_READY_OPERATION_ATTR] = "";
  }

  function isSteamContentTarget() {
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    if (ctx.domain === "steam") {
      return true;
    }
    try {
      if (MATCH?.isSteamLoopbackHost?.(location.hostname) === true) {
        return true;
      }
    } catch {
    }
    const currentTitle = String(document.title || "");
    return currentTitle === "Steam" ||
      currentTitle === "SharedJSContext" ||
      String(location.href || "").includes("IN_STEAMUI_SHARED_CONTEXT=true");
  }

  function steamContentDepsReady() {
    return !!globalThis.STGuard?.ready &&
      typeof globalThis.STGuard.ok === "function" &&
      typeof globalThis.STGuard.lock === "function" &&
      typeof globalThis.STInject?.inject === "function" &&
      !!globalThis.STLogger?.ready &&
      typeof globalThis.STLoggerFactory?.createLogger === "function" &&
      typeof globalThis.STErrorBoundary?.capture === "function" &&
      !!globalThis.STI18n &&
      typeof globalThis.STPageContext?.snapshot === "function" &&
      typeof globalThis.STMessageBus?.request === "function" &&
      typeof globalThis.STSettingsBus?.loadSettingsSnapshot === "function";
  }

  function readySteamDeps() {
    return steamContentDepsReady();
  }

  function settingsReady() {
    return !!globalThis.STSettings?.catalog &&
      !!globalThis.STSettings?.storage &&
      !!globalThis.STSettingsMembership;
  }

  function canOpenSettingsUi() {
    return globalThis.STPageContext?.settingsPage?.() === "settings-web";
  }

  function injectContentBundle(bundle, meta = {}) {
    const id = String(bundle || "").trim();
    if (!id) {
      return Promise.resolve({ success: true });
    }
    if (globalThis.STMessageBus?.request) {
      return globalThis.STMessageBus.request({
        type: "CONTENT_FILES_INJECT",
        bundle: id,
        meta,
      }, {
        timeoutMs: 12_000,
        dedupeKey: `CONTENT_FILES_INJECT:${id}:${JSON.stringify(meta || {})}`,
        expectSuccess: true,
      });
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type: "CONTENT_FILES_INJECT",
          bundle: id,
          meta,
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || "内容脚本按需注入请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || "内容脚本按需注入失败"));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function ensureSteamContentDeps() {
    if (steamContentDepsReady()) {
      globalThis[STEAM_CONTENT_DEPS_LOAD_MARK] = "ready";
      return Promise.resolve(true);
    }
    if (globalThis[STEAM_CONTENT_DEPS_LOAD_MARK] === STEAM_CONTENT_DEPS_PENDING) {
      return Promise.resolve(false);
    }
    globalThis[STEAM_CONTENT_DEPS_LOAD_MARK] = STEAM_CONTENT_DEPS_PENDING;
    return injectContentBundle(CONTENT_BUNDLES.steamContentDeps)
      .then(() => {
        const ready = steamContentDepsReady();
        globalThis[STEAM_CONTENT_DEPS_LOAD_MARK] = ready ? "ready" : "";
        return ready;
      })
      .catch((error) => {
        globalThis[STEAM_CONTENT_DEPS_LOAD_MARK] = "";
        log({
          level: "error",
          domain: "steam",
          feature: "steam-runtime",
          event: "steam-content-deps-recover-failed",
          message: "Steam 内容脚本依赖补注入失败",
          error,
          meta: pageMeta({ bootTries }),
        });
        return false;
      });
  }

  function waitSteamContentDeps() {
    globalThis[RUN_MARK] = RUN_PENDING;
    steamRuntimeLogOnce("steam-content-deps-recover-start", {
      level: "info",
      domain: "steam",
      feature: "steam-runtime",
      event: "steam-content-deps-recover-start",
      message: "Steam 内容脚本依赖缺失，开始补注入",
      meta: pageMeta({ bootTries }),
    });
    ensureSteamContentDeps()
      .then((ready) => {
        if (!ready) {
          if (!retryRun()) {
            globalThis[RUN_MARK] = "";
          }
          return;
        }
        globalThis[RUN_MARK] = "";
        run();
      })
      .catch(() => {
        if (!retryRun()) {
          globalThis[RUN_MARK] = "";
        }
      });
  }

  function activateLightRuntime(domain, meta = {}) {
    try {
      const actions = globalThis.STPageContext?.getUserActions?.() || [];
      globalThis.STPageContext?.setUserActions?.([...actions, "settings-open"]);
      const rt = globalThis.STRuntime?.get?.({ id: "steam-buff-page-runtime" });
      rt?.registerAdapter?.({
        id: domain,
        domain,
        publicApi: domain === "settings" ? "window.STSettings" : "window.STStore",
        registry: "extension/content.js",
        loadStrategy: "content-script-light-boot",
        meta: {
          entry: "extension/content.js",
          ...meta,
        },
      });
    } catch {
    }
  }

  async function ensureSettingsShared() {
    if (settingsReady()) {
      return true;
    }
    await injectContentBundle(CONTENT_BUNDLES.settingsShared);
    return settingsReady();
  }

  async function loadSettingsUi(reason = "manual-open") {
    if (!canOpenSettingsUi()) {
      log({
        level: "info",
        domain: "settings",
        feature: "settings-loader",
        event: "settings-runtime-inject-skipped",
        message: "当前页面不允许打开设置中心，跳过完整面板加载",
        meta: pageMeta({ reason }),
      });
      return false;
    }
    if (globalThis[SETTINGS_LOAD_MARK] === "ready") {
      return true;
    }
    if (globalThis[SETTINGS_LOAD_MARK] === SETTINGS_LOAD_PENDING) {
      return false;
    }
    globalThis[SETTINGS_LOAD_MARK] = SETTINGS_LOAD_PENDING;
    try {
      await ensureSettingsShared();
      await injectContentBundle(CONTENT_BUNDLES.settingsUi);
      globalThis[SETTINGS_LOAD_MARK] = "ready";
      activateLightRuntime("settings", {
        reason,
        loadStrategy: "runtime-on-open",
      });
      return true;
    } catch (error) {
      globalThis[SETTINGS_LOAD_MARK] = "";
      log({
        level: "error",
        domain: "settings",
        feature: "settings-loader",
        event: "settings-runtime-inject-failed",
        message: "设置中心按需加载失败",
        error,
        meta: pageMeta({ reason }),
      });
      throw error;
    }
  }

  async function loadSettingsRail(reason = "light-boot") {
    if (globalThis[SETTINGS_RAIL_LOAD_MARK] === "ready") {
      return true;
    }
    if (globalThis[SETTINGS_RAIL_LOAD_MARK] === SETTINGS_RAIL_LOAD_PENDING) {
      return false;
    }
    if (globalThis.STPageContext?.settingsPage?.() !== "settings-web") {
      return false;
    }
    globalThis[SETTINGS_RAIL_LOAD_MARK] = SETTINGS_RAIL_LOAD_PENDING;
    try {
      await injectContentBundle(CONTENT_BUNDLES.settingsRail);
      globalThis[SETTINGS_RAIL_LOAD_MARK] = "ready";
      activateLightRuntime("settings", {
        reason,
        loadStrategy: "content-script-floating-rail",
      });
      return true;
    } catch (error) {
      globalThis[SETTINGS_RAIL_LOAD_MARK] = "";
      log({
        level: "error",
        domain: "settings",
        feature: "floating-rail",
        event: "settings-rail-inject-failed",
        message: "设置中心轻量悬浮入口加载失败",
        error,
        meta: pageMeta({ reason }),
      });
      throw error;
    }
  }

  function openSettings(category = "", options = {}) {
    const requestId = String(Date.now());
    const el = root();
    if (el?.dataset) {
      el.dataset.steamBuffOpenRequested = requestId;
      if (category) {
        el.dataset.steamBuffOpenCat = String(category);
      }
      if (options.filteredReviews === true) {
        el.dataset.steamBuffOpenFilteredReviews = "1";
      }
    }
    loadSettingsUi("manual-open")
      .then((loaded) => {
        if (!loaded) {
          return;
        }
        const target = root();
        if (!target) {
          return;
        }
        if (category) {
          target.dataset.steamBuffOpenCat = String(category);
        }
        if (options.filteredReviews === true) {
          target.dataset.steamBuffOpenFilteredReviews = "1";
        }
        target.dispatchEvent(new CustomEvent("STSettingsOpen", {
          detail: {
            filteredReviews: options.filteredReviews === true,
          },
        }));
      })
      .catch(() => {});
  }

  function bindSettingsOpenRequest() {
    try {
      root()?.addEventListener?.("STSettingsOpenRequest", (event) => {
        openSettings(event?.detail?.category || "", {
          filteredReviews: event?.detail?.filteredReviews === true,
        });
      });
    } catch {
    }
  }

  function bindSettingsOpenMessage() {
    try {
      if (globalThis.STMessageBus?.listen) {
        globalThis.STMessageBus.listen(SETTINGS_OPEN_MESSAGE, (request) => {
          openSettings(request.category || "");
          return false;
        }, {
          owner: "extension:content",
          key: "settings-open",
        });
        return;
      }
      chrome.runtime.onMessage.addListener((request) => {
        if (request?.type !== SETTINGS_OPEN_MESSAGE) {
          return false;
        }
        openSettings(request.category || "");
        return false;
      });
    } catch {
    }
  }

  function runLightBoot() {
    if (!shouldLightBoot()) {
      return;
    }
    watchPageLog();
    bindSettingsOpenMessage();
    bindSettingsOpenRequest();
    loadSettingsRail("light-boot").catch(() => {});
    activateLightRuntime("settings", {
      loadStrategy: "content-script-light-boot",
    });
    if (globalThis.STPageContext?.snapshot?.().domain === "store") {
      loadStoreRuntime().catch(() => {});
    }
  }

  function storePageType() {
    return globalThis.STPageContext?.storePageType?.() || "other";
  }

  async function loadStoreRuntime() {
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    if (ctx.domain !== "store") {
      return false;
    }
    if (globalThis[STORE_LOAD_MARK] === "ready" || globalThis[STORE_LOAD_MARK] === STORE_LOAD_PENDING) {
      return true;
    }
    globalThis[STORE_LOAD_MARK] = STORE_LOAD_PENDING;
    const type = storePageType();
    try {
      if (type === "age") {
        globalThis[STORE_LOAD_MARK] = "ready";
        activateLightRuntime("store", {
          pageType: type,
          reason: "no-store-feature",
        });
        return true;
      }
      await injectContentBundle(CONTENT_BUNDLES.storeRuntime, { pageType: type });
      globalThis[STORE_LOAD_MARK] = "ready";
      activateLightRuntime("store", {
        pageType: type,
        loadStrategy: "runtime-page-chunk",
      });
      return true;
    } catch (error) {
      globalThis[STORE_LOAD_MARK] = "";
      log({
        level: "error",
        domain: "store",
        feature: "store-loader",
        event: "store-runtime-inject-failed",
        message: "商店页运行时按需加载失败",
        error,
        meta: pageMeta({ pageType: type }),
      });
      throw error;
    }
  }

  // Steam CEF 常先进入 about:blank 或脚本半就绪状态；依赖未齐时必须继续排队重试，不能直接终止注入链路
  function retryRun() {
    if (bootTries >= BOOT_MAX) {
      return false;
    }
    bootTries += 1;
    window.setTimeout(run, BOOT_MS);
    return true;
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

  function storageGet(keys) {
    if (globalThis.STSettingsBus?.rawGet) {
      return globalThis.STSettingsBus.rawGet(keys, {
        owner: "extension:content",
        reason: "content-read",
      });
    }
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

  function storageSet(data, diagnostics = {}) {
    if (globalThis.STSettingsBus?.rawSet) {
      return globalThis.STSettingsBus.rawSet(data, {
        operationId: String(diagnostics?.operationId || ""),
        owner: "extension:content",
        reason: "content-write",
      });
    }
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

  function storageRemove(keys, diagnostics = {}) {
    if (globalThis.STSettingsBus?.rawRemove) {
      return globalThis.STSettingsBus.rawRemove(keys, {
        operationId: String(diagnostics?.operationId || ""),
        owner: "extension:content",
        reason: "content-remove",
      });
    }
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

    const out = { ...STEAM_SETTING_DEFAULTS };
    if (globalThis.STSettingsBus?.loadSettingsSnapshot) {
      settingsCache = await globalThis.STSettingsBus.loadSettingsSnapshot({
        owner: "extension:content",
        ids: STEAM_SETTING_IDS,
        defaults: out,
        force,
        ttlMs: 30_000,
        reason: "content-settings-load",
      });
      return settingsCache;
    }
    const rt = await storageGet(STEAM_SETTING_IDS.map(settingKey));
    for (const id of STEAM_SETTING_IDS) {
      const value = rt[settingKey(id)];
      out[id] = typeof value === "boolean" ? value : STEAM_SETTING_DEFAULTS[id];
    }
    settingsCache = out;
    return out;
  }

  async function enabled(id) {
    const settings = await loadSettings();
    return settings[id] !== false;
  }

  async function nameAllowed() {
    return { enabled: await enabled(SORT_TITLE_ID) };
  }

  function aiConcurrency(value) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
      return AI_DEFAULTS.aiConcurrency;
    }
    return Math.min(10, Math.max(1, num));
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
      aiConcurrency: aiConcurrency(src.aiConcurrency),
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
    const legacyAiKeys = aiIds.includes("aiConcurrency") ? [transKey("aiConcurrency")] : [];
    const rt = await storageGet([
      settingKey("translate"),
      ...transIds.map(transKey),
      ...aiIds.map(aiKey),
      ...legacyAiKeys,
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
      const storeKey = aiKey(id);
      const value = id === "aiConcurrency" && !Object.hasOwn(rt, storeKey)
        ? rt[transKey("aiConcurrency")]
        : rt[storeKey];
      if (typeof def === "boolean") {
        out.ai[id] = typeof value === "boolean" ? value : def;
      } else if (typeof def === "number") {
        const num = Number(value);
        out.ai[id] = Number.isFinite(num) ? num : def;
      } else {
        out.ai[id] = typeof value === "string" ? value : def;
      }
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

  function resolvedNewsService(conf = {}) {
    const service = String(conf.newsPopupService || "follow");
    return service === "follow" ? String(conf.service || "client.edge") : service;
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
      resolvedService: resolvedNewsService(conf),
      aiConcurrency: aiConcurrency(conf?.ai?.aiConcurrency),
      to: String(conf?.to || "chinese_simplified"),
    };
  }

  function writeNewsTranslateDataset(config) {
    const el = root();
    if (!el?.dataset) {
      return;
    }
    try {
      el.dataset[NEWS_TRANSLATE_ATTR] = JSON.stringify(config || { enabled: false });
    } catch {
      el.dataset[NEWS_TRANSLATE_ATTR] = "{\"enabled\":false}";
    }
  }

  function readNewsTranslateDataset() {
    try {
      const data = JSON.parse(String(root()?.dataset?.[NEWS_TRANSLATE_ATTR] || ""));
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  async function writeNewsTranslateSettings(featureOn = null) {
    if (globalThis.STPageContext?.snapshot?.().domain !== "steam") {
      return null;
    }
    watchNewsTranslateBridge();
    const enabledFeature = featureOn == null ? await enabled(NEWS_TRANSLATE_ID) : featureOn;
    const conf = await loadTranslateConfig();
    const config = newsTranslatePublicConfig(enabledFeature, conf);
    writeNewsTranslateDataset(config);
    return config;
  }

  async function postNewsConfig(rid = "") {
    let config = null;
    try {
      config = await writeNewsTranslateSettings();
    } catch {
      config = readNewsTranslateDataset();
    }
    postNews(NEWS_TRANSLATE_CONFIG_RES, {
      rid: safeRid(rid),
      config: config || { enabled: false },
    });
  }

  function injectTranslate(conf) {
    return new Promise((resolve) => {
      try {
        if (globalThis.STMessageBus?.send) {
          globalThis.STMessageBus.send({
            type: "TRANSLATE_INJECT",
            cfg: conf,
          }, {
            timeoutMs: 12_000,
          }).then((response) => {
            resolve(response || { success: false, error: "翻译注入请求失败" });
          }).catch((error) => {
            resolve({ success: false, error: error?.message || "翻译注入请求失败" });
          });
          return;
        }
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
    const service = String(conf.newsPopupService || "follow");
    const resolved = resolvedNewsService(conf);
    const modes = resolved === "steam-buff.ai"
      ? ["manual", "aiConfig"]
      : ["manual"];
    const rtConf = {
      ...conf,
      page: false,
      selection: false,
      manual: true,
      modes,
      selectionService: service,
      newsPopupService: service,
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

  function splitLongNewsPart(text, limit) {
    const out = [];
    let rest = String(text || "");
    while (rest.length > limit) {
      let cut = limit;
      const start = Math.max(0, limit - 360);
      const probe = rest.slice(start, limit);
      const soft = Math.max(
        probe.lastIndexOf("\n"),
        probe.lastIndexOf(". "),
        probe.lastIndexOf("! "),
        probe.lastIndexOf("? "),
        probe.lastIndexOf("。"),
        probe.lastIndexOf("！"),
        probe.lastIndexOf("？"),
        probe.lastIndexOf("；"),
        probe.lastIndexOf("; ")
      );
      if (soft > 80) {
        cut = start + soft + 1;
      }
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) {
      out.push(rest);
    }
    return out;
  }

  function newsTextChunks(text) {
    const out = [];
    let cur = "";
    const push = () => {
      if (cur) {
        out.push(cur);
        cur = "";
      }
    };
    for (const part of String(text || "").split(/(\n+)/)) {
      if (!part) {
        continue;
      }
      if (part.length > NEWS_AI_HARD_CHUNK_CHARS) {
        push();
        out.push(...splitLongNewsPart(part, NEWS_AI_HARD_CHUNK_CHARS));
        continue;
      }
      if (cur && cur.length + part.length > NEWS_AI_CHUNK_CHARS) {
        push();
      }
      cur += part;
    }
    push();
    return out.length ? out : [String(text || "")];
  }

  function newsRequestTexts(data = {}) {
    if (Array.isArray(data.texts)) {
      return data.texts.map((text) => String(text || "").replace(/\s+\n/g, "\n").trim());
    }
    return [String(data.text || "").replace(/\s+\n/g, "\n").trim()];
  }

  function newsRequestMeta(data = {}) {
    const raw = data?.meta;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  async function translateNewsAiTexts(rtConf, texts, options = {}) {
    const to = options.to || rtConf.to || "chinese_simplified";
    const fn = globalThis.STTranslateAI?.translate;
    if (typeof fn !== "function") {
      throw new Error("AI 翻译模块未加载");
    }
    const response = await fn(rtConf, {
      from: "auto",
      to,
      mode: NEWS_AI_MODE,
      meta: options.meta || {},
      text: encodeURIComponent(JSON.stringify(texts)),
    }, {
      timeoutMs: NEWS_AI_TIMEOUT_MS,
    });
    const out = Array.isArray(response?.text) ? response.text.map((text) => String(text || "")) : [];
    if (out.length !== texts.length) {
      throw new Error("AI 新闻分块翻译结果数量不一致");
    }
    return {
      text: out.join("\n"),
      texts: out,
      meta: {
        service: AI_SERVICE,
        length: texts.reduce((sum, text) => sum + text.length, 0),
        textCount: texts.length,
        chunkCount: 1,
        maxChunkLength: texts.reduce((max, text) => Math.max(max, text.length), 0),
        timeoutMs: NEWS_AI_TIMEOUT_MS,
      },
    };
  }

  async function translateNewsText(rtConf, text, options = {}) {
    const service = String(options.service || rtConf.newsPopupService || "follow");
    const to = options.to || rtConf.to || "chinese_simplified";
    const resolved = globalThis.STTranslateText.serviceFor?.(globalThis.translate, rtConf, service) || service;
    const isAi = resolved === AI_SERVICE;
    if (Array.isArray(text)) {
      if (isAi) {
        return translateNewsAiTexts(rtConf, text, options);
      }
      const translatedItems = [];
      const metas = [];
      for (const item of text) {
        const result = await translateNewsText(rtConf, item, options);
        translatedItems.push(String(result.text || ""));
        metas.push(result.meta || null);
      }
      return {
        text: translatedItems.join("\n"),
        texts: translatedItems,
        meta: {
          service: resolved,
          length: text.reduce((sum, item) => sum + item.length, 0),
          textCount: text.length,
          chunkCount: metas.reduce((sum, meta) => sum + (meta?.chunkCount || 1), 0),
          items: metas,
        },
      };
    }
    const chunks = isAi ? newsTextChunks(text) : [text];
    const translated = [];
    for (const chunk of chunks) {
      const result = await globalThis.STTranslateText.translateText(globalThis.translate, rtConf, chunk, {
        from: "auto",
        to,
        service,
        ...(isAi ? { mode: NEWS_AI_MODE, meta: options.meta || {} } : {}),
        ...(isAi ? { timeoutMs: NEWS_AI_TIMEOUT_MS } : {}),
      });
      translated.push(String(result || ""));
    }
    return {
      text: translated.join(""),
      texts: [translated.join("")],
      meta: {
        service: resolved,
        length: text.length,
        chunkCount: chunks.length,
        maxChunkLength: chunks.reduce((max, chunk) => Math.max(max, chunk.length), 0),
        timeoutMs: isAi ? NEWS_AI_TIMEOUT_MS : 0,
      },
    };
  }

  async function handleNewsTextRequest(data) {
    const rid = safeRid(data?.rid);
    const startedAt = Date.now();
    const texts = newsRequestTexts(data);
    const meta = newsRequestMeta(data);
    const text = texts.join("\n");
    if (!texts.length || !texts.some(Boolean)) {
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
      const input = Array.isArray(data?.texts) ? texts : text;
      const result = await translateNewsText(rtConf, input, {
        to: conf.to || "chinese_simplified",
        service,
        meta,
      });
      postNews(NEWS_TRANSLATE_TEXT_RES, {
        rid,
        ok: true,
        text: String(result.text || ""),
        texts: Array.isArray(result.texts) ? result.texts : [String(result.text || "")],
        meta: {
          ...result.meta,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      log({
        level: "error",
        domain: "steam",
        feature: NEWS_TRANSLATE_ID,
        event: "steam-news-translate-failed",
        message: "Steam 新闻翻译请求失败",
        requestId: rid,
        error,
        meta: pageMeta({
          durationMs: Date.now() - startedAt,
          textCount: texts.length,
          textLength: text.length,
        }),
      });
      postNews(NEWS_TRANSLATE_TEXT_RES, {
        rid,
        ok: false,
        error: error?.message || String(error || "翻译失败"),
      });
    }
  }

  /* Steam 新闻翻译桥接 */
  function watchNewsTranslateBridge() {
    if (!isSteamContentTarget()) {
      return;
    }
    if (
      globalThis[NEWS_TRANSLATE_BRIDGE_HANDLER_MARK] === RUN_VERSION &&
      typeof globalThis[NEWS_TRANSLATE_BRIDGE_HANDLER_REF] === "function"
    ) {
      globalThis[NEWS_TRANSLATE_BRIDGE_MARK] = RUN_VERSION;
      watchNewsTranslate = true;
      return;
    }
    if (typeof globalThis[NEWS_TRANSLATE_BRIDGE_HANDLER_REF] === "function") {
      window.removeEventListener("message", globalThis[NEWS_TRANSLATE_BRIDGE_HANDLER_REF]);
    }
    watchNewsTranslate = true;
    globalThis[NEWS_TRANSLATE_BRIDGE_MARK] = RUN_VERSION;
    globalThis[NEWS_TRANSLATE_BRIDGE_HANDLER_MARK] = RUN_VERSION;
    const bridgeHandler = (event) => {
      const data = event.data || {};
      if (data.source !== "steam-buff-page") {
        return;
      }
      if (data.type === NEWS_TRANSLATE_CONFIG_REQ) {
        postNewsConfig(data.rid).catch((error) => {
          log({
            level: "warn",
            domain: "steam",
            feature: NEWS_TRANSLATE_ID,
            event: "steam-news-translate-config-failed",
            message: "Steam 新闻翻译配置读取失败，已返回关闭状态",
            requestId: safeRid(data.rid),
            error,
            meta: pageMeta(),
          });
          postNews(NEWS_TRANSLATE_CONFIG_RES, {
            rid: safeRid(data.rid),
            config: readNewsTranslateDataset() || { enabled: false },
          });
        });
        return;
      }
      if (data.type === NEWS_TRANSLATE_TEXT_REQ) {
        handleNewsTextRequest(data).catch((error) => {
          log({
            level: "error",
            domain: "steam",
            feature: NEWS_TRANSLATE_ID,
            event: "steam-news-translate-failed",
            message: "Steam 新闻翻译请求处理异常",
            requestId: safeRid(data.rid),
            error,
            meta: pageMeta(),
          });
          postNews(NEWS_TRANSLATE_TEXT_RES, {
            rid: safeRid(data.rid),
            ok: false,
            error: error?.message || String(error || "翻译失败"),
          });
        });
      }
    };
    globalThis[NEWS_TRANSLATE_BRIDGE_HANDLER_REF] = bridgeHandler;
    window.addEventListener("message", bridgeHandler);
  }

  function isSteamNewsTranslateBridgeTarget() {
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    if (ctx.domain !== "steam") {
      return false;
    }
    if (ctx.title === "Steam" || ctx.steam?.aboutMain === true) {
      return true;
    }
    try {
      return String(location.href || "").startsWith("about:blank") &&
        /(?:[?&])browserType=4(?:&|$)/u.test(String(location.href || ""));
    } catch {
      return false;
    }
  }

  function ensureSteamNewsTranslateBridge() {
    if (isSteamNewsTranslateBridgeTarget()) {
      watchNewsTranslateBridge();
    }
  }

  function trustedNamePage() {
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    return ctx.domain === "steam" || ctx.domain === "store";
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

  async function openNameAccountCenter(data) {
    const response = await globalThis.STMessageBus.request({
      type: CHROMIUM_WINDOW_OPEN,
      url: chrome.runtime.getURL(SETTINGS_CENTER_PAGE),
      requestId: safeRid(data.rid),
    }, {
      timeoutMs: 10_000,
      expectSuccess: true,
    });
    if (response?.opened !== true) {
      throw new Error("用户中心打开失败");
    }
    postName({
      type: "open-account-result",
      rid: data.rid || "",
      ok: true,
      data: { opened: true },
    });
  }

  // 页面主上下文无法直接调用 chrome API，标题/库自定义名统一走 DOM 属性桥接到内容脚本
  async function getAuth() {
    const rt = await storageGet([AUTH_KEY]);
    return cleanAuth(rt[AUTH_KEY]);
  }

  async function saveAuth(auth, diagnostics = {}) {
    const next = cleanAuth(auth);
    if (!next) {
      await clearAuthOrThrow(diagnostics);
      return null;
    }
    const saved = await storageSet({ [AUTH_KEY]: next }, diagnostics);
    if (saved !== true) {
      const error = new Error("登录状态保存失败");
      error.code = "AUTH_STORAGE_WRITE_FAILED";
      throw error;
    }
    return next;
  }

  async function clearAuth(diagnostics = {}) {
    return (await storageRemove([AUTH_KEY], diagnostics)) === true;
  }

  async function clearAuthOrThrow(diagnostics = {}) {
    if (await clearAuth(diagnostics)) {
      return true;
    }
    const error = new Error("本地登录状态清理失败");
    error.code = "AUTH_STORAGE_REMOVE_FAILED";
    throw error;
  }

  async function touchAuth(auth, diagnostics = {}) {
    try {
      await saveAuth({ ...auth, last_used_at: Date.now() }, diagnostics);
      return true;
    } catch (error) {
      log({
        level: "warn",
        domain: "extension",
        feature: NAME_ID,
        event: "library-custom-name-auth-persist-failed",
        message: "库自定义名称鉴权状态更新失败，但远端操作结果已保留",
        operationId: diagnostics.operationId || "",
        requestId: diagnostics.requestId || "",
        error,
        meta: pageMeta(),
      });
      return false;
    }
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
        if (globalThis.STMessageBus?.send) {
          globalThis.STMessageBus.send({
            type: "STORE_FETCH",
            ...request,
          }, {
            timeoutMs: request.timeoutMs || 12_000,
          }).then((response) => {
            if (!response?.success) {
              reject(new Error(response?.error || "后台请求失败"));
              return;
            }
            resolve(response);
          }).catch(reject);
          return;
        }
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

  function authError(message) {
    const error = new Error(message);
    error.code = 401;
    return error;
  }

  async function refreshAuth(auth, diagnostics = {}) {
    if (!auth?.refresh_token) {
      await clearAuthOrThrow(diagnostics);
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
      operationId: diagnostics.operationId || "",
      requestId: diagnostics.requestId || "",
    });
    const body = parseBody(response);
    const code = Number(body?.code) || response.status || 0;
    if (code < 200 || code >= 300 || !body?.access_token) {
      await clearAuthOrThrow(diagnostics);
      throw authError(body?.message || "登录已过期，请重新登录");
    }

    const next = nextAuth(body, auth);
    await saveAuth(next, diagnostics);
    return next;
  }

  async function readyAuth(diagnostics = {}) {
    const auth = await getAuth();
    if (!auth?.access_token && !auth?.refresh_token) {
      throw authError("请先在设置中登录");
    }
    if (authSession.expired(auth)) {
      return refreshAuth(auth, diagnostics);
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
    const diagnostics = { requestId: rid };
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
      let auth = await readyAuth(diagnostics);
      let response = await sendQuery(payload, auth, diagnostics);
      let body = parseBody(response);
      let code = Number(body?.code) || response.status || 0;
      if (code === 401 && auth?.refresh_token) {
        auth = await refreshAuth(auth, diagnostics);
        response = await sendQuery(payload, auth, diagnostics);
        body = parseBody(response);
        code = Number(body?.code) || response.status || 0;
      }
      if (code < 200 || code >= 300) {
        postName({
          type: "query-result",
          rid,
          ok: false,
          code,
          error: `[${code}] ${body?.message || "查询失败"}`,
        });
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
      await touchAuth(auth, diagnostics);
      postName({ type: "query-result", rid, ok: true, data: body });
    } catch (error) {
      postName({
        type: "query-result",
        rid,
        ok: false,
        code: Number(error?.code) || 0,
        error: error?.message || String(error),
      });
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

  function sendQuery(body, auth, diagnostics = {}) {
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
      operationId: diagnostics.operationId || "",
      requestId: diagnostics.requestId || "",
    });
  }

  async function submitFeedback(data) {
    const rid = data?.rid || "";
    const diagnostics = {
      operationId: data?.operationId || "",
      requestId: rid,
    };
    const status = await nameAllowed();
    if (!status.enabled) {
      postName({ type: "feedback-result", rid, ok: false, data: { code: 403, message: "功能已关闭" } });
      return;
    }

    try {
      let auth = await readyAuth(diagnostics);
      let response = await sendFeedback(data, auth);
      let body = parseBody(response);
      let code = Number(body?.code) || response.status || 0;
      if (code === 401 && auth?.refresh_token) {
        auth = await refreshAuth(auth, diagnostics);
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
          operationId: data?.operationId || "",
          meta: bridgeNameMeta(data, { code, status: response.status || 0 }),
        });
        return;
      }
      if (code !== 401) {
        await touchAuth(auth, diagnostics);
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
        operationId: data?.operationId || "",
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
      const validation = globalThis.STLoggerSchema?.validateEntry?.(event.data.entry);
      if (validation?.ok !== true) {
        return;
      }
      globalThis.STLogger?.append?.(event.data.entry, {
        forcePersist: event.data.forcePersist === true,
      });
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
      operationId: data?.operationId || "",
      requestId: data?.rid || "",
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
    // MutationObserver 可能重复读到同一个 rid，短缓存只用于去重，不影响后续新的页面请求
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
    if (data.script !== NAME_ID || data.side !== "page"
        || !["query", "feedback", "open-account"].includes(data.type)) {
      return;
    }
    if (seenName(data)) {
      return;
    }
    if (data.type === "open-account") {
      openNameAccountCenter(data).catch((error) => {
        postName({
          type: "open-account-result",
          rid: data.rid || "",
          ok: false,
          error: error?.message || String(error),
        });
      });
      return;
    }
    if (data.type === "feedback") {
      submitFeedback(data).catch((error) => {
        postName({ type: "feedback-result", rid: data.rid || "", ok: false, data: { code: 0, message: error?.message || String(error) } });
      });
      return;
    }
    queryNames(data).catch((error) => {
      postName({
        type: "query-result",
        rid: data.rid || "",
        ok: false,
        code: Number(error?.code) || 0,
        error: error?.message || String(error),
      });
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
    // 只监听 documentElement 上的请求属性，用于隔离上下文桥接，不观察 DOM 子树
      obs.observe(el, {
        attributes: true,
        attributeFilter: [NAME_REQ_ATTR],
      });
      handleName(readNameReq());
    } catch {
      watchNames = false;
    }
  }

  function steamSettingsFrom(all = {}) {
    const settings = {};
    for (const id of STEAM_SETTING_IDS) {
      settings[id] = typeof all[id] === "boolean" ? all[id] : STEAM_SETTING_DEFAULTS[id];
    }
    return settings;
  }

  function disabledSteamFeatureIds(prev = {}, next = {}) {
    return STEAM_FEATURE_IDS.filter((featureId) => {
      const settingId = STEAM_FEATURE_SETTING_IDS[featureId];
      if (featureId === SORT_TITLE_ID) {
        const wasActive = prev[SORT_TITLE_ID] !== false || prev["library-group-labels"] !== false;
        const isActive = next[SORT_TITLE_ID] !== false || next["library-group-labels"] !== false;
        return wasActive && !isActive;
      }
      return prev[settingId] !== false && next[settingId] === false;
    });
  }

  function playerStatsRequest(attribute) {
    try {
      return JSON.parse(root()?.getAttribute(attribute) || "{}");
    } catch {
      return {};
    }
  }

  function takePlayerStatsRequest(attribute) {
    const data = playerStatsRequest(attribute);
    try {
      root()?.removeAttribute(attribute);
    } catch {
    }
    return data;
  }

  function postPlayerStats(data) {
    try {
      const attribute = PLAYER_STATS_RES_ATTRS[String(data?.part || "")];
      if (!attribute) return;
      root()?.setAttribute(attribute, JSON.stringify({
        script: PLAYER_STATS_ID,
        side: "content",
        ...data,
      }));
    } catch {
    }
  }

  async function handlePlayerStats(data) {
    const appId = Number.parseInt(String(data?.appid || ""), 10);
    const part = String(data?.part || "");
    const route = String(data?.route || "");
    const routeMatch = route.match(/^\/library\/app\/(\d+)$/);
    if (data?.script !== PLAYER_STATS_ID || data?.side !== "page" || data?.type !== "fetch"
        || (part !== "gmcharts" && part !== "steam-current" && part !== "augmented-peak") || !String(data?.rid || "") || !Number.isInteger(appId) || appId <= 0
        || !routeMatch || Number.parseInt(routeMatch[1], 10) !== appId) {
      return;
    }
    try {
      const response = await globalThis.STMessageBus.request({
        type: "PLAYER_STATS_FETCH",
        part,
        appid: String(appId),
        route,
        timeoutMs: 12_000,
      }, {
        timeoutMs: 12_000,
        dedupeKey: `player-stats:${part}:${appId}`,
        expectSuccess: false,
      });
      postPlayerStats({ part, rid: data.rid, ...response });
    } catch (error) {
      postPlayerStats({ part, rid: data.rid, success: false, error: error?.message || String(error) });
    }
  }

  function isSteamPlayerStatsBridgeTarget() {
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    return ctx.domain === "steam" && (ctx.title === "Steam" || ctx.steam?.aboutMain === true);
  }

  function watchPlayerStatsReq() {
    if (!isSteamPlayerStatsBridgeTarget()) {
      return;
    }
    const el = root();
    if (!el || el.dataset.steamBuffPlayerStatsBridge === "1") return;
    el.dataset.steamBuffPlayerStatsBridge = "1";
    try {
      const observer = new MutationObserver((items) => {
        const attributes = new Set(items.map((item) => item.attributeName).filter((attribute) => Object.values(PLAYER_STATS_REQ_ATTRS).includes(attribute)));
        for (const attribute of attributes) {
          void handlePlayerStats(takePlayerStatsRequest(attribute));
        }
      });
      // 每一路请求使用独立属性，避免并行请求在同一 MutationObserver 批次内互相覆盖。
      const requestAttributes = Object.values(PLAYER_STATS_REQ_ATTRS);
      observer.observe(el, { attributes: true, attributeFilter: requestAttributes });
      for (const attribute of requestAttributes) {
        void handlePlayerStats(takePlayerStatsRequest(attribute));
      }
    } catch {
      delete el.dataset.steamBuffPlayerStatsBridge;
    }
  }

  function notifySteamFeaturesDisabled(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
      return;
    }
    try {
      window.postMessage({
        type: STEAM_FEATURES_DISABLED_MESSAGE,
        keys,
      }, "*");
    } catch {
    }
  }

  function readSteamSettingsSnapshot() {
    if (steamSettingsSnapshot && typeof steamSettingsSnapshot === "object") {
      return steamSettingsSnapshot;
    }
    try {
      const raw = root()?.dataset?.[SETTINGS_ATTR] || "";
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  async function writeSteamSettings(options = {}) {
    const el = root();
    if (!el) {
      return;
    }

    // Steam 主上下文脚本通过 dataset 读取开关快照，避免每次按钮点击都等待内容脚本往返
    const onPhase = typeof options.onPhase === "function" ? options.onPhase : () => {};
    const prev = readSteamSettingsSnapshot();
    onPhase("settings-load");
    const settings = steamSettingsFrom(await loadSettings());

    try {
      el.dataset[SETTINGS_ATTR] = JSON.stringify(settings);
    } catch {
      el.dataset[SETTINGS_ATTR] = "{}";
    }
    steamSettingsSnapshot = settings;
    if (options.notifyDisabled !== false && prev) {
      notifySteamFeaturesDisabled(disabledSteamFeatureIds(prev, settings));
    }
    onPhase("locale-load");
    await writeUiLocale();
    onPhase("settings-ready");
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
    el.dataset[LOCALE_ATTR] = globalThis.STI18n.normalizeLocale(locale);
  }

  function watchSettingsChanges() {
    if (watchSettings) {
      return;
    }
    watchSettings = true;

    try {
      if (globalThis.STSettingsBus?.subscribe) {
        globalThis.STSettingsBus.subscribe((event) => {
          const keys = event.changedKeys || [];
          const localeHit = keys.includes(UI_LOCALE_KEY);
          const hit = STEAM_SETTING_IDS.some(id => keys.includes(settingKey(id)));
          if (hit) {
            settingsCache = null;
            if (globalThis.STPageContext?.snapshot?.().domain === "steam") {
              writeSteamSettings().catch(() => {});
            }
          }
          if (localeHit) {
            writeUiLocale().catch(() => {});
          }
        }, {
          owner: "extension:content",
          key: "settings-watch",
          prefixes: [SETTINGS_PREFIX, TRANS_PREFIX, AI_PREFIX],
          keys: [UI_LOCALE_KEY],
        });
        return;
      }
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
          return;
        }
        const localeHit = Object.hasOwn(changes || {}, UI_LOCALE_KEY);
        const keys = Object.keys(changes || {});
        const hit = STEAM_SETTING_IDS.some(id => Object.hasOwn(changes, settingKey(id)));
        if (hit) {
          settingsCache = null;
          if (globalThis.STPageContext?.snapshot?.().domain === "steam") {
            writeSteamSettings().catch(() => {});
          }
        }
        if (localeHit) {
          writeUiLocale().catch(() => {});
        }
      });
    } catch {
    }
  }

  function run() {
    if (window.STPerformanceMonitor) {
      STPerformanceMonitor.start();
    }
    watchPageLog();
    bindSettingsOpenMessage();
    bindSettingsOpenRequest();
    watchSettingsChanges();
    ensureSteamNewsTranslateBridge();
    logOnce("content-script-start", {
      level: "info",
      domain: "extension",
      feature: "content-script",
      event: "content-script-start",
      message: "内容脚本已启动",
      meta: pageMeta(),
    });
    const inj = globalThis.STInject;

    // ⚠️ 历史问题：Steam CEF 复用旧窗口时可能只拿到半套内容脚本，必须先补齐共享依赖再启动页面运行时
    if (isSteamContentTarget() && !readySteamDeps()) {
      steamRuntimeLogOnce("steam-runtime-deps-waiting", {
        level: "info",
        domain: "steam",
        feature: "steam-runtime",
        event: "runtime-deps-waiting",
        message: "Steam 运行时等待注入依赖就绪",
        meta: pageMeta({ bootTries }),
      });
      waitSteamContentDeps();
      return;
    }

    const gd = globalThis.STGuard;
    if (isSteamContentTarget()) {
      globalThis[RUN_MARK] = RUN_PENDING;
    }
    // guard.ok() 失败通常表示页面仍是 about:blank 或非目标 frame，继续 retry 才能覆盖后续 ready 的 Steam CEF
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
    watchPlayerStatsReq();

    if (!gd.lock()) {
      if (pageRuntimeReady()) {
        globalThis[RUN_MARK] = RUN_VERSION;
        return;
      }
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

    const injection = beginSteamRuntimeInjection();
    const operationId = injection.operationId;
    const attempt = injection.attempt;
    let injectPhase = "settings-load";
    if (attempt === 1) {
      steamRuntimeLogOnce(`runtime-inject-start:${operationId}`, {
        level: "info",
        domain: "steam",
        feature: "steam-runtime",
        event: "runtime-inject-start",
        message: "开始注入 Steam 运行时",
        operationId,
        meta: steamRuntimeInjectionMeta({ phase: injectPhase }),
      });
    }

    writeSteamSettings({
      notifyDisabled: false,
      onPhase: (phase) => {
        injectPhase = phase;
      },
    })
      .then(() => {
        injectPhase = "resource-load";
        return inj.inject([
          "shared/logger-schema.js",
          "extension/runtime/logger.js",
          "shared/logger-factory.js",
          "shared/config.js",
          "shared/error-boundary.js",
          "shared/i18n.js",
          "shared/styles/theme.js",
          "shared/utils/dom.js",
          "shared/styles/components.js",
          "shared/performance-monitor.js",
          "shared/scheduler.js",
          "shared/observer-utils.js",
          "shared/data-index.js",
          "shared/batch-queue.js",
          "shared/virtual-list.js",
          "shared/utils/player-stats.js",
          "shared/utils/player-stats-ui.js",
          "shared/page-context.js",
          "shared/runtime/kernel.js",
          "shared/runtime/surface-manager.js",
          "steam/shared/constants.js",
          "steam/runtime/paths.js",
          "steam/runtime/steam-context.js",
          "steam/runtime/context-router.js",
          "steam/runtime/surface-hosts.js",
          "steam/runtime/styles.js",
          "steam/runtime/download-toolbar.js",
          "steam/runtime/feature-registry.js",
          "steam/features/features.js",
          "steam/main.js",
        ]);
      })
      .then(() => {
        injectPhase = "runtime-ready";
        if (!pageRuntimeReady(operationId)) {
          const error = new Error("Steam 页面运行时未回写 ready 回执");
          error.name = "SteamRuntimeReadyError";
          throw error;
        }
        globalThis[RUN_MARK] = RUN_VERSION;
        steamRuntimeLogOnce(`runtime-inject-success:${operationId}`, {
          level: attempt > 1 ? "warn" : "info",
          domain: "steam",
          feature: "steam-runtime",
          event: "runtime-inject-success",
          message: "Steam 运行时注入完成",
          operationId,
          durationMs: Date.now() - steamRuntimeInjectStartedAt,
          ...runtimeInjectionRetryMeta(attempt),
          meta: steamRuntimeInjectionMeta({
            phase: "runtime-ready",
            ...(attempt > 1 ? { recovered: true } : {}),
            ...(steamRuntimeLastInjectFailurePhase
              ? { previousFailurePhase: steamRuntimeLastInjectFailurePhase }
              : {}),
          }),
        });
        steamRuntimeInjectAttempt = 0;
        steamRuntimeLastInjectFailurePhase = "";
      })
      .catch((error) => {
        globalThis[RUN_MARK] = "";
        clearPageRuntimeReady(operationId);
        gd.fail();
        steamRuntimeLastInjectFailurePhase = injectPhase;
        const retryDelay = scheduleRuntimeInjectionRetry(attempt);
        if (retryDelay !== null) {
          steamRuntimeLogOnce(`runtime-inject-retry:${operationId}:${attempt}`, {
            level: "warn",
            domain: "steam",
            feature: "steam-runtime",
            event: "runtime-inject-retry",
            message: "Steam 运行时注入失败，等待有限重试",
            operationId,
            durationMs: Date.now() - steamRuntimeInjectStartedAt,
            error,
            retry: {
              attempt,
              maxAttempts: RUNTIME_INJECT_MAX_ATTEMPTS,
              delayMs: retryDelay,
            },
            meta: steamRuntimeInjectionMeta({ phase: injectPhase }),
          });
          return;
        }
        steamRuntimeLogOnce(`runtime-inject-failed:${operationId}`, {
          level: "error",
          domain: "steam",
          feature: "steam-runtime",
          event: "runtime-inject-failed",
          message: "注入 Steam 运行时失败",
          operationId,
          durationMs: Date.now() - steamRuntimeInjectStartedAt,
          error,
          retry: { attempt, maxAttempts: RUNTIME_INJECT_MAX_ATTEMPTS },
          meta: steamRuntimeInjectionMeta({ phase: injectPhase }),
        });
        steamRuntimeInjectAttempt = 0;
        steamRuntimeLastInjectFailurePhase = "";
      });
  }

  function shouldWaitSteamTitle() {
    return globalThis.STPageContext?.shouldWaitSteamTitle?.() === true;
  }

  function shouldWaitSteamRuntimeScope() {
    return globalThis.STPageContext?.shouldWaitSteamRuntimeScope?.() === true;
  }

  function boot() {
    if (globalThis[RUN_MARK] === RUN_VERSION || globalThis[RUN_MARK] === RUN_PENDING) {
      return;
    }

    if (shouldWaitSteamTitle()) {
      const tries = Number(globalThis[STEAM_TITLE_WAIT_TRIES]) || 0;
      if (tries < STEAM_TITLE_WAIT_MAX) {
        globalThis[RUN_MARK] = RUN_PENDING;
        globalThis[STEAM_TITLE_WAIT_TRIES] = tries + 1;
        window.setTimeout(() => {
          if (globalThis[RUN_MARK] === RUN_PENDING) {
            globalThis[RUN_MARK] = "";
          }
          boot();
        }, STEAM_TITLE_WAIT_MS);
        return;
      }
    }

    if (!shouldInject()) {
      if (shouldWaitSteamRuntimeScope()) {
        const tries = Number(globalThis[STEAM_SCOPE_WAIT_TRIES]) || 0;
        if (tries < STEAM_SCOPE_WAIT_MAX) {
          globalThis[RUN_MARK] = RUN_PENDING;
          globalThis[STEAM_SCOPE_WAIT_TRIES] = tries + 1;
          window.setTimeout(() => {
            if (globalThis[RUN_MARK] === RUN_PENDING) {
              globalThis[RUN_MARK] = "";
            }
            boot();
          }, STEAM_TITLE_WAIT_MS);
          return;
        }
      }
      // 被排除页面也标记为已处理，避免后台补注入反复命中 Steam CEF 菜单页
      globalThis[RUN_MARK] = RUN_VERSION;
      runLightBoot();
      cleanupExcludedSteamRuntime();
      return;
    }

    globalThis[RUN_MARK] = "";
    if (isSteamContentTarget() && !steamContentDepsReady()) {
      waitSteamContentDeps();
      return;
    }

    globalThis[RUN_MARK] = isSteamContentTarget() ? RUN_PENDING : RUN_VERSION;
    if (globalThis.STPageContext?.snapshot?.().domain !== "steam") {
      runLightBoot();
      return;
    }

    run();
  }

  boot();
})();
