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
  const RUN_VERSION = "steam-buff-runtime-v4";
  const RUN_PENDING = `${RUN_VERSION}:pending`;
  const EXCLUDED_STEAM_CLEANUP_SCRIPT = "steam/runtime/cleanup-stale.js";
  const SETTINGS_OPEN_MESSAGE = "STEAM_BUFF_OPEN_SETTINGS";
  const SETTINGS_LOAD_MARK = "__steamBuffSettingsChunk";
  const SETTINGS_LOAD_PENDING = `${SETTINGS_LOAD_MARK}:pending`;
  const SETTINGS_RAIL_LOAD_MARK = "__steamBuffSettingsRailChunk";
  const SETTINGS_RAIL_LOAD_PENDING = `${SETTINGS_RAIL_LOAD_MARK}:pending`;
  const STORE_LOAD_MARK = "__steamBuffStoreChunk";
  const STORE_LOAD_PENDING = `${STORE_LOAD_MARK}:pending`;
  const STEAM_TITLE_WAIT_MS = 100;
  const STEAM_TITLE_WAIT_MAX = 80;
  const STEAM_TITLE_WAIT_TRIES = "__steamBuffTitleWaitTries";
  const STEAM_CONTENT_DEPS_LOAD_MARK = "__steamBuffSteamContentDepsLoad";
  const STEAM_CONTENT_DEPS_PENDING = `${STEAM_CONTENT_DEPS_LOAD_MARK}:pending`;
  const STEAM_CONTENT_SHARED_SCRIPTS = Object.freeze([
    "shared/config.js",
    "shared/i18n.js",
    "shared/performance-monitor.js",
    "extension/runtime/guard.js",
    "extension/runtime/injector.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/page-context.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
  ]);

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
  const COMMUNITY_MARK = "steamBuffCommunityInjected";
  const SETTINGS_ATTR = "steamBuffSettings";
  const NEWS_TRANSLATE_ATTR = "steamBuffNewsTranslate";
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
  const SETTINGS_SHARED_SCRIPTS = Object.freeze([
    "ai/config.js",
    "shared/config.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/i18n.js",
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/page-context.js",
    "shared/runtime/kernel.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "settings/catalog.js",
    "settings/membership.js",
    "settings/storage.js",
  ]);
  const SETTINGS_RAIL_SCRIPTS = Object.freeze([
    "shared/i18n.js",
    "shared/styles/theme.js",
    "settings/ui/assets.js",
    "settings/ui/styles.js",
    "settings/floating-rail.js",
  ]);
  const SETTINGS_UI_SCRIPTS = Object.freeze([
    "settings/api/request.js",
    "settings/update-log-renderer.js",
    "settings/update-checker.js",
    "settings/settings-backup.js",
    "settings/pages/registry.js",
    "settings/pages/about.js",
    "settings/update-reminder.js",
    "settings/pages/account/style.js",
    "settings/pages/account/state.js",
    "settings/pages/account/api.js",
    "settings/pages/account/auth.js",
    "settings/pages/account/device-login.js",
    "settings/pages/account/center.js",
    "settings/pages/account/view.js",
    "settings/pages/account/actions.js",
    "settings/pages/account.js",
    "settings/startup-animation.js",
    "settings/ui/html.js",
    "settings/ui/assets.js",
    "settings/ui/styles.js",
    "settings/ui/dialogs.js",
    "settings/ui/toast.js",
    "settings/ui/fields.js",
    "settings/ui/feature-row.js",
    "settings/panels/review-filter.js",
    "settings/panels/search-suggestions.js",
    "settings/panels/see.js",
    "settings/panels/ai.js",
    "settings/panels/translate.js",
    "settings/menu/dependencies.js",
    "settings/menu/panels.js",
    "settings/menu/shell.js",
    "settings/menu/controller.js",
    "settings/menu/events.js",
    "settings/floating-menu.js",
  ]);
  const STORE_BASE_SCRIPTS = Object.freeze([
    "shared/styles/theme.js",
    "shared/errors.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/utils/format.js",
    "shared/performance-monitor.js",
    "shared/scheduler.js",
    "shared/observer-utils.js",
    "shared/data-index.js",
    "shared/batch-queue.js",
    "shared/virtual-list.js",
    "shared/page-context.js",
    "shared/runtime/kernel.js",
    "store/runtime/config.js",
    "store/runtime/context.js",
    "store/runtime/cache.js",
    "store/runtime/assets.js",
    "store/runtime/format.js",
    "store/runtime/dom.js",
    "store/runtime/styles.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "store/runtime/feature-registry.js",
    "store/runtime/settings-gate.js",
    "store/runtime/url-watch.js",
    "store/runtime/purchase-recover.js",
    "shared/config.js",
    "shared/i18n.js",
    "shared/auth-client.js",
    "settings/catalog.js",
    "settings/membership.js",
    "settings/storage.js",
    "settings/ui/html.js",
    "settings/ui/styles.js",
    "settings/ui/dialogs.js",
    "settings/ui/toast.js",
    "store/api/request.js",
  ]);
  const STORE_FEATURE_CHUNKS = Object.freeze({
    details: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/price-history.js",
      "store/features/steampy-deals.js",
      "store/features/audio-check.js",
      "store/features/family-sharing.js",
      "store/features/drm-warning.js",
      "store/features/subscription-info.js",
      "store/features/dlc-bridge.js",
      "store/features/dlc-scan.js",
      "store/features/dlc-checkboxes.js",
      "store/features/cart-select.js",
      "store/features/review-filter-core.js",
      "store/features/review-filter.js",
      "store/features/search-suggestions.js",
      "store/features/wishlist-dom.js",
      "store/features/title-custom-name.js",
      "store/features/game-notes.js",
    ]),
    wishlist: Object.freeze([
      "store/features/wishlist-price-history-core.js",
      "store/features/wishlist-price-history.js",
      "store/features/review-filter-core.js",
      "store/features/search-suggestions.js",
      "store/features/wishlist-dom.js",
      "store/features/title-custom-name.js",
      "store/features/game-notes.js",
    ]),
    search: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/review-filter-core.js",
      "store/features/search-suggestions.js",
      "store/features/subscription-info.js",
      "store/features/game-notes.js",
    ]),
    cart: Object.freeze([
      "store/features/cart-select.js",
    ]),
    history: Object.freeze([
      "store/features/purchase-history-classifier.user.js",
      "store/features/purchase-history-classifier.js",
    ]),
    other: Object.freeze([
      "store/features/review-filter-core.js",
      "store/features/search-suggestions.js",
      "store/features/game-notes.js",
    ]),
  });
  const STORE_START_SCRIPTS = Object.freeze([
    "store/features/features.js",
    "store/main.js",
  ]);
  const SEEN_NAME_MAX = 200;
  const BOOT_MS = 250;
  const BOOT_MAX = 480;
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
    const ctx = globalThis.STPageContext?.snapshot?.() || {};
    return {
      host: ctx.host || location.hostname,
      path: ctx.path || location.pathname,
      title: ctx.title || document.title || "",
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

  function uniquePaths(paths) {
    return Array.from(new Set((paths || []).filter(Boolean)));
  }

  function settingsReady() {
    return !!globalThis.STSettings?.catalog &&
      !!globalThis.STSettings?.storage &&
      !!globalThis.STSettingsMembership;
  }

  function injectPaths(paths) {
    const inj = globalThis.STInject;
    if (!inj?.inject) {
      return Promise.reject(new Error("动态注入器未就绪"));
    }
    return inj.inject(uniquePaths(paths));
  }

  function injectContentFiles(paths) {
    const files = uniquePaths(paths);
    if (!files.length) {
      return Promise.resolve({ success: true });
    }
    if (globalThis.STMessageBus?.request) {
      return globalThis.STMessageBus.request({
        type: "CONTENT_FILES_INJECT",
        files,
      }, {
        timeoutMs: 12_000,
        dedupeKey: `CONTENT_FILES_INJECT:${files.join("|")}`,
        expectSuccess: true,
      });
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          type: "CONTENT_FILES_INJECT",
          files,
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
    return injectContentFiles(STEAM_CONTENT_SHARED_SCRIPTS)
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
    await injectContentFiles(SETTINGS_SHARED_SCRIPTS);
    return settingsReady();
  }

  async function loadSettingsUi(reason = "manual-open") {
    if (globalThis[SETTINGS_LOAD_MARK] === "ready") {
      return true;
    }
    if (globalThis[SETTINGS_LOAD_MARK] === SETTINGS_LOAD_PENDING) {
      return false;
    }
    globalThis[SETTINGS_LOAD_MARK] = SETTINGS_LOAD_PENDING;
    try {
      await ensureSettingsShared();
      await injectContentFiles(SETTINGS_UI_SCRIPTS);
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
      await injectContentFiles(SETTINGS_RAIL_SCRIPTS);
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
      .then(() => {
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

  function storeFeaturePaths(type) {
    if (type === "age") {
      return [];
    }
    return STORE_FEATURE_CHUNKS[type] || STORE_FEATURE_CHUNKS.other;
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
      const featurePaths = storeFeaturePaths(type);
      if (!featurePaths.length) {
        globalThis[STORE_LOAD_MARK] = "ready";
        activateLightRuntime("store", {
          pageType: type,
          reason: "no-store-feature",
        });
        return true;
      }
      await injectContentFiles([
        ...STORE_BASE_SCRIPTS,
        ...featurePaths,
        ...STORE_START_SCRIPTS,
      ]);
      globalThis[STORE_LOAD_MARK] = "ready";
      activateLightRuntime("store", {
        pageType: type,
        featureScriptCount: featurePaths.length,
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
    return globalThis.STPageContext?.isCommunityTargetPage?.() === true;
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

  function storageSet(data) {
    if (globalThis.STSettingsBus?.rawSet) {
      return globalThis.STSettingsBus.rawSet(data, {
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

  function storageRemove(keys) {
    if (globalThis.STSettingsBus?.rawRemove) {
      return globalThis.STSettingsBus.rawRemove(keys, {
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

    const out = {};
    for (const id of ALL_SETTING_IDS) {
      out[id] = true;
    }
    if (globalThis.STSettingsBus?.loadSettingsSnapshot) {
      settingsCache = await globalThis.STSettingsBus.loadSettingsSnapshot({
        owner: "extension:content",
        ids: ALL_SETTING_IDS,
        defaults: out,
        force,
        ttlMs: 30_000,
        reason: "content-settings-load",
      });
      return settingsCache;
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

  async function writeNewsTranslateSettings(featureOn = null) {
    if (globalThis.STPageContext?.snapshot?.().domain !== "steam") {
      return null;
    }
    const enabledFeature = featureOn == null ? await enabled(NEWS_TRANSLATE_ID) : featureOn;
    const conf = await loadTranslateConfig();
    const config = newsTranslatePublicConfig(enabledFeature, conf);
    writeNewsTranslateDataset(config);
    return config;
  }

  async function postNewsConfig(rid = "") {
    const config = await writeNewsTranslateSettings();
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
    const modes = service === "steam-buff.ai"
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
    if (watchNewsTranslate || globalThis[NEWS_TRANSLATE_BRIDGE_MARK] === RUN_VERSION || !isSteamContentTarget()) {
      return;
    }
    watchNewsTranslate = true;
    globalThis[NEWS_TRANSLATE_BRIDGE_MARK] = RUN_VERSION;
    steamRuntimeLogOnce("steam-news-translate-bridge-start", {
      level: "info",
      domain: "extension",
      feature: NEWS_TRANSLATE_ID,
      event: "steam-news-translate-bridge-start",
      message: "Steam 新闻翻译桥接已启动",
      meta: pageMeta(),
    });
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
      // 只监听 documentElement 上的请求属性，用于隔离上下文桥接，不观察 DOM 子树。
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
    await writeNewsTranslateSettings(settings[NEWS_TRANSLATE_ID] !== false);
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
      if (globalThis.STSettingsBus?.subscribe) {
        globalThis.STSettingsBus.subscribe((event) => {
          const keys = event.changedKeys || [];
          const localeHit = keys.includes(UI_LOCALE_KEY);
          const hit = ALL_SETTING_IDS.some(id => keys.includes(settingKey(id)));
          const newsHit = keys.some((item) => item === settingKey(NEWS_TRANSLATE_ID) || item === settingKey("translate") || item.startsWith(TRANS_PREFIX) || item.startsWith(AI_PREFIX));
          if (hit) {
            settingsCache = null;
            if (globalThis.STPageContext?.snapshot?.().domain === "steam") {
              writeSteamSettings().catch(() => {});
            }
          }
          if (newsHit && globalThis.STPageContext?.snapshot?.().domain === "steam") {
            postNewsConfig("").catch(() => {});
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
        const hit = ALL_SETTING_IDS.some(id => Object.hasOwn(changes, settingKey(id)));
        const newsHit = keys.some((item) => item === settingKey(NEWS_TRANSLATE_ID) || item === settingKey("translate") || item.startsWith(TRANS_PREFIX) || item.startsWith(AI_PREFIX));
        if (hit) {
          settingsCache = null;
          if (globalThis.STPageContext?.snapshot?.().domain === "steam") {
            writeSteamSettings().catch(() => {});
          }
        }
        if (newsHit && globalThis.STPageContext?.snapshot?.().domain === "steam") {
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
    if (window.STPerformanceMonitor) {
      STPerformanceMonitor.start();
    }
    watchPageLog();
    bindSettingsOpenMessage();
    bindSettingsOpenRequest();
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
      loadSettingsRail("runtime-boot").catch(() => {});

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
          "shared/logger-factory.js",
          "shared/config.js",
          "shared/error-boundary.js",
          "shared/i18n.js",
          "shared/styles/theme.js",
          "shared/utils/dom.js",
          "shared/styles/components.js",
          "shared/performance-monitor.js",
          "shared/observer-utils.js",
          "shared/data-index.js",
          "shared/batch-queue.js",
          "shared/virtual-list.js",
          "shared/page-context.js",
          "shared/runtime/kernel.js",
          "community/runtime/base.js",
          "community/runtime/settings.js",
          "community/runtime/dom.js",
          "community/runtime/storage.js",
          "community/runtime/request-queue.js",
          "community/runtime/styles.js",
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

    // ⚠️ 历史问题：Steam CEF 复用旧窗口时可能只拿到半套内容脚本，必须先补齐共享依赖再启动页面运行时。
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
      globalThis[RUN_MARK] = RUN_VERSION;
    }
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
          "shared/page-context.js",
          "shared/runtime/kernel.js",
          "steam/shared/constants.js",
          "steam/runtime/paths.js",
          "steam/runtime/steam-context.js",
          "steam/runtime/styles.js",
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
        globalThis[RUN_MARK] = "";
        gd.fail();
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

  function shouldWaitSteamTitle() {
    return globalThis.STPageContext?.shouldWaitSteamTitle?.() === true;
  }

  function boot() {
    if (isSteamContentTarget()) {
      watchNewsTranslateBridge();
    }
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

    // 被排除页面也标记为已处理，避免后台补注入反复命中 Steam CEF 菜单页。
    globalThis[RUN_MARK] = RUN_VERSION;
    if (!shouldInject()) {
      runLightBoot();
      cleanupExcludedSteamRuntime();
      return;
    }

    globalThis[RUN_MARK] = "";
    if (isSteamContentTarget() && !steamContentDepsReady()) {
      waitSteamContentDeps();
      return;
    }

    globalThis[RUN_MARK] = RUN_VERSION;
    if (globalThis.STPageContext?.snapshot?.().domain !== "steam" && !isCommunityPage()) {
      runLightBoot();
      return;
    }

    run();
  }

  boot();
})();
