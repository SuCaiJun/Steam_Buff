/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展后台消息与请求代理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  importScripts(chrome.runtime.getURL("shared/config.js"));
  importScripts(chrome.runtime.getURL("onboarding/contract.js"));
  importScripts(chrome.runtime.getURL("shared/logger-schema.js"));
  importScripts(chrome.runtime.getURL("extension/background-logger.js"));
  globalThis.STLogger = Object.freeze({
    ready: true,
    schemaVersion: globalThis.STLoggerSchema.version,
    sessionId: globalThis.STLoggerSchema.createSessionId("background"),
    execution: "background",
    append(entry, options) {
      return globalThis.STBackgroundLogger.append(
        options?.forcePersist === true ? { entry, forcePersist: true } : entry,
      );
    },
  });
  importScripts(chrome.runtime.getURL("shared/logger-factory.js"));
  importScripts(chrome.runtime.getURL("shared/lifecycle-prompt-contract.js"));
  importScripts(chrome.runtime.getURL("extension/background-lifecycle.js"));
  importScripts(chrome.runtime.getURL("extension/background-update.js"));

  const CFG = globalThis.STConfig;
  const ONBOARDING = globalThis.STOnboardingContract;
  const MATCH = CFG.matchers;
  const STORE_HOSTS = Object.freeze(new Set([
    CFG.vendors.steamStore.host,
    CFG.vendors.steamApi.host,
    CFG.vendors.isthereanydeal.host,
    CFG.vendors.frankfurter.host,
    CFG.vendors.augmentedSteam.host,
    CFG.vendors.steampy.host,
    ...CFG.hosts.storeProxy,
  ]));
  const SAFE_HEADERS = Object.freeze(new Set([
    "accept",
    "content-type",
    "authorization",
    "itad-api-key",
    "x-requested-with",
  ]));
  const SAFE_RESPONSE_HEADERS = Object.freeze(new Set([
    "content-type",
    "retry-after",
  ]));
  const FILES = Object.freeze([
    "shared/client-environment.js",
    "shared/config.js",
    "shared/performance-monitor.js",
    "shared/page-context.js",
    "extension/runtime/guard.js",
    "extension/runtime/injector.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/i18n.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "extension/content.js",
  ]);
  const STEAM_LOOPBACK_GUARD_FILES = Object.freeze([
    "shared/runtime/surface-manager.js",
    "extension/runtime/steamloopback-guard.js",
  ]);
  const WEB_BOOT_FILES = Object.freeze([
    "shared/client-environment.js",
    "shared/config.js",
    "extension/runtime/injector.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/runtime/kernel.js",
    "shared/page-context.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "extension/content.js",
  ]);
  const STEAM_CONTENT_SHARED_SCRIPTS = Object.freeze([
    "shared/client-environment.js",
    "shared/config.js",
    "shared/i18n.js",
    "shared/performance-monitor.js",
    "extension/runtime/guard.js",
    "extension/runtime/injector.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/page-context.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
  ]);
  const SETTINGS_SHARED_SCRIPTS = Object.freeze([
    "ai/config.js",
    "shared/client-environment.js",
    "shared/config.js",
    "shared/logger-schema.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/i18n.js",
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/page-context.js",
    "shared/runtime/kernel.js",
    "shared/runtime/message-bus.js",
    "shared/settings-bus.js",
    "shared/account-profile.js",
    "shared/price-comparison-catalog.js",
    "settings/catalog.js",
    "settings/membership.js",
    "settings/storage.js",
  ]);
  const SETTINGS_RAIL_SCRIPTS = Object.freeze([
    "shared/i18n.js",
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "settings/ui/assets.js",
    "settings/ui/styles.js",
    "settings/floating-rail.js",
    "settings/api/request.js",
    "settings/update-log-renderer.js",
    "settings/update-checker.js",
    "shared/lifecycle-prompt-contract.js",
    "settings/membership.js",
    "settings/lifecycle-prompts.js",
    "settings/update-reminder.js",
  ]);
  const SETTINGS_UI_SCRIPTS = Object.freeze([
    "shared/styles/theme.js",
    "shared/styles/components.js",
    "settings/api/request.js",
    "settings/update-log-renderer.js",
    "settings/update-checker.js",
    "shared/lifecycle-prompt-contract.js",
    "settings/lifecycle-prompts.js",
    "settings/settings-backup.js",
    "vendor/fflate/fflate.js",
    "settings/diagnostics-export.js",
    "settings/pages/registry.js",
    "vendor/catalog.js",
    "settings/pages/about.js",
    "settings/update-reminder.js",
    "shared/account-profile.js",
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
    "settings/ui/scroll-targets.js",
    "settings/panels/review-filter.js",
    "settings/panels/search-suggestions.js",
    "settings/panels/ai.js",
    "settings/panels/translate.js",
    "settings/panels/third-party-services.js",
    "settings/panels/store-price-chart.js",
    "settings/menu/dependencies.js",
    "settings/menu/panels.js",
    "settings/menu/shell.js",
    "settings/menu/controller.js",
    "settings/menu/events.js",
    "settings/floating-menu.js",
  ]);
  const STORE_BASE_SCRIPTS = Object.freeze([
    "shared/client-environment.js",
    "shared/styles/theme.js",
    "shared/errors.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/utils/format.js",
    "shared/price-comparison-catalog.js",
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
    "store/runtime/family-library-cache.js",
    "store/runtime/assets.js",
    "store/runtime/format.js",
    "store/runtime/dom.js",
    "store/runtime/styles.js",
    "shared/logger-schema.js",
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
      "store/api/family-library.js",
      "store/api/exchange-rates.js",
      "store/api/providers/isthereanydeal.js",
      "store/api/third-party-data.js",
      "store/features/data-display/forecast-pack.js",
      "vendor/markdown-it/markdown-it.min.js",
      "vendor/dompurify/purify.min.js",
      "store/features/data-display/markdown.js",
      "store/features/data-display/ai-forecast.js",
      "store/features/data-display/charts.js",
      "store/features/data-display/view.js",
      "store/features/data-display/feature.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/price/regional-price-popover.js",
      "store/features/price/price-history.js",
      "store/features/price/steampy-deals.js",
      "store/features/reminders/audio-check.js",
      "store/features/reminders/family-sharing.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/reminders/drm-warning.js",
      "store/features/reminders/subscription-info.js",
      "store/features/dlc/dlc-bridge.js",
      "store/features/dlc/dlc-scan.js",
      "store/features/dlc/dlc-checkboxes.js",
      "store/features/cart/cart-select.js",
      "store/features/review/review-filter-core.js",
      "store/features/review/review-filter.js",
      "store/features/search/search-suggestions.js",
      "store/features/price/wishlist-dom.js",
      "store/features/search/title-custom-name.js",
      "store/features/notes/game-notes.js",
    ]),
    wishlist: Object.freeze([
      "store/api/subscription-info.js",
      "store/api/providers/isthereanydeal.js",
      "store/api/third-party-data.js",
      "store/features/data-display/charts.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/price/wishlist-price-history-core.js",
      "store/features/price/wishlist-price-history.js",
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/price/wishlist-dom.js",
      "store/features/search/title-custom-name.js",
      "store/features/notes/game-notes.js",
    ]),
    search: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/notes/game-notes.js",
    ]),
    cart: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/cart/cart-select.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
    ]),
    history: Object.freeze([
      "store/features/third-party-scripts/purchase-history-classifier.js",
    ]),
    other: Object.freeze([
      "store/api/subscription-info.js",
      "store/features/reminders/app-card-badge-scanner.js",
      "store/features/review/review-filter-core.js",
      "store/features/search/search-suggestions.js",
      "store/features/reminders/subscription-info.js",
      "store/features/reminders/family-library-owned-marker.js",
      "store/features/notes/game-notes.js",
    ]),
  });
  const STORE_START_SCRIPTS = Object.freeze([
    "store/features/features.js",
    "store/main.js",
  ]);
  const CONTENT_MARK = "steamBuffContentStarted";
  const CONTENT_MARK_VERSION = "steam-buff-runtime-v20";
  const RUNTIME_READY_ATTR = "steamBuffRuntimeReady";
  const RUNTIME_READY_OPERATION_ATTR = "steamBuffRuntimeReadyOperationId";
  const STEAM_RUNTIME_READY_WAIT_MS = 6000;
  const STEAM_RUNTIME_READY_POLL_MS = 250;
  const STEAM_LOOPBACK_INJECT_REQUEST = "STEAM_LOOPBACK_INJECT_REQUEST";
  const STEAM_LOOPBACK_RECOVERY_MARK = "__steamBuffLoopbackRecovery";
  const STEAM_LOOPBACK_RECOVERY_TARGET_KEY = "steamBuffSteamLoopbackRecoveryTargetV1";
  const STEAM_LOOPBACK_RECOVERY_ALARM_PREFIX = "steam-buff-loopback-recovery-attempt-";
  const STEAM_LOOPBACK_RECOVERY_FINAL_ALARM = "steam-buff-loopback-recovery-final";
  const STEAM_LOOPBACK_RECOVERY_DELAY_MS = 180000;
  const STEAM_LOOPBACK_RECOVERY_FINAL_GRACE_MS = 30000;
  const STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS = 4;
  const STEAM_LOOPBACK_RECOVERY_ATTEMPTS = Object.freeze([2, 3, 4]);
  const STEAM_LOOPBACK_FAILURE_REASONS = new Set([
    "callback-timeout",
    "runtime-last-error",
    "scope-mismatch",
    "background-inject-failed",
    "response-rejected",
    "send-message-unavailable",
    "send-message-exception",
    "scope-not-ready",
    "shared-context-not-recovered",
    "page-runtime-not-ready",
    "content-mark-not-ready",
  ]);
  const STEAM_LOOPBACK_BACKGROUND_FAILURE_REASONS = new Set([
    "scope-mismatch",
    "background-inject-failed",
    "page-runtime-not-ready",
    "content-mark-not-ready",
  ]);
  const SETTINGS_OPEN_MESSAGE = "STEAM_BUFF_OPEN_SETTINGS";
  const ONBOARDING_OPEN_LOCAL_MESSAGE = ONBOARDING.MESSAGES.openLocalPage;
  const ONBOARDING_OPEN_SETTINGS_MESSAGE = ONBOARDING.MESSAGES.openSettings;
  const ONBOARDING_PAGE = "onboarding/index.html";
  const ONBOARDING_STORE_URL = "https://store.steampowered.com/";
  const INJECT_DELAYS = Object.freeze([0, 1000, 3000]);
  const TAB_INJECT_DELAYS = Object.freeze([0, 1000]);
  const pendingTabInjects = new Map();
  const steamFrameInjectionFlights = new Map();
  let steamLoopbackRecoveryScheduleFlight = null;
  let steamLoopbackRecoveryFinished = false;
  const STORE_FETCH_TIMEOUT_MS = 12 * 1000;
  const AI_FETCH_TIMEOUT_MS = 20 * 1000;
  const AI_FETCH_TIMEOUT_MAX_MS = 120 * 1000;
  const AI_GATEWAY_PERMISSION_CHECK = "AI_GATEWAY_PERMISSION_CHECK";
  const AI_GATEWAY_PERMISSION_REQUEST = "AI_GATEWAY_PERMISSION_REQUEST";
  const AI_GATEWAY_PERMISSION_OPEN = "AI_GATEWAY_PERMISSION_OPEN";
  const AI_GATEWAY_PERMISSION_CONTEXT = "AI_GATEWAY_PERMISSION_CONTEXT";
  const AI_GATEWAY_PERMISSION_CANCEL = "AI_GATEWAY_PERMISSION_CANCEL";
  const AI_GATEWAY_PERMISSION_COMPLETE = "AI_GATEWAY_PERMISSION_COMPLETE";
  const AI_GATEWAY_PERMISSION_RESULT = "AI_GATEWAY_PERMISSION_RESULT";
  const CHROMIUM_WINDOW_OPEN = "CHROMIUM_WINDOW_OPEN";
  const STEAM_ROOT_MENU_OPEN_CHROMIUM = "STEAM_ROOT_MENU_OPEN_CHROMIUM";
  const STEAM_ROOT_MENU_TITLE = "Steam Root Menu";
  const STEAM_ROOT_MENU_BROWSER_HOME_SETTING = "web_browser_home";
  const STEAM_ROOT_MENU_BROWSER_FALLBACK = "https://sucaijun.com/";
  const STEAM_ROOT_MENU_EXTENSIONS_URL = "chrome://extensions/";
  const STEAM_ROOT_MENU_REFOCUS_DELAY_MS = 0;
  const AI_PERMISSION_PAGE = "permissions/ai/index.html";
  const AI_PERMISSION_SESSION_PREFIX = "st.aiGatewayPermission.session.v1.";
  const AI_PERMISSION_TAB_PREFIX = "st.aiGatewayPermission.tab.v1.";
  const AI_PERMISSION_WINDOW_PREFIX = "st.aiGatewayPermission.window.v1.";
  const AI_PERMISSION_SESSION_TTL_MS = 5 * 60 * 1000;
  const AI_STREAM_PORT = "AI_CHAT_COMPLETIONS_STREAM";
  const AI_FORECAST_SESSION_STORAGE_PREFIX = "st.aiDiscountForecast.session.v1.";
  const AI_FORECAST_SESSION_CLEANUP_ALARM = "steam-buff-ai-forecast-session-cleanup";
  const AI_FORECAST_SESSION_CLEANUP_PERIOD_MINUTES = 24 * 60;
  const SHARED_CONFIG = "shared/config.js";
  const OBSERVER_UTILS = "shared/observer-utils.js";
  const TRANS_VENDOR_WRAPPER = "translate/vendor-wrapper.js";
  const TRANS_LIB = "vendor/xnx3-translate/translate.js";
  const AI_CONFIG = "ai/config.js";
  const AI_CACHE = "ai/cache.js";
  const TRANS_AI_PROMPTS = "translate/ai-prompts.js";
  const TRANS_AI = "translate/ai-adapter.js";
  const TRANS_RUNNER = "translate/runner.js";
  const TRANSLATE_AI_SERVICE = "steam-buff.ai";
  const TRANSLATE_MODES = Object.freeze({
    selection: "selection",
    manual: "manual",
    autoPage: "autoPage",
    aiConfig: "aiConfig",
  });
  let aiReady = false;
  let aiLoadError = "";
  let aiActive = 0;
  const aiQueue = [];
  const aiPermissionSessions = new Map();
  const aiPermissionTabs = new Map();
  const aiPermissionWindows = new Map();
  const aiPermissionSettling = new Set();

  /* 后台脚本依赖 */
  try {
    importScripts(chrome.runtime.getURL(AI_CONFIG));
    aiReady = !!globalThis.STAI?.ready;
  } catch (error) {
    aiLoadError = error?.message || String(error);
    logError("background", "ai-config-load-failed", "AI 配置加载失败", error);
  }

  try {
    importScripts(chrome.runtime.getURL(AI_CACHE));
  } catch (error) {
    logError("background", "ai-cache-load-failed", "AI 缓存加载失败", error);
  }

  function backgroundLogger(feature, options) {
    return globalThis.STLoggerFactory.createLogger("background", feature, options);
  }

  function logError(feature, event, message, error, meta) {
    backgroundLogger(feature).error(event, message, {
      error,
      ...(meta || {}),
    });
  }

  function logNetwork(entry) {
    const feature = String(entry?.feature || "background");
    const event = String(entry?.event || "request-failed");
    const message = String(entry?.message || "后台请求失败");
    let requestUrlPolicy;
    try {
      const url = new URL(entry?.url);
      if (STORE_HOSTS.has(url.hostname)) requestUrlPolicy = { allowPath: true };
    } catch {
      requestUrlPolicy = undefined;
    }
    backgroundLogger(feature, { requestUrlPolicy }).network(event, message, {
      error: entry?.error,
      service: entry?.service,
      operationId: entry?.operationId,
      requestId: entry?.requestId,
      durationMs: entry?.durationMs,
      request: {
        method: String(entry?.method || "GET"),
        endpointKey: String(entry?.endpointKey || feature),
        url: entry?.url,
      },
      response: Number(entry?.status) ? { status: Number(entry.status) } : undefined,
    });
  }

  function bindGlobalLoggers() {
    globalThis.addEventListener("error", (event) => {
      const error = event?.error != null ? event.error : event?.message;
      logError("background", "background-unhandled-error", "后台未捕获异常", error, {
        source: globalThis.STLoggerSchema.sourceFromErrorEvent(event),
      });
    });
    globalThis.addEventListener("unhandledrejection", (event) => {
      logError("background", "background-unhandled-rejection", "后台未处理 Promise 拒绝", event?.reason);
    });
  }

  function isSteam(url) {
    try {
      return MATCH.isSteamLoopbackHost(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  function steamAboutBlankParams(value) {
    const url = String(value || "");
    if (!url.startsWith("about:blank")) {
      return null;
    }
    try {
      const query = url.slice("about:blank".length).replace(/^\?/, "");
      return new URLSearchParams(query);
    } catch {
      return null;
    }
  }

  function isSteamMainAboutBlank(value) {
    const params = steamAboutBlankParams(value);
    if (!params) {
      return false;
    }
    return params.get("browserType") === CFG.pages?.translate?.browserType;
  }

  function isSteamPropertyDialogAboutBlank(value) {
    const params = steamAboutBlankParams(value);
    if (!params) {
      return false;
    }
    return params.has("createflags") &&
      params.has("centerOnBrowserID") &&
      params.has("minwidth") &&
      params.has("minheight") &&
      !params.has("browserType");
  }

  function isSteamCefAboutBlank(value) {
    return isSteamMainAboutBlank(value) || isSteamPropertyDialogAboutBlank(value);
  }

  function isExcludedSteamTitle(value) {
    const title = String(value || "");
    return (CFG.pages?.steam?.excludedTitles || []).includes(title) ||
      /(?:Root Menu|Supernav)$/u.test(title) ||
      /^MainMenu_/u.test(title);
  }

  function hasSteamSharedContextMarker(value) {
    return String(value || "").includes("IN_STEAMUI_SHARED_CONTEXT=true");
  }

  function isSteamLoopbackUrl(value) {
    try {
      return MATCH.isSteamLoopbackHost(new URL(String(value || "")).hostname);
    } catch {
      return false;
    }
  }

  function steamLoopbackCandidateUrls(input = {}) {
    const raw = [
      input.url,
      input.senderUrl,
      input.tabUrl,
      ...(Array.isArray(input.urls) ? input.urls : []),
    ];
    return Array.from(new Set(raw
      .map(item => String(item || "").trim())
      .filter(Boolean)));
  }

  function isAllowedSteamLoopbackPath(value) {
    try {
      const url = new URL(String(value || ""));
      return MATCH.isSteamLoopbackHost(url.hostname) &&
        (url.pathname.startsWith("/library/") || url.pathname.startsWith("/downloads"));
    } catch {
      return false;
    }
  }

  function hasPropertyDialogSignal(input = {}) {
    return input.propertyDialog === true ||
      input.pageHint === "property-dialog";
  }

  function shouldInjectSteamLoopbackRuntime(input = {}) {
    const title = String(input.title || "").trim();
    const urls = steamLoopbackCandidateUrls(input);
    if (isExcludedSteamTitle(title)) {
      return false;
    }
    if (title === "Steam" || title === "SharedJSContext") {
      return true;
    }
    if (hasPropertyDialogSignal(input) && urls.some(isSteamLoopbackUrl)) {
      return true;
    }
    return urls.some(url => hasSteamSharedContextMarker(url) ||
      isSteamMainAboutBlank(url) ||
      isSteamPropertyDialogAboutBlank(url) ||
      isAllowedSteamLoopbackPath(url));
  }

  function isSteamSharedContext(input = {}) {
    return String(input.title || "").trim() === "SharedJSContext" ||
      steamLoopbackCandidateUrls(input).some(hasSteamSharedContextMarker);
  }

  // Steam 客户端内嵌窗口常以 about:blank 起步，后台只补轻 guard；完整 runtime 由 guard 精准申请。
  function ok(tab) {
    if (!tab || typeof tab.id !== "number") {
      return false;
    }
    if (isExcludedSteamTitle(tab.title)) {
      return false;
    }
    return isSteam(tab.url) || isSteamCefAboutBlank(tab.url);
  }

  function inject(tabId) {
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        world: "ISOLATED",
        files: STEAM_LOOPBACK_GUARD_FILES,
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("injection", "steam-loopback-guard-inject-failed", "后台补注入 Steam CEF 轻量守卫失败", err, { tabId });
        }
      },
    );
  }

  async function readSteamFrameHealth(frameTarget) {
    const page = await execScript({
      target: frameTarget,
      world: "MAIN",
      func: (version) => {
        const runtime = globalThis.SteamBuff?.runtime;
        const status = String(runtime?.status || "");
        return {
          present: !!globalThis.SteamBuff,
          started: runtime?.started === true,
          status,
          version: String(runtime?.version || ""),
          ready: runtime?.started === true
            && runtime?.version === version
            && (status === "starting" || status === "running"),
        };
      },
      args: [CONTENT_MARK_VERSION],
    });
    const content = await execScript({
      target: frameTarget,
      world: "ISOLATED",
      func: (mark, version, readyAttr) => {
        const el = document.documentElement || document.head;
        return {
          marked: globalThis[mark] === version,
          pending: globalThis[mark] === `${version}:pending`,
          ready: el?.dataset?.[readyAttr] === version,
        };
      },
      args: [CONTENT_MARK, CONTENT_MARK_VERSION, RUNTIME_READY_ATTR],
    });
    return {
      page: page?.[0]?.result || {},
      content: content?.[0]?.result || {},
    };
  }

  async function clearStaleSteamFrameState(frameTarget) {
    await execScript({
      target: frameTarget,
      world: "ISOLATED",
      func: (mark, version, readyAttr, readyOperationAttr) => {
        if (globalThis[mark] === version || globalThis[mark] === `${version}:pending`) {
          globalThis[mark] = "";
        }
        const el = document.documentElement || document.head;
        if (el?.dataset?.[readyAttr] === version) {
          el.dataset[readyAttr] = "";
          el.dataset[readyOperationAttr] = "";
        }
        globalThis.STGuard?.fail?.();
      },
      args: [CONTENT_MARK, CONTENT_MARK_VERSION, RUNTIME_READY_ATTR, RUNTIME_READY_OPERATION_ATTR],
    });
  }

  // 注:完整资源包通过 script.onload 后还需要主世界 runtime 回执；等待只发生在单个 frame 的启动注入路径，最多 6 秒，每 250ms 做一次 O(1) 健康读取。
  async function waitForSteamFrameReady(frameTarget) {
    const deadline = Date.now() + STEAM_RUNTIME_READY_WAIT_MS;
    let health = null;
    while (Date.now() <= deadline) {
      health = await readSteamFrameHealth(frameTarget);
      if (health.page.ready && health.content.marked && health.content.ready) {
        return health;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, STEAM_RUNTIME_READY_POLL_MS));
    }
    const reason = health?.page?.ready ? "content-mark-not-ready" : "page-runtime-not-ready";
    const error = new Error(`Steam CEF 运行时就绪确认失败：${reason}`);
    error.name = "SteamRuntimeReadyError";
    error.reason = reason;
    throw error;
  }

  async function ping(tabId) {
    try {
      const frames = await execScript({
        target: { tabId, allFrames: true },
        func: (mark, version) => globalThis[mark] === version,
        args: [CONTENT_MARK, CONTENT_MARK_VERSION],
      });
      return frames.length > 0 && frames.every(frame => frame?.result === true);
    } catch {
      return false;
    }
  }

  async function injectIfNeeded(tabId) {
    if (await ping(tabId)) {
      return;
    }
    inject(tabId);
  }

  function steamFrameInjectionKey(tabId, frameId) {
    return `${tabId}:${frameId}`;
  }

  function clearSteamFrameInjectionFlight(key, flight) {
    if (steamFrameInjectionFlights.get(key) === flight) {
      steamFrameInjectionFlights.delete(key);
    }
  }

  function startSteamLoopbackFrameInjection(tabId, frameId, key) {
    const frameTarget = { tabId, frameIds: [frameId] };
    const flight = (async () => {
      const active = await readSteamFrameHealth(frameTarget);
      if (active.page.ready && active.content.marked && active.content.ready) {
        return false;
      }
      if ((active.content.marked || active.content.pending) && !active.page.ready) {
        await clearStaleSteamFrameState(frameTarget);
      }
      await execScript({
        target: frameTarget,
        world: "ISOLATED",
        files: FILES,
      });
      await waitForSteamFrameReady(frameTarget);
      return true;
    })();
    steamFrameInjectionFlights.set(key, flight);
    flight.then(
      () => clearSteamFrameInjectionFlight(key, flight),
      () => clearSteamFrameInjectionFlight(key, flight),
    );
    return flight;
  }

  // 注:Steam CEF reload 会保留 tab/frame 身份但销毁 document。新 document 若撞上旧任务，等待其结束后只允许一个调用方接管并重新注入。
  async function injectSteamLoopbackFrameIfNeeded(tabId, frameId) {
    const key = steamFrameInjectionKey(tabId, frameId);
    const existing = steamFrameInjectionFlights.get(key);
    if (!existing) {
      return startSteamLoopbackFrameInjection(tabId, frameId, key);
    }
    try {
      return await existing;
    } catch {
      clearSteamFrameInjectionFlight(key, existing);
      const replacement = steamFrameInjectionFlights.get(key);
      if (replacement) {
        return replacement;
      }
      return startSteamLoopbackFrameInjection(tabId, frameId, key);
    }
  }

  function tabsQueryAll() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "读取标签页失败"));
          return;
        }
        if (!Array.isArray(tabs)) {
          reject(new Error("tabs-query-invalid"));
          return;
        }
        resolve(tabs);
      });
    });
  }

  async function injectAll() {
    try {
      const tabs = await tabsQueryAll();
      const candidates = tabs.filter(ok);
      if (candidates.length) {
        startSteamLoopbackRecoveryCampaign();
      }
      for (const tab of candidates) {
        injectIfNeeded(tab.id);
      }
    } catch (error) {
      logError("injection", "tabs-query-failed", "后台读取标签页失败", error);
    }
  }

  function storageLocalGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "读取后台恢复目标失败"));
          return;
        }
        resolve(result?.[key]);
      });
    });
  }

  function storageLocalSet(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "保存后台恢复目标失败"));
          return;
        }
        resolve();
      });
    });
  }

  function storageLocalRemove(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(key, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "清理后台恢复目标失败"));
          return;
        }
        resolve();
      });
    });
  }

  function normalizeSteamLoopbackRecoveryTarget(value) {
    const tabId = Number(value?.tabId);
    const frameId = Number(value?.frameId);
    const observedAt = Number(value?.observedAt);
    if (!Number.isInteger(tabId) || tabId < 0 || !Number.isInteger(frameId) || frameId < 0 || !Number.isFinite(observedAt) || observedAt <= 0) {
      return null;
    }
    return { tabId, frameId, observedAt };
  }

  async function rememberSteamLoopbackRecoveryTarget(tabId, frameId) {
    const target = normalizeSteamLoopbackRecoveryTarget({ tabId, frameId, observedAt: Date.now() });
    if (!target) {
      return;
    }
    await storageLocalSet({ [STEAM_LOOPBACK_RECOVERY_TARGET_KEY]: target });
  }

  async function readSteamLoopbackRecoveryTarget() {
    return normalizeSteamLoopbackRecoveryTarget(await storageLocalGet(STEAM_LOOPBACK_RECOVERY_TARGET_KEY));
  }

  function clearSteamLoopbackRecoveryTarget() {
    return storageLocalRemove(STEAM_LOOPBACK_RECOVERY_TARGET_KEY);
  }

  // 注:每轮最多 3 个三分钟级 alarm；优先验证真实 sender，再用 tabs.query 补充，不直接注入 FILES 或启动常驻轮询。
  function steamLoopbackRecoveryAlarmName(attempt) {
    return `${STEAM_LOOPBACK_RECOVERY_ALARM_PREFIX}${attempt}`;
  }

  function steamLoopbackRecoveryAlarmNames() {
    return [
      ...STEAM_LOOPBACK_RECOVERY_ATTEMPTS.map(steamLoopbackRecoveryAlarmName),
      STEAM_LOOPBACK_RECOVERY_FINAL_ALARM,
    ];
  }

  function getAlarm(name) {
    return new Promise((resolve, reject) => {
      chrome.alarms.get(name, (alarm) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "读取恢复 alarm 失败"));
          return;
        }
        resolve(alarm || null);
      });
    });
  }

  function clearAlarm(name) {
    return new Promise((resolve, reject) => {
      chrome.alarms.clear(name, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "清理恢复 alarm 失败"));
          return;
        }
        resolve();
      });
    });
  }

  async function clearSteamLoopbackRecoveryAlarms() {
    await Promise.all(steamLoopbackRecoveryAlarmNames().map(clearAlarm));
  }

  async function ensureSteamLoopbackRecoveryAlarms(replace = false) {
    const startedAt = Date.now();
    for (const attempt of STEAM_LOOPBACK_RECOVERY_ATTEMPTS) {
      if (steamLoopbackRecoveryFinished) {
        return;
      }
      const name = steamLoopbackRecoveryAlarmName(attempt);
      if (replace) {
        chrome.alarms.create(name, {
          when: startedAt + STEAM_LOOPBACK_RECOVERY_DELAY_MS * (attempt - 1),
        });
        continue;
      }
      const existing = await getAlarm(name);
      if (steamLoopbackRecoveryFinished) {
        return;
      }
      if (!existing) {
        chrome.alarms.create(name, {
          when: startedAt + STEAM_LOOPBACK_RECOVERY_DELAY_MS * (attempt - 1),
        });
      }
    }
  }

  function startSteamLoopbackRecoveryCampaign(replace = false) {
    if (replace) {
      steamLoopbackRecoveryFinished = false;
      const flight = ensureSteamLoopbackRecoveryAlarms(true);
      flight.catch((error) => {
        logError("injection", "steam-loopback-recovery-alarm-failed", "Steam CEF 后台恢复 alarm 重建失败", error);
      });
      return flight;
    }
    if (steamLoopbackRecoveryFinished) {
      return Promise.resolve();
    }
    if (steamLoopbackRecoveryScheduleFlight) {
      return steamLoopbackRecoveryScheduleFlight;
    }
    const flight = ensureSteamLoopbackRecoveryAlarms();
    steamLoopbackRecoveryScheduleFlight = flight;
    flight.then(
      () => {
        if (steamLoopbackRecoveryScheduleFlight === flight) {
          steamLoopbackRecoveryScheduleFlight = null;
        }
      },
      (error) => {
        if (steamLoopbackRecoveryScheduleFlight === flight) {
          steamLoopbackRecoveryScheduleFlight = null;
        }
        logError("injection", "steam-loopback-recovery-alarm-failed", "Steam CEF 后台恢复 alarm 创建失败", error);
      },
    );
    return flight;
  }

  function stopSteamLoopbackRecoveryCampaign() {
    if (steamLoopbackRecoveryFinished) {
      return false;
    }
    steamLoopbackRecoveryFinished = true;
    Promise.all([
      clearSteamLoopbackRecoveryAlarms(),
      clearSteamLoopbackRecoveryTarget(),
    ]).catch((error) => {
      logError("injection", "steam-loopback-recovery-state-clear-failed", "Steam CEF 后台恢复状态清理失败", error);
    });
    return true;
  }

  function steamLoopbackRecoveryAttempt(name) {
    if (!String(name || "").startsWith(STEAM_LOOPBACK_RECOVERY_ALARM_PREFIX)) {
      return 0;
    }
    const attempt = Number(String(name).slice(STEAM_LOOPBACK_RECOVERY_ALARM_PREFIX.length));
    return STEAM_LOOPBACK_RECOVERY_ATTEMPTS.includes(attempt) ? attempt : 0;
  }

  function steamLoopbackRecoveryScriptTarget(target) {
    if (typeof target === "number") {
      return { tabId: target, allFrames: true };
    }
    return { tabId: target.tabId, frameIds: [target.frameId] };
  }

  async function validateSteamLoopbackRecoveryTarget(target) {
    const results = await execScript({
      target: steamLoopbackRecoveryScriptTarget(target),
      world: "ISOLATED",
      func: () => ({
        title: String(document.title || ""),
        url: String(location.href || ""),
      }),
    });
    const frame = results?.[0]?.result;
    if (!frame || !isSteamSharedContext(frame)) {
      const error = new Error("保存的 Steam CEF sender 已不再是 SharedJSContext");
      error.name = "SteamLoopbackRecoveryTargetError";
      error.reason = "stored-target-scope-mismatch";
      throw error;
    }
  }

  async function injectSteamLoopbackRecoveryGuard(target, recovery) {
    const scriptTarget = steamLoopbackRecoveryScriptTarget(target);
    await execScript({
      target: scriptTarget,
      world: "ISOLATED",
      func: (mark, value) => {
        globalThis[mark] = value;
      },
      args: [STEAM_LOOPBACK_RECOVERY_MARK, recovery],
    });
    await execScript({
      target: scriptTarget,
      world: "ISOLATED",
      files: STEAM_LOOPBACK_GUARD_FILES,
    });
  }

  async function runSteamLoopbackRecoveryAttempt(alarm, attempt) {
    if (steamLoopbackRecoveryFinished) {
      return;
    }
    const scheduledTime = Number(alarm?.scheduledTime);
    const startedAt = Number.isFinite(scheduledTime)
      ? Math.max(1, scheduledTime - STEAM_LOOPBACK_RECOVERY_DELAY_MS * (attempt - 1))
      : Date.now() - STEAM_LOOPBACK_RECOVERY_DELAY_MS * (attempt - 1);
    const retry = {
      attempt,
      maxAttempts: STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS,
      delayMs: STEAM_LOOPBACK_RECOVERY_DELAY_MS,
    };
    const recovery = {
      ...retry,
      startedAt,
      previousFailureReason: "shared-context-not-recovered",
    };
    const failures = [];
    let storedTarget = null;
    let storedTargetAgeMs = null;
    let exactTargetInjected = false;
    try {
      storedTarget = await readSteamLoopbackRecoveryTarget();
      if (storedTarget) {
        storedTargetAgeMs = Math.max(0, Date.now() - storedTarget.observedAt);
        await validateSteamLoopbackRecoveryTarget(storedTarget);
        await injectSteamLoopbackRecoveryGuard(storedTarget, recovery);
        exactTargetInjected = true;
      }
    } catch (error) {
      failures.push(error);
    }
    let candidates = [];
    try {
      const tabs = await tabsQueryAll();
      candidates = tabs.filter(ok);
      if (exactTargetInjected) {
        candidates = candidates.filter((tab) => tab.id !== storedTarget.tabId);
      }
    } catch (error) {
      failures.push(error);
    }
    backgroundLogger("injection").info(
      "steam-loopback-runtime-recovery-attempt",
      "Steam CEF 后台开始有限恢复检查",
      {
        retry,
        context: { execution: "background" },
        meta: {
          targetSource: exactTargetInjected ? "sender" : candidates.length ? "query" : "none",
          storedTarget: !!storedTarget,
          storedTargetAgeMs,
          exactTargetInjected,
          candidateTabs: candidates.length,
        },
      },
    );
    let injectedTargets = exactTargetInjected ? 1 : 0;
    for (const tab of candidates) {
      try {
        await injectSteamLoopbackRecoveryGuard(tab.id, recovery);
        injectedTargets += 1;
      } catch (error) {
        failures.push(error);
      }
    }
    if (attempt < STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS && (!injectedTargets || failures.length)) {
      const error = failures[0] || new Error("未发现可注入的 Steam CEF sender 或 tab");
      backgroundLogger("injection").warn(
        "steam-loopback-runtime-inject-retry",
        "Steam CEF 后台恢复检查未能覆盖目标页面，等待下一次有限重试",
        {
          error,
          retry,
          context: { execution: "background" },
          meta: {
            reason: "shared-context-not-recovered",
            targetSource: exactTargetInjected ? "sender" : candidates.length ? "query" : "none",
            storedTarget: !!storedTarget,
            storedTargetAgeMs,
            exactTargetInjected,
            candidateTabs: candidates.length,
            injectedTargets,
            failedTargets: failures.length,
          },
        },
      );
    }
  }

  function failSteamLoopbackRecoveryCampaign() {
    if (!stopSteamLoopbackRecoveryCampaign()) {
      return;
    }
    const error = new Error("SharedJSContext 未在有限恢复窗口内建立");
    error.name = "SteamLoopbackRecoveryError";
    logError("injection", "steam-loopback-runtime-inject-failed", "Steam CEF SharedJSContext 后台有限恢复最终失败", error, {
      retry: {
        attempt: STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS,
        maxAttempts: STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS,
        delayMs: STEAM_LOOPBACK_RECOVERY_DELAY_MS,
      },
      context: { execution: "background" },
      meta: { reason: "shared-context-not-recovered" },
    });
  }

  function handleSteamLoopbackRecoveryAlarm(alarm) {
    if (alarm?.name === STEAM_LOOPBACK_RECOVERY_FINAL_ALARM) {
      failSteamLoopbackRecoveryCampaign();
      return;
    }
    const attempt = steamLoopbackRecoveryAttempt(alarm?.name);
    if (!attempt) {
      return;
    }
    if (attempt === STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS) {
      chrome.alarms.create(STEAM_LOOPBACK_RECOVERY_FINAL_ALARM, {
        when: Date.now() + STEAM_LOOPBACK_RECOVERY_FINAL_GRACE_MS,
      });
    }
    runSteamLoopbackRecoveryAttempt(alarm, attempt).catch((error) => {
      if (attempt < STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS) {
        backgroundLogger("injection").warn(
          "steam-loopback-runtime-inject-retry",
          "Steam CEF 后台恢复检查失败，等待下一次有限重试",
          {
            error,
            retry: {
              attempt,
              maxAttempts: STEAM_LOOPBACK_RECOVERY_MAX_ATTEMPTS,
              delayMs: STEAM_LOOPBACK_RECOVERY_DELAY_MS,
            },
            context: { execution: "background" },
            meta: { reason: "shared-context-not-recovered" },
          },
        );
      }
    });
  }

  function injectSoon() {
    // 扩展重载、开机自启和 Steam CEF 复用旧窗口时机不稳定，短重试用于覆盖稍后才 ready 的既有页面。
    for (const delay of INJECT_DELAYS) {
      if (delay <= 0) {
        injectAll();
      } else {
        globalThis.setTimeout(injectAll, delay);
      }
    }
  }

  function clearPendingTabInject(tabId) {
    const handles = pendingTabInjects.get(tabId);
    if (!handles) {
      return;
    }
    handles.forEach(handle => globalThis.clearTimeout(handle));
    pendingTabInjects.delete(tabId);
  }

  function injectTabSoon(tab) {
    if (!ok(tab)) {
      return;
    }
    startSteamLoopbackRecoveryCampaign();
    const tabId = tab.id;
    clearPendingTabInject(tabId);
    const handles = TAB_INJECT_DELAYS.map((delay, index) => globalThis.setTimeout(() => {
      injectIfNeeded(tabId);
      if (index === TAB_INJECT_DELAYS.length - 1) {
        pendingTabInjects.delete(tabId);
      }
    }, delay));
    pendingTabInjects.set(tabId, handles);
  }

  function openSettings(tab) {
    const tabId = tab?.id;
    if (typeof tabId !== "number") {
      return;
    }
    const sendOpen = () => {
      chrome.tabs.sendMessage(tabId, { type: SETTINGS_OPEN_MESSAGE }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("settings", "settings-open-message-failed", "设置中心打开消息发送失败", err, { tabId });
        }
      });
    };
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: false },
        files: WEB_BOOT_FILES,
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("settings", "settings-open-boot-failed", "设置中心轻入口补注入失败", err, { tabId });
        }
        sendOpen();
      },
    );
  }

  function openOnboardingPage() {
    if (!chrome.tabs?.create) {
      return;
    }
    chrome.tabs.create({ url: CFG.urls.onboardingPage(1) }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        logError("onboarding", "onboarding-open-failed", "安装引导页打开失败", err);
      }
    });
  }

  // 云端只能从正式 HTTPS v1 顶层页面请求切换当前标签
  function isOnboardingCloudSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.origin === CFG.urls.onboardingOrigin
      && url.pathname === "/wizard/v1/"
      && sender?.frameId === 0
      && Number.isInteger(sender?.tab?.id);
  }

  function openOnboardingLocalPage(request, sender, sendResponse) {
    if (!isOnboardingCloudSender(sender)) {
      sendResponse({ success: false, error: "云端引导页来源无效" });
      return;
    }
    const pageCount = request?.pageCount;
    const localIndex = request?.localIndex;
    const page = ONBOARDING.pageForLocalIndex(localIndex, pageCount);
    if (!page || request?.page !== page) {
      sendResponse({ success: false, error: "本地引导页码无效" });
      return;
    }
    const url = chrome.runtime.getURL(`${ONBOARDING_PAGE}?page=${page}`);
    chrome.tabs.update(sender.tab.id, { url }, () => {
      const err = chrome.runtime.lastError;
      sendResponse(err
        ? { success: false, error: err.message || "本地引导页打开失败" }
        : { success: true });
    });
  }

  function openOnboardingSettings(request, sender, sendResponse) {
    void request;
    if (!isOnboardingSender(sender)) {
      sendResponse({ success: false, error: "引导页来源无效" });
      return;
    }
    chrome.tabs.create({ url: ONBOARDING_STORE_URL }, (tab) => {
      const err = chrome.runtime.lastError;
      const tabId = tab?.id;
      if (err || typeof tabId !== "number") {
        sendResponse({ success: false, error: err?.message || "无法打开 Steam 商店页" });
        return;
      }

      let done = false;
      const finish = (targetTab, timedOut = false) => {
        if (done) return;
        done = true;
        chrome.tabs.onUpdated.removeListener(listener);
        openSettings(targetTab || tab);
        sendResponse({ success: true, tabId, timedOut });
      };
      const listener = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          finish(updatedTab);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
      if (tab.status === "complete") {
        finish(tab);
        return;
      }
      globalThis.setTimeout(() => {
        chrome.tabs.get(tabId, (current) => {
          finish(chrome.runtime.lastError ? tab : current || tab, true);
        });
      }, 8000);
    });
  }

  // 后台代理是跨域访问边界，只允许业务需要的少量请求头，避免调用方透传浏览器敏感头。
  function cleanHeaders(headers) {
    const out = {};
    for (const [name, value] of Object.entries(headers || {})) {
      const lower = name.toLowerCase();
      if (!SAFE_HEADERS.has(lower)) {
        continue;
      }
      if (value === undefined || value === null) {
        continue;
      }
      out[name] = String(value);
    }
    return out;
  }

  function cleanResponseHeaders(headers) {
    const out = {};
    try {
      headers?.forEach?.((value, name) => {
        const lower = String(name || "").toLowerCase();
        if (SAFE_RESPONSE_HEADERS.has(lower)) {
          out[lower] = String(value || "");
        }
      });
    } catch {
    }
    return out;
  }

  function storeLogNetwork(request, entry) {
    if (request?.silentLog === true) {
      return;
    }
    logNetwork({
      ...entry,
      service: request?.service,
      operationId: request?.operationId,
      requestId: request?.requestId,
      endpointKey: request?.endpointKey,
    });
  }

  function reqBody(request) {
    if (request.body !== undefined) {
      return request.body;
    }
    if (request.data !== undefined) {
      return JSON.stringify(request.data);
    }
    return undefined;
  }

  function normalizeTimeout(value, fallback) {
    const next = Number(value ?? fallback);
    return Number.isFinite(next) && next > 0 ? next : 0;
  }

  function capTimeout(value, fallback, max) {
    const requested = normalizeTimeout(value, 0);
    const timeout = requested > 0 ? requested : normalizeTimeout(fallback, 0);
    const cap = normalizeTimeout(max, 0);
    return timeout > 0 && cap > 0 ? Math.min(timeout, cap) : timeout;
  }

  function timeoutError(timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  async function fetchWithTimeout(url, init, timeoutMs) {
    const timeout = normalizeTimeout(timeoutMs, 0);
    if (timeout <= 0) {
      return fetch(url, init);
    }
    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError(timeout)), timeout);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }
    let timer = 0;
    return Promise.race([
      fetch(url, init),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeout)), timeout);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /* 商店页跨域代理 */
  async function storeFetch(request, sender, sendResponse) {
    const startedAt = Date.now();
    let url;
    try {
      url = new URL(request.url);
    } catch {
      storeLogNetwork(request, {
        feature: "store-fetch",
        event: "invalid-url",
        message: "后台代理收到无效请求地址",
        method: request.method || "GET",
        url: request.url || "",
        status: 0,
        durationMs: Date.now() - startedAt,
      });
      sendResponse({ success: false, error: "无效的请求地址" });
      return;
    }

    if (!STORE_HOSTS.has(url.hostname)) {
      storeLogNetwork(request, {
        feature: "store-fetch",
        event: "blocked-host",
        message: "后台代理拒绝非允许列表地址",
        method: request.method || "GET",
        url: url.toString(),
        status: 0,
        durationMs: Date.now() - startedAt,
      });
      sendResponse({ success: false, error: "请求地址不在允许列表中" });
      return;
    }

    const method = String(request.method || "GET").toUpperCase();
    const init = {
      method,
      headers: cleanHeaders(request.headers),
      cache: "no-cache",
      credentials: "omit",
    };

    const body = reqBody(request);
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = body;
    }

    try {
      const response = await fetchWithTimeout(url.toString(), init, request.timeoutMs ?? STORE_FETCH_TIMEOUT_MS);
      const data = await response.text();
      if (!response.ok && !request.allowHttpError) {
        const msg = httpError(response.status, data);
        const requestError = new Error(msg);
        requestError.name = "HttpError";
        requestError.code = "HTTP_STATUS_ERROR";
        requestError.status = response.status;
        storeLogNetwork(request, {
          feature: "store-fetch",
          event: "http-failed",
          message: "后台代理请求失败",
          method,
          url: url.toString(),
          status: response.status,
          durationMs: Date.now() - startedAt,
          error: requestError,
        });
        sendResponse({ success: false, error: msg, data, status: response.status, ok: false, headers: cleanResponseHeaders(response.headers) });
        return;
      }
      if (!response.ok) {
        storeLogNetwork(request, {
          feature: "store-fetch",
          event: "http-allowed-error",
          message: "后台代理收到非成功状态码",
          method,
          url: url.toString(),
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
      }
      sendResponse({ success: true, data, status: response.status, ok: response.ok, headers: cleanResponseHeaders(response.headers) });
    } catch (error) {
      const msg = error.message || String(error);
      storeLogNetwork(request, {
        feature: "store-fetch",
        event: "request-thrown",
        message: "后台代理请求异常",
        method,
        url: url.toString(),
        status: 0,
        durationMs: Date.now() - startedAt,
        error,
      });
      sendResponse({
        success: false,
        error: msg,
        status: 0,
        ok: false,
        errorKind: "transport",
        ...(error?.name ? { errorName: String(error.name) } : {}),
        ...(error?.code ? { errorCode: String(error.code) } : {}),
      });
    }
  }

  function parseJson(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function httpError(status, text) {
    void text;
    return `HTTP状态码错误: ${status}`;
  }

  function aiLimit(conf) {
    const limit = globalThis.STAI?.concurrency?.(conf);
    return Number.isFinite(limit) ? limit : 10;
  }

  function aiGatewayPermissionPattern(value) {
    return globalThis.STAI?.hostPermissionPattern?.(value) || "";
  }

  function hasAiGatewayPermission(value) {
    const origin = aiGatewayPermissionPattern(value);
    if (!origin) {
      return Promise.resolve(false);
    }
    if (!chrome.permissions?.contains) {
      const error = new Error("AI 网关权限检查不可用");
      error.code = "AI_HOST_PERMISSION_UNAVAILABLE";
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      chrome.permissions.contains({ origins: [origin] }, (granted) => {
        const error = chrome.runtime.lastError;
        if (error) {
          const next = new Error(error.message || "AI 网关权限检查失败");
          next.code = "AI_HOST_PERMISSION_CHECK_FAILED";
          reject(next);
          return;
        }
        resolve(granted === true);
      });
    });
  }

  function checkAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关权限检查来源无效" });
      return;
    }
    const origin = aiGatewayPermissionPattern(request?.host);
    const sourceTabId = sender?.tab?.id;
    const sourceFrameId = sender?.frameId;
    if (!origin) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_INVALID", error: "无效的 AI 网关地址" });
      return;
    }
    if (!Number.isInteger(sourceTabId) || sourceTabId < 0 || !Number.isInteger(sourceFrameId) || sourceFrameId < 0) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SOURCE_INVALID", error: "AI 设置页上下文无效" });
      return;
    }
    hasAiGatewayPermission(origin)
      .then((granted) => sendResponse({ success: true, granted, origin, sourceTabId, sourceFrameId }))
      .catch((error) => sendResponse({
        success: false,
        granted: false,
        code: error?.code || "AI_HOST_PERMISSION_CHECK_FAILED",
        error: error?.message || "AI 网关权限检查失败",
      }));
  }

  function requestAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关权限申请来源无效" });
      return;
    }
    const origin = aiGatewayPermissionPattern(request?.host);
    if (!origin) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_INVALID", error: "无效的 AI 网关地址" });
      return;
    }
    if (!chrome.permissions?.request) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_UNAVAILABLE", error: "AI 网关权限申请不可用" });
      return;
    }
    chrome.permissions.request({ origins: [origin] }, (granted) => {
      const error = chrome.runtime.lastError;
      if (error) {
        sendResponse({
          success: false,
          granted: false,
          code: "AI_HOST_PERMISSION_REQUEST_FAILED",
          error: error.message || "AI 网关权限申请失败",
        });
        return;
      }
      sendResponse({
        success: granted === true,
        granted: granted === true,
        origin,
        ...(granted === true ? {} : {
          code: "AI_HOST_PERMISSION_DENIED",
          error: "未获得当前 AI 网关的访问权限",
        }),
      });
    });
  }

  // 一次性会话由后台持有；URL 只携带 requestId，来源 tab/frame 和授权目标始终从会话读取。
  // tab/window 索引写入 storage.session，确保 MV3 Service Worker 重启后仍能处理真实关闭事件。
  function aiPermissionRequestId(value) {
    const requestId = String(value || "");
    return /^request-[0-9a-f-]{36}$/iu.test(requestId) ? requestId : "";
  }

  function aiPermissionSessionKey(requestId) {
    return `${AI_PERMISSION_SESSION_PREFIX}${requestId}`;
  }

  function aiPermissionTabKey(tabId) {
    return `${AI_PERMISSION_TAB_PREFIX}${tabId}`;
  }

  function aiPermissionWindowKey(windowId) {
    return `${AI_PERMISSION_WINDOW_PREFIX}${windowId}`;
  }

  function sessionStorageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.get(key, (entries) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "读取 AI 授权会话失败"));
        else resolve(entries?.[key]);
      });
    });
  }

  function sessionStorageSet(entries) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.set(entries, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "保存 AI 授权会话失败"));
        else resolve();
      });
    });
  }

  function sessionStorageRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.session.remove(keys, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "清理 AI 授权会话失败"));
        else resolve();
      });
    });
  }

  function cacheAiPermissionSession(session) {
    aiPermissionSessions.set(session.requestId, session);
    if (Number.isInteger(session.authTabId)) {
      aiPermissionTabs.set(session.authTabId, session.requestId);
    }
    if (Number.isInteger(session.authWindowId)) {
      aiPermissionWindows.set(session.authWindowId, session.requestId);
    }
    return session;
  }

  async function writeAiPermissionSession(session) {
    const entries = {
      [aiPermissionSessionKey(session.requestId)]: session,
    };
    if (Number.isInteger(session.authTabId)) {
      entries[aiPermissionTabKey(session.authTabId)] = session.requestId;
    }
    if (Number.isInteger(session.authWindowId)) {
      entries[aiPermissionWindowKey(session.authWindowId)] = session.requestId;
    }
    await sessionStorageSet(entries);
    return cacheAiPermissionSession(session);
  }

  async function readAiPermissionSession(requestId) {
    const cached = aiPermissionSessions.get(requestId);
    if (cached) return cached.state === "pending" ? cached : null;
    const stored = await sessionStorageGet(aiPermissionSessionKey(requestId));
    if (!stored || stored.requestId !== requestId || stored.state !== "pending") return null;
    return cacheAiPermissionSession(stored);
  }

  async function removeAiPermissionSession(session) {
    session.state = "settled";
    cacheAiPermissionSession(session);
    const keys = [aiPermissionSessionKey(session.requestId)];
    if (Number.isInteger(session.authTabId)) {
      keys.push(aiPermissionTabKey(session.authTabId));
    }
    if (Number.isInteger(session.authWindowId)) {
      keys.push(aiPermissionWindowKey(session.authWindowId));
    }
    await sessionStorageRemove(keys);
    aiPermissionSessions.delete(session.requestId);
    if (Number.isInteger(session.authTabId)) aiPermissionTabs.delete(session.authTabId);
    if (Number.isInteger(session.authWindowId)) aiPermissionWindows.delete(session.authWindowId);
  }

  function claimAiPermissionSession(requestId) {
    if (aiPermissionSettling.has(requestId)) return false;
    aiPermissionSettling.add(requestId);
    return true;
  }

  function releaseAiPermissionSession(requestId) {
    aiPermissionSettling.delete(requestId);
  }

  function aiPermissionSessionExpired(session) {
    return !Number.isFinite(Number(session?.expiresAt)) || Number(session.expiresAt) <= Date.now();
  }

  function aiPermissionSessionMatchesPage(session, sender) {
    const tabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;
    return (!Number.isInteger(session.authTabId) || session.authTabId === tabId)
      && (!Number.isInteger(session.authWindowId) || session.authWindowId === windowId);
  }

  function aiPermissionResult(session, details = {}) {
    return {
      type: AI_GATEWAY_PERMISSION_RESULT,
      requestId: session.requestId,
      operationId: session.operationId,
      origin: session.origin,
      granted: details.granted === true,
      ...(details.code ? { code: details.code } : {}),
      ...(details.error ? { error: details.error } : {}),
    };
  }

  function notifyAiPermissionSource(session, result) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(session.sourceTabId, result, { frameId: session.sourceFrameId }, () => {
        const error = chrome.runtime.lastError;
        resolve(error ? String(error.message || error) : "");
      });
    });
  }

  async function consumeAiPermissionSession(session, details) {
    if (!claimAiPermissionSession(session.requestId)) {
      return { consumed: false, notifyError: "" };
    }
    try {
      await removeAiPermissionSession(session);
      const notifyError = await notifyAiPermissionSource(session, aiPermissionResult(session, details));
      return { consumed: true, notifyError };
    } finally {
      releaseAiPermissionSession(session.requestId);
    }
  }

  function bindAiPermissionPage(session, sender) {
    const tabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;
    if (!Number.isInteger(tabId) || !Number.isInteger(windowId)) return false;
    if (!aiPermissionSessionMatchesPage(session, sender)) return false;
    session.authTabId = tabId;
    session.authWindowId = windowId;
    cacheAiPermissionSession(session);
    return true;
  }

  function aiPermissionPageUrl(requestId) {
    const url = new URL(chrome.runtime.getURL(AI_PERMISSION_PAGE));
    url.searchParams.set("requestId", requestId);
    return url.toString();
  }

  async function openAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关授权页打开来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    const operationId = String(request?.operationId || "").slice(0, 120);
    const origin = aiGatewayPermissionPattern(request?.host);
    const sourceTabId = sender?.tab?.id;
    const sourceFrameId = sender?.frameId;
    if (!requestId) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_REQUEST_INVALID", error: "AI 网关授权请求无效" });
      return;
    }
    if (!origin) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_INVALID", error: "无效的 AI 网关地址" });
      return;
    }
    if (!Number.isInteger(sourceTabId) || sourceTabId < 0 || !Number.isInteger(sourceFrameId) || sourceFrameId < 0) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SOURCE_INVALID", error: "AI 设置页上下文无效" });
      return;
    }
    let existingSession;
    try {
      existingSession = await readAiPermissionSession(requestId);
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { operationId, requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (existingSession) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_REQUEST_DUPLICATE", error: "AI 网关授权请求已存在" });
      return;
    }
    const createdAt = Date.now();
    const session = {
      state: "pending",
      requestId,
      operationId,
      origin,
      sourceTabId,
      sourceFrameId,
      authTabId: null,
      authWindowId: null,
      createdAt,
      expiresAt: createdAt + AI_PERMISSION_SESSION_TTL_MS,
    };
    try {
      await writeAiPermissionSession(session);
    } catch (error) {
      logError("ai", "ai-permission-session-save-failed", "AI 授权会话保存失败", error, { operationId, requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_SAVE_FAILED", error: "AI 授权会话创建失败" });
      return;
    }
    openChromiumWindow(aiPermissionPageUrl(requestId), async (response) => {
      if (response?.opened !== true || !Number.isInteger(response.windowId)) {
        try {
          await removeAiPermissionSession(session);
        } catch (error) {
          logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", error, { operationId, requestId });
        }
        sendResponse(response);
        return;
      }
      session.authWindowId = response.windowId;
      cacheAiPermissionSession(session);
      try {
        await writeAiPermissionSession(session);
        if (session.state !== "pending") {
          try {
            await removeAiPermissionSession(session);
          } catch (cleanupError) {
            logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, { operationId, requestId });
          }
          sendResponse({ success: false, code: "AI_HOST_PERMISSION_PAGE_CLOSED", error: "授权网页已关闭，未完成 AI 网关授权" });
          return;
        }
        sendResponse({ success: true, opened: true, requestId });
      } catch (error) {
        logError("ai", "ai-permission-session-bind-failed", "AI 授权窗口绑定失败", error, { operationId, requestId });
        try {
          await removeAiPermissionSession(session);
        } catch (cleanupError) {
          logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, { operationId, requestId });
        }
        closeAiPermissionPage(session);
        sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_BIND_FAILED", error: "AI 授权窗口状态保存失败" });
      }
    });
  }

  async function getAiGatewayPermissionContext(request, sender, sendResponse) {
    if (!isAiPermissionPageSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_PAGE_REJECTED", error: "AI 网关授权页来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    let session;
    try {
      session = requestId ? await readAiPermissionSession(requestId) : null;
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (!session || aiPermissionSessionExpired(session) || !bindAiPermissionPage(session, sender)) {
      if (session && aiPermissionSessionExpired(session) && claimAiPermissionSession(requestId)) {
        try {
          await removeAiPermissionSession(session);
        } catch (error) {
          logError("ai", "ai-permission-session-cleanup-failed", "过期 AI 授权会话清理失败", error, {
            operationId: session.operationId,
            requestId,
          });
        } finally {
          releaseAiPermissionSession(requestId);
        }
      }
      backgroundLogger("ai").warn("ai-permission-session-rejected", "AI 授权页面会话已失效", {
        requestId,
        reason: !session ? "missing" : aiPermissionSessionExpired(session) ? "expired" : "page-mismatch",
      });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
      return;
    }
    try {
      await writeAiPermissionSession(session);
      if (session.state !== "pending") {
        sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
        return;
      }
      sendResponse({ success: true, requestId, origin: session.origin, expiresAt: session.expiresAt });
    } catch (error) {
      logError("ai", "ai-permission-session-bind-failed", "AI 授权页面绑定失败", error, {
        operationId: session.operationId,
        requestId,
      });
      const details = {
        granted: false,
        code: "AI_HOST_PERMISSION_SESSION_BIND_FAILED",
        error: "AI 授权页面状态确认失败",
      };
      if (claimAiPermissionSession(requestId)) {
        try {
          try {
            await removeAiPermissionSession(session);
          } catch (cleanupError) {
            logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, {
              operationId: session.operationId,
              requestId,
            });
          }
          await notifyAiPermissionSource(session, aiPermissionResult(session, details));
        } finally {
          releaseAiPermissionSession(requestId);
        }
      }
      closeAiPermissionPage(session);
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_BIND_FAILED", error: "AI 授权页面状态确认失败" });
    }
  }

  async function cancelAiGatewayPermission(request, sender, sendResponse) {
    if (!isSettingsSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SENDER_REJECTED", error: "AI 网关授权取消来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    let session;
    try {
      session = requestId ? await readAiPermissionSession(requestId) : null;
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { requestId });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (!session) {
      sendResponse({ success: true, cancelled: false });
      return;
    }
    if (session.sourceTabId !== sender?.tab?.id || session.sourceFrameId !== sender?.frameId) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_SOURCE_INVALID", error: "AI 设置页上下文无效" });
      return;
    }
    if (!claimAiPermissionSession(requestId)) {
      sendResponse({ success: true, cancelled: false });
      return;
    }
    try {
      await removeAiPermissionSession(session);
      closeAiPermissionPage(session);
      sendResponse({ success: true, cancelled: true });
    } catch (error) {
      logError("ai", "ai-permission-session-cancel-failed", "AI 授权会话取消失败", error, {
        operationId: session.operationId,
        requestId,
      });
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_CANCEL_FAILED", error: "AI 授权会话取消失败" });
    } finally {
      releaseAiPermissionSession(requestId);
    }
  }

  function openChromiumWindow(url, sendResponse) {
    const targetUrl = String(url || "").trim();
    try {
      new URL(targetUrl);
    } catch {
      sendResponse({ success: false, code: "CHROMIUM_WINDOW_URL_INVALID", error: "Chromium 打开地址无效" });
      return;
    }
    if (!chrome.windows?.create) {
      sendResponse({ success: false, code: "CHROMIUM_WINDOW_UNAVAILABLE", error: "Chromium 窗口打开能力不可用" });
      return;
    }
    chrome.windows.create({ url: targetUrl, type: "normal", focused: true }, (createdWindow) => {
      const error = chrome.runtime.lastError;
      if (error || !Number.isInteger(createdWindow?.id)) {
        sendResponse({
          success: false,
          code: "CHROMIUM_WINDOW_OPEN_FAILED",
          error: error?.message || "Chromium 窗口打开失败",
        });
        return;
      }
      sendResponse({ success: true, opened: true, windowId: createdWindow.id });
    });
  }

  function openChromiumWindowRequest(request, sender, sendResponse) {
    if (sender?.id !== chrome.runtime.id) {
      sendResponse({ success: false, code: "CHROMIUM_WINDOW_SENDER_REJECTED", error: "Chromium 窗口打开来源无效" });
      return;
    }
    openChromiumWindow(request?.url, sendResponse);
  }

  function steamRootMenuWebUrl(value) {
    const target = String(value || "").trim();
    try {
      const url = new URL(target);
      return url.protocol === "http:" || url.protocol === "https:" ? target : "";
    } catch {
      return "";
    }
  }

  async function steamRootMenuContext(sender) {
    if (sender?.id !== chrome.runtime.id) {
      return null;
    }
    const target = senderTarget(sender);
    if (!target) {
      return null;
    }
    try {
      const results = await execScript({
        target,
        world: "MAIN",
        func: (settingKey) => {
          let openerUrl = "";
          let openerTitle = "";
          let configuredUrl = "";
          try {
            openerUrl = String(window.opener?.location?.href || "");
            openerTitle = String(window.opener?.document?.title || "");
            const value = window.opener?.settingsStore?.clientSettings?.[settingKey];
            configuredUrl = typeof value === "string" ? value.trim() : "";
          } catch {
            configuredUrl = "";
          }
          return {
            title: String(document.title || ""),
            url: String(location.href || ""),
            openerUrl,
            openerTitle,
            configuredUrl,
          };
        },
        args: [STEAM_ROOT_MENU_BROWSER_HOME_SETTING],
      });
      const frame = results?.[0]?.result;
      if (frame?.title !== STEAM_ROOT_MENU_TITLE
          || frame?.openerTitle !== "SharedJSContext"
          || !isSteamLoopbackUrl(frame?.url)
          || !isSteamLoopbackUrl(frame?.openerUrl)) {
        return null;
      }
      return Object.freeze({ configuredUrl: steamRootMenuWebUrl(frame.configuredUrl) });
    } catch {
      return null;
    }
  }

  function steamRootMenuBrowserTarget(context) {
    return context?.configuredUrl
      ? { url: context.configuredUrl, source: "steam-setting" }
      : { url: STEAM_ROOT_MENU_BROWSER_FALLBACK, source: "fallback" };
  }

  async function openSteamRootMenuChromiumRequest(request, sender, sendResponse) {
    const action = String(request?.action || "");
    if (action !== "browser" && action !== "extensions") {
      sendResponse({ success: false, code: "STEAM_ROOT_MENU_ACTION_INVALID", error: "Steam Root Menu 操作无效" });
      return;
    }
    const context = await steamRootMenuContext(sender);
    if (!context) {
      sendResponse({ success: false, code: "STEAM_ROOT_MENU_SENDER_REJECTED", error: "Steam Root Menu 来源无效" });
      return;
    }
    const target = action === "extensions"
      ? { url: STEAM_ROOT_MENU_EXTENSIONS_URL, source: "fixed" }
      : steamRootMenuBrowserTarget(context);
    openChromiumWindow(target.url, (response) => {
      sendResponse({
        ...response,
        action,
        source: target.source,
      });
    });
  }

  function isAiPermissionPageSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "chrome-extension:"
      && url.hostname === chrome.runtime.id
      && url.pathname.replace(/^\/+/, "") === AI_PERMISSION_PAGE
      && sender?.frameId === 0
      && Number.isInteger(sender?.tab?.id);
  }

  function closeAiPermissionTab(tabId) {
    globalThis.setTimeout(() => {
      chrome.tabs.remove(tabId, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          logError("ai", "ai-permission-tab-close-failed", "AI 授权页关闭失败", error, { tabId });
        }
      });
    }, 0);
  }

  function closeAiPermissionPage(session) {
    if (Number.isInteger(session?.authTabId)) {
      closeAiPermissionTab(session.authTabId);
      return;
    }
    if (!Number.isInteger(session?.authWindowId)) return;
    globalThis.setTimeout(() => {
      chrome.windows.remove(session.authWindowId, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          logError("ai", "ai-permission-window-close-failed", "AI 授权窗口关闭失败", error, {
            windowId: session.authWindowId,
          });
        }
      });
    }, 0);
  }

  async function completeAiGatewayPermission(request, sender, sendResponse) {
    if (!isAiPermissionPageSender(sender)) {
      sendResponse({ success: false, code: "AI_HOST_PERMISSION_PAGE_REJECTED", error: "AI 网关授权页来源无效" });
      return;
    }
    const requestId = aiPermissionRequestId(request?.requestId);
    let session;
    try {
      session = requestId ? await readAiPermissionSession(requestId) : null;
    } catch (error) {
      logError("ai", "ai-permission-session-read-failed", "AI 授权会话读取失败", error, { requestId });
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_READ_FAILED", error: "AI 授权会话状态读取失败" });
      return;
    }
    if (!session || aiPermissionSessionExpired(session)) {
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
      return;
    }
    if (!bindAiPermissionPage(session, sender)) {
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_EXPIRED", error: "授权请求已失效，请返回设置中心重新发起" });
      return;
    }
    // 先抢占终态再检查权限，避免用户点击授权后立即关页时同时回传成功和关闭失败。
    if (!claimAiPermissionSession(requestId)) {
      sendResponse({ success: false, granted: false, code: "AI_HOST_PERMISSION_SESSION_SETTLED", error: "授权请求已经结束" });
      return;
    }
    try {
      const granted = await hasAiGatewayPermission(session.origin);
      const details = granted
        ? { granted: true }
        : { granted: false, code: "AI_HOST_PERMISSION_DENIED", error: "未获得当前 AI 网关的访问权限" };
      await removeAiPermissionSession(session);
      const notifyError = await notifyAiPermissionSource(session, aiPermissionResult(session, details));
      sendResponse({
        success: !notifyError,
        granted,
        notified: !notifyError,
        ...(details.code ? { code: details.code } : {}),
        ...(details.error ? { error: details.error } : {}),
        ...(notifyError ? { code: "AI_HOST_PERMISSION_RESULT_UNDELIVERED", error: "原设置页已关闭，无法继续授权操作" } : {}),
      });
      if (!notifyError) closeAiPermissionTab(sender.tab.id);
    } catch (error) {
      const code = error?.code || (session.state === "settled"
        ? "AI_HOST_PERMISSION_SESSION_CLEANUP_FAILED"
        : "AI_HOST_PERMISSION_CHECK_FAILED");
      const message = error?.message || "AI 网关权限检查失败";
      try {
        await removeAiPermissionSession(session);
      } catch (cleanupError) {
        logError("ai", "ai-permission-session-cleanup-failed", "AI 授权会话清理失败", cleanupError, {
          operationId: session.operationId,
          requestId,
        });
      }
      const notifyError = await notifyAiPermissionSource(session, aiPermissionResult(session, {
        granted: false,
        code,
        error: message,
      }));
      sendResponse({
        success: false,
        granted: false,
        notified: !notifyError,
        code,
        error: message,
      });
      closeAiPermissionPage(session);
    } finally {
      releaseAiPermissionSession(requestId);
    }
  }

  async function aiPermissionRequestIdForTab(tabId) {
    return aiPermissionTabs.get(tabId) || await sessionStorageGet(aiPermissionTabKey(tabId)) || "";
  }

  async function aiPermissionRequestIdForWindow(windowId) {
    return aiPermissionWindows.get(windowId) || await sessionStorageGet(aiPermissionWindowKey(windowId)) || "";
  }

  async function finishClosedAiPermissionPage(requestId, source, id) {
    const session = requestId ? await readAiPermissionSession(requestId) : null;
    if (!session) return;
    if (source === "tab" && session.authTabId !== id) return;
    if (source === "window" && session.authWindowId !== id) return;
    const result = await consumeAiPermissionSession(session, {
      granted: false,
      code: "AI_HOST_PERMISSION_PAGE_CLOSED",
      error: "授权网页已关闭，未完成 AI 网关授权",
    });
    if (!result.consumed) return;
    backgroundLogger("ai").warn("ai-permission-page-closed", "AI 授权页面在完成前被关闭", {
      operationId: session.operationId,
      requestId,
      durationMs: Date.now() - session.createdAt,
      notified: !result.notifyError,
    });
  }

  function handleAiPermissionTabRemoved(tabId) {
    aiPermissionRequestIdForTab(tabId)
      .then((requestId) => finishClosedAiPermissionPage(requestId, "tab", tabId))
      .catch((error) => logError("ai", "ai-permission-tab-close-handle-failed", "AI 授权标签关闭处理失败", error, { tabId }));
  }

  function handleAiPermissionWindowRemoved(windowId) {
    aiPermissionRequestIdForWindow(windowId)
      .then((requestId) => finishClosedAiPermissionPage(requestId, "window", windowId))
      .catch((error) => logError("ai", "ai-permission-window-close-handle-failed", "AI 授权窗口关闭处理失败", error, { windowId }));
  }

  function drainAiQueue() {
    while (aiQueue.length) {
      const task = aiQueue[0];
      if (aiActive >= task.limit) {
        return;
      }
      aiQueue.shift();
      aiActive += 1;
      Promise.resolve()
        .then(task.job)
        .then(task.resolve, task.reject)
        .finally(() => {
          aiActive = Math.max(0, aiActive - 1);
          drainAiQueue();
        });
    }
  }

  function runAiLimited(limit, job) {
    return new Promise((resolve, reject) => {
      aiQueue.push({ limit, job, resolve, reject });
      drainAiQueue();
    });
  }

  function fetchAiChat(url, next, timeoutMs) {
    return fetchWithTimeout(url, {
      method: "POST",
      headers: next.headers,
      body: JSON.stringify(next.body),
      cache: "no-cache",
      credentials: "omit",
    }, timeoutMs)
      .then((response) => response.text().then((text) => {
        if (!response.ok) {
          throw new Error(httpError(response.status, text));
        }
        const data = parseJson(text);
        const content = globalThis.STAI?.chatText?.(data);
        if (!content) {
          throw new Error("AI 响应格式异常");
        }
        return { content, status: response.status };
      }));
  }

  function aiChat(request, sender, sendResponse) {
    void sender;
    if (!aiReady) {
      sendResponse({
        success: false,
        code: "AI_CONFIG_LOAD_FAILED",
        error: aiLoadError ? `AI 配置脚本加载失败：${aiLoadError}` : "AI 配置脚本未就绪",
      });
      return;
    }

    const next = globalThis.STAI?.chatRequest?.(request.ai, request.messages);
    if (!next) {
      sendResponse({ success: false, code: "AI_CONFIG_INCOMPLETE", error: "AI 配置不完整" });
      return;
    }

    let url;
    try {
      url = new URL(next.url);
    } catch {
      sendResponse({ success: false, error: "无效的 AI 网关地址" });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      sendResponse({ success: false, error: "无效的 AI 网关协议" });
      return;
    }

    const timeoutMs = capTimeout(request.timeoutMs, AI_FETCH_TIMEOUT_MS, AI_FETCH_TIMEOUT_MAX_MS);
    const limit = aiLimit(request.ai);
    hasAiGatewayPermission(url.toString())
      .then((granted) => {
        if (!granted) {
          const error = new Error("未获得当前 AI 网关的访问权限，请在设置中心重新保存 AI 配置并允许访问");
          error.code = "AI_HOST_PERMISSION_REQUIRED";
          throw error;
        }
        return runAiLimited(limit, () => fetchAiChat(url.toString(), next, timeoutMs));
      })
      .then((res) => {
        sendResponse({ success: true, text: res.content, status: res.status });
      })
      .catch((error) => {
        const msg = error.message || String(error);
        logError("ai", "request-failed", "AI 请求失败", error);
        sendResponse({ success: false, code: error?.code || "AI_REQUEST_FAILED", error: msg });
      });
  }

  function validAiStreamMessages(messages) {
    const roles = new Set(["system", "user", "assistant"]);
    return Array.isArray(messages)
      && messages.length > 0
      && messages.every(message => (
        message
        && typeof message === "object"
        && roles.has(String(message.role || ""))
        && typeof message.content === "string"
        && message.content.trim().length > 0
      ));
  }

  function streamPortPost(port, payload) {
    try {
      port.postMessage(payload);
      return true;
    } catch {
      return false;
    }
  }

  function parseAiStreamEvent(block) {
    const dataText = String(block || "")
      .split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!dataText) return { done: false, text: "" };
    if (dataText === "[DONE]") return { done: true, text: "" };
    const data = parseJson(dataText);
    if (!data) {
      const error = new Error("AI 流式响应格式异常");
      error.code = "AI_STREAM_EVENT_INVALID";
      throw error;
    }
    return {
      done: false,
      text: globalThis.STAI?.chatDelta?.(data) || "",
    };
  }

  async function fetchAiChatStream(url, next, timeoutMs, controller, onDelta) {
    const timeout = normalizeTimeout(timeoutMs, 0);
    const timer = timeout > 0
      ? setTimeout(() => controller.abort(timeoutError(timeout)), timeout)
      : 0;
    let reader = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: next.headers,
        body: JSON.stringify(next.body),
        cache: "no-cache",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(httpError(response.status, ""));
        error.name = "HttpError";
        error.code = "HTTP_STATUS_ERROR";
        error.status = response.status;
        throw error;
      }
      if (!response.body?.getReader) {
        const error = new Error("AI 服务未返回可读取的流式响应");
        error.code = "AI_STREAM_BODY_UNAVAILABLE";
        throw error;
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      let chunks = 0;
      let finished = false;

      const consume = (block) => {
        const event = parseAiStreamEvent(block);
        if (event.done) {
          finished = true;
          return;
        }
        if (!event.text) return;
        content += event.text;
        chunks += 1;
        onDelta(event.text);
      };

      while (!finished) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let boundary = /\r?\n\r?\n/.exec(buffer);
        while (boundary) {
          consume(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
          if (finished) break;
          boundary = /\r?\n\r?\n/.exec(buffer);
        }
      }
      buffer += decoder.decode();
      if (!finished && buffer.trim()) consume(buffer);
      if (!content.trim()) {
        const error = new Error("AI 流式响应没有返回文本");
        error.code = "AI_STREAM_TEXT_EMPTY";
        throw error;
      }
      if (finished) {
        try {
          await reader.cancel();
        } catch {
        }
      }
      return { content, chunks, status: response.status };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function aiStreamConnect(port) {
    if (port?.name !== AI_STREAM_PORT) return;
    const controller = new AbortController();
    let started = false;
    let disconnected = false;

    port.onDisconnect.addListener(() => {
      disconnected = true;
      if (!controller.signal.aborted) controller.abort(new Error("AI 流式通道已断开"));
    });

    port.onMessage.addListener((request = {}) => {
      if (started) {
        streamPortPost(port, { event: "error", code: "AI_STREAM_ALREADY_STARTED", error: "流式通道已经开始请求" });
        return;
      }
      started = true;
      const startedAt = Date.now();
      const requestId = String(request.requestId || "").trim();
      const operationId = String(request.operationId || "").trim();
      const model = String(globalThis.STAI?.normalize?.(request.ai)?.model || "");
      const fail = (code, error, status = 0) => {
        if (disconnected) return;
        streamPortPost(port, {
          event: "error",
          code,
          error,
          status,
          requestId,
          operationId,
        });
      };

      if (!aiReady) {
        fail("AI_CONFIG_LOAD_FAILED", aiLoadError ? `AI 配置脚本加载失败：${aiLoadError}` : "AI 配置脚本未就绪");
        return;
      }
      if (!validAiStreamMessages(request.messages)) {
        fail("AI_MESSAGES_INVALID", "AI 对话上下文格式无效");
        return;
      }

      const next = globalThis.STAI?.chatStreamRequest?.(request.ai, request.messages);
      if (!next) {
        fail("AI_CONFIG_INCOMPLETE", "AI 配置不完整");
        return;
      }
      let url;
      try {
        url = new URL(next.url);
      } catch {
        fail("AI_URL_INVALID", "无效的 AI 网关地址");
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        fail("AI_URL_PROTOCOL_INVALID", "无效的 AI 网关协议");
        return;
      }

      const timeoutMs = capTimeout(request.timeoutMs, AI_FETCH_TIMEOUT_MAX_MS, AI_FETCH_TIMEOUT_MAX_MS);
      const limit = aiLimit(request.ai);
      hasAiGatewayPermission(url.toString()).then((granted) => {
        if (!granted) {
          const error = new Error("未获得当前 AI 网关的访问权限，请在设置中心重新保存 AI 配置并允许访问");
          error.code = "AI_HOST_PERMISSION_REQUIRED";
          throw error;
        }
        backgroundLogger("ai").info("ai-stream-request-start", "AI 流式请求开始", {
          operationId,
          requestId,
          model,
          messageCount: request.messages.length,
        });
        streamPortPost(port, { event: "start", requestId, operationId });
        return runAiLimited(limit, () => fetchAiChatStream(
          url.toString(),
          next,
          timeoutMs,
          controller,
          chunk => {
            if (!streamPortPost(port, { event: "delta", text: chunk, requestId, operationId })) {
              throw new Error("AI 流式通道已断开");
            }
          }
        ));
      }).then((result) => {
        if (disconnected) return;
        backgroundLogger("ai").info("ai-stream-request-success", "AI 流式请求完成", {
          operationId,
          requestId,
          model,
          status: result.status,
          chunkCount: result.chunks,
          durationMs: Date.now() - startedAt,
        });
        streamPortPost(port, {
          event: "done",
          text: result.content,
          status: result.status,
          requestId,
          operationId,
        });
      }).catch((error) => {
        if (disconnected) return;
        const message = error?.message || String(error);
        logError("ai", "ai-stream-request-failed", "AI 流式请求失败", error, {
          operationId,
          requestId,
          model,
          status: Number(error?.status) || 0,
          durationMs: Date.now() - startedAt,
        });
        fail(error?.code || error?.name || "AI_STREAM_FAILED", message, Number(error?.status) || 0);
      });
    });
  }

  function storageLocalEntries() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (entries) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "读取 AI 预测会话失败"));
        else resolve(entries || {});
      });
    });
  }

  function storageLocalRemoveMany(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || "清理 AI 预测会话失败"));
        else resolve();
      });
    });
  }

  async function cleanupExpiredAiForecastSessions() {
    const entries = await storageLocalEntries();
    const now = Date.now();
    const expiredKeys = Object.entries(entries)
      .filter(([key, value]) => (
        key.startsWith(AI_FORECAST_SESSION_STORAGE_PREFIX)
        && (!Number.isFinite(Number(value?.expiresAt)) || Number(value.expiresAt) <= now)
      ))
      .map(([key]) => key);
    if (!expiredKeys.length) return 0;
    await storageLocalRemoveMany(expiredKeys);
    backgroundLogger("ai").info("ai-forecast-session-cleanup-success", "过期 AI 预测会话已清理", {
      removedCount: expiredKeys.length,
    });
    return expiredKeys.length;
  }

  async function ensureAiForecastSessionCleanupAlarm() {
    const existing = await getAlarm(AI_FORECAST_SESSION_CLEANUP_ALARM);
    if (existing) return;
    chrome.alarms.create(AI_FORECAST_SESSION_CLEANUP_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: AI_FORECAST_SESSION_CLEANUP_PERIOD_MINUTES,
    });
  }

  function handleAiForecastSessionCleanupAlarm(alarm) {
    if (alarm?.name !== AI_FORECAST_SESSION_CLEANUP_ALARM) return;
    cleanupExpiredAiForecastSessions().catch((error) => {
      logError("ai", "ai-forecast-session-cleanup-failed", "清理过期 AI 预测会话失败", error);
    });
  }

  function translateTarget(sender) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      return null;
    }
    return { tabId, frameIds: [frameId] };
  }

  function unique(items) {
    return Array.from(new Set((items || []).filter(Boolean).map(String)));
  }

  function translateUsesAi(conf = {}) {
    return conf.service === TRANSLATE_AI_SERVICE ||
      conf.selectionService === TRANSLATE_AI_SERVICE ||
      conf.newsPopupService === TRANSLATE_AI_SERVICE;
  }

  function translateModesFrom(conf = {}) {
    if (conf.enabled === false) {
      return [];
    }
    const raw = Array.isArray(conf.modes)
      ? conf.modes
      : typeof conf.mode === "string"
        ? [conf.mode]
        : [];
    const modes = unique(raw);
    if (conf.selection === true && !modes.includes(TRANSLATE_MODES.selection)) {
      modes.push(TRANSLATE_MODES.selection);
    }
    if (conf.page === true && !modes.includes(TRANSLATE_MODES.autoPage)) {
      modes.push(TRANSLATE_MODES.autoPage);
    }
    if (conf.manual === true && !modes.includes(TRANSLATE_MODES.manual)) {
      modes.push(TRANSLATE_MODES.manual);
    }
    if (modes.length && translateUsesAi(conf) && !modes.includes(TRANSLATE_MODES.aiConfig)) {
      modes.push(TRANSLATE_MODES.aiConfig);
    }
    return unique(modes);
  }

  function senderTarget(sender) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      return null;
    }
    return { tabId, frameIds: [frameId] };
  }

  function senderUrl(sender) {
    return String(sender?.url || sender?.tab?.url || "");
  }

  function senderUrlObject(sender) {
    try {
      return new URL(senderUrl(sender));
    } catch {
      return null;
    }
  }

  function storePageTypeFromMeta(meta = {}) {
    const type = String(meta.pageType || meta.storePageType || "other");
    return Object.hasOwn(STORE_FEATURE_CHUNKS, type) ? type : "other";
  }

  function isStoreHistorySender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "https:"
      && MATCH.isSteamStoreHost?.(url.hostname) === true
      && (url.pathname === "/account/history" || url.pathname.startsWith("/account/history/"));
  }

  function storeFiles(meta = {}, sender) {
    const type = storePageTypeFromMeta(meta);
    if (type === "age") {
      return { files: [], skipped: true, reason: "no-store-feature" };
    }
    if (type === "history" && !isStoreHistorySender(sender)) {
      return { files: [], skipped: true, reason: "not-store-history-page" };
    }
    return {
      files: [
        ...STORE_BASE_SCRIPTS,
        ...(STORE_FEATURE_CHUNKS[type] || STORE_FEATURE_CHUNKS.other),
        ...STORE_START_SCRIPTS,
      ],
    };
  }

  function isSettingsSender(sender) {
    const url = senderUrlObject(sender);
    if (!url || !["http:", "https:"].includes(url.protocol)) {
      return false;
    }
    return MATCH.isSteamPoweredLikeHost?.(url.hostname) === true ||
      MATCH.isSteamCommunityLikeHost?.(url.hostname) === true;
  }

  function isOnboardingSender(sender) {
    const url = senderUrlObject(sender);
    return !!url
      && url.protocol === "chrome-extension:"
      && url.hostname === chrome.runtime.id
      && url.pathname.replace(/^\/+/, "") === ONBOARDING_PAGE;
  }

  function isStoreSender(sender) {
    const url = senderUrlObject(sender);
    return !!url && MATCH.isSteamStoreHost?.(url.hostname) === true;
  }

  function isSteamRuntimeSender(sender) {
    const url = senderUrl(sender);
    if (isSteam(url) || isSteamCefAboutBlank(url)) {
      return true;
    }
    return hasSteamSharedContextMarker(url) || isAllowedSteamLoopbackPath(url);
  }

  function contentBundle(request, sender) {
    const bundle = String(request?.bundle || "").trim();
    switch (bundle) {
      case "steam-content-deps":
        return isSteamRuntimeSender(sender) ? { files: STEAM_CONTENT_SHARED_SCRIPTS } : null;
      case "settings-shared":
        return isSettingsSender(sender) ? { files: SETTINGS_SHARED_SCRIPTS } : null;
      case "settings-ui":
        return isSettingsSender(sender) ? { files: SETTINGS_UI_SCRIPTS } : null;
      case "settings-rail":
        return isSettingsSender(sender) ? { files: SETTINGS_RAIL_SCRIPTS } : null;
      case "store-runtime":
        return isStoreSender(sender) ? storeFiles(request.meta, sender) : null;
      default:
        return null;
    }
  }

  // Chrome executeScript 没有 Promise 形态，统一包一层便于异步路由保持 sendResponse 通道。
  function execScript(options) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(options, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || String(err)));
          return;
        }
        resolve(res || []);
      });
    });
  }

  // 翻译脚本只注入发起请求的 frame，先写入配置，再按需加载翻译库和 runner，避免污染其他页面。
  async function translateInject(request, sender, sendResponse) {
    const target = translateTarget(sender);
    if (!target) {
      sendResponse({ success: false, error: "无法定位翻译页面" });
      return;
    }

    const inputCfg = request.cfg && typeof request.cfg === "object" ? request.cfg : {};
    const modes = translateModesFrom(inputCfg);
    const translateCfg = {
      ...inputCfg,
      modes,
    };

    try {
      await execScript({
        target,
        world: "ISOLATED",
        func: (cfg) => {
          globalThis.STEAM_BUFF_TRANSLATE_CONFIG = cfg || {};
          globalThis.STTranslateVendor?.configure?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG);
          globalThis.STTranslateRunner?.configure?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG);
        },
        args: [translateCfg],
      });

      const res = await execScript({
        target,
        world: "ISOLATED",
        func: () => ({
          lib: !!(globalThis.translate && globalThis.translate.version),
          runner: globalThis.steamBuffTranslateRunnerLoaded === true,
        }),
      });
      const state = res?.[0]?.result || {};
      if (!modes.length) {
        sendResponse({ success: true, skipped: true, reason: "no-enabled-mode" });
        return;
      }
      if (state.runner === true) {
        await execScript({
          target,
          world: "ISOLATED",
          func: () => {
            const cfg = globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {};
            globalThis.STTranslateVendor?.configure?.(cfg);
            globalThis.STTranslateRunner?.configure?.(cfg);
          },
        });
        sendResponse({ success: true });
        return;
      }

      if (state.lib !== true) {
        await execScript({
          target,
          world: "ISOLATED",
          files: [TRANS_VENDOR_WRAPPER],
        });
        await execScript({
          target,
          world: "ISOLATED",
          func: () => {
            globalThis.STTranslateVendor?.beforeVendorLoad?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {});
          },
        });
      }

      if (state.lib !== true) {
        await execScript({
          target,
          world: "ISOLATED",
          files: [TRANS_LIB],
        });
        await execScript({
          target,
          world: "ISOLATED",
          func: () => {
            globalThis.STTranslateVendor?.afterVendorLoad?.(globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {});
          },
        });
      }
      await execScript({
        target,
        world: "ISOLATED",
        files: state.lib === true
          ? [TRANS_VENDOR_WRAPPER, SHARED_CONFIG, OBSERVER_UTILS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER]
          : [SHARED_CONFIG, OBSERVER_UTILS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER],
      });
      await execScript({
        target,
        world: "ISOLATED",
        func: () => {
          const cfg = globalThis.STEAM_BUFF_TRANSLATE_CONFIG || {};
          globalThis.STTranslateVendor?.configure?.(cfg);
          globalThis.STTranslateRunner?.configure?.(cfg);
        },
      });
      sendResponse({ success: true });
    } catch (error) {
      const msg = error.message || String(error);
      logError("translate", "inject-failed", "翻译注入失败", error);
      sendResponse({ success: false, error: msg });
    }
  }

  async function injectContentFiles(request, sender, sendResponse) {
    const target = senderTarget(sender);
    const bundle = contentBundle(request, sender);
    const files = Array.isArray(bundle?.files) ? bundle.files : [];
    if (!target || !bundle) {
      sendResponse({ success: false, error: "无法定位注入目标或脚本包不被允许" });
      return;
    }
    if (bundle.skipped || !files.length) {
      sendResponse({ success: true, skipped: true, reason: bundle.reason || "empty-bundle" });
      return;
    }

    try {
      await execScript({
        target,
        world: "ISOLATED",
        files,
      });
      sendResponse({ success: true });
    } catch (error) {
      logError("injection", "content-files-inject-failed", "内容脚本文件按需注入失败", error, {
        bundle: String(request?.bundle || ""),
        count: files.length,
        firstFile: files[0] || "",
      });
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  }

  async function steamLoopbackInjectRequest(request, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      sendResponse({ success: false, error: "无法定位 Steam CEF 注入目标" });
      return;
    }

    const retryAttempt = Number(request?.retry?.attempt);
    const retryMaxAttempts = Number(request?.retry?.maxAttempts);
    const retry = Number.isInteger(retryAttempt) && retryAttempt >= 1
      && Number.isInteger(retryMaxAttempts) && retryMaxAttempts >= retryAttempt
      ? { attempt: retryAttempt, maxAttempts: retryMaxAttempts }
      : undefined;
    if (retry && Number.isInteger(Number(request?.retry?.delayMs)) && Number(request.retry.delayMs) >= 0) {
      retry.delayMs = Number(request.retry.delayMs);
    }
    const previousFailureReason = STEAM_LOOPBACK_FAILURE_REASONS.has(
      String(request?.diagnostics?.previousFailureReason || ""),
    )
      ? String(request.diagnostics.previousFailureReason)
      : "";
    const elapsedMs = Number(request?.diagnostics?.elapsedMs);
    const requestRetryAttempt = Number(request?.diagnostics?.requestRetry?.attempt);
    const requestRetryMaxAttempts = Number(request?.diagnostics?.requestRetry?.maxAttempts);
    const requestRetry = Number.isInteger(requestRetryAttempt) && requestRetryAttempt >= 1
      && Number.isInteger(requestRetryMaxAttempts) && requestRetryMaxAttempts >= requestRetryAttempt
      ? { attempt: requestRetryAttempt, maxAttempts: requestRetryMaxAttempts }
      : undefined;
    if (requestRetry && Number.isInteger(Number(request?.diagnostics?.requestRetry?.delayMs)) && Number(request.diagnostics.requestRetry.delayMs) >= 0) {
      requestRetry.delayMs = Number(request.diagnostics.requestRetry.delayMs);
    }
    const diagnostics = {
      ...(previousFailureReason ? { previousFailureReason } : {}),
      ...(Number.isFinite(elapsedMs) && elapsedMs >= 0 ? { elapsedMs: Math.round(elapsedMs) } : {}),
      ...(requestRetry ? { requestRetry } : {}),
    };
    const recoveredByBackground = Number(retry?.attempt) > 1;
    const recoveredByRequest = Number(requestRetry?.attempt) > 1;
    const logRetry = recoveredByBackground ? retry : recoveredByRequest ? requestRetry : retry;
    const retryScope = recoveredByBackground ? "background-alarm" : recoveredByRequest ? "guard-request" : "";
    const finalAttempt = !retry || retry.attempt >= retry.maxAttempts;
    const context = { execution: "background", frameId };

    const urls = steamLoopbackCandidateUrls({
      url: request.url,
      senderUrl: sender?.url,
      tabUrl: sender?.tab?.url,
    });
    const meta = {
      title: String(request.title || sender?.tab?.title || ""),
      url: urls[0] || "",
      urls,
      propertyDialog: request.propertyDialog === true,
      pageHint: String(request.pageHint || ""),
    };
    const sharedContext = isSteamSharedContext(meta);
    if (sharedContext) {
      try {
        await rememberSteamLoopbackRecoveryTarget(tabId, frameId);
      } catch (error) {
        backgroundLogger("injection").warn(
          "steam-loopback-recovery-target-store-failed",
          "Steam CEF SharedJSContext 精确恢复目标保存失败",
          {
            error,
            retry: logRetry,
            context,
            meta: {
              reason: "recovery-target-store-failed",
              ...(retryScope ? { retryScope } : {}),
            },
          },
        );
      }
    }
    if (!shouldInjectSteamLoopbackRuntime(meta)) {
      const error = new Error("steam-loopback-scope-mismatch");
      error.name = "SteamLoopbackScopeError";
      const details = {
        error,
        retry: logRetry,
        context,
        ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
        meta: {
          reason: "scope-mismatch",
          ...(retryScope ? { retryScope } : {}),
          ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
        },
      };
      if (finalAttempt) {
        const shouldLogFinalFailure = !sharedContext || stopSteamLoopbackRecoveryCampaign();
        if (shouldLogFinalFailure) {
          logError("injection", "steam-loopback-runtime-inject-failed", "Steam CEF 完整运行时注入范围检查最终失败", error, {
            retry: logRetry,
            context,
            ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
            meta: details.meta,
          });
        }
      } else {
        backgroundLogger("injection").warn(
          "steam-loopback-runtime-inject-retry",
          "Steam CEF 完整运行时注入范围检查失败，等待有限重试",
          details,
        );
        if (sharedContext && retry?.attempt === 1) {
          startSteamLoopbackRecoveryCampaign(true);
        }
      }
      sendResponse({ success: true, skipped: true, reason: "steam-loopback-scope-mismatch" });
      return;
    }

    try {
      const injected = await injectSteamLoopbackFrameIfNeeded(tabId, frameId);
      if (recoveredByBackground || recoveredByRequest) {
        const logger = backgroundLogger("injection");
        const recoveryDetails = {
          context,
          retry: logRetry,
          ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
          meta: {
            injected,
            ...(retryScope ? { retryScope } : {}),
            ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
          },
        };
        logger.warn(
          "steam-loopback-runtime-inject-recovered",
          "Steam CEF 完整运行时注入已在有限重试后恢复",
          recoveryDetails,
        );
      }
      if (sharedContext) {
        stopSteamLoopbackRecoveryCampaign();
      }
      sendResponse({ success: true, injected });
    } catch (error) {
      const reason = STEAM_LOOPBACK_BACKGROUND_FAILURE_REASONS.has(String(error?.reason || ""))
        ? String(error.reason)
        : "background-inject-failed";
      if (finalAttempt) {
        const shouldLogFinalFailure = !sharedContext || stopSteamLoopbackRecoveryCampaign();
        if (shouldLogFinalFailure) {
          logError("injection", "steam-loopback-runtime-inject-failed", "Steam CEF 完整运行时注入最终失败", error, {
            retry: logRetry,
            context,
            ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
            meta: {
              reason,
              ...(retryScope ? { retryScope } : {}),
              ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
            },
          });
        }
      } else {
        backgroundLogger("injection").warn(
          "steam-loopback-runtime-inject-retry",
          "Steam CEF 完整运行时注入失败，等待有限重试",
          {
            error,
            retry: logRetry,
            context,
            ...(diagnostics.elapsedMs !== undefined ? { durationMs: diagnostics.elapsedMs } : {}),
            meta: {
              reason,
              ...(retryScope ? { retryScope } : {}),
              ...(diagnostics.previousFailureReason ? { previousFailureReason: diagnostics.previousFailureReason } : {}),
            },
          },
        );
        if (sharedContext && retry?.attempt === 1) {
          startSteamLoopbackRecoveryCampaign(true);
        }
      }
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  }

  function cacheGet(request, sender, sendResponse) {
    const store = globalThis.STAITranslateCache;
    if (!store?.getMany) {
      sendResponse({ success: true, data: {} });
      return;
    }
    store.getMany(request.keys)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  }

  function cacheSet(request, sender, sendResponse) {
    const store = globalThis.STAITranslateCache;
    if (!store?.setMany) {
      sendResponse({ success: false, error: "AI 缓存模块未加载" });
      return;
    }
    store.setMany(request.entries)
      .then((ok) => sendResponse({ success: ok !== false }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  }

  const ROUTE_POLICY = Object.freeze({
    UPDATE_CHECK: "设置中心更新检查",
    STORE_FETCH: "允许列表内跨域请求代理",
    TRANSLATE_INJECT: "翻译 runner 按需注入",
    CONTENT_FILES_INJECT: "当前 frame 内容脚本按需注入",
    [STEAM_LOOPBACK_INJECT_REQUEST]: "Steam CEF 白名单 frame 按需注入",
    [AI_GATEWAY_PERMISSION_CHECK]: "AI 设置页检查当前网关精确域名权限",
    [AI_GATEWAY_PERMISSION_REQUEST]: "用户操作触发的 AI 网关按域名授权",
    [AI_GATEWAY_PERMISSION_OPEN]: "Steam 设置页创建一次性 AI 网关授权会话",
    [AI_GATEWAY_PERMISSION_CONTEXT]: "扩展授权页读取后台持有的一次性授权上下文",
    [AI_GATEWAY_PERMISSION_CANCEL]: "AI 设置页取消未完成的一次性授权会话",
    [CHROMIUM_WINDOW_OPEN]: "扩展内部 URL 的 Chromium 窗口打开",
    [STEAM_ROOT_MENU_OPEN_CHROMIUM]: "Steam Root Menu 打开主页或扩展管理",
    [AI_GATEWAY_PERMISSION_COMPLETE]: "扩展授权页回传 AI 网关授权结果",
    AI_CHAT_COMPLETIONS: "AI 网关连接测试与翻译代理",
    AI_TRANSLATE_CACHE_GET: "AI 翻译缓存读取",
    AI_TRANSLATE_CACHE_SET: "AI 翻译缓存写入",
    LOG_APPEND: "诊断日志追加",
    LOG_EXPORT: "诊断日志导出",
    LOG_CLEAR: "诊断日志清空",
    LOG_STATS: "诊断日志状态",
    [ONBOARDING_OPEN_LOCAL_MESSAGE]: "云端安装引导页打开本地步骤",
    [ONBOARDING_OPEN_SETTINGS_MESSAGE]: "安装引导页打开设置中心",
  });

  const ROUTES = Object.freeze({
    UPDATE_CHECK: globalThis.STBackgroundUpdate.updateCheck,
    STORE_FETCH: storeFetch,
    TRANSLATE_INJECT: translateInject,
    CONTENT_FILES_INJECT: injectContentFiles,
    [STEAM_LOOPBACK_INJECT_REQUEST]: steamLoopbackInjectRequest,
    [AI_GATEWAY_PERMISSION_CHECK]: checkAiGatewayPermission,
    [AI_GATEWAY_PERMISSION_REQUEST]: requestAiGatewayPermission,
    [AI_GATEWAY_PERMISSION_OPEN]: openAiGatewayPermission,
    [AI_GATEWAY_PERMISSION_CONTEXT]: getAiGatewayPermissionContext,
    [AI_GATEWAY_PERMISSION_CANCEL]: cancelAiGatewayPermission,
    [CHROMIUM_WINDOW_OPEN]: openChromiumWindowRequest,
    [STEAM_ROOT_MENU_OPEN_CHROMIUM]: openSteamRootMenuChromiumRequest,
    [AI_GATEWAY_PERMISSION_COMPLETE]: completeAiGatewayPermission,
    AI_CHAT_COMPLETIONS: aiChat,
    AI_TRANSLATE_CACHE_GET: cacheGet,
    AI_TRANSLATE_CACHE_SET: cacheSet,
    [ONBOARDING_OPEN_LOCAL_MESSAGE]: openOnboardingLocalPage,
    [ONBOARDING_OPEN_SETTINGS_MESSAGE]: openOnboardingSettings,
    LOG_APPEND(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.append(request, sender)
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_EXPORT(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.exportLogs(request.entry || request, sender)
        .then((data) => sendResponse({ success: true, ...data }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_CLEAR(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.clear()
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_STATS(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.stats()
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
  });

  function messageRoute(request) {
    const type = String(request?.type || "").slice(0, 80);
    return Object.hasOwn(ROUTES, type) ? ROUTES[type] : null;
  }

  // 所有异步路由必须 return true，让 Chrome 保持 sendResponse 通道。
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const route = messageRoute(request);
    if (route) {
      route(request, sender, sendResponse);
      return true;
    }
    return false;
  });
  chrome.runtime.onConnect.addListener(aiStreamConnect);

  chrome.runtime.onInstalled.addListener((details) => {
    const lifecycleReady = globalThis.STBackgroundLifecycle.initialize(details)
      .then(() => null)
      .catch((error) => error);
    globalThis.STBackgroundLogger.initialize()
      .then(async () => {
        const lifecycleError = await lifecycleReady;
        if (lifecycleError) {
          backgroundLogger("background-runtime").error(
            "extension-lifecycle-state-failed",
            "扩展安装与升级提示状态保存失败",
            { error: lifecycleError },
          );
        }
        injectSoon();
        if (details?.reason === "install") openOnboardingPage();
      })
      .catch((error) => {
        backgroundLogger("background-runtime").error("background-session-failed", "后台日志存储初始化失败", { error });
      });
  });
  chrome.runtime.onStartup.addListener(() => {
    injectSoon();
  });
  chrome.alarms?.onAlarm?.addListener(handleSteamLoopbackRecoveryAlarm);
  chrome.alarms?.onAlarm?.addListener(handleAiForecastSessionCleanupAlarm);
  chrome.tabs?.onCreated?.addListener(injectTabSoon);
  chrome.tabs?.onUpdated?.addListener((_tabId, _changeInfo, tab) => injectTabSoon(tab));
  chrome.tabs?.onRemoved?.addListener(handleAiPermissionTabRemoved);
  chrome.windows?.onRemoved?.addListener(handleAiPermissionWindowRemoved);
  chrome.action?.onClicked?.addListener(openSettings);
  bindGlobalLoggers();
  ensureAiForecastSessionCleanupAlarm().catch((error) => {
    logError("ai", "ai-forecast-session-cleanup-alarm-failed", "AI 预测会话清理任务创建失败", error);
  });
  globalThis.STBackgroundLogger.initialize()
    .then(() => {
      backgroundLogger("background-runtime").info("background-session-ready", "后台日志与消息运行时已就绪");
      injectSoon();
    })
    .catch((error) => {
      backgroundLogger("background-runtime").error("background-session-failed", "后台日志存储初始化失败", { error });
    });
})();
